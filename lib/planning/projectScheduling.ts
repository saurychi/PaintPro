import type { ProjectDimensions } from "@/lib/planning/materialEstimator"

export type SchedulingGeneratedSubTask = {
  title: string
  priority: number
  duration?: {
    estimatedHours?: number | null
    adjustedDurationHours?: number | null
    roundedHours?: number | null
    baseLaborHours?: number | null
  } | null
  assignedEmployee?: {
    id?: string | null
  } | null
  employees?: Array<{
    id?: string | null
  }> | null
}

export type SchedulingGeneratedMainTask = {
  name: string
  priority: number
  sub_tasks: SchedulingGeneratedSubTask[]
}

export type ExistingScheduledBlock = {
  userId: string
  startDatetime: string
  endDatetime: string
}

export type ProjectSchedulingInput = {
  project: {
    scheduled_start_datetime?: string | null
    scheduled_end_datetime?: string | null
    dimensions?: ProjectDimensions | null
  }
  generatedTasks: SchedulingGeneratedMainTask[]
  existingBlocks?: ExistingScheduledBlock[]
}

export type ProjectSubTaskScheduleItem = {
  taskName: string
  subTaskTitle: string
  assignedUserId: string | null
  estimatedHours: number | null
  scheduledStartDatetime: string | null
  scheduledEndDatetime: string | null
  sortOrder: number
}

export type ProjectScheduleResult = {
  scheduledItems: ProjectSubTaskScheduleItem[]
  projectScheduledEndDatetime: string | null
}

const WORK_START_HOUR = 9
const WORK_END_HOUR = 17

function isValidDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false
  return !Number.isNaN(new Date(value).getTime())
}

function cloneDate(date: Date) {
  return new Date(date.getTime())
}

function firstAssignedEmployeeId(subTask: SchedulingGeneratedSubTask) {
  if (typeof subTask.assignedEmployee?.id === "string" && subTask.assignedEmployee.id.trim()) {
    return subTask.assignedEmployee.id.trim()
  }

  if (Array.isArray(subTask.employees)) {
    const first = subTask.employees.find(
      (employee) => typeof employee?.id === "string" && employee.id.trim()
    )

    if (typeof first?.id === "string" && first.id.trim()) {
      return first.id.trim()
    }
  }

  return null
}

function getScheduledHours(subTask: SchedulingGeneratedSubTask) {
  const candidates = [
    subTask.duration?.estimatedHours,
    subTask.duration?.roundedHours,
    subTask.duration?.adjustedDurationHours,
    subTask.duration?.baseLaborHours,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
  }

  return 1
}

function startOfWorkday(date: Date) {
  const next = cloneDate(date)
  next.setHours(WORK_START_HOUR, 0, 0, 0)
  return next
}

function endOfWorkday(date: Date) {
  const next = cloneDate(date)
  next.setHours(WORK_END_HOUR, 0, 0, 0)
  return next
}

function moveToNextWorkdayStart(date: Date) {
  const next = cloneDate(date)
  next.setDate(next.getDate() + 1)
  next.setHours(WORK_START_HOUR, 0, 0, 0)
  return next
}

function clampToWorkingTime(date: Date) {
  const next = cloneDate(date)
  const dayStart = startOfWorkday(next)
  const dayEnd = endOfWorkday(next)

  if (next < dayStart) return dayStart
  if (next >= dayEnd) return moveToNextWorkdayStart(next)

  return next
}

function addWorkingHours(start: Date, hours: number) {
  let remainingMs = Math.max(0, hours) * 60 * 60 * 1000
  let cursor = clampToWorkingTime(start)

  if (remainingMs === 0) {
    return cloneDate(cursor)
  }

  while (remainingMs > 0) {
    const dayEnd = endOfWorkday(cursor)
    const availableToday = dayEnd.getTime() - cursor.getTime()

    if (availableToday <= 0) {
      cursor = moveToNextWorkdayStart(cursor)
      continue
    }

    const chunk = Math.min(remainingMs, availableToday)
    cursor = new Date(cursor.getTime() + chunk)
    remainingMs -= chunk

    if (remainingMs > 0) {
      cursor = moveToNextWorkdayStart(cursor)
    }
  }

  return cursor
}

function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime()
}

