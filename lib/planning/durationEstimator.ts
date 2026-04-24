import type { AreaSummary } from "@/lib/planning/materialEstimator"

export type DurationTaskLite = {
  name: string
}

export type DurationSubTaskLite = {
  title: string
  priority?: number
}

export type SubTaskDurationEstimate = {
  taskName: string
  subTaskTitle: string
  baseLaborHours: number
  requiredEmployeeCount: number
  adjustedDurationHours: number
  roundedHours: number
  formula: string
  driver: number
  driverUnit: "m2" | "m" | "count" | "fixed"
  productivityHoursPerEmployee: number
  teamEfficiencyFactor: number
}

function norm(value: string) {
  return String(value || "").trim().toLowerCase()
}

function roundToQuarterHour(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value * 4) / 4
}

function clampMin(value: number, min: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(value, min)
}

function calcFixedHours(hours: number) {
  return clampMin(hours, 0.25)
}

function calcAreaHours(args: {
  areaM2: number
  rateM2PerHour: number
  baseHours?: number
  multiplier?: number
  minimumHours?: number
}) {
  const {
    areaM2,
    rateM2PerHour,
    baseHours = 0,
    multiplier = 1,
    minimumHours = 0.25,
  } = args

  const raw = (baseHours + areaM2 / rateM2PerHour) * multiplier
  return clampMin(raw, minimumHours)
}

function calcLengthHours(args: {
  lengthM: number
  rateMPerHour: number
  baseHours?: number
  multiplier?: number
  minimumHours?: number
}) {
  const {
    lengthM,
    rateMPerHour,
    baseHours = 0,
    multiplier = 1,
    minimumHours = 0.25,
  } = args

  const raw = (baseHours + lengthM / rateMPerHour) * multiplier
  return clampMin(raw, minimumHours)
}

function calcCountHours(args: {
  count: number
  ratePerHour: number
  baseHours?: number
  multiplier?: number
  minimumHours?: number
}) {
  const {
    count,
    ratePerHour,
    baseHours = 0,
    multiplier = 1,
    minimumHours = 0.25,
  } = args

  const raw = (baseHours + count / ratePerHour) * multiplier
  return clampMin(raw, minimumHours)
}

function getRequiredEmployeeCountFromLaborHours(laborHours: number) {
  const normalized = Math.max(Number(laborHours || 0), 0.25)
  const productivityHoursPerEmployee = 6
  const rawEmployees = normalized / productivityHoursPerEmployee

  return clampMin(Math.ceil(rawEmployees), 1)
}

function getTeamEfficiencyFactor(employeeCount: number) {
  if (employeeCount <= 1) return 1
  if (employeeCount === 2) return 0.95
  if (employeeCount === 3) return 0.9
  if (employeeCount === 4) return 0.85
  return 0.8
}

function getAdjustedDurationHours(args: {
  baseLaborHours: number
  requiredEmployeeCount: number
}) {
  const { baseLaborHours, requiredEmployeeCount } = args
  const productivityHoursPerEmployee = 6
  const teamEfficiencyFactor = getTeamEfficiencyFactor(requiredEmployeeCount)

  const adjustedDurationHours =
    baseLaborHours /
    Math.max(requiredEmployeeCount * productivityHoursPerEmployee * teamEfficiencyFactor, 0.25)

  return {
    adjustedDurationHours: clampMin(adjustedDurationHours, 0.25),
    productivityHoursPerEmployee,
    teamEfficiencyFactor,
  }
}

