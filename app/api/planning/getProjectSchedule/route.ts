import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { buildProjectSchedule } from "@/lib/planning/projectScheduling"

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type ExistingScheduledRow = {
  project_sub_task_id: string
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
}

type ExistingStaffAssignmentRow = {
  user_id: string
  project_sub_task_id: string
}

function readAssignedUserId(subTask: any) {
  if (typeof subTask?.assignedEmployee?.id === "string") {
    const directId = subTask.assignedEmployee.id.trim()
    if (directId) return directId
  }

  if (Array.isArray(subTask?.employees)) {
    const firstEmployee = subTask.employees.find(
      (employee: any) =>
        typeof employee?.id === "string" && employee.id.trim()
    )

    if (typeof firstEmployee?.id === "string") {
      return firstEmployee.id.trim()
    }
  }

  return ""
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
    const assignedUserIds = [
      ...new Set(
        generatedTasks
          .flatMap((task: any) =>
            Array.isArray(task.sub_tasks)
              ? task.sub_tasks.map((subTask: any) => readAssignedUserId(subTask))
              : []
          )
          .filter(Boolean)
      ),
    ]

    let existingBlocks: Array<{
      userId: string
      startDatetime: string
      endDatetime: string
    }> = []

    if (assignedUserIds.length > 0) {
      const { data: assignments, error: assignmentsError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .select("user_id, project_sub_task_id")
        .in("user_id", assignedUserIds)
        .returns<ExistingStaffAssignmentRow[]>()

      if (assignmentsError) {
        return NextResponse.json(
          {
            error: "Failed to load existing scheduled project subtasks.",
            details: assignmentsError.message,
          },
          { status: 500 }
        )
      }

      const projectSubTaskIds = [
        ...new Set(
          (assignments ?? []).map((row) => row.project_sub_task_id).filter(Boolean)
        ),
      ]

      if (projectSubTaskIds.length > 0) {
        const { data: scheduledRows, error: scheduledRowsError } = await supabaseAdmin
          .from("project_sub_task")
          .select(
            "project_sub_task_id, scheduled_start_datetime, scheduled_end_datetime"
          )
          .in("project_sub_task_id", projectSubTaskIds)
          .not("scheduled_start_datetime", "is", null)
          .not("scheduled_end_datetime", "is", null)
          .returns<ExistingScheduledRow[]>()

        if (scheduledRowsError) {
          return NextResponse.json(
            {
              error: "Failed to load existing scheduled project subtasks.",
              details: scheduledRowsError.message,
            },
            { status: 500 }
          )
        }

        const scheduledRowMap = new Map(
          (scheduledRows ?? []).map((row) => [row.project_sub_task_id, row])
        )

        existingBlocks = (assignments ?? [])
          .map((assignment) => {
            const scheduledRow = scheduledRowMap.get(
              assignment.project_sub_task_id
            )

            if (
              !scheduledRow?.scheduled_start_datetime ||
              !scheduledRow?.scheduled_end_datetime
            ) {
              return null
            }

            return {
              userId: assignment.user_id,
              startDatetime: scheduledRow.scheduled_start_datetime,
              endDatetime: scheduledRow.scheduled_end_datetime,
            }
          })
          .filter(
            (
              block
            ): block is {
              userId: string
              startDatetime: string
              endDatetime: string
            } => Boolean(block)
          )
      }
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
