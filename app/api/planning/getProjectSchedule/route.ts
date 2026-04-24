import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { buildProjectSchedule } from "@/lib/planning/projectScheduling"

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type ExistingScheduledRow = {
  assigned_user_id: string | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!isObj(body)) {
    return NextResponse.json({ error: "Invalid body shape." }, { status: 400 })
  }

  const project = isObj(body.project) ? body.project : null
  const generatedTasks = Array.isArray(body.generatedTasks) ? body.generatedTasks : []

  if (!project) {
    return NextResponse.json(
      { error: "Missing project payload." },
      { status: 400 }
    )
  }

  if (!generatedTasks.length) {
    return NextResponse.json(
      { error: "Missing generatedTasks payload." },
      { status: 400 }
    )
  }

  try {
    const assignedUserIds = generatedTasks
      .flatMap((task: any) =>
        Array.isArray(task.sub_tasks)
          ? task.sub_tasks.map((subTask: any) =>
              typeof subTask?.assignedEmployee?.id === "string"
                ? subTask.assignedEmployee.id.trim()
                : ""
            )
          : []
      )
      .filter(Boolean)

    let existingBlocks: Array<{
      userId: string
      startDatetime: string
      endDatetime: string
    }> = []

    if (assignedUserIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("project_sub_task")
        .select(
          "assigned_user_id, scheduled_start_datetime, scheduled_end_datetime"
        )
        .in("assigned_user_id", assignedUserIds)
        .not("scheduled_start_datetime", "is", null)
        .not("scheduled_end_datetime", "is", null)

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to load existing scheduled project subtasks.",
            details: error.message,
          },
          { status: 500 }
        )
      }

      existingBlocks = ((data ?? []) as ExistingScheduledRow[])
        .filter(
          (row) =>
            row.assigned_user_id &&
            row.scheduled_start_datetime &&
            row.scheduled_end_datetime
        )
        .map((row) => ({
          userId: row.assigned_user_id as string,
          startDatetime: row.scheduled_start_datetime as string,
          endDatetime: row.scheduled_end_datetime as string,
        }))
    }

    const schedule = buildProjectSchedule({
      project: {
        scheduled_start_datetime:
          typeof project.scheduled_start_datetime === "string"
            ? project.scheduled_start_datetime
            : null,
        scheduled_end_datetime:
          typeof project.scheduled_end_datetime === "string"
            ? project.scheduled_end_datetime
            : null,
        dimensions: isObj(project.dimensions) ? project.dimensions : null,
      },
      generatedTasks: generatedTasks as any,
      existingBlocks,
    })

    return NextResponse.json(schedule)
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to generate project schedule.",
        details: error?.message || "Unknown scheduling error.",
      },
      { status: 500 }
    )
  }
}
