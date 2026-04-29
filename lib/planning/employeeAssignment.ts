import type { EmployeeHint, WeekdayKey } from "@/lib/planning/aiContext"
import { getRequiredEmployeeCountFromLaborHours } from "@/lib/planning/workforceMath"

export type ProjectTaskLite = {
  name: string
  priority?: number
}

export type ProjectSubTaskLite = {
  title: string
  priority?: number
  estimatedHours?: number
  requiredEmployeeCount?: number
}

export type EmployeeAssignmentScore = {
  employee: EmployeeHint
  matched_specialties: string[]
  is_available: boolean
  assignment_count: number
  repeat_penalty: number
  score: number
  reasons: string[]
}

export type EmployeeTaskSuggestion = {
  taskName: string
  suggested: EmployeeAssignmentScore[]
}

export type EmployeeSubTaskAssignment = {
  taskName: string
  subTaskTitle: string
  requiredEmployeeCount: number
  employees: EmployeeHint[]
  score: number
  reasons: string[]
}

const SPECIALTY_STOP_WORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "with",
  "in",
  "on",
  "at",
  "by",
])

function tokenizeMeaningfulWords(value: string): string[] {
  return norm(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !SPECIALTY_STOP_WORDS.has(word))
}

function hasKeywordOverlap(left: string, right: string): boolean {
  const leftWords = tokenizeMeaningfulWords(left)
  const rightWords = tokenizeMeaningfulWords(right)

  if (!leftWords.length || !rightWords.length) return false

  const rightSet = new Set(rightWords)
  const overlapCount = leftWords.filter((word) => rightSet.has(word)).length

  if (overlapCount >= 2) return true

  if (leftWords.length === 1 && rightWords.length === 1) {
    return leftWords[0] === rightWords[0]
  }

  return false
}

const ALL_WEEKDAYS: readonly WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const REPEAT_PENALTY_PER_ASSIGNMENT = 18

function norm(value: string) {
  return String(value || "").trim().toLowerCase()
}

function shuffleArray<T>(items: readonly T[]) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function isAssignableStaff(employee: EmployeeHint) {
  return employee.role === "staff"
}

export function getAvailableDays(employee: EmployeeHint): WeekdayKey[] {
  const availabilityMap = new Map(
    (employee.availability ?? []).map((entry) => [norm(entry.day_of_week), entry.is_available])
  )

  return ALL_WEEKDAYS.filter((day) => availabilityMap.get(norm(day)) === true)
}

export function isEmployeeAvailableOnDay(employee: EmployeeHint, day: WeekdayKey): boolean {
  const matched = (employee.availability ?? []).find(
    (entry) => norm(entry.day_of_week) === norm(day)
  )

  return matched?.is_available === true
}

export function getMatchedSpecialties(
  employee: EmployeeHint,
  taskNames: readonly string[]
): string[] {
  const normalizedTasks = taskNames
    .map((task) => norm(task))
    .filter(Boolean)

  return (employee.specialties ?? []).filter((specialty) => {
    const normalizedSpecialty = norm(specialty)
    if (!normalizedSpecialty) return false

    return normalizedTasks.some((task) => {
      if (!task) return false

      if (normalizedSpecialty === task) return true
      if (normalizedSpecialty.includes(task)) return true
      if (task.includes(normalizedSpecialty)) return true

      return hasKeywordOverlap(normalizedSpecialty, task)
    })
  })
}

