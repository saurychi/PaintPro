import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays"

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
  status: string | null
}

function utcDateKey(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

function addUtcDays(yyyymmdd: string, days: number) {
  const d = new Date(`${yyyymmdd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function enumerateUtcDays(startIso: string | null, endIso: string | null) {
  const startKey = utcDateKey(startIso)
  const endKey = utcDateKey(endIso)
  if (!startKey || !endKey || endKey < startKey) return [] as string[]
  const out: string[] = []
  let cur = startKey
  while (cur <= endKey) {
    out.push(cur)
    cur = addUtcDays(cur, 1)
  }
  return out
}

function normalizeStatus(status: string | null) {
  const value = String(status || "").trim().toLowerCase()

  if (value === "completed" || value === "done") return "done"
  if (value === "behind" || value === "delayed" || value === "overdue") return "behind"
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
    return "current"
  }

  if (
    value === "main_task_pending" ||
    value === "sub_task_pending" ||
    value === "materials_pending" ||
    value === "equipment_pending" ||
    value === "schedule_pending" ||
    value === "employee_assignment_pending" ||
    value === "ready_to_start"
  ) {
    return "pending"
  }

  return "pending"
}

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "No date"

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "No date"

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })
}

export async function GET(req: Request) {
  const [{ data, error }, unavailableDays] = await Promise.all([
    supabaseAdmin
      .from("projects")
      .select(
        "project_id, project_code, title, scheduled_start_datetime, scheduled_end_datetime, status"
      )
      .order("scheduled_start_datetime", { ascending: true }),
    listScheduleUnavailableDays(req.headers.get("cookie")),
  ])

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to load projects.",
        details: error.message,
      },
      { status: 500 }
    )
  }

  // Only surface projects that have actually entered the work / wrap-up phase.
  // Earlier draft statuses (main_task_pending, sub_task_pending, etc.) belong
  // on /admin/projects, not on the calendar.
  const SCHEDULE_VISIBLE_STATUSES = new Set([
    "in_progress",
    "review_pending",
    "invoice_pending",
    "invoice_agreement_pending",
    "payment_pending",
    "employee_management_pending",
    "conclude_job_pending",
    "completed",
  ])

  const projectRows = ((data ?? []) as ProjectRow[]).filter((row) =>
    SCHEDULE_VISIBLE_STATUSES.has(
      String(row.status || "").trim().toLowerCase(),
    ),
  )

  // Render-only exclusion: subtract the current unavailable-day set from each
  // project's [start, end] span. The per-subtask scheduled datetimes are still
  // the source of truth in the DB; this just keeps the calendar from painting
  // a project bar across a holiday or manual block, regardless of whether the
  // subtask plan technically lands there.
  const unavailableSet = new Set(unavailableDays.map((day) => day.blockedDate))

  const projects = projectRows.map((project) => {
    const span = enumerateUtcDays(
      project.scheduled_start_datetime,
      project.scheduled_end_datetime,
    )
    const activeDays = span.filter((day) => !unavailableSet.has(day))

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
    }
  })

  const currentProject =
    projects.find((project) => project.status === "current") ?? projects[0] ?? null

  // Pull subtasks for the visible projects so the schedule page can render
  // them individually in timeline view (instead of a single block per
  // project). We only return the fields the calendar needs — start/end
  // datetimes, the human-readable title, and which project they belong to.
  const projectIds = projects.map((p) => p.id)
  type SubtaskOut = {
    id: string
    projectId: string
    title: string
    scheduledStartDatetime: string | null
    scheduledEndDatetime: string | null
    status: string
    // Work-hours of the subtask (excludes lunch + non-working day pauses).
    // The schedule pages need this to render multi-segment chips that
    // visually pause for lunch / blocked days, matching the wizard's
    // project-schedule view.
    estimatedHours: number | null
  }
  const subtasks: SubtaskOut[] = []

  if (projectIds.length > 0) {
    const { data: taskRows } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id")
      .in("project_id", projectIds)

    const taskIdToProjectId = new Map<string, string>()
    for (const row of taskRows ?? []) {
      taskIdToProjectId.set(
        row.project_task_id as string,
        row.project_id as string,
      )
    }

    const taskIds = Array.from(taskIdToProjectId.keys())

    if (taskIds.length > 0) {
      const { data: subRows } = await supabaseAdmin
        .from("project_sub_task")
        .select(
          "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime, status, estimated_hours, sub_task(description)",
        )
        .in("project_task_id", taskIds)

      for (const row of (subRows ?? []) as Array<{
        project_sub_task_id: string
        project_task_id: string
        scheduled_start_datetime: string | null
        scheduled_end_datetime: string | null
        status: string | null
        estimated_hours: number | null
        sub_task:
          | { description: string | null }
          | { description: string | null }[]
          | null
      }>) {
        const projectId = taskIdToProjectId.get(row.project_task_id)
        if (!projectId) continue
        const subTask = Array.isArray(row.sub_task)
          ? row.sub_task[0]
          : row.sub_task
        const hoursRaw = Number(row.estimated_hours)
        subtasks.push({
          id: row.project_sub_task_id,
          projectId,
          title: subTask?.description?.trim() || "Subtask",
          scheduledStartDatetime: row.scheduled_start_datetime,
          scheduledEndDatetime: row.scheduled_end_datetime,
          status: String(row.status ?? "").trim().toLowerCase(),
          estimatedHours:
            Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : null,
        })
      }
    }
  }

  return NextResponse.json({
    projects,
    currentProject,
    subtasks,
  })
}
