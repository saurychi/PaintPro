import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")?.trim()

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    // 1. Get all sub-task assignments for this staff member
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("project_sub_task_id, assignment_status")
      .eq("user_id", userId)

    if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 })
    if (!assignments || assignments.length === 0) return NextResponse.json({ timeline: [] })

    const subTaskIds = assignments.map((a) => a.project_sub_task_id)
    const assignmentStatusMap: Record<string, string | null> = Object.fromEntries(
      assignments.map((a) => [a.project_sub_task_id, a.assignment_status]),
    )

    // 2. Get project sub-task details
    const { data: subTasks, error: subTaskError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, sub_task_id, scheduled_start_datetime, scheduled_end_datetime, estimated_hours, status",
      )
      .in("project_sub_task_id", subTaskIds)

    if (subTaskError) return NextResponse.json({ error: subTaskError.message }, { status: 500 })
    if (!subTasks || subTasks.length === 0) return NextResponse.json({ timeline: [] })

    const projectTaskIds = [...new Set(subTasks.map((st) => st.project_task_id))]
    const subTaskCatalogIds = [...new Set(subTasks.map((st) => st.sub_task_id))]

    // 3. Get project IDs from project_task
    const { data: projectTasks } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id")
      .in("project_task_id", projectTaskIds)

    const projectIds = [...new Set((projectTasks ?? []).map((pt) => pt.project_id))]

    // 4. Get project names
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("project_id, title, site_address")
      .in("project_id", projectIds)

    // 5. Get sub_task descriptions (the 1–2 word overview)
    const { data: subTaskCatalog } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, description")
      .in("sub_task_id", subTaskCatalogIds)

    // Build lookup maps
    const projectTaskMap: Record<string, string> = Object.fromEntries(
      (projectTasks ?? []).map((pt) => [pt.project_task_id, pt.project_id]),
    )
    const projectMap: Record<string, { title: string | null; site_address: string | null }> = Object.fromEntries(
      (projects ?? []).map((p) => [p.project_id, p]),
    )
    const subTaskDescMap: Record<string, string | null> = Object.fromEntries(
      (subTaskCatalog ?? []).map((st) => [st.sub_task_id, st.description]),
    )

    // 6. Build timeline entries
    const timeline = subTasks
      .map((st) => {
        const projectId = projectTaskMap[st.project_task_id]
        const project = projectId ? projectMap[projectId] : null

        return {
          projectName: project?.title || project?.site_address || "Unknown Project",
          startDate: st.scheduled_start_datetime,
          estimatedHours: st.estimated_hours,
          taskDescription: subTaskDescMap[st.sub_task_id] ?? null,
          taskStatus: st.status,
          assignmentStatus: assignmentStatusMap[st.project_sub_task_id] ?? null,
        }
      })
      .sort((a, b) => {
        if (!a.startDate) return 1
        if (!b.startDate) return -1
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      })

    return NextResponse.json({ timeline: timeline.slice(0, 5) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
