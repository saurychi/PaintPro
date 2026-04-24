import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type IncomingTask = {
  id: string
  name?: string
  project_task_id?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const projectId = body?.projectId as string | undefined
    const mainTasks = Array.isArray(body?.mainTasks) ? (body.mainTasks as IncomingTask[]) : []

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 })
    }

    const normalizedIncoming = mainTasks
      .map((task) => ({
        id: typeof task?.id === "string" ? task.id.trim() : "",
        project_task_id:
          typeof task?.project_task_id === "string" && task.project_task_id.trim().length > 0
            ? task.project_task_id.trim()
            : null,
      }))
      .filter((task) => task.id.length > 0)

    const incomingMainTaskIds = Array.from(new Set(normalizedIncoming.map((task) => task.id)))

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id")
      .eq("project_id", projectId)

    if (existingError) {
      return NextResponse.json(
        {
          error: "Failed to fetch existing project main tasks.",
          details: existingError.message,
        },
        { status: 500 }
      )
    }

    const existingByMainTaskId = new Map(
      (existingRows ?? []).map((row) => [row.main_task_id, row])
    )

    const existingMainTaskIds = new Set((existingRows ?? []).map((row) => row.main_task_id))

    const toInsert = incomingMainTaskIds.filter((mainTaskId) => !existingMainTaskIds.has(mainTaskId))

    const toDelete = (existingRows ?? []).filter(
      (row) => !incomingMainTaskIds.includes(row.main_task_id)
    )

    if (toDelete.length > 0) {
      const projectTaskIdsToDelete = toDelete.map((row) => row.project_task_id)

      const { error: deleteSubTaskError } = await supabaseAdmin
        .from("project_sub_task")
        .delete()
        .in("project_task_id", projectTaskIdsToDelete)

      if (deleteSubTaskError) {
        return NextResponse.json(
          {
            error: "Failed to clear subtasks for removed main tasks.",
            details: deleteSubTaskError.message,
          },
          { status: 500 }
        )
      }

      const { error: deleteProjectTaskError } = await supabaseAdmin
        .from("project_task")
        .delete()
        .in("project_task_id", projectTaskIdsToDelete)

      if (deleteProjectTaskError) {
        return NextResponse.json(
          {
            error: "Failed to remove deselected main tasks.",
            details: deleteProjectTaskError.message,
          },
          { status: 500 }
        )
      }
    }

    let insertedRows: any[] = []

    if (toInsert.length > 0) {
      const rowsToInsert = toInsert.map((mainTaskId) => ({
        project_id: projectId,
        main_task_id: mainTaskId,
      }))

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("project_task")
        .insert(rowsToInsert)
        .select("project_task_id, project_id, main_task_id")

      if (insertError) {
        return NextResponse.json(
          {
            error: "Failed to insert new project main tasks.",
            details: insertError.message,
          },
          { status: 500 }
        )
      }

      insertedRows = inserted ?? []
    }

    const { error: statusError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "sub_task_pending",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)

    if (statusError) {
      return NextResponse.json(
        {
          error: "Main tasks were saved, but failed to update project status.",
          details: statusError.message,
        },
        { status: 500 }
      )
    }

    const finalRows = [
      ...((existingRows ?? []).filter((row) => incomingMainTaskIds.includes(row.main_task_id))),
      ...insertedRows,
    ]

    return NextResponse.json({
      success: true,
      message: "Project main tasks saved successfully.",
      projectTasks: finalRows,
      status: "sub_task_pending",
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving project main tasks.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
