import { SURFACE_SCALE_PRESETS, type ScaleBandKey } from "@/lib/planning/aiContext"

type ScalePresetKey = keyof typeof SURFACE_SCALE_PRESETS

export type SubTask = {
  title: string
  priority: number
}

export type EstimatorTask = {
  name: string
  priority?: number
  confidence?: number
  reasons?: string[]
  sub_tasks: SubTask[]
  materials: string[]
}

export type ProjectScaledField = {
  presetKey: ScalePresetKey
  sizeBand?: ScaleBandKey
  estimatedValue?: number
  isManualOverride?: boolean
  notes?: string
}

export type ProjectDimensions = {
  scaled?: Partial<Record<ScalePresetKey, ProjectScaledField>>
  notes?: string
}

export type MaterialCatalogItem = {
  name: string
  unit?: string
  notes?: string
}

export type MaterialQty = {
  name: string
  qty: number
  unit: string
}

export type AreaSummary = {
  wallAreaM2: number
  ceilingAreaM2: number
  featureWallAreaM2: number
  exteriorWallAreaM2: number
  roofAreaM2: number
  wallpaperAreaM2: number
  pressureWashAreaM2: number
  deckAreaM2: number
  patioAreaM2: number
  drivewayAreaM2: number
  garageFloorAreaM2: number
  epoxyFloorAreaM2: number
  trimLengthM: number
  skirtingLengthM: number
  architraveLengthM: number
  guttersLengthM: number
  fasciaLengthM: number
  eavesLengthM: number
  downpipesLengthM: number
  handrailLengthM: number
  balustradeLengthM: number
  doorsCount: number
  windowsCount: number
  fenceLengthM: number
  gateCount: number
}

function roundUp(n: number, step = 0.5) {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.ceil(n / step) * step
}

function norm(s: string) {
  return String(s || "").trim().toLowerCase()
}

function getUnitForMaterial(
  name: string,
  materialCatalog: readonly MaterialCatalogItem[]
) {
  const material = materialCatalog.find((item) => norm(item.name) === norm(name))
  return material?.unit || ""
}

