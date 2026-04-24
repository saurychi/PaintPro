"use client"

import { useMemo, useState } from "react"
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Copy,
  CheckSquare,
  Beaker,
  Plus,
  Trash2,
  Settings2,
  X,
  Check,
  UserCog,
} from "lucide-react"
import {
  SURFACE_SCALE_PRESETS,
  type ScaleBandKey,
  type WeekdayKey,
} from "@/lib/planning/aiContext"
import {
  computeAreasFromDimensions,
  estimateMaterialsForTask,
  type ProjectDimensions,
  type ProjectScaledField,
} from "@/lib/planning/materialEstimator"

const ACCENT = "#00c065"
const ACCENT_HOVER = "#00a054"
const BORDER = "border border-gray-200"

const SCALE_BANDS: ScaleBandKey[] = ["small", "medium", "large"]
const WEEKDAY_OPTIONS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const DEFAULT_DESCRIPTION =
  "Client wants to repaint a 3-bedroom house interior with some ceiling work, patch minor cracks and nail holes, repaint trim and doors, and freshen exterior areas that may also need pressure washing. There is one feature wall in the living room. Staff made quick scale-based estimates on site and manually adjusted a few measurements."

const DEFAULT_DIMENSIONS = {
  scaled: {
    interior_wall_area_m2: {
      presetKey: "interior_wall_area_m2",
      sizeBand: "medium",
      estimatedValue: 195,
      isManualOverride: true,
    },
    ceiling_area_m2: {
      presetKey: "ceiling_area_m2",
      sizeBand: "medium",
      estimatedValue: 70,
      isManualOverride: false,
    },
    trim_length_m: {
      presetKey: "trim_length_m",
      sizeBand: "medium",
      estimatedValue: 62,
      isManualOverride: true,
    },
    doors_count: {
      presetKey: "doors_count",
      sizeBand: "medium",
      estimatedValue: 7,
      isManualOverride: true,
    },
    windows_count: {
      presetKey: "windows_count",
      sizeBand: "medium",
      estimatedValue: 8,
      isManualOverride: false,
    },
    exterior_wall_area_m2: {
      presetKey: "exterior_wall_area_m2",
      sizeBand: "medium",
      estimatedValue: 160,
      isManualOverride: false,
    },
    roof_area_m2: {
      presetKey: "roof_area_m2",
      sizeBand: "medium",
      estimatedValue: 190,
      isManualOverride: true,
    },
    gutters_length_m: {
      presetKey: "gutters_length_m",
      sizeBand: "medium",
      estimatedValue: 26,
      isManualOverride: false,
    },
    eaves_length_m: {
      presetKey: "eaves_length_m",
      sizeBand: "medium",
      estimatedValue: 24,
      isManualOverride: false,
    },
    pressure_wash_area_m2: {
      presetKey: "pressure_wash_area_m2",
      sizeBand: "small",
      estimatedValue: 36,
      isManualOverride: false,
    },
    deck_area_m2: {
      presetKey: "deck_area_m2",
      sizeBand: "small",
      estimatedValue: 14,
      isManualOverride: true,
    },
    epoxy_floor_area_m2: {
      presetKey: "epoxy_floor_area_m2",
      sizeBand: "small",
      estimatedValue: 18,
      isManualOverride: false,
    },
  },
  notes:
    "Sample placeholder project dimensions for the test page. Some values come from quick scale selection, while others were manually adjusted by staff for better accuracy.",
} as const

type MaterialOut = {
  name: string
  unit: string
  notes?: string
}

type EquipmentOut = {
  name: string
  notes?: string
}

type DurationOut = {
  taskName: string
  subTaskTitle: string
  estimatedHours: number
  roundedHours: number
  formula: string
  driver: number
  driverUnit: "m2" | "m" | "count" | "fixed"
}

type AssignedEmployeeOut = {
  id: string
  name: string
  role: "staff" | "manager" | "admin" | "client"
} | null

type SubTask = {
  title: string
  priority: number
  materials: MaterialOut[]
  equipment: EquipmentOut[]
  duration: DurationOut | null
  assignedEmployee: AssignedEmployeeOut
  assignmentScore: number | null
  assignmentReasons: string[]
}

