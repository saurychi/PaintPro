import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  status: string | null;
};

function utcDateKey(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function addUtcDays(yyyymmdd: string, days: number) {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function enumerateUtcDays(startIso: string | null, endIso: string | null) {
  const startKey = utcDateKey(startIso);
  const endKey = utcDateKey(endIso);
  if (!startKey || !endKey || endKey < startKey) return [] as string[];
  const out: string[] = [];
  let cur = startKey;
  while (cur <= endKey) {
    out.push(cur);
    cur = addUtcDays(cur, 1);
  }
  return out;
}

type UnavailRow = {
  unavailability_id: string;
  start_datetime: string | null;
  end_datetime: string | null;
  reason: string | null;
  status: string | null;
};

function normalizeStatus(status: string | null) {
  const value = String(status || "").trim().toLowerCase();

  if (value === "completed" || value === "done") return "done";
  if (value === "behind" || value === "delayed" || value === "overdue") return "behind";
  if (
    value === "in_progress" ||
    value === "ongoing" ||
    value === "active" ||
    value === "review_pending" ||
    value === "invoice_pending" ||
    value === "invoice_agreement_pending" ||
    value === "payment_pending" ||
    value === "employee_management_pending" ||
    value === "conclude_job_pending"
  ) {
    return "current";
  }

  return "pending";
}

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Step 1: get project_sub_task IDs this staff member is assigned to
  const { data: assignData, error: assignErr } = await supabaseAdmin
    .from("project_sub_task_staff")
    .select("project_sub_task_id")
    .eq("user_id", userId);

  if (assignErr) {
    return NextResponse.json(
      { error: "Failed to load assignments.", details: assignErr.message },
      { status: 500 },
    );
  }

  const subTaskIds = [...new Set((assignData ?? []).map((a) => a.project_sub_task_id))];

  let projects: ReturnType<typeof buildProject>[] = [];

  if (subTaskIds.length > 0) {
    // Resolve the staff member's projects through subtask → task → project.
    const { data: subTaskData } = await supabaseAdmin
      .from("project_sub_task")
      .select("project_task_id")
      .in("project_sub_task_id", subTaskIds);

    const projectTaskIds = [
      ...new Set((subTaskData ?? []).map((st) => st.project_task_id)),
    ];

    if (projectTaskIds.length > 0) {
      const { data: taskData } = await supabaseAdmin
        .from("project_task")
        .select("project_id")
        .in("project_task_id", projectTaskIds);

      const projectIds = [
        ...new Set((taskData ?? []).map((t) => t.project_id)),
      ];

      if (projectIds.length > 0) {
        const [{ data: projectData, error: projectErr }, unavailableDays] =
          await Promise.all([
            supabaseAdmin
              .from("projects")
              .select(
                "project_id, project_code, title, scheduled_start_datetime, scheduled_end_datetime, status",
              )
              .in("project_id", projectIds)
              .order("scheduled_start_datetime", { ascending: true }),
            listScheduleUnavailableDays(request.headers.get("cookie")),
          ]);

        if (projectErr) {
          return NextResponse.json(
            { error: "Failed to load projects.", details: projectErr.message },
            { status: 500 },
          );
        }

        // Surface every project with a confirmed schedule — including the
        // pre-work states (client signed quotation → downpayment → ready)
        // where the calendar still needs to show *when* the work is going
        // to happen. Earlier draft statuses belong on /admin/projects, not
        // on the calendar.
        const SCHEDULE_VISIBLE_STATUSES = new Set([
          "client_quotation_done",
          "downpayment_pending",
          "ready_to_start",
          "in_progress",
          "review_pending",
          "invoice_pending",
          "invoice_agreement_pending",
          "invoice_signed",
          "payment_pending",
          "employee_management_pending",
          "conclude_job_pending",
          "completed",
        ]);

        // Render-only exclusion: subtract the current unavailable-day set
        // from each project's [start, end] span so the calendar bars never
        // paint over a holiday or manual block.
        const unavailableSet = new Set(
          unavailableDays.map((day) => day.blockedDate),
        );

        projects = ((projectData ?? []) as ProjectRow[])
          .filter((row) =>
            SCHEDULE_VISIBLE_STATUSES.has(
              String(row.status || "").trim().toLowerCase(),
            ),
          )
          .map((row) => {
            const span = enumerateUtcDays(
              row.scheduled_start_datetime,
              row.scheduled_end_datetime,
            );
            const activeDays = span.filter((day) => !unavailableSet.has(day));
            return buildProject(row, activeDays);
          });
      }
    }
  }

  // Get unavailability for this staff member
  const { data: unavailData, error: unavailErr } = await supabaseAdmin
    .from("staff_unavailability")
    .select("unavailability_id, start_datetime, end_datetime, reason, status")
    .eq("user_id", userId)
    .order("start_datetime", { ascending: true });

  if (unavailErr) {
    return NextResponse.json(
      { error: "Failed to load unavailability.", details: unavailErr.message },
      { status: 500 },
    );
  }

  const unavailability = ((unavailData ?? []) as UnavailRow[]).map((u) => ({
    id: u.unavailability_id,
    startDatetime: u.start_datetime,
    endDatetime: u.end_datetime,
    reason: u.reason,
    status: String(u.status ?? "pending").trim().toLowerCase(),
  }));

  const currentProject =
    projects.find((p) => p.status === "current") ?? projects[0] ?? null;

  // Pull only the subtasks this staff member is assigned to (we already
  // resolved that subTaskIds list at step 1) so the timeline view can show
  // each block at its real scheduled time instead of one slab per project.
  type SubtaskOut = {
    id: string;
    projectId: string;
    title: string;
    scheduledStartDatetime: string | null;
    scheduledEndDatetime: string | null;
    status: string;
  };
  const subtasks: SubtaskOut[] = [];

  if (subTaskIds.length > 0 && projects.length > 0) {
    const visibleProjectIds = new Set(projects.map((p) => p.id));

    const { data: subRows } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime, status, sub_task(description)",
      )
      .in("project_sub_task_id", subTaskIds);

    const taskIdsToFetch = Array.from(
      new Set((subRows ?? []).map((s) => s.project_task_id as string)),
    );
    const taskToProject = new Map<string, string>();
    if (taskIdsToFetch.length > 0) {
      const { data: taskRows } = await supabaseAdmin
        .from("project_task")
        .select("project_task_id, project_id")
        .in("project_task_id", taskIdsToFetch);
      for (const row of taskRows ?? []) {
        taskToProject.set(
          row.project_task_id as string,
          row.project_id as string,
        );
      }
    }

    for (const row of (subRows ?? []) as Array<{
      project_sub_task_id: string;
      project_task_id: string;
      scheduled_start_datetime: string | null;
      scheduled_end_datetime: string | null;
      status: string | null;
      sub_task:
        | { description: string | null }
        | { description: string | null }[]
        | null;
    }>) {
      const projectId = taskToProject.get(row.project_task_id);
      if (!projectId || !visibleProjectIds.has(projectId)) continue;
      const subTask = Array.isArray(row.sub_task)
        ? row.sub_task[0]
        : row.sub_task;
      subtasks.push({
        id: row.project_sub_task_id,
        projectId,
        title: subTask?.description?.trim() || "Subtask",
        scheduledStartDatetime: row.scheduled_start_datetime,
        scheduledEndDatetime: row.scheduled_end_datetime,
        status: String(row.status ?? "").trim().toLowerCase(),
      });
    }
  }

  return NextResponse.json({ projects, currentProject, unavailability, subtasks });
}

function buildProject(project: ProjectRow, activeDays: string[]) {
  return {
    id: project.project_id,
    projectCode: project.project_code,
    title: project.title || "Untitled Project",
    scheduledStartDatetime: project.scheduled_start_datetime,
    scheduledEndDatetime: project.scheduled_end_datetime,
    status: normalizeStatus(project.status),
    rawStatus: String(project.status || "").trim().toLowerCase(),
    dateLabel: formatDateLabel(project.scheduled_start_datetime),
    activeDays,
  };
}