export function getScaledValue(
  dimensions: ProjectDimensions | null | undefined,
  key: ScalePresetKey
) {
  const value = Number(dimensions?.scaled?.[key]?.estimatedValue)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function computeAreasFromDimensions(
  dimensions: ProjectDimensions | null | undefined
): AreaSummary {
  const wallArea = getScaledValue(dimensions, "interior_wall_area_m2")
  const featureWallArea = getScaledValue(dimensions, "feature_wall_area_m2")
  const ceilingArea = getScaledValue(dimensions, "ceiling_area_m2")
  const exteriorWallArea = getScaledValue(dimensions, "exterior_wall_area_m2")
  const roofArea = getScaledValue(dimensions, "roof_area_m2")
  const wallpaperArea = getScaledValue(dimensions, "wallpaper_area_m2")
  const pressureWashArea = getScaledValue(dimensions, "pressure_wash_area_m2")
  const deckArea = getScaledValue(dimensions, "deck_area_m2")
  const patioArea = getScaledValue(dimensions, "patio_area_m2")
  const drivewayArea = getScaledValue(dimensions, "driveway_area_m2")
  const garageFloorArea = getScaledValue(dimensions, "garage_floor_area_m2")
  const epoxyFloorArea = getScaledValue(dimensions, "epoxy_floor_area_m2")
  const trimLength = getScaledValue(dimensions, "trim_length_m")
  const skirtingLength = getScaledValue(dimensions, "skirting_length_m")
  const architraveLength = getScaledValue(dimensions, "architrave_length_m")
  const guttersLength = getScaledValue(dimensions, "gutters_length_m")
  const fasciaLength = getScaledValue(dimensions, "fascia_length_m")
  const eavesLength = getScaledValue(dimensions, "eaves_length_m")
  const downpipesLength = getScaledValue(dimensions, "downpipes_length_m")
  const handrailLength = getScaledValue(dimensions, "handrail_length_m")
  const balustradeLength = getScaledValue(dimensions, "balustrade_length_m")
  const doorsCount = getScaledValue(dimensions, "doors_count")
  const windowsCount = getScaledValue(dimensions, "windows_count")
  const fenceLength = getScaledValue(dimensions, "fence_length_m")
  const gateCount = getScaledValue(dimensions, "gate_count")

  return {
    wallAreaM2: wallArea,
    ceilingAreaM2: ceilingArea,
    featureWallAreaM2:
      featureWallArea > 0 ? featureWallArea : wallArea > 0 ? Math.max(12, Math.min(wallArea * 0.18, 24)) : 0,
    exteriorWallAreaM2: exteriorWallArea,
    roofAreaM2: roofArea,
    wallpaperAreaM2: wallpaperArea,
    pressureWashAreaM2: pressureWashArea,
    deckAreaM2: deckArea,
    patioAreaM2: patioArea,
    drivewayAreaM2: drivewayArea,
    garageFloorAreaM2: garageFloorArea,
    epoxyFloorAreaM2: epoxyFloorArea,
    trimLengthM: trimLength,
    skirtingLengthM: skirtingLength,
    architraveLengthM: architraveLength,
    guttersLengthM: guttersLength,
    fasciaLengthM: fasciaLength,
    eavesLengthM: eavesLength,
    downpipesLengthM: downpipesLength,
    handrailLengthM: handrailLength,
    balustradeLengthM: balustradeLength,
    doorsCount,
    windowsCount,
    fenceLengthM: fenceLength,
    gateCount,
  }
}

export function estimateMaterialsForTask(args: {
  task: EstimatorTask
  areas: AreaSummary
  materialCatalog: readonly MaterialCatalogItem[]
}): MaterialQty[] {
  const { task, areas, materialCatalog } = args

  const coverageM2PerL = 10
  const coverageLinearPerLTrim = 12
  const coverageM2PerLDeck = 8
  const coverageM2PerLCleaner = 25
  const coverageM2PerLIndustrial = 6

  const hasPrimeSubTask = task.sub_tasks.some((s) => norm(s.title).includes("prime"))
  const wantsPrimer = task.materials.some((m) => norm(m).includes("primer")) || hasPrimeSubTask

  const out: MaterialQty[] = []

  const add = (name: string, qty: number) => {
    if (!name) return

    const unit = getUnitForMaterial(name, materialCatalog)
    const key = norm(name)
    const existing = out.find((item) => norm(item.name) === key)
    const safeQty = Number.isFinite(qty) ? qty : 0

    if (existing) {
      existing.qty += safeQty
    } else {
      out.push({ name, qty: safeQty, unit })
    }
  }

  const wallArea = areas.wallAreaM2
  const ceilArea = areas.ceilingAreaM2
  const featureArea = areas.featureWallAreaM2
  const exteriorWallArea = areas.exteriorWallAreaM2
  const roofArea = areas.roofAreaM2
  const wallpaperArea = areas.wallpaperAreaM2
  const pressureWashArea = areas.pressureWashAreaM2
  const deckArea = areas.deckAreaM2
  const patioArea = areas.patioAreaM2
  const drivewayArea = areas.drivewayAreaM2
  const garageFloorArea = areas.garageFloorAreaM2
  const epoxyFloorArea = areas.epoxyFloorAreaM2
  const trimLength = areas.trimLengthM
  const skirtingLength = areas.skirtingLengthM
  const architraveLength = areas.architraveLengthM
  const guttersLength = areas.guttersLengthM
  const fasciaLength = areas.fasciaLengthM
  const eavesLength = areas.eavesLengthM
  const downpipesLength = areas.downpipesLengthM
  const handrailLength = areas.handrailLengthM
  const balustradeLength = areas.balustradeLengthM
  const doorsCount = areas.doorsCount
  const windowsCount = areas.windowsCount
  const fenceLength = areas.fenceLengthM
  const gateCount = areas.gateCount

  if (task.name === "Interior Painting") {
    const liters = (wallArea * 2) / coverageM2PerL
    const primerL = wantsPrimer ? wallArea / coverageM2PerL : 0
    const wallPaint =
      task.materials.find((m) => norm(m).includes("interior wall paint")) ?? "Interior wall paint"

    add(wallPaint, liters)
    if (primerL > 0) add("Primer / sealer", primerL)
  }

  if (task.name === "Ceiling Painting") {
    const liters = (ceilArea * 2) / coverageM2PerL
    const primerL = wantsPrimer ? ceilArea / coverageM2PerL : 0

    add("Ceiling paint", liters)
    if (primerL > 0) add("Primer / sealer", primerL)
  }

  if (task.name === "Feature Wall Painting") {
    const liters = (featureArea * 2) / coverageM2PerL
    const wallPaint =
      task.materials.find((m) => norm(m).includes("interior wall paint")) ?? "Interior wall paint"

    add(wallPaint, liters)
  }

  if (task.name === "Exterior Painting") {
    const liters = (exteriorWallArea * 2) / coverageM2PerL
    const primerL = wantsPrimer ? exteriorWallArea / coverageM2PerL : 0

    add("Exterior paint", liters)
    if (primerL > 0) add("Primer / sealer", primerL)
  }

  if (task.name === "Roof Tile Painting" || task.name === "Colourbond Roof Painting") {
    const liters = (roofArea * 2) / coverageM2PerL

    add("Roof paint", liters)
    if (wantsPrimer) add("Primer / sealer", roofArea / coverageM2PerL)
  }

  if (task.name === "Gutters, Fascia & Eaves Painting") {
    const linearTotal = guttersLength + fasciaLength + eavesLength + downpipesLength
    const liters = (linearTotal * 2) / coverageLinearPerLTrim

    add("Exterior paint", liters)
    if (wantsPrimer) add("Primer / sealer", linearTotal / coverageLinearPerLTrim)
  }

  if (task.name === "Trim, Doors & Frames Painting") {
    const trimDriver =
      trimLength +
      skirtingLength +
      architraveLength +
      handrailLength +
      balustradeLength +
      doorsCount * 3 +
      windowsCount * 2

    const liters = (trimDriver * 2) / coverageLinearPerLTrim
    const paintName =
      task.materials.find((m) => norm(m).includes("interior wall paint")) ?? "Interior wall paint"

    add(paintName, liters)
    add("Caulk / sealant", Math.max(1, Math.ceil(trimDriver / 25)))
    if (wantsPrimer) add("Primer / sealer", trimDriver / coverageLinearPerLTrim)
  }

  if (task.name === "Stain Blocking / Primer Work") {
    const liters = wallArea / coverageM2PerL
    add("Stain blocker primer", liters)
  }

  if (task.name === "Plaster & Patching") {
    add("Patch compound", wallArea * 0.04)
    add("Sandpaper assorted grits", Math.max(5, wallArea / 20))
  }

  if (task.name === "Surface Preparation (Sanding, Scraping, Filling)") {
    add("Sandpaper assorted grits", Math.max(8, wallArea / 15))
    add("Sugar soap / cleaner", Math.max(1, wallArea / 80))
  }

  if (task.name === "Mould Treatment") {
    add("Mould treatment solution", Math.max(1, wallArea / 120))
  }

  if (task.name === "High-Pressure Cleaning") {
    const washDriver = pressureWashArea + patioArea + drivewayArea
    add("Sugar soap / cleaner", Math.max(1, washDriver / coverageM2PerLCleaner))
  }

  if (task.name === "Decking Staining & Coating") {
    const coatArea = deckArea + patioArea
    add("Exterior paint", (coatArea * 2) / coverageM2PerLDeck)
  }

  if (task.name === "Fence & Gate Painting") {
    const fenceDriver = Math.max(fenceLength * 1.8 + gateCount * 4, 12)
    add("Exterior paint", (fenceDriver * 2) / coverageM2PerL)
  }

  if (task.name === "Epoxy Floor Coatings") {
    const floorDriver = epoxyFloorArea > 0 ? epoxyFloorArea : garageFloorArea
    add("Primer / sealer", floorDriver / coverageM2PerLIndustrial)
  }

  if (task.name === "Wallpaper Installation") {
    const wallpaperDriver = wallpaperArea > 0 ? wallpaperArea : featureArea
    add("Drop sheets / plastic film", Math.max(1, wallpaperDriver / 25))
    add("Masking tape", Math.max(1, wallpaperDriver / 30))
  }

  if (task.name === "Wallpaper Removal") {
    const wallpaperDriver = wallpaperArea > 0 ? wallpaperArea : featureArea
    add("Drop sheets / plastic film", Math.max(1, wallpaperDriver / 20))
    add("Masking tape", Math.max(1, wallpaperDriver / 25))
    add("Sugar soap / cleaner", Math.max(1, wallpaperDriver / 35))
  }

  if (
    task.name === "Protective / Industrial Coatings" ||
    task.name === "Anti-Corrosion Coatings"
  ) {
    add("Primer / sealer", exteriorWallArea / coverageM2PerLIndustrial)
  }

  if (task.materials.some((m) => norm(m).includes("masking tape"))) {
    add("Masking tape", Math.max(2, wallArea / 60))
  }

  if (task.materials.some((m) => norm(m).includes("drop sheets"))) {
    add("Drop sheets / plastic film", Math.max(2, wallArea / 80))
  }

  return out
    .map((item) => {
      const isLiters = norm(item.unit) === "l"
      const isKg = norm(item.unit) === "kg"
      const qty = isLiters
        ? roundUp(item.qty, 0.5)
        : isKg
        ? roundUp(item.qty, 1)
        : Math.ceil(item.qty)

      return { ...item, qty }
    })
    .filter((item) => item.qty > 0)
}

export function estimateMaterialsForTasks(args: {
  tasks: readonly EstimatorTask[]
  dimensions: ProjectDimensions | null | undefined
  materialCatalog: readonly MaterialCatalogItem[]
}) {
  const { tasks, dimensions, materialCatalog } = args
  const areas = computeAreasFromDimensions(dimensions)

  return tasks.map((task) => ({
    taskName: task.name,
    materials: estimateMaterialsForTask({
      task,
      areas,
      materialCatalog,
    }),
  }))
}
