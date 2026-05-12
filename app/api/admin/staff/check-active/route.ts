import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

// The only PROJECT statuses that count as "done" for staff archive
// purposes — the admin can archive a staff member whose assigned
// projects are all in one of these terminal states, even if the row
// in project_sub_task_staff still says "assigned". Anything else
// (in_progress, downpayment_pending, review_pending, etc.) keeps the
// staff "still active".
const TERMINAL_PROJECT_STATUSES = new Set([
  "completed",
  "cancelled",
])

type AssignmentRow = {
  project_sub_task_id: string
  project_sub_task:
    | {
        project_task:
          | {
              project_id: string | null
            }
          | { project_id: string | null }[]
          | null
      }
    | { project_task: unknown }[]
    | null
}

type ProjectRow = {
  project_id: string
  status: string | null
}

function flattenProjectIds(row: AssignmentRow): string[] {
  // Supabase returns the joined relation as either an object or an
  // array depending on cardinality. Normalise both shapes into a list
  // so the downstream filter doesn't have to care.
  const projectSubTask = Array.isArray(row.project_sub_task)
    ? row.project_sub_task
    : row.project_sub_task
      ? [row.project_sub_task]
      : []

  const projectTasks = projectSubTask.flatMap((pst) => {
    const pt = (pst as { project_task?: unknown }).project_task
    if (Array.isArray(pt)) return pt
    if (pt) return [pt]
    return []
  })

  return projectTasks
    .map((pt) => (pt as { project_id?: string | null })?.project_id)
    .filter((id): id is string => Boolean(id))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")?.trim()

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    // Pull every project_sub_task_staff row for this user along with the
    // owning project_id (via project_sub_task → project_task). If there
    // are none, the staff isn't assigned to anything and archive is
    // unconditionally fine.
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select(
        "project_sub_task_id, project_sub_task:project_sub_task_id(project_task:project_task_id(project_id))",
      )
      .eq("user_id", userId)
      .returns<AssignmentRow[]>()

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 })
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ hasActiveAssignments: false, count: 0 })
    }

    const projectIds = Array.from(
      new Set(assignments.flatMap(flattenProjectIds)),
    )

    if (projectIds.length === 0) {
      // Defensive: assignments exist but they couldn't be mapped to a
      // project (orphaned subtasks?). Treat as "still active" so we
      // don't archive a staff member with mystery assignments.
      return NextResponse.json({
        hasActiveAssignments: true,
        count: assignments.length,
      })
    }

    const { data: projects, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, status")
      .in("project_id", projectIds)
      .returns<ProjectRow[]>()

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 })
    }

    const stillActiveProjects = (projects ?? []).filter((row) => {
      const status = String(row.status ?? "").trim().toLowerCase()
      return !TERMINAL_PROJECT_STATUSES.has(status)
    })

    return NextResponse.json({
      hasActiveAssignments: stillActiveProjects.length > 0,
      count: stillActiveProjects.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
