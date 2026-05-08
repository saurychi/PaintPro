import type { ProjectDimensions } from "@/lib/planning/materialEstimator"
// Sunday + lunch (12-13 LOCAL) + work-hour (09-17) rules shared with the
// schedule wizard drag/resize and the staff-completion cascade so the
// same span never changes shape depending on which call path produced it.
import {
  WORK_START_HOUR,
  WORK_END_HOUR,
  isNonWorkingDay,
  placeWorkSpan,
} from "@/lib/schedule/workHours"

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
  unavailableDates?: string[]
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

function moveToNextAvailableWorkdayStart(date: Date, unavailableDateSet: Set<string>) {
  let next = cloneDate(date)

  // isNonWorkingDay returns true for Sundays even when the set is empty,
  // so a project whose start lands on Sunday gets nudged to Monday 9am
  // without callers having to enumerate Sundays explicitly.
  while (isNonWorkingDay(next, unavailableDateSet)) {
    next = moveToNextWorkdayStart(next)
  }

  return next
}

function clampToWorkingTime(date: Date, unavailableDateSet = new Set<string>()) {
  const next = cloneDate(date)
  const availableDay = moveToNextAvailableWorkdayStart(next, unavailableDateSet)

  if (availableDay.getTime() !== next.getTime()) {
    return availableDay
  }

  const dayStart = startOfWorkday(next)
  const dayEnd = endOfWorkday(next)

  if (next < dayStart) return dayStart
  if (next >= dayEnd) {
    return moveToNextAvailableWorkdayStart(moveToNextWorkdayStart(next), unavailableDateSet)
  }

  return next
}

// Subtasks are modelled as a SPAN of N work-hours that pauses for
// lunch / unavailable days / Sunday / 17:00 work-end and resumes on the
// next valid block. `placeWorkSpan` returns the envelope (first segment
// start, last segment end) plus the segment list — callers store the
// envelope in the DB and the renderer fans the segments out as adjacent
// chips. This keeps the lunch row visually empty without sliding the
// whole task past it.
function placeContiguousSpan(
  start: Date,
  hours: number,
  unavailableDateSet: Set<string>
) {
  const safeHours = Math.max(0, hours)
  const cursor = clampToWorkingTime(start, unavailableDateSet)

  if (safeHours === 0) return { start: cloneDate(cursor), end: cloneDate(cursor) }

  const placed = placeWorkSpan(cursor, safeHours, unavailableDateSet)
  return { start: placed.start, end: placed.end }
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
  unavailableDateSet: Set<string>
}) {
  const { desiredStart, durationHours, assignedUserId, blocksByUser, unavailableDateSet } = args

  if (!assignedUserId) {
    return placeContiguousSpan(desiredStart, durationHours, unavailableDateSet)
  }

  const blocks = blocksByUser.get(assignedUserId) ?? []
  let candidateStart = clampToWorkingTime(desiredStart, unavailableDateSet)

  while (true) {
    // placeContiguousSpan may push the start past blocked days inside the
    // window, so the conflict check must use the snapped span — not the
    // pre-snap candidateStart — otherwise we'd compare an employee block
    // against the wrong interval.
    const placed = placeContiguousSpan(
      candidateStart,
      durationHours,
      unavailableDateSet
    )

    const conflictingBlock = blocks.find((block) =>
      overlaps(placed.start, placed.end, block.start, block.end)
    )

    if (!conflictingBlock) {
      return placed
    }

    candidateStart = clampToWorkingTime(conflictingBlock.end, unavailableDateSet)
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

  const unavailableDateSet = new Set(
    (input.unavailableDates ?? []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  )

  // Earliest-start-first single-cursor scheduling. Each step we look
  // at every still-unscheduled subtask and pick the one whose placement
  // would START EARLIEST given the current cursor, then advance the
  // cursor to that placement's end. Strictly serial output (no two
  // subtasks share a time slot, no visual stacking on the calendar)
  // AND no gaps — when the priority-next subtask's assigned employee
  // is busy with another project, we defer it and run a free-employee
  // subtask first to fill the slot.
  //
  // Trade-off: subtask priority order can be reordered when needed to
  // close gaps. Within a single employee's queue, priority order is
  // preserved (their subtasks naturally process in input order because
  // they all have the same employee cursor and tie on placement time).
  // O(N²) in subtask count — fine up to ~100 subtasks.
  const projectStart = clampToWorkingTime(scheduledStart, unavailableDateSet)
  const unscheduled = flattened.map((item, originalIndex) => ({
    ...item,
    originalIndex,
  }))
  let projectCursor = projectStart
  let latestEnd: Date | null = null
  const scheduledItems: ProjectSubTaskScheduleItem[] = []

  while (unscheduled.length > 0) {
    let bestIdx = 0
    let bestStartMs = Number.POSITIVE_INFINITY
    let bestPlacement: { start: Date; end: Date } | null = null

    for (let i = 0; i < unscheduled.length; i++) {
      const item = unscheduled[i]
      const placement = findNextFreeSlot({
        desiredStart: projectCursor,
        durationHours: item.estimatedHours ?? 1,
        assignedUserId: item.assignedUserId,
        blocksByUser,
        unavailableDateSet,
      })
      const startMs = placement.start.getTime()
      // Strict `<` so a tie keeps the earlier-by-original-index winner,
      // preserving priority order between subtasks that could place at
      // the same time.
      if (startMs < bestStartMs) {
        bestIdx = i
        bestStartMs = startMs
        bestPlacement = placement
      }
    }

    if (!bestPlacement) break

    const item = unscheduled[bestIdx]
    const slot = bestPlacement

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

    scheduledItems.push({
      taskName: item.taskName,
      subTaskTitle: item.subTaskTitle,
      assignedUserId: item.assignedUserId,
      estimatedHours: item.estimatedHours,
      scheduledStartDatetime: slot.start.toISOString(),
      scheduledEndDatetime: slot.end.toISOString(),
      sortOrder: item.sortOrder,
    })

    unscheduled.splice(bestIdx, 1)
  }

  const finalLatestEnd = latestEnd as Date | null

  return {
    scheduledItems,
    projectScheduledEndDatetime: finalLatestEnd
      ? finalLatestEnd.toISOString()
      : null,
  }
}
