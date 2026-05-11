import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateCancellationSettlement,
  isTerminal,
  shouldHardDelete,
} from "@/lib/planning/projectCancellation";

// POST /api/planning/cancelProject
//
// Soft-cancels a project that has already been exposed to the client (status
// is past `quotation_pending`). Computes the settlement (earned cost + revenue
// vs collected downpayment), stamps the cancellation audit columns, voids any
// non-signed documents, and marks unfinished subtasks as cancelled so they
// stop showing up in active views.
//
// Pre-quotation projects must be deleted via /api/planning/deleteProject —
// this route refuses them so the client can't accidentally use the wrong
// endpoint.
//
// Notification to the client is fired in a separate request (the modal calls
// notifyProjectCancelled after this returns success), keeping side effects
// composable and making it easy to retry the notification on its own.

async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (callerStatus !== "active" || (role !== "admin" && role !== "manager")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const projectCode = String(body?.projectCode ?? "").trim();
    // Admin-internal note (optional). Appended to projects.notes prefixed
    // with the cancel date so the cancellation context lives alongside
    // any other notes the project already has, instead of in a separate
    // single-purpose column.
    const note = String(body?.note ?? "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }
    if (!projectCode) {
      return NextResponse.json(
        { error: "Missing projectCode confirmation." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, status, downpayment, markup_rate, notes")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }
    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    if (project.project_code?.trim() !== projectCode) {
      return NextResponse.json(
        { error: "Project code does not match. Cancellation aborted." },
        { status: 400 },
      );
    }

    const currentStatus = String(project.status ?? "").trim();

    if (shouldHardDelete(currentStatus)) {
      return NextResponse.json(
        {
          error:
            "This project hasn't been shared with the client yet. Use the delete flow instead.",
          hint: "POST /api/planning/deleteProject",
        },
        { status: 400 },
      );
    }

    if (isTerminal(currentStatus)) {
      return NextResponse.json(
        { error: `Project is already ${currentStatus}.` },
        { status: 400 },
      );
    }

    const settlement = await calculateCancellationSettlement(projectId);

    const cancelledAt = new Date().toISOString();

    // Append the cancel context to the existing project notes. We keep
    // the prior notes verbatim and tack a dated cancellation block on
    // the end so the project's note history still reads top-to-bottom.
    const cancelDateLabel = cancelledAt.slice(0, 10);
    const cancelNoteBlock = `[Cancelled ${cancelDateLabel}]${note ? ` ${note}` : ""}`;
    const existingNotes =
      typeof project.notes === "string" ? project.notes.trimEnd() : "";
    const nextNotes = existingNotes
      ? `${existingNotes}\n\n${cancelNoteBlock}`
      : cancelNoteBlock;

    const { error: updateProjectError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        cancelled_by: userId,
        cancelled_from_status: currentStatus,
        cancellation_earned_cost: settlement.earnedCost,
        cancellation_earned_revenue: settlement.earnedRevenue,
        cancellation_balance: settlement.balance,
        // Seed the post-cancel wrap-up to its first substep. The dashboard
        // surfaces a "Project Cancellation" group whose children advance
        // through review -> document -> payment -> employee -> conclude.
        cancellation_phase: "review",
        notes: nextNotes,
        updated_at: cancelledAt,
      })
      .eq("project_id", projectId);

    if (updateProjectError) {
      return NextResponse.json(
        {
          error: "Failed to cancel project.",
          details: updateProjectError.message,
        },
        { status: 500 },
      );
    }

    // Mark unfinished subtasks as cancelled so the schedule conflict checker
    // and any "pending" filters stop returning them. We leave already-completed
    // subtasks alone — they're part of the audit trail for the settlement.
    const { data: projectTasks } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id")
      .eq("project_id", projectId);

    const projectTaskIds = (projectTasks ?? []).map(
      (t) => t.project_task_id as string,
    );

    if (projectTaskIds.length > 0) {
      // Null out the schedule times so cancelled subtasks can never
      // phantom-block another project's scheduler. The status filter in
      // getProjectSchedule already excludes them, but defence-in-depth
      // covers the case where any future query forgets that filter.
      const { error: subtaskError } = await supabaseAdmin
        .from("project_sub_task")
        .update({
          status: "cancelled",
          scheduled_start_datetime: null,
          scheduled_end_datetime: null,
          updated_at: cancelledAt,
        })
        .in("project_task_id", projectTaskIds)
        .not("status", "in", "(completed,done,finished,cancelled)");

      if (subtaskError) {
        console.error(
          "[cancelProject] failed to cancel pending subtasks:",
          subtaskError.message,
        );
      }
    }

    // Void unsigned documents (drafts, generated PDFs awaiting signature).
    // Signed documents stay as-is — they're part of the legal/audit trail.
    const { error: voidDocsError } = await supabaseAdmin
      .from("project_documents")
      .update({ document_status: "void", updated_at: cancelledAt })
      .eq("project_id", projectId)
      .in("document_status", ["draft", "generated", "sent"]);

    if (voidDocsError) {
      console.error(
        "[cancelProject] failed to void unsigned documents:",
        voidDocsError.message,
      );
    }

    return NextResponse.json({
      ok: true,
      cancelledFromStatus: currentStatus,
      settlement,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while cancelling project.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
