import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/checkScheduleConflicts
// Body: { projectId: string, offsetMs?: number }
//
// Returns the list of resource conflicts that would result if every subtask
// in `projectId` had its scheduled times shifted by `offsetMs` (default 0).
// A "resource conflict" here = a staff member assigned to one of this
// project's shifted subtasks is ALSO assigned to another active project's
// subtask whose time window overlaps the shifted window.
//
// Returns { conflicts: Array<{ staffName, otherProjectCode, otherProjectTitle,
// thisSubtask, otherSubtask, otherStart, otherEnd }> } so the dashboard
// can show a human-readable list.
//
// Skips projects in cancelled / completed states, and skips this project
// itself when scanning.

export const runtime = "nodejs";

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  sub_task: { description: string | null } | { description: string | null }[] | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string;
};

type StaffAssignmentRow = {
  project_sub_task_id: string;
  user_id: string;
};

type OtherSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  sub_task: { description: string | null } | { description: string | null }[] | null;
};

function readDescription(
  v: { description: string | null } | { description: string | null }[] | null,
): string {
  if (!v) return "Subtask";
  const obj = Array.isArray(v) ? v[0] : v;
  return obj?.description?.trim() || "Subtask";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const offsetMs = Number(body?.offsetMs);
    const shift = Number.isFinite(offsetMs) ? offsetMs : 0;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    // 1. Get this project's subtasks (with their existing schedules).
    const { data: thisProjectTasks, error: thisTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id")
      .eq("project_id", projectId);

    if (thisTasksError) {
      return NextResponse.json(
        { error: thisTasksError.message },
        { status: 500 },
      );
    }

    const thisTaskIds = (thisProjectTasks ?? []).map(
      (t) => t.project_task_id as string,
    );
    if (thisTaskIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    const { data: thisSubTasks, error: thisSubError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime, sub_task(description)",
      )
      .in("project_task_id", thisTaskIds);

    if (thisSubError) {
      return NextResponse.json(
        { error: thisSubError.message },
        { status: 500 },
      );
    }

    const thisSubs = (thisSubTasks ?? []) as ProjectSubTaskRow[];
    const thisSubIds = thisSubs.map((s) => s.project_sub_task_id);

    if (thisSubIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    // 2. Get the staff assigned to this project's subtasks.
    const { data: thisStaff, error: thisStaffError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("project_sub_task_id, user_id")
      .in("project_sub_task_id", thisSubIds);

    if (thisStaffError) {
      return NextResponse.json(
        { error: thisStaffError.message },
        { status: 500 },
      );
    }

    const thisAssignments = (thisStaff ?? []) as StaffAssignmentRow[];
    const allStaffIds = Array.from(
      new Set(thisAssignments.map((s) => s.user_id)),
    );
    if (allStaffIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    // 3. Find subtasks belonging to OTHER active projects that share any of
    // those staff. We pull all assignments for these staff first, then filter.
    const { data: allOtherAssignments, error: otherStaffError } =
      await supabaseAdmin
        .from("project_sub_task_staff")
        .select("project_sub_task_id, user_id")
        .in("user_id", allStaffIds);

    if (otherStaffError) {
      return NextResponse.json(
        { error: otherStaffError.message },
        { status: 500 },
      );
    }

    const candidateSubIds = Array.from(
      new Set(
        (allOtherAssignments ?? [])
          .map((row) => row.project_sub_task_id as string)
          .filter((id) => !thisSubIds.includes(id)),
      ),
    );
    if (candidateSubIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    const { data: otherSubData, error: otherSubError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime, sub_task(description)",
      )
      .in("project_sub_task_id", candidateSubIds);

    if (otherSubError) {
      return NextResponse.json(
        { error: otherSubError.message },
        { status: 500 },
      );
    }

    const otherSubs = (otherSubData ?? []) as OtherSubTaskRow[];
    const otherTaskIds = Array.from(
      new Set(otherSubs.map((s) => s.project_task_id)),
    );

    const { data: otherTaskRows, error: otherTaskError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id")
      .in("project_task_id", otherTaskIds);

    if (otherTaskError) {
      return NextResponse.json(
        { error: otherTaskError.message },
        { status: 500 },
      );
    }

    const taskToProject = new Map<string, string>();
    for (const t of (otherTaskRows ?? []) as ProjectTaskRow[]) {
      taskToProject.set(t.project_task_id, t.project_id);
    }

    // Filter out subtasks belonging to inactive projects (completed /
    // cancelled) — those don't constitute live conflicts.
    const otherProjectIds = Array.from(
      new Set(Array.from(taskToProject.values()).filter((id) => id !== projectId)),
    );

    const { data: otherProjectRows, error: otherProjectError } =
      await supabaseAdmin
        .from("projects")
        .select("project_id, project_code, title, status")
        .in("project_id", otherProjectIds);

    if (otherProjectError) {
      return NextResponse.json(
        { error: otherProjectError.message },
        { status: 500 },
      );
    }

    const projectMeta = new Map<
      string,
      { code: string | null; title: string | null; status: string | null }
    >();
    for (const p of otherProjectRows ?? []) {
      projectMeta.set(p.project_id as string, {
        code: (p.project_code as string | null) ?? null,
        title: (p.title as string | null) ?? null,
        status: (p.status as string | null) ?? null,
      });
    }

    const ACTIVE_STATUSES = new Set([
      "main_task_pending",
      "sub_task_pending",
      "materials_pending",
      "equipment_pending",
      "schedule_pending",
      "employee_assignment_pending",
      "cost_estimation_pending",
      "overview_pending",
      "client_quotation_pending",
      "quotation_pending",
      "client_quotation_done",
      "downpayment_pending",
      "ready_to_start",
      "in_progress",
      "review_pending",
      "invoice_pending",
      "invoice_agreement_pending",
      "payment_pending",
    ]);

    // Lookup: user_id -> Set<other subtask id>
    const staffToOtherSubs = new Map<string, Set<string>>();
    for (const row of (allOtherAssignments ?? []) as StaffAssignmentRow[]) {
      if (thisSubIds.includes(row.project_sub_task_id)) continue;
      if (!staffToOtherSubs.has(row.user_id)) {
        staffToOtherSubs.set(row.user_id, new Set());
      }
      staffToOtherSubs.get(row.user_id)!.add(row.project_sub_task_id);
    }

    const otherSubMap = new Map<string, OtherSubTaskRow>();
    for (const s of otherSubs) {
      otherSubMap.set(s.project_sub_task_id, s);
    }

    // Lookup: this subtask id -> Set<staff user_id>
    const thisSubToStaff = new Map<string, string[]>();
    for (const row of thisAssignments) {
      if (!thisSubToStaff.has(row.project_sub_task_id)) {
        thisSubToStaff.set(row.project_sub_task_id, []);
      }
      thisSubToStaff.get(row.project_sub_task_id)!.push(row.user_id);
    }

    // Pull staff display names in one go.
    const { data: usersData } = await supabaseAdmin
      .from("users")
      .select("id, username")
      .in("id", allStaffIds);
    const userIdToName = new Map<string, string>();
    for (const u of usersData ?? []) {
      userIdToName.set(
        u.id as string,
        ((u.username as string | null) ?? "").trim() || "Unknown",
      );
    }

    type Conflict = {
      staffName: string;
      otherProjectCode: string | null;
      otherProjectTitle: string | null;
      thisSubtask: string;
      otherSubtask: string;
      shiftedStart: string;
      shiftedEnd: string;
      otherStart: string;
      otherEnd: string;
    };

    const conflicts: Conflict[] = [];

    for (const sub of thisSubs) {
      const startMs = sub.scheduled_start_datetime
        ? new Date(sub.scheduled_start_datetime).getTime()
        : NaN;
      const endMs = sub.scheduled_end_datetime
        ? new Date(sub.scheduled_end_datetime).getTime()
        : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      const shiftedStart = startMs + shift;
      const shiftedEnd = endMs + shift;

      const staffIds = thisSubToStaff.get(sub.project_sub_task_id) ?? [];

      for (const staffId of staffIds) {
        const otherIds = staffToOtherSubs.get(staffId);
        if (!otherIds) continue;

        for (const otherSubId of otherIds) {
          const otherSub = otherSubMap.get(otherSubId);
          if (!otherSub) continue;

          const otherProjectId = taskToProject.get(otherSub.project_task_id);
          if (!otherProjectId) continue;
          if (otherProjectId === projectId) continue;

          const meta = projectMeta.get(otherProjectId);
          if (!meta || !meta.status || !ACTIVE_STATUSES.has(meta.status)) continue;

          const otherStartMs = otherSub.scheduled_start_datetime
            ? new Date(otherSub.scheduled_start_datetime).getTime()
            : NaN;
          const otherEndMs = otherSub.scheduled_end_datetime
            ? new Date(otherSub.scheduled_end_datetime).getTime()
            : NaN;
          if (!Number.isFinite(otherStartMs) || !Number.isFinite(otherEndMs)) {
            continue;
          }

          // Standard overlap check: A < B_end AND B < A_end.
          const overlaps =
            shiftedStart < otherEndMs && otherStartMs < shiftedEnd;
          if (!overlaps) continue;

          conflicts.push({
            staffName: userIdToName.get(staffId) ?? "Staff",
            otherProjectCode: meta.code,
            otherProjectTitle: meta.title,
            thisSubtask: readDescription(sub.sub_task),
            otherSubtask: readDescription(otherSub.sub_task),
            shiftedStart: new Date(shiftedStart).toISOString(),
            shiftedEnd: new Date(shiftedEnd).toISOString(),
            otherStart: new Date(otherStartMs).toISOString(),
            otherEnd: new Date(otherEndMs).toISOString(),
          });
        }
      }
    }

    return NextResponse.json({ conflicts });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error checking conflicts.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
