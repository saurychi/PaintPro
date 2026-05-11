import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/manageCancellationSettlement
//
// Records cancellation-settlement instalments. Mirrors manageDownpayment:
//   * Each call writes the cumulative `cancellation_settled` value the
//     admin has collected/paid out so far.
//   * `finalize: false` (default) just persists the running tally — the
//     admin can keep adding instalments without flipping the phase.
//   * `finalize: true` requires the running tally to be at least the
//     absolute settlement balance (|cancellation_balance|) and, on
//     success, advances `cancellation_phase` from 'payment' to
//     'employee'. Mirrors advanceCancellationPhase's safety check
//     (project must be cancelled + currently in 'payment').

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
    const settled = body?.settled;
    const finalize = body?.finalize === true;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }
    if (typeof settled !== "number" || !Number.isFinite(settled) || settled < 0) {
      return NextResponse.json(
        { error: "Invalid settlement amount." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select(
        "project_id, status, cancellation_phase, cancellation_balance, cancellation_settled",
      )
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (String(project.status ?? "").toLowerCase() !== "cancelled") {
      return NextResponse.json(
        {
          error:
            "Project is not cancelled — settlement only applies to cancelled projects.",
        },
        { status: 400 },
      );
    }

    const currentPhase = String(project.cancellation_phase ?? "");
    if (currentPhase !== "payment") {
      return NextResponse.json(
        {
          error:
            "Cancellation phase is not at payment — refresh the dashboard to see the latest state.",
          currentPhase,
        },
        { status: 409 },
      );
    }

    const requiredAmount = Math.abs(Number(project.cancellation_balance ?? 0));

    if (finalize && settled + 0.0001 < requiredAmount) {
      return NextResponse.json(
        {
          error:
            "Cannot mark settled — the collected amount is still less than the total settlement.",
          required: requiredAmount,
          collected: settled,
        },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      cancellation_settled: settled,
      updated_at: new Date().toISOString(),
    };

    if (finalize) {
      updates.cancellation_phase = "employee";
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update(updates)
      .eq("project_id", projectId);

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to save cancellation settlement.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      finalized: finalize,
      settled,
      phase: finalize ? "employee" : currentPhase,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error saving cancellation settlement.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