function normalizeExistingBlocks(blocks: ExistingScheduledBlock[]) {
  return blocks
    .map((block) => ({
      userId: block.userId,
      start: new Date(block.startDatetime),
      end: new Date(block.endDatetime),
    }))
    .filter(
      (block) =>
        block.userId &&
        !Number.isNaN(block.start.getTime()) &&
        !Number.isNaN(block.end.getTime()) &&
        block.end > block.start
    )
}

function findNextFreeSlot(args: {
  desiredStart: Date
  durationHours: number
  assignedUserId: string | null
  blocksByUser: Map<string, Array<{ start: Date; end: Date }>>
}) {
  const { desiredStart, durationHours, assignedUserId, blocksByUser } = args

  if (!assignedUserId) {
    const start = clampToWorkingTime(desiredStart)
    const end = addWorkingHours(start, durationHours)
    return { start, end }
  }

  const blocks = blocksByUser.get(assignedUserId) ?? []
  let candidateStart = clampToWorkingTime(desiredStart)

  while (true) {
    const candidateEnd = addWorkingHours(candidateStart, durationHours)

    const conflictingBlock = blocks.find((block) =>
      overlaps(candidateStart, candidateEnd, block.start, block.end)
    )

    if (!conflictingBlock) {
      return {
        start: candidateStart,
        end: candidateEnd,
      }
    }

    candidateStart = clampToWorkingTime(conflictingBlock.end)
  }
}

export function buildProjectSchedule(
  input: ProjectSchedulingInput
): ProjectScheduleResult {
  const scheduledStart =
    isValidDate(input.project.scheduled_start_datetime)
      ? new Date(String(input.project.scheduled_start_datetime))
      : null

  const flattened = input.generatedTasks.flatMap((task) =>
    task.sub_tasks.map((subTask) => ({
      taskName: task.name,
      subTaskTitle: subTask.title,
      assignedUserId: firstAssignedEmployeeId(subTask),
      estimatedHours: getScheduledHours(subTask),
      sortOrder: subTask.priority || 0,
    }))
  )

  if (!scheduledStart) {
    return {
      scheduledItems: flattened.map((item) => ({
        ...item,
        scheduledStartDatetime: null,
        scheduledEndDatetime: null,
      })),
      projectScheduledEndDatetime: null,
    }
  }

  const normalizedBlocks = normalizeExistingBlocks(input.existingBlocks ?? [])
  const blocksByUser = new Map<string, Array<{ start: Date; end: Date }>>()

  for (const block of normalizedBlocks) {
    const list = blocksByUser.get(block.userId) ?? []
    list.push({ start: block.start, end: block.end })
    blocksByUser.set(block.userId, list)
  }

  for (const [userId, blocks] of blocksByUser.entries()) {
    blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
    blocksByUser.set(userId, blocks)
  }

  let projectCursor = clampToWorkingTime(scheduledStart)
  let latestEnd: Date | null = null

  const scheduledItems: ProjectSubTaskScheduleItem[] = flattened.map((item) => {
    const slot = findNextFreeSlot({
      desiredStart: projectCursor,
      durationHours: item.estimatedHours ?? 1,
      assignedUserId: item.assignedUserId,
      blocksByUser,
    })

    if (item.assignedUserId) {
      const list = blocksByUser.get(item.assignedUserId) ?? []
      list.push({ start: slot.start, end: slot.end })
      list.sort((a, b) => a.start.getTime() - b.start.getTime())
      blocksByUser.set(item.assignedUserId, list)
    }

    projectCursor = cloneDate(slot.end)

    if (!(latestEnd instanceof Date) || slot.end.getTime() > latestEnd.getTime()) {
      latestEnd = cloneDate(slot.end)
    }

    return {
      taskName: item.taskName,
      subTaskTitle: item.subTaskTitle,
      assignedUserId: item.assignedUserId,
      estimatedHours: item.estimatedHours,
      scheduledStartDatetime: slot.start.toISOString(),
      scheduledEndDatetime: slot.end.toISOString(),
      sortOrder: item.sortOrder,
    }
  })

  const finalLatestEnd = latestEnd as Date | null

  return {
    scheduledItems,
    projectScheduledEndDatetime: finalLatestEnd
      ? finalLatestEnd.toISOString()
      : null,
  }
}
