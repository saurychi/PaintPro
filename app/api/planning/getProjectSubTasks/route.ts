import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")
    console.log("[getProjectSubTasks] projectId:", projectId) // here

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 }
      )
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title")
      .eq("project_id", projectId)
      .single()

      // here
    console.log("[getProjectSubTasks] project query result:", {
      project,
      projectError,
    })

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project.",
          details: projectError.message,
        },
        { status: 500 }
      )
    }

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id")
      .eq("project_id", projectId)

    console.log("[getProjectSubTasks] project_task rows:", {
      projectTasksError,
      rowCount: projectTasks?.length ?? 0,
      projectTasks,
    })

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project tasks.",
          details: projectTasksError.message,
        },
        { status: 500 }
      )
    }

    const projectTaskIds = (projectTasks ?? []).map((row) => row.project_task_id)

    console.log("[getProjectSubTasks] projectTaskIds:", projectTaskIds)

    if (projectTaskIds.length === 0) {
      return NextResponse.json({
        project,
        projectSubTasks: [],
      })
    }

    const { data, error } = await supabaseAdmin
      .from("project_sub_task")
      .select(`
        project_sub_task_id,
        project_task_id,
        sub_task_id,
        estimated_hours,
        status,
        sort_order,
        notes,
        scheduled_start_datetime,
        scheduled_end_datetime,
        actual_start_datetime,
        actual_end_datetime,
        project_task:project_task_id!inner (
          project_task_id,
          project_id,
          main_task_id,
          main_task:main_task_id!inner (
            main_task_id,
            name,
            sort_order:default_sort_order
          )
        ),
        sub_task:sub_task_id!inner (
          sub_task_id,
          description,
          sort_order:default_sort_order
        )
      `)
      .in("project_task_id", projectTaskIds)
      .order("sort_order", { ascending: true })

    console.log("[getProjectSubTasks] subtask query result:", {
      error,
      rowCount: data?.length ?? 0,
      data,
    })

    // here
    console.log("[getProjectSubTasks] subtask query result:", {
      error,
      rowCount: data?.length ?? 0,
      data,
    })

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch project subtasks.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    // here
    console.log("[getProjectSubTasks] final response:", {
      project,
      projectSubTasks: data ?? [],
    })

    return NextResponse.json({
      project,
      projectSubTasks: data ?? [],
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching project subtasks.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
