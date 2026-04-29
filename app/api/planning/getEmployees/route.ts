import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { assignStaffPerTaskGroup } from "@/lib/planning/employeeAssignment"
import type { EmployeeHint, WeekdayKey } from "@/lib/planning/aiContext"

type UserRole = "client" | "staff" | "manager" | "admin"
type UserStatus = "active" | "inactive" | "pending"

type UserRow = {
  id: string
  username: string | null
  role: UserRole | null
  specialty: string | string[] | null
  status: UserStatus | null
}

type StaffUnavailabilityRow = {
  user_id: string | null
  start_datetime: string | null
  end_datetime: string | null
  reason: string | null
}

type RequestSubTask = {
  title: string
  priority?: number
  estimatedHours?: number
  requiredEmployeeCount?: number
}

type RequestTask = {
  taskName: string
  subTasks: RequestSubTask[]
}

type SuccessResponse = {
  day: WeekdayKey | null
  scheduledDate: string | null
  assignments: Array<{
    taskName: string
    assignments: Array<{
      taskName: string
      subTaskTitle: string
      requiredEmployeeCount: number
      employees: EmployeeHint[]
      score: number
      reasons: string[]
    }>
  }>
}

type EmployeeAvailability = {
  day_of_week: WeekdayKey
  is_available: boolean
  start_time: string | null
  end_time: string | null
}

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isWeekday(value: unknown): value is WeekdayKey {
  return (
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday" ||
    value === "sunday"
  )
}

function normalizeRole(value: unknown): UserRole {
  if (
    value === "client" ||
    value === "staff" ||
    value === "manager" ||
    value === "admin"
  ) {
    return value
  }

  return "staff"
}

function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }

  return []
}

function normalizeTasks(value: unknown): RequestTask[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isObj)
    .map((task) => {
      const taskName =
        typeof task.taskName === "string" ? task.taskName.trim() : ""

      const subTasks = Array.isArray(task.subTasks)
        ? task.subTasks
            .filter(isObj)
            .map((subTask) => ({
              title:
                typeof subTask.title === "string" ? subTask.title.trim() : "",
              priority:
                Number.isFinite(Number(subTask.priority))
                  ? Number(subTask.priority)
                  : undefined,
              estimatedHours:
                Number.isFinite(Number(subTask.estimatedHours))
                  ? Number(subTask.estimatedHours)
                  : undefined,
              requiredEmployeeCount:
                Number.isFinite(Number(subTask.requiredEmployeeCount))
                  ? Number(subTask.requiredEmployeeCount)
                  : undefined,
            }))
            .filter((subTask) => subTask.title)
        : []

      return {
        taskName,
        subTasks,
      }
    })
    .filter((task) => task.taskName && task.subTasks.length > 0)
}

function getWeekdayFromDate(dateString: string): WeekdayKey | null {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) return null

  const day = parsed.getDay()

  if (day === 0) return "sunday"
  if (day === 1) return "monday"
  if (day === 2) return "tuesday"
  if (day === 3) return "wednesday"
  if (day === 4) return "thursday"
  if (day === 5) return "friday"
  return "saturday"
}

