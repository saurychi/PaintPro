import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
  status: string | null
}

function normalizeStatus(status: string | null) {
  const value = String(status || "").trim().toLowerCase()

  if (value === "completed" || value === "done") return "done"
  if (value === "behind" || value === "delayed" || value === "overdue") return "behind"
  if (value === "in_progress" || value === "ongoing" || value === "active") return "current"

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

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select(
      "project_id, project_code, title, scheduled_start_datetime, scheduled_end_datetime, status"
    )
    .order("scheduled_start_datetime", { ascending: true })

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to load projects.",
        details: error.message,
      },
      { status: 500 }
    )
  }

  const projects = ((data ?? []) as ProjectRow[]).map((project) => ({
    id: project.project_id,
    projectCode: project.project_code,
    title: project.title || "Untitled Project",
    scheduledStartDatetime: project.scheduled_start_datetime,
    scheduledEndDatetime: project.scheduled_end_datetime,
    status: normalizeStatus(project.status),
    rawStatus: String(project.status || "").trim().toLowerCase(),
    dateLabel: formatDateLabel(project.scheduled_start_datetime),
  }))

  const currentProject =
    projects.find((project) => project.status === "current") ?? projects[0] ?? null

  return NextResponse.json({
    projects,
    currentProject,
  })
}