export function scoreEmployeeForTasks(args: {
  employee: EmployeeHint
  tasks: readonly ProjectTaskLite[]
  day?: WeekdayKey
  assignmentCount?: number
}): EmployeeAssignmentScore {
  const { employee, tasks, day, assignmentCount = 0 } = args

  const taskNames = tasks.map((task) => task.name).filter(Boolean)
  const matched = getMatchedSpecialties(employee, taskNames)
  const available = day ? isEmployeeAvailableOnDay(employee, day) : true

  let score = 0
  const reasons: string[] = []

  if (!isAssignableStaff(employee)) {
    score -= 5000
    reasons.push("Not assignable because role is not staff")
  } else {
    score += 25
    reasons.push("Assignable staff")
  }

  if (available) {
    score += 100
    reasons.push(day ? `Available on ${day}` : "Available")
  } else {
    score -= 1000
    reasons.push(day ? `Unavailable on ${day}` : "Unavailable")
  }

  if (matched.length > 0) {
    score += matched.length * 30
    reasons.push(`Matched ${matched.length} specialty task(s)`)
  } else {
    reasons.push("No direct specialty match")
  }

  const repeatPenalty = assignmentCount * REPEAT_PENALTY_PER_ASSIGNMENT
  if (repeatPenalty > 0) {
    score -= repeatPenalty
    reasons.push(`Repeat penalty applied: -${repeatPenalty}`)
  }

  return {
    employee,
    matched_specialties: matched,
    is_available: available,
    assignment_count: assignmentCount,
    repeat_penalty: repeatPenalty,
    score,
    reasons,
  }
}

export function rankEmployeesForTasks(args: {
  tasks: readonly ProjectTaskLite[]
  employees: readonly EmployeeHint[]
  day?: WeekdayKey
  randomizeTies?: boolean
  assignmentCounts?: Record<string, number>
}): EmployeeAssignmentScore[] {
  const {
    tasks,
    employees,
    day,
    randomizeTies = true,
    assignmentCounts = {},
  } = args

  const scored = employees.map((employee) =>
    scoreEmployeeForTasks({
      employee,
      tasks,
      day,
      assignmentCount: assignmentCounts[employee.id] ?? 0,
    })
  )

  scored.sort((a, b) => b.score - a.score)

  if (!randomizeTies) {
    return scored.sort((a, b) => b.score - a.score || a.employee.name.localeCompare(b.employee.name))
  }

  const grouped: EmployeeAssignmentScore[][] = []
  for (const item of scored) {
    const last = grouped[grouped.length - 1]
    if (!last || last[0].score !== item.score) {
      grouped.push([item])
    } else {
      last.push(item)
    }
  }

  return grouped.flatMap((group) => (group.length > 1 ? shuffleArray(group) : group))
}

export function suggestEmployeesForTasks(args: {
  tasks: readonly ProjectTaskLite[]
  employees: readonly EmployeeHint[]
  day?: WeekdayKey
  limit?: number
  requireAvailability?: boolean
  assignmentCounts?: Record<string, number>
}): EmployeeAssignmentScore[] {
  const {
    tasks,
    employees,
    day,
    limit = 3,
    requireAvailability = true,
    assignmentCounts = {},
  } = args

  let ranked = rankEmployeesForTasks({
    tasks,
    employees,
    day,
    randomizeTies: true,
    assignmentCounts,
  })

  ranked = ranked.filter((item) => isAssignableStaff(item.employee))

  if (requireAvailability) {
    ranked = ranked.filter((item) => item.is_available)
  }

  return ranked.slice(0, limit)
}

export function suggestEmployeesPerTask(args: {
  tasks: readonly ProjectTaskLite[]
  employees: readonly EmployeeHint[]
  day?: WeekdayKey
  limitPerTask?: number
  requireAvailability?: boolean
  assignmentCounts?: Record<string, number>
}): EmployeeTaskSuggestion[] {
  const {
    tasks,
    employees,
    day,
    limitPerTask = 2,
    requireAvailability = true,
    assignmentCounts = {},
  } = args

  return tasks.map((task) => ({
    taskName: task.name,
    suggested: suggestEmployeesForTasks({
      tasks: [task],
      employees,
      day,
      limit: limitPerTask,
      requireAvailability,
      assignmentCounts,
    }),
  }))
}

export function getRequiredEmployeeCountFromEstimatedHours(
  estimatedHours?: number
): number {
  return getRequiredEmployeeCountFromLaborHours(Number(estimatedHours ?? 0))
}