function estimateInteriorPaintingSubTask(subTaskTitle: string, areas: AreaSummary) {
  const title = norm(subTaskTitle)

  if (title === "site protection and masking") {
    const hours = calcFixedHours(1.5)
    return {
      estimatedHours: hours,
      formula: "fixed 1.5h",
      driver: 1.5,
      driverUnit: "fixed" as const,
    }
  }

  if (title === "surface inspection and prep") {
    const hours = calcAreaHours({
      areaM2: areas.wallAreaM2,
      rateM2PerHour: 85,
      baseHours: 0.5,
    })
    return {
      estimatedHours: hours,
      formula: "0.5 + wallAreaM2 / 85",
      driver: areas.wallAreaM2,
      driverUnit: "m2" as const,
    }
  }

  if (title === "patch minor defects") {
    const patchArea = Math.max(areas.wallAreaM2 * 0.08, 6)
    const hours = calcAreaHours({
      areaM2: patchArea,
      rateM2PerHour: 12,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + patchArea / 12, patchArea = max(wallAreaM2 * 0.08, 6)",
      driver: patchArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "sand and dust removal") {
    const hours = calcAreaHours({
      areaM2: areas.wallAreaM2,
      rateM2PerHour: 40,
      baseHours: 0.5,
    })
    return {
      estimatedHours: hours,
      formula: "0.5 + wallAreaM2 / 40",
      driver: areas.wallAreaM2,
      driverUnit: "m2" as const,
    }
  }

  if (title === "prime as needed") {
    const primeArea = Math.max(areas.wallAreaM2 * 0.35, 10)
    const hours = calcAreaHours({
      areaM2: primeArea,
      rateM2PerHour: 50,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + primeArea / 50, primeArea = max(wallAreaM2 * 0.35, 10)",
      driver: primeArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "cut-in edges and corners") {
    const trimDriver =
      areas.trimLengthM +
      areas.skirtingLengthM +
      areas.architraveLengthM +
      areas.handrailLengthM +
      areas.balustradeLengthM +
      areas.doorsCount * 3 +
      areas.windowsCount * 2

    const effectiveLength = Math.max(trimDriver, areas.wallAreaM2 * 0.12, 12)

    const hours = calcLengthHours({
      lengthM: effectiveLength,
      rateMPerHour: 18,
      baseHours: 0.5,
    })

    return {
      estimatedHours: hours,
      formula: "0.5 + effectiveLength / 18",
      driver: effectiveLength,
      driverUnit: "m" as const,
    }
  }

  if (title === "roll first coat") {
    const hours = calcAreaHours({
      areaM2: areas.wallAreaM2,
      rateM2PerHour: 45,
      baseHours: 0.5,
    })
    return {
      estimatedHours: hours,
      formula: "0.5 + wallAreaM2 / 45",
      driver: areas.wallAreaM2,
      driverUnit: "m2" as const,
    }
  }

  if (title === "roll second coat") {
    const hours = calcAreaHours({
      areaM2: areas.wallAreaM2,
      rateM2PerHour: 50,
      baseHours: 0.4,
    })
    return {
      estimatedHours: hours,
      formula: "0.4 + wallAreaM2 / 50",
      driver: areas.wallAreaM2,
      driverUnit: "m2" as const,
    }
  }

  if (title === "touch-ups and detailing") {
    const touchUpArea = Math.max(areas.wallAreaM2 * 0.08, 6)
    const hours = calcAreaHours({
      areaM2: touchUpArea,
      rateM2PerHour: 25,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + touchUpArea / 25, touchUpArea = max(wallAreaM2 * 0.08, 6)",
      driver: touchUpArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "clean up and dispose waste") {
    const hours = calcFixedHours(1)
    return {
      estimatedHours: hours,
      formula: "fixed 1h",
      driver: 1,
      driverUnit: "fixed" as const,
    }
  }

  return null
}

function estimatePlasterPatchingSubTask(subTaskTitle: string, areas: AreaSummary) {
  const title = norm(subTaskTitle)
  const patchArea = Math.max(areas.wallAreaM2 * 0.1, 8)

  if (title === "mark defects and damaged areas") {
    const hours = calcFixedHours(0.75)
    return {
      estimatedHours: hours,
      formula: "fixed 0.75h",
      driver: 0.75,
      driverUnit: "fixed" as const,
    }
  }

  if (title === "prepare patch materials") {
    const hours = calcFixedHours(0.5)
    return {
      estimatedHours: hours,
      formula: "fixed 0.5h",
      driver: 0.5,
      driverUnit: "fixed" as const,
    }
  }

  if (title === "apply patch compound") {
    const hours = calcAreaHours({
      areaM2: patchArea,
      rateM2PerHour: 10,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + patchArea / 10, patchArea = max(wallAreaM2 * 0.1, 8)",
      driver: patchArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "feather edges") {
    const hours = calcAreaHours({
      areaM2: patchArea,
      rateM2PerHour: 14,
      baseHours: 0.2,
    })
    return {
      estimatedHours: hours,
      formula: "0.2 + patchArea / 14",
      driver: patchArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "dry and recoat if needed") {
    const hours = calcFixedHours(0.5)
    return {
      estimatedHours: hours,
      formula: "fixed 0.5h",
      driver: 0.5,
      driverUnit: "fixed" as const,
    }
  }

  if (title === "sand smooth") {
    const hours = calcAreaHours({
      areaM2: patchArea,
      rateM2PerHour: 16,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + patchArea / 16",
      driver: patchArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "spot-prime patched areas") {
    const hours = calcAreaHours({
      areaM2: patchArea,
      rateM2PerHour: 30,
      baseHours: 0.2,
    })
    return {
      estimatedHours: hours,
      formula: "0.2 + patchArea / 30",
      driver: patchArea,
      driverUnit: "m2" as const,
    }
  }

  return null
}

function estimateSurfacePrepSubTask(subTaskTitle: string, areas: AreaSummary) {
  const title = norm(subTaskTitle)
  const prepArea = Math.max(areas.wallAreaM2, 12)

  if (title === "protect area and cover floors") {
    const hours = calcFixedHours(1)
    return {
      estimatedHours: hours,
      formula: "fixed 1h",
      driver: 1,
      driverUnit: "fixed" as const,
    }
  }

  if (title === "scrape loose paint") {
    const activeArea = Math.max(prepArea * 0.45, 8)
    const hours = calcAreaHours({
      areaM2: activeArea,
      rateM2PerHour: 18,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + activeArea / 18, activeArea = max(prepArea * 0.45, 8)",
      driver: activeArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "fill holes and cracks") {
    const activeArea = Math.max(prepArea * 0.12, 6)
    const hours = calcAreaHours({
      areaM2: activeArea,
      rateM2PerHour: 10,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + activeArea / 10, activeArea = max(prepArea * 0.12, 6)",
      driver: activeArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "sand surfaces smooth") {
    const hours = calcAreaHours({
      areaM2: prepArea,
      rateM2PerHour: 22,
      baseHours: 0.5,
    })
    return {
      estimatedHours: hours,
      formula: "0.5 + prepArea / 22",
      driver: prepArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "dust removal and wipe down") {
    const hours = calcAreaHours({
      areaM2: prepArea,
      rateM2PerHour: 55,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + prepArea / 55",
      driver: prepArea,
      driverUnit: "m2" as const,
    }
  }

  if (title === "spot-prime repaired areas") {
    const activeArea = Math.max(prepArea * 0.2, 8)
    const hours = calcAreaHours({
      areaM2: activeArea,
      rateM2PerHour: 35,
      baseHours: 0.2,
    })
    return {
      estimatedHours: hours,
      formula: "0.2 + activeArea / 35, activeArea = max(prepArea * 0.2, 8)",
      driver: activeArea,
      driverUnit: "m2" as const,
    }
  }

  return null
}

function fallbackEstimate(taskName: string, subTaskTitle: string, areas: AreaSummary) {
  const title = norm(subTaskTitle)
  const task = norm(taskName)

  if (title.includes("clean")) {
    const hours = calcFixedHours(1)
    return {
      estimatedHours: hours,
      formula: "fixed 1h fallback",
      driver: 1,
      driverUnit: "fixed" as const,
    }
  }

  if (title.includes("mask") || title.includes("protect")) {
    const hours = calcFixedHours(1)
    return {
      estimatedHours: hours,
      formula: "fixed 1h fallback",
      driver: 1,
      driverUnit: "fixed" as const,
    }
  }

  if (title.includes("sand") || title.includes("scrape") || title.includes("prep")) {
    const area =
      task.includes("exterior") ? areas.exteriorWallAreaM2 : Math.max(areas.wallAreaM2, 12)

    const hours = calcAreaHours({
      areaM2: area,
      rateM2PerHour: 25,
      baseHours: 0.5,
    })

    return {
      estimatedHours: hours,
      formula: "0.5 + area / 25 fallback",
      driver: area,
      driverUnit: "m2" as const,
    }
  }

  if (title.includes("prime")) {
    const area = Math.max(areas.wallAreaM2 * 0.35, 10)
    const hours = calcAreaHours({
      areaM2: area,
      rateM2PerHour: 40,
      baseHours: 0.25,
    })
    return {
      estimatedHours: hours,
      formula: "0.25 + area / 40 fallback",
      driver: area,
      driverUnit: "m2" as const,
    }
  }

  if (title.includes("coat") || title.includes("paint") || title.includes("roll")) {
    const area =
      task.includes("ceiling")
        ? areas.ceilingAreaM2
        : task.includes("feature")
        ? areas.featureWallAreaM2
        : task.includes("exterior")
        ? areas.exteriorWallAreaM2
        : areas.wallAreaM2

    const hours = calcAreaHours({
      areaM2: Math.max(area, 10),
      rateM2PerHour: 45,
      baseHours: 0.5,
    })

    return {
      estimatedHours: hours,
      formula: "0.5 + area / 45 fallback",
      driver: Math.max(area, 10),
      driverUnit: "m2" as const,
    }
  }

  const hours = calcFixedHours(1)
  return {
    estimatedHours: hours,
    formula: "fixed 1h fallback",
    driver: 1,
    driverUnit: "fixed" as const,
  }
}

export function estimateDurationForSubTask(args: {
  taskName: string
  subTaskTitle: string
  areas: AreaSummary
}): SubTaskDurationEstimate {
  const { taskName, subTaskTitle, areas } = args
  const task = norm(taskName)

  let result:
    | {
        estimatedHours: number
        formula: string
        driver: number
        driverUnit: "m2" | "m" | "count" | "fixed"
      }
    | null = null

  if (task === "interior painting") {
    result = estimateInteriorPaintingSubTask(subTaskTitle, areas)
  } else if (task === "plaster & patching") {
    result = estimatePlasterPatchingSubTask(subTaskTitle, areas)
  } else if (task === "surface preparation (sanding, scraping, filling)") {
    result = estimateSurfacePrepSubTask(subTaskTitle, areas)
  }

  if (!result) {
    result = fallbackEstimate(taskName, subTaskTitle, areas)
  }

  const baseLaborHours = clampMin(result.estimatedHours, 0.25)
  const requiredEmployeeCount = getRequiredEmployeeCountFromLaborHours(baseLaborHours)
  const {
    adjustedDurationHours,
    productivityHoursPerEmployee,
    teamEfficiencyFactor,
  } = getAdjustedDurationHours({
    baseLaborHours,
    requiredEmployeeCount,
  })

  return {
    taskName,
    subTaskTitle,
    baseLaborHours,
    requiredEmployeeCount,
    adjustedDurationHours,
    roundedHours: roundToQuarterHour(adjustedDurationHours),
    formula: result.formula,
    driver: result.driver,
    driverUnit: result.driverUnit,
    productivityHoursPerEmployee,
    teamEfficiencyFactor,
  }
}

export function estimateDurationsForTask(args: {
  taskName: string
  subTasks: readonly DurationSubTaskLite[]
  areas: AreaSummary
}) {
  const { taskName, subTasks, areas } = args

  return subTasks.map((subTask) =>
    estimateDurationForSubTask({
      taskName,
      subTaskTitle: subTask.title,
      areas,
    })
  )
}

export function estimateDurationsForTasks(args: {
  tasks: readonly {
    name: string
    sub_tasks: readonly DurationSubTaskLite[]
  }[]
  areas: AreaSummary
}) {
  const { tasks, areas } = args

  return tasks.map((task) => ({
    taskName: task.name,
    estimates: estimateDurationsForTask({
      taskName: task.name,
      subTasks: task.sub_tasks,
      areas,
    }),
  }))
}
