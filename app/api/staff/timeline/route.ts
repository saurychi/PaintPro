import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")?.trim()

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    // 1. All sub-task assignments for this user
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("project_sub_task_id, assignment_status")
      .eq("user_id", userId)

    if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 })
    if (!assignments || assignments.length === 0) return NextResponse.json({ projects: [] })

    const subTaskIds = assignments.map((a) => a.project_sub_task_id)
    const assignmentStatusMap = Object.fromEntries(
      assignments.map((a) => [a.project_sub_task_id, a.assignment_status ?? null]),
    )

    // 2. Sub-task schedule details
    const { data: subTasks, error: subTaskError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, sub_task_id, scheduled_start_datetime, scheduled_end_datetime, estimated_hours, status",
      )
      .in("project_sub_task_id", subTaskIds)

    if (subTaskError) return NextResponse.json({ error: subTaskError.message }, { status: 500 })
    if (!subTasks || subTasks.length === 0) return NextResponse.json({ projects: [] })

    const projectTaskIds = [...new Set(subTasks.map((st) => st.project_task_id))]
    const subTaskCatalogIds = [...new Set(subTasks.map((st) => st.sub_task_id))]

    // 3. Project task → project ID + main task name
    const { data: projectTasks } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task(name)")
      .in("project_task_id", projectTaskIds)

    const projectIds = [...new Set((projectTasks ?? []).map((pt) => pt.project_id))]

    // 4. Project details
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("project_id, title, site_address, status")
      .in("project_id", projectIds)

    // 5. Sub-task catalog descriptions
    const { data: subTaskCatalog } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, description")
      .in("sub_task_id", subTaskCatalogIds)

    // Build lookup maps
    type PtInfo = { projectId: string; mainTaskName: string | null }
    const projectTaskMap: Record<string, PtInfo> = Object.fromEntries(
      (projectTasks ?? []).map((pt) => [
        pt.project_task_id,
        {
          projectId: pt.project_id,
          mainTaskName: (pt as any).main_task?.name ?? null,
        },
      ]),
    )

    const projectInfoMap: Record<
      string,
      { title: string | null; site_address: string | null; status: string | null }
    > = Object.fromEntries((projects ?? []).map((p) => [p.project_id, p]))

    const subTaskDescMap: Record<string, string | null> = Object.fromEntries(
      (subTaskCatalog ?? []).map((st) => [st.sub_task_id, st.description ?? null]),
    )

    // 6. Group by project
    type TaskEntry = {
      taskDescription: string | null
      mainTaskName: string | null
      taskStatus: string | null
      assignmentStatus: string | null
      startDate: string | null
      endDate: string | null
      estimatedHours: number | null
    }
    type ProjectEntry = {
      projectId: string
      projectName: string
      siteAddress: string | null
      projectStatus: string | null
      tasks: TaskEntry[]
    }

    const grouped = new Map<string, ProjectEntry>()

    for (const st of subTasks) {
      const ptInfo = projectTaskMap[st.project_task_id]
      if (!ptInfo) continue

      const { projectId, mainTaskName } = ptInfo
      const proj = projectInfoMap[projectId]
      const projectName = proj?.title || proj?.site_address || "Unknown Project"

      const task: TaskEntry = {
        taskDescription: subTaskDescMap[st.sub_task_id] ?? null,
        mainTaskName,
        taskStatus: st.status ?? null,
        assignmentStatus: assignmentStatusMap[st.project_sub_task_id] ?? null,
        startDate: st.scheduled_start_datetime ?? null,
        endDate: st.scheduled_end_datetime ?? null,
        estimatedHours: st.estimated_hours ?? null,
      }

      if (!grouped.has(projectId)) {
        grouped.set(projectId, {
          projectId,
          projectName,
          siteAddress: proj?.site_address ?? null,
          projectStatus: proj?.status ?? null,
          tasks: [task],
        })
      } else {
        grouped.get(projectId)!.tasks.push(task)
      }
    }

    // Sort projects by earliest task start date (newest first)
    const result = Array.from(grouped.values()).sort((a, b) => {
      const aDate = a.tasks.find((t) => t.startDate)?.startDate
      const bDate = b.tasks.find((t) => t.startDate)?.startDate
      if (!aDate) return 1
      if (!bDate) return -1
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })

    return NextResponse.json({ projects: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