export function assignStaffPerSubTask(args: {
  taskName: string
  subTasks: readonly ProjectSubTaskLite[]
  employees: readonly EmployeeHint[]
  day?: WeekdayKey
  requireAvailability?: boolean
  assignmentCounts?: Record<string, number>
}): EmployeeSubTaskAssignment[] {
  const {
    taskName,
    subTasks,
    employees,
    day,
    requireAvailability = true,
    assignmentCounts = {},
  } = args

  let previousEmployeeIds: string[] = []

  return subTasks.map((subTask) => {
    const requiredEmployeeCount =
      typeof subTask.requiredEmployeeCount === "number" &&
      Number.isFinite(subTask.requiredEmployeeCount) &&
      subTask.requiredEmployeeCount > 0
        ? Math.max(1, Math.ceil(subTask.requiredEmployeeCount))
        : getRequiredEmployeeCountFromEstimatedHours(subTask.estimatedHours)

    const candidates = suggestEmployeesForTasks({
      tasks: [
        { name: taskName },
        { name: subTask.title },
      ],
      employees,
      day,
      limit: employees.length,
      requireAvailability,
      assignmentCounts,
    })

    const previousEmployeeIdSet = new Set(previousEmployeeIds)
    const nonConsecutiveCandidates =
      previousEmployeeIdSet.size === 0
        ? candidates
        : candidates.filter(
            (candidate) => !previousEmployeeIdSet.has(candidate.employee.id)
          )

    const candidatePool =
      nonConsecutiveCandidates.length >= requiredEmployeeCount
        ? nonConsecutiveCandidates
        : candidates

    const chosenEmployees = candidatePool
      .slice(0, requiredEmployeeCount)
      .map((candidate) => candidate.employee)

    if (chosenEmployees.length === 0) {
      return {
        taskName,
        subTaskTitle: subTask.title,
        requiredEmployeeCount,
        employees: [],
        score: -1,
        reasons: requireAvailability
          ? ["No available staff matched this subtask"]
          : ["No staff matched this subtask"],
      }
    }

    const reusedPreviousEmployee = chosenEmployees.some((employee) =>
      previousEmployeeIdSet.has(employee.id)
    )

    for (const employee of chosenEmployees) {
      assignmentCounts[employee.id] = (assignmentCounts[employee.id] ?? 0) + 1
    }

    previousEmployeeIds = chosenEmployees.map((employee) => employee.id)

    return {
      taskName,
      subTaskTitle: subTask.title,
      requiredEmployeeCount,
      employees: chosenEmployees,
      score: candidatePool[0]?.score ?? candidates[0]?.score ?? 0,
      reasons: [
        `Required employees: ${requiredEmployeeCount}`,
        ...(previousEmployeeIdSet.size > 0 && !reusedPreviousEmployee
          ? ["Avoided consecutive employee reuse"]
          : []),
        ...(previousEmployeeIdSet.size > 0 && reusedPreviousEmployee
          ? ["Reused previous subtask employee because alternatives were limited"]
          : []),
        ...new Set(candidatePool.slice(0, requiredEmployeeCount).flatMap((c) => c.reasons)),
      ],
    }
  })
}

export function assignStaffPerTaskGroup(args: {
  tasks: readonly {
    name: string
    sub_tasks: readonly ProjectSubTaskLite[]
  }[]
  employees: readonly EmployeeHint[]
  day?: WeekdayKey
  requireAvailability?: boolean
}) {
  const { tasks, employees, day, requireAvailability = true } = args

  const assignmentCounts: Record<string, number> = {}

  return tasks.map((task) => ({
    taskName: task.name,
    assignments: assignStaffPerSubTask({
      taskName: task.name,
      subTasks: task.sub_tasks,
      employees,
      day,
      requireAvailability,
      assignmentCounts,
    }),
  }))
}

export function groupEmployeesByAvailability(employees: readonly EmployeeHint[]) {
  const assignableStaff = employees.filter((employee) => isAssignableStaff(employee))

  return {
    available_all_week: assignableStaff.filter(
      (employee) => getAvailableDays(employee).length === ALL_WEEKDAYS.length
    ),
    partly_unavailable: assignableStaff.filter(
      (employee) => getAvailableDays(employee).length < ALL_WEEKDAYS.length
    ),
  }
}