type MainTask = {
  name: string
  priority: number
  confidence: number
  reasons: string[]
  sub_tasks: SubTask[]
  materials: string[]
  materialCatalog: MaterialOut[]
}

type GetTasksApiResponse =
  | {
      main_tasks: Array<{
        name: string
        priority: number
        confidence: number
        reasons: string[]
        sub_tasks: Array<{
          title: string
          priority: number
        }>
      }>
      dimensions?: unknown
      raw?: string
    }
  | { error: string; raw?: string; details?: string }

type GetMaterialsApiResponse =
  | {
      taskName: string
      subTaskTitle: string | null
      materials: MaterialOut[]
    }
  | { error: string; details?: string }

type GetEquipmentApiResponse =
  | {
      taskName: string
      subTaskTitle: string | null
      equipment: EquipmentOut[]
    }
  | { error: string; details?: string }

type GetDurationApiResponse =
  | {
      taskName: string
      subTaskTitle: string
      duration: DurationOut
    }
  | { error: string; details?: string }

type GetEmployeesApiResponse =
  | {
      day: WeekdayKey | null
      scheduledDate: string | null
      assignments: Array<{
        taskName: string
        assignments: Array<{
          taskName: string
          subTaskTitle: string
          employee: AssignedEmployeeOut
          score: number
          reasons: string[]
        }>
      }>
    }
  | { error: string; details?: string }

type ScalePresetKey = keyof typeof SURFACE_SCALE_PRESETS

