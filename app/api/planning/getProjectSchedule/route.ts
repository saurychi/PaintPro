import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import {
  buildProjectSchedule,
  type SchedulingGeneratedMainTask,
} from "@/lib/planning/projectScheduling"
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays"

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
            "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime"
          )
          .in("project_sub_task_id", projectSubTaskIds)
          .not("scheduled_start_datetime", "is", null)
          .not("scheduled_end_datetime", "is", null)
          // Cancelled subtasks shouldn't block the new schedule even if
          // their datetime columns are still set (defensive — the cancel
          // route also nulls these out, but old data may not have been
          // migrated).
          .neq("status", "cancelled")
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

        // Resolve each subtask to its parent project so we can drop blocks
        // belonging to cancelled or completed projects. Without this filter
        // a cancelled project's stale schedule rows phantom-block staff.
        const projectTaskIds = [
          ...new Set(
            (scheduledRows ?? [])
              .map((row) => (row as { project_task_id?: string }).project_task_id)
              .filter((id): id is string => Boolean(id))
          ),
        ]

        const inactiveSubTaskIds = new Set<string>()

        if (projectTaskIds.length > 0) {
          const { data: projectTaskRows, error: projectTaskError } =
            await supabaseAdmin
              .from("project_task")
              .select("project_task_id, project_id")
              .in("project_task_id", projectTaskIds)

          if (projectTaskError) {
            return NextResponse.json(
              {
                error: "Failed to resolve subtask projects.",
                details: projectTaskError.message,
              },
              { status: 500 }
            )
          }

          const projectIdsForBlocks = [
            ...new Set(
              (projectTaskRows ?? [])
                .map((row) => row.project_id as string)
                .filter(Boolean)
            ),
          ]

          if (projectIdsForBlocks.length > 0) {
            const { data: projectRows, error: projectStatusError } =
              await supabaseAdmin
                .from("projects")
                .select("project_id, status")
                .in("project_id", projectIdsForBlocks)

            if (projectStatusError) {
              return NextResponse.json(
                {
                  error: "Failed to resolve project statuses.",
                  details: projectStatusError.message,
                },
                { status: 500 }
              )
            }

            const inactiveProjectIds = new Set(
              (projectRows ?? [])
                .filter(
                  (row) =>
                    String(row.status ?? "").toLowerCase() === "cancelled" ||
                    String(row.status ?? "").toLowerCase() === "completed"
                )
                .map((row) => row.project_id as string)
            )

            const taskToProject = new Map(
              (projectTaskRows ?? []).map((row) => [
                row.project_task_id as string,
                row.project_id as string,
              ])
            )

            for (const row of scheduledRows ?? []) {
              const projectIdForRow = taskToProject.get(
                (row as { project_task_id?: string }).project_task_id ?? ""
              )
              if (projectIdForRow && inactiveProjectIds.has(projectIdForRow)) {
                inactiveSubTaskIds.add(row.project_sub_task_id)
              }
            }
          }
        }

        const scheduledRowMap = new Map(
          (scheduledRows ?? [])
            .filter((row) => !inactiveSubTaskIds.has(row.project_sub_task_id))
            .map((row) => [row.project_sub_task_id, row])
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

    // Pull manual blocks + public holidays (the same set the schedule pages
    // render in red) so the scheduler skips both kinds when laying out
    // subtasks. Without the cookie-driven holiday settings, the user would
    // see freshly generated projects overlap holidays on the calendar.
    const unavailableDays = await listScheduleUnavailableDays(
      req.headers.get("cookie"),
    )

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
      generatedTasks: generatedTasks as SchedulingGeneratedMainTask[],
      existingBlocks,
      unavailableDates: unavailableDays.map((day) => day.blockedDate),
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