function getDayBounds(dateString: string) {
  const start = new Date(`${dateString}T00:00:00`)
  const end = new Date(`${dateString}T23:59:59.999`)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function hasOverlappingUnavailability(
  rows: StaffUnavailabilityRow[],
  dayStartIso: string,
  dayEndIso: string
) {
  const dayStart = new Date(dayStartIso).getTime()
  const dayEnd = new Date(dayEndIso).getTime()

  return rows.some((row) => {
    if (!row.start_datetime || !row.end_datetime) return false

    const blockStart = new Date(row.start_datetime).getTime()
    const blockEnd = new Date(row.end_datetime).getTime()

    if (Number.isNaN(blockStart) || Number.isNaN(blockEnd)) return false

    return blockStart < dayEnd && blockEnd > dayStart
  })
}

function buildAvailabilityForScheduledDate(args: {
  scheduledDate: string | null
  rows: StaffUnavailabilityRow[]
}): EmployeeAvailability[] {
  const { scheduledDate, rows } = args

  if (!scheduledDate) return []

  const weekday = getWeekdayFromDate(scheduledDate)
  if (!weekday) return []

  const { startIso, endIso } = getDayBounds(scheduledDate)
  const unavailable = hasOverlappingUnavailability(rows, startIso, endIso)

  return [
    {
      day_of_week: weekday,
      is_available: !unavailable,
      start_time: unavailable ? null : "08:00:00",
      end_time: unavailable ? null : "17:00:00",
    },
  ]
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

  const scheduledDate =
    typeof body.scheduledDate === "string" ? body.scheduledDate.trim() : ""

  const day = isWeekday(body.day)
    ? body.day
    : scheduledDate
      ? getWeekdayFromDate(scheduledDate)
      : null

  const tasks = normalizeTasks(body.tasks)

  if (!tasks.length) {
    return NextResponse.json(
      { error: "Missing or invalid tasks." },
      { status: 400 }
    )
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, username, role, specialty, status")
    .eq("role", "staff")
    .eq("status", "active")

  if (usersError) {
    return NextResponse.json(
      {
        error: "Failed to fetch staff users.",
        details: usersError.message,
      },
      { status: 500 }
    )
  }

  const userIds = (users ?? [])
    .map((user) => (typeof user.id === "string" ? user.id : ""))
    .filter(Boolean)

  let unavailabilityRows: StaffUnavailabilityRow[] = []

  if (userIds.length && scheduledDate) {
    const { startIso, endIso } = getDayBounds(scheduledDate)

    const { data, error } = await supabaseAdmin
      .from("staff_unavailability")
      .select("user_id, start_datetime, end_datetime, reason")
      .in("user_id", userIds)
      .lt("start_datetime", endIso)
      .gt("end_datetime", startIso)

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch staff unavailability.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    unavailabilityRows = (data ?? []) as StaffUnavailabilityRow[]
  }

  const unavailabilityByUser = new Map<string, StaffUnavailabilityRow[]>()

  for (const row of unavailabilityRows) {
    if (!row.user_id) continue
    const list = unavailabilityByUser.get(row.user_id) ?? []
    list.push(row)
    unavailabilityByUser.set(row.user_id, list)
  }

  const employees: EmployeeHint[] = ((users ?? []) as UserRow[]).map((user) => ({
    id: user.id,
    name: user.username?.trim() || "Unnamed Staff",
    role: normalizeRole(user.role),
    specialties: normalizeSpecialties(user.specialty),
    availability: buildAvailabilityForScheduledDate({
      scheduledDate: scheduledDate || null,
      rows: unavailabilityByUser.get(user.id) ?? [],
    }),
  }))

  const groupedAssignments = assignStaffPerTaskGroup({
    tasks: tasks.map((task) => ({
      name: task.taskName,
      sub_tasks: task.subTasks.map((subTask) => ({
        title: subTask.title,
        priority: subTask.priority,
        estimatedHours: subTask.estimatedHours,
        requiredEmployeeCount: subTask.requiredEmployeeCount,
      })),
    })),
    employees,
    day: day ?? undefined,
    requireAvailability: true,
  })

  const response: SuccessResponse = {
    day,
    scheduledDate: scheduledDate || null,
    assignments: groupedAssignments.map((group) => ({
      taskName: group.taskName,
      assignments: group.assignments.map((assignment) => ({
        taskName: assignment.taskName,
        subTaskTitle: assignment.subTaskTitle,
        requiredEmployeeCount: assignment.requiredEmployeeCount,
        employees: assignment.employees,
        score: assignment.score,
        reasons: assignment.reasons,
      })),
    })),
  }

  return NextResponse.json(response)
}