type MeasurementRow = {
  id: string
  presetKey: ScalePresetKey
  sizeBand: ScaleBandKey
  estimatedValue: number
  isManualOverride: boolean
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function unitLabel(unit: string) {
  if (unit === "m2") return "m²"
  if (unit === "m") return "m"
  return "count"
}

function formatWeekday(day: WeekdayKey) {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

function getBandIndex(band: ScaleBandKey) {
  return SCALE_BANDS.indexOf(band)
}

function getBandFromIndex(index: number): ScaleBandKey {
  return SCALE_BANDS[Math.max(0, Math.min(2, index))] ?? "medium"
}

function norm(value: string) {
  return String(value || "").trim().toLowerCase()
}

function uniqueByName<T extends { name: string }>(items: readonly T[]) {
  return items.filter(
    (item, index, arr) =>
      arr.findIndex((x) => norm(x.name) === norm(item.name)) === index
  )
}

function makeRowFromPreset(
  presetKey: ScalePresetKey,
  band: ScaleBandKey = "medium",
  overrides?: Partial<MeasurementRow>
): MeasurementRow {
  const preset = SURFACE_SCALE_PRESETS[presetKey]
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${presetKey}-${Date.now()}-${Math.random()}`,
    presetKey,
    sizeBand: band,
    estimatedValue: preset.bands[band].suggested,
    isManualOverride: false,
    ...(overrides ?? {}),
  }
}

function buildInitialRows(): MeasurementRow[] {
  const scaled = DEFAULT_DIMENSIONS?.scaled ?? {}
  const entries = Object.entries(scaled) as [ScalePresetKey, ProjectScaledField][]

  if (!entries.length) {
    return [
      makeRowFromPreset("interior_wall_area_m2", "medium"),
      makeRowFromPreset("ceiling_area_m2", "medium"),
      makeRowFromPreset("trim_length_m", "medium"),
      makeRowFromPreset("doors_count", "medium"),
    ]
  }

  return entries.map(([presetKey, value]) =>
    makeRowFromPreset(presetKey, value.sizeBand ?? "medium", {
      estimatedValue:
        Number.isFinite(Number(value.estimatedValue))
          ? Number(value.estimatedValue)
          : SURFACE_SCALE_PRESETS[presetKey].bands[value.sizeBand ?? "medium"].suggested,
      isManualOverride: Boolean(value.isManualOverride),
    })
  )
}

function rowsToProjectDimensions(rows: MeasurementRow[]): ProjectDimensions {
  const scaled: Partial<Record<ScalePresetKey, ProjectScaledField>> = {}

  for (const row of rows) {
    const currentValue = Number.isFinite(row.estimatedValue) ? row.estimatedValue : 0
    const existing = scaled[row.presetKey]
    const existingValue =
      existing && Number.isFinite(Number(existing.estimatedValue))
        ? Number(existing.estimatedValue)
        : 0

    scaled[row.presetKey] = {
      presetKey: row.presetKey,
      sizeBand: row.sizeBand,
      estimatedValue: existingValue + currentValue,
      isManualOverride: Boolean(existing?.isManualOverride) || row.isManualOverride,
    }
  }

  return {
    scaled,
    notes: DEFAULT_DIMENSIONS?.notes ?? "",
  }
}

function MeasurementModal(props: {
  open: boolean
  rows: MeasurementRow[]
  onClose: () => void
  onAdd: () => void
  onRemove: (id: string) => void
  onPresetChange: (id: string, presetKey: ScalePresetKey) => void
  onBandChange: (id: string, band: ScaleBandKey) => void
  onManualValueChange: (id: string, value: string) => void
}) {
  const {
    open,
    rows,
    onClose,
    onAdd,
    onRemove,
    onPresetChange,
    onBandChange,
    onManualValueChange,
  } = props

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Measurements</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use the slider for a quick scale, then refine the exact value if needed.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-140px)] overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
              style={{ backgroundColor: ACCENT }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT_HOVER
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT
              }}
            >
              <Plus className="h-4 w-4" />
              Add Measurement
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row) => {
              const preset = SURFACE_SCALE_PRESETS[row.presetKey]
              const bandMeta = preset.bands[row.sizeBand]

              return (
                <div key={row.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_auto]">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Surface Type
                      </label>
                      <select
                        value={row.presetKey}
                        onChange={(e) => onPresetChange(row.id, e.target.value as ScalePresetKey)}
                        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      >
                        {(Object.keys(SURFACE_SCALE_PRESETS) as ScalePresetKey[]).map((key) => (
                          <option key={key} value={key}>
                            {SURFACE_SCALE_PRESETS[key].label}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Size Scale
                          </label>
                          <span className="text-[11px] font-semibold text-gray-700">
                            {bandMeta.label}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={1}
                          value={getBandIndex(row.sizeBand)}
                          onChange={(e) =>
                            onBandChange(row.id, getBandFromIndex(Number(e.target.value)))
                          }
                          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                          style={{ accentColor: ACCENT }}
                        />

                        <div className="mt-2 grid grid-cols-3 text-[11px] font-medium text-gray-500">
                          <span>Small</span>
                          <span className="text-center">Medium</span>
                          <span className="text-right">Large</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Exact Measurement
                      </label>
                      <div className="mt-1 flex items-center rounded-md border border-gray-200 bg-white">
                        <input
                          type="number"
                          min={0}
                          step={preset.unit === "count" ? 1 : 0.1}
                          value={Number.isFinite(row.estimatedValue) ? row.estimatedValue : ""}
                          onChange={(e) => onManualValueChange(row.id, e.target.value)}
                          className="w-full rounded-l-md px-3 py-2 text-sm text-gray-900 outline-none"
                        />
                        <div className="rounded-r-md border-l border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
                          {unitLabel(preset.unit)}
                        </div>
                      </div>

                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                            row.isManualOverride
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {row.isManualOverride ? "Manual override" : "Auto-filled from scale"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start justify-end">
                      <button
                        type="button"
                        onClick={() => onRemove(row.id)}
                        disabled={rows.length <= 1}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center gap-2 rounded-lg ${BORDER} bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50`}
          >
            Close
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
            style={{ backgroundColor: ACCENT }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT_HOVER
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT
            }}
          >
            <Check className="h-4 w-4" />
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

async function postJson<TResponse>(
  url: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as TResponse & {
    error?: string
    details?: string
  }

  if (!response.ok || ("error" in data && typeof data.error === "string")) {
    const message =
      "error" in data && typeof data.error === "string"
        ? [data.error, data.details ? `Details:\n${data.details}` : ""]
            .filter(Boolean)
            .join("\n\n")
        : "Request failed."

    throw new Error(message)
  }

  return data as TResponse
}

export default function AdminTestPage() {
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION)
  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[]>(buildInitialRows())
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false)
  const [assignmentDay, setAssignmentDay] = useState<WeekdayKey>("monday")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [tasks, setTasks] = useState<MainTask[]>([])
  const [raw, setRaw] = useState("")
  const [copiedRaw, setCopiedRaw] = useState(false)

  const dimensions = useMemo(() => rowsToProjectDimensions(measurementRows), [measurementRows])
  const areas = useMemo(() => computeAreasFromDimensions(dimensions), [dimensions])
  const [scheduledDate, setScheduledDate] = useState(() => {
    const today = new Date()
    return today.toISOString().slice(0, 10)
  })

  const summaryChips = useMemo(() => {
    return measurementRows.slice(0, 4).map((row) => {
      const preset = SURFACE_SCALE_PRESETS[row.presetKey]
      return {
        id: row.id,
        label: preset.label,
        value: `${row.estimatedValue} ${unitLabel(preset.unit)}`,
      }
    })
  }, [measurementRows])

  async function copy(text: string, type: "raw" | "description" = "description") {
    try {
      await navigator.clipboard.writeText(text)
      if (type === "raw") {
        setCopiedRaw(true)
        window.setTimeout(() => setCopiedRaw(false), 1200)
      }
    } catch {
      setError("Clipboard copy failed. Copy manually.")
    }
  }

  function updateRow(id: string, updater: (row: MeasurementRow) => MeasurementRow) {
    setMeasurementRows((prev) => prev.map((row) => (row.id === id ? updater(row) : row)))
  }

  function handleBandChange(id: string, nextBand: ScaleBandKey) {
    updateRow(id, (row) => {
      const preset = SURFACE_SCALE_PRESETS[row.presetKey]
      return {
        ...row,
        sizeBand: nextBand,
        estimatedValue: row.isManualOverride ? row.estimatedValue : preset.bands[nextBand].suggested,
      }
    })
  }

  function handlePresetChange(id: string, nextPresetKey: ScalePresetKey) {
    const preset = SURFACE_SCALE_PRESETS[nextPresetKey]
    updateRow(id, () => ({
      id,
      presetKey: nextPresetKey,
      sizeBand: "medium",
      estimatedValue: preset.bands.medium.suggested,
      isManualOverride: false,
    }))
  }

  function handleManualValueChange(id: string, rawValue: string) {
    const nextValue = Number(rawValue)
    updateRow(id, (row) => ({
      ...row,
      estimatedValue: Number.isFinite(nextValue) ? nextValue : 0,
      isManualOverride: true,
    }))
  }

  function addMeasurement() {
    const allPresetKeys = Object.keys(SURFACE_SCALE_PRESETS) as ScalePresetKey[]
    const used = new Set(measurementRows.map((row) => row.presetKey))
    const nextPresetKey =
      allPresetKeys.find((key) => !used.has(key)) ??
      allPresetKeys[measurementRows.length % allPresetKeys.length]

    if (!nextPresetKey) return
    setMeasurementRows((prev) => [...prev, makeRowFromPreset(nextPresetKey, "medium")])
  }

  function removeMeasurement(id: string) {
    setMeasurementRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  async function generate() {
    setError("")
    setTasks([])
    setRaw("")

    setLoading(true)

    try {
      const taskData = await postJson<GetTasksApiResponse>("/api/planning/getTasks", {
        description,
        dimensions,
      })

      if ("error" in taskData) {
        throw new Error(taskData.error)
      }

      let nextTasks: MainTask[] = (taskData.main_tasks || []).map((t) => ({
        name: String(t.name || "").trim(),
        priority: Number.isFinite(Number(t.priority)) ? Number(t.priority) : 50,
        confidence: clamp01(Number(t.confidence ?? 0)),
        reasons: Array.isArray(t.reasons) ? t.reasons.map(String).slice(0, 6) : [],
        sub_tasks: Array.isArray(t.sub_tasks)
          ? t.sub_tasks
              .filter((x) => x && typeof x === "object")
              .map((x) => ({
                title: String(x.title || "").trim(),
                priority: Number.isFinite(Number(x.priority)) ? Number(x.priority) : 500,
                materials: [],
                equipment: [],
                duration: null,
                assignedEmployee: null,
                assignmentScore: null,
                assignmentReasons: [],
              }))
              .filter((x) => x.title)
              .slice(0, 16)
          : [],
        materials: [],
        materialCatalog: [],
      }))

      setRaw(taskData.raw || "")
      console.log("finished generating main task and subtask")

      const materialStageTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const updatedSubTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const materialData = await postJson<GetMaterialsApiResponse>(
                "/api/planning/getMaterials",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                }
              )

              if ("error" in materialData) {
                throw new Error(materialData.error)
              }

              return {
                ...subTask,
                materials: materialData.materials ?? [],
              }
            })
          )

          const materialCatalog = uniqueByName(
            updatedSubTasks.flatMap((subTask) => subTask.materials)
          )

          return {
            ...task,
            sub_tasks: updatedSubTasks,
            materials: materialCatalog.map((item) => item.name),
            materialCatalog,
          }
        })
      )

      nextTasks = materialStageTasks
      console.log("finished generating materials")

      const equipmentStageTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const updatedSubTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const equipmentData = await postJson<GetEquipmentApiResponse>(
                "/api/planning/getEquipment",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                }
              )

              if ("error" in equipmentData) {
                throw new Error(equipmentData.error)
              }

              return {
                ...subTask,
                equipment: equipmentData.equipment ?? [],
              }
            })
          )

          return {
            ...task,
            sub_tasks: updatedSubTasks,
          }
        })
      )

      nextTasks = equipmentStageTasks
      console.log("finished generating equipment")

      const durationStageTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const updatedSubTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const durationData = await postJson<GetDurationApiResponse>(
                "/api/planning/getDuration",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                  dimensions,
                }
              )

              if ("error" in durationData) {
                throw new Error(durationData.error)
              }

              return {
                ...subTask,
                duration: durationData.duration ?? null,
              }
            })
          )

          return {
            ...task,
            sub_tasks: updatedSubTasks,
          }
        })
      )

      nextTasks = durationStageTasks
      console.log("finished generating duration")

      const employeeData = await postJson<GetEmployeesApiResponse>(
        "/api/planning/getEmployees",
        {
          scheduledDate,
          tasks: nextTasks.map((task) => ({
            taskName: task.name,
            subTasks: task.sub_tasks.map((subTask) => ({
              title: subTask.title,
              priority: subTask.priority,
            })),
          })),
        }
      )

      if ("error" in employeeData) {
        throw new Error(employeeData.error)
      }

      const assignmentMap = new Map<
        string,
        {
          employee: AssignedEmployeeOut
          score: number
          reasons: string[]
        }
      >()

      for (const taskGroup of employeeData.assignments ?? []) {
        for (const assignment of taskGroup.assignments ?? []) {
          const key = `${taskGroup.taskName}__${assignment.subTaskTitle}`
          assignmentMap.set(key, {
            employee: assignment.employee ?? null,
            score: Number.isFinite(Number(assignment.score))
              ? Number(assignment.score)
              : 0,
            reasons: Array.isArray(assignment.reasons)
              ? assignment.reasons.map(String)
              : [],
          })
        }
      }

      nextTasks = nextTasks.map((task) => ({
        ...task,
        sub_tasks: task.sub_tasks.map((subTask) => {
          const key = `${task.name}__${subTask.title}`
          const matched = assignmentMap.get(key)

          return {
            ...subTask,
            assignedEmployee: matched?.employee ?? null,
            assignmentScore: matched ? matched.score : null,
            assignmentReasons: matched?.reasons ?? [],
          }
        }),
      }))

      const unassigned = nextTasks.flatMap((task) =>
        task.sub_tasks
          .filter((subTask) => !subTask.assignedEmployee?.id)
          .map((subTask) => `${task.name} -> ${subTask.title}`)
      )

      if (unassigned.length > 0) {
        setError(
          `No employee was assigned to these subtasks for ${scheduledDate}:\n\n${unassigned.join("\n")}`
        )
      }

      console.log("finished generating employees")

      setTasks(nextTasks)
    } catch (e: any) {
      setError(e?.message || "Unexpected error.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-gray-900">AI Task Generation Test</div>
            <div className="mt-1 text-sm text-gray-500">
              AI selects main tasks and sub tasks from the project description and measurements.
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
            style={{ backgroundColor: loading ? "#9CA3AF" : ACCENT }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = ACCENT_HOVER
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = ACCENT
            }}
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        <div className={`rounded-lg bg-white shadow-sm ${BORDER}`}>
          <div className="px-5 py-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-gray-600">Description</label>
                  <button
                    type="button"
                    onClick={() => copy(description)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2 min-h-[180px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: ACCENT }}
                />

                <div className={`mt-4 rounded-lg bg-gray-50 p-4 ${BORDER}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Measurements</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Manage surface sizes in a popup so the page stays clean.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMeasurementModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                      style={{ backgroundColor: ACCENT }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = ACCENT_HOVER
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = ACCENT
                      }}
                    >
                      <Settings2 className="h-4 w-4" />
                      Edit Measurements
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Configured Surfaces
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summaryChips.map((chip) => (
                        <span
                          key={chip.id}
                          className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {chip.label}: {chip.value}
                        </span>
                      ))}
                      {measurementRows.length > 4 ? (
                        <span className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                          +{measurementRows.length - 4} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-lg bg-gray-50 p-4 ${BORDER}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-900">Resolved Measurement Summary</div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-gray-600">Assign Day</label>
                      <select
                        value={assignmentDay}
                        onChange={(e) => setAssignmentDay(e.target.value as WeekdayKey)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:ring-2"
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      >
                        {WEEKDAY_OPTIONS.map((day) => (
                          <option key={day} value={day}>
                            {formatWeekday(day)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-gray-600">Scheduled Date</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:ring-2"
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Interior Walls</span>
                    <span className="font-semibold">{areas.wallAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Ceilings</span>
                    <span className="font-semibold">{areas.ceilingAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Feature Wall</span>
                    <span className="font-semibold">{areas.featureWallAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Exterior Walls</span>
                    <span className="font-semibold">{areas.exteriorWallAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Roof</span>
                    <span className="font-semibold">{areas.roofAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Pressure Wash</span>
                    <span className="font-semibold">{areas.pressureWashAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Trim</span>
                    <span className="font-semibold">{areas.trimLengthM.toFixed(1)} m</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Gutters</span>
                    <span className="font-semibold">{areas.guttersLengthM.toFixed(1)} m</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Fascia</span>
                    <span className="font-semibold">{areas.fasciaLengthM.toFixed(1)} m</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Eaves</span>
                    <span className="font-semibold">{areas.eavesLengthM.toFixed(1)} m</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Deck</span>
                    <span className="font-semibold">{areas.deckAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Epoxy Floor</span>
                    <span className="font-semibold">{areas.epoxyFloorAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Doors</span>
                    <span className="font-semibold">{Math.round(areas.doorsCount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Windows</span>
                    <span className="font-semibold">{Math.round(areas.windowsCount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <>
                <div className="my-4 h-px w-full bg-gray-200" />
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div className="whitespace-pre-wrap">{error}</div>
                </div>
              </>
            ) : null}

            <div className="my-4 h-px w-full bg-gray-200" />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`rounded-lg ${BORDER} bg-gray-50 p-4`}>
                <div className="text-sm font-semibold text-gray-900">
                  Predicted Tasks + Material Quantities
                </div>

                {loading ? (
                  <div className="mt-2 text-sm text-gray-600">Generating…</div>
                ) : tasks.length ? (
                  <div className="mt-3 space-y-3">
                    {tasks.map((t) => {
                      const estimated = estimateMaterialsForTask({
                        task: {
                          name: t.name,
                          sub_tasks: t.sub_tasks,
                          materials: t.materials,
                        },
                        areas,
                        materialCatalog: t.materialCatalog,
                      })

                      return (
                        <div key={t.name} className="rounded-md border border-gray-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-900">
                              <span className="mr-2 inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                                P{t.priority}
                              </span>
                              {t.name}
                            </div>
                            <div className="text-xs font-semibold text-gray-600">
                              {(t.confidence * 100).toFixed(0)}%
                            </div>
                          </div>

                          {t.sub_tasks.length ? (
                            <div className="mt-3">
                              <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-700">
                                <CheckSquare className="h-4 w-4" />
                                Sub Tasks + Assigned Staff
                              </div>

                              <ul className="mt-2 space-y-2 text-[12px] text-gray-700">
                                {t.sub_tasks.map((s, i) => {
                                  return (
                                    <li
                                      key={`${t.name}-${s.title}-${i}`}
                                      className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                                    >
                                      <div className="flex items-start gap-2">
                                        <span className="mt-0.5 inline-flex rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                                          P{s.priority}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                          <div className="leading-relaxed text-gray-900">{s.title}</div>

                                          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                                            <UserCog className="h-3.5 w-3.5" />
                                            <span className="font-semibold text-gray-700">
                                              Assigned staff:
                                            </span>
                                            <span>{s.assignedEmployee?.name ?? "No available staff"}</span>
                                          </div>

                                          {s.assignmentScore !== null ? (
                                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                                              <span className="font-semibold text-gray-700">
                                                Assignment score:
                                              </span>
                                              <span>{s.assignmentScore}</span>
                                            </div>
                                          ) : null}

                                          {s.duration ? (
                                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                                              <span className="font-semibold text-gray-700">
                                                Estimated duration:
                                              </span>
                                              <span>{s.duration.roundedHours.toFixed(2)} hrs</span>
                                            </div>
                                          ) : null}

                                          {s.equipment.length ? (
                                            <div className="mt-2 text-[11px] text-gray-600">
                                              <span className="font-semibold text-gray-700">Equipment:</span>{" "}
                                              {s.equipment.map((item) => item.name).join(", ")}
                                            </div>
                                          ) : null}

                                          {s.materials.length ? (
                                            <div className="mt-2 text-[11px] text-gray-600">
                                              <span className="font-semibold text-gray-700">Materials:</span>{" "}
                                              {s.materials.map((item) => item.name).join(", ")}
                                            </div>
                                          ) : null}

                                          {s.assignmentReasons.length ? (
                                            <div className="mt-1 text-[11px] text-gray-500">
                                              {s.assignmentReasons.join(" • ")}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          ) : null}

                          <div className="mt-3">
                            <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-700">
                              <Beaker className="h-4 w-4" />
                              Materials
                            </div>

                            {t.materials.length ? (
                              <div className="mt-2 text-[12px] text-gray-700">
                                <div className="font-semibold text-gray-600">Selected materials:</div>
                                <ul className="mt-1 list-disc pl-5">
                                  {t.materials.map((m, i) => (
                                    <li key={`${t.name}-material-${i}`}>{m}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <div className="mt-2 text-[12px] text-gray-500">
                                No materials loaded yet.
                              </div>
                            )}

                            <div className="mt-2 text-[12px] text-gray-700">
                              <div className="font-semibold text-gray-600">Calculated quantities:</div>
                              {estimated.length ? (
                                <ul className="mt-1 space-y-1">
                                  {estimated.map((m) => (
                                    <li
                                      key={`${t.name}-${m.name}`}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="text-gray-700">{m.name}</span>
                                      <span className="font-semibold text-gray-900">
                                        {m.qty} {m.unit}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="mt-1 text-gray-500">
                                  No formula available for this task yet.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-gray-600">No result yet.</div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">Raw AI Message</div>
                  <button
                    type="button"
                    onClick={() => copy(raw, "raw")}
                    disabled={!raw}
                    className={`inline-flex items-center gap-2 rounded-lg ${BORDER} bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-60`}
                  >
                    {copiedRaw ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedRaw ? "Copied" : "Copy"}
                  </button>
                </div>

                <pre className="mt-2 whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-700">
                  {raw || "No raw message yet."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MeasurementModal
        open={measurementModalOpen}
        rows={measurementRows}
        onClose={() => setMeasurementModalOpen(false)}
        onAdd={addMeasurement}
        onRemove={removeMeasurement}
        onPresetChange={handlePresetChange}
        onBandChange={handleBandChange}
        onManualValueChange={handleManualValueChange}
      />
    </>
  )
}
