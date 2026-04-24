export type MainTaskName = string

export type SubTaskHint = {
  title: string
  priority: number
}

export type MaterialHint = {
  name: string
  unit?: string
  notes?: string
}

export type EquipmentHint = {
  name: string
  notes?: string
}

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export type EmployeeAvailability = {
  day_of_week: WeekdayKey
  is_available: boolean
  start_time?: string | null
  end_time?: string | null
}

export type EmployeeRole = "staff" | "manager" | "admin" | "client"

export type EmployeeHint = {
  id: string
  name: string
  role: EmployeeRole
  specialties: readonly string[]
  availability: readonly EmployeeAvailability[]
  notes?: string
}

export type AiCatalog = {
  mainTasks: readonly string[]
  mainTaskPriority?: Record<string, number>
  subTasks?: Partial<Record<string, readonly SubTaskHint[]>>
  materials?: readonly MaterialHint[]
  equipment?: readonly EquipmentHint[]
  employees?: readonly EmployeeHint[]
}

export type BusinessProfile = {
  businessName: string
  location: string
}

export type ScaleBandKey = "small" | "medium" | "large"

export type ScaleBand = {
  min: number
  max: number
  suggested: number
  label: string
}

export type SurfaceScalePreset = {
  key: string
  label: string
  unit: "m2" | "m" | "count"
  bands: Record<ScaleBandKey, ScaleBand>
}

export const SURFACE_SCALE_PRESETS: Record<string, SurfaceScalePreset> = {
  interior_wall_area_m2: {
    key: "interior_wall_area_m2",
    label: "Interior Wall Area",
    unit: "m2",
    bands: {
      small: { min: 40, max: 120, suggested: 80, label: "Small (40-120 m²)" },
      medium: { min: 121, max: 250, suggested: 180, label: "Medium (121-250 m²)" },
      large: { min: 251, max: 500, suggested: 320, label: "Large (251-500 m²)" },
    },
  },
  feature_wall_area_m2: {
    key: "feature_wall_area_m2",
    label: "Feature Wall Area",
    unit: "m2",
    bands: {
      small: { min: 6, max: 18, suggested: 12, label: "Small (6-18 m²)" },
      medium: { min: 19, max: 35, suggested: 24, label: "Medium (19-35 m²)" },
      large: { min: 36, max: 60, suggested: 42, label: "Large (36-60 m²)" },
    },
  },
  ceiling_area_m2: {
    key: "ceiling_area_m2",
    label: "Ceiling Area",
    unit: "m2",
    bands: {
      small: { min: 10, max: 50, suggested: 25, label: "Small (10-50 m²)" },
      medium: { min: 51, max: 120, suggested: 80, label: "Medium (51-120 m²)" },
      large: { min: 121, max: 250, suggested: 160, label: "Large (121-250 m²)" },
    },
  },
  exterior_wall_area_m2: {
    key: "exterior_wall_area_m2",
    label: "Exterior Wall Area",
    unit: "m2",
    bands: {
      small: { min: 50, max: 150, suggested: 100, label: "Small (50-150 m²)" },
      medium: { min: 151, max: 300, suggested: 220, label: "Medium (151-300 m²)" },
      large: { min: 301, max: 600, suggested: 420, label: "Large (301-600 m²)" },
    },
  },
  wallpaper_area_m2: {
    key: "wallpaper_area_m2",
    label: "Wallpaper Area",
    unit: "m2",
    bands: {
      small: { min: 8, max: 30, suggested: 18, label: "Small (8-30 m²)" },
      medium: { min: 31, max: 70, suggested: 45, label: "Medium (31-70 m²)" },
      large: { min: 71, max: 140, suggested: 90, label: "Large (71-140 m²)" },
    },
  },
  roof_area_m2: {
    key: "roof_area_m2",
    label: "Roof Area",
    unit: "m2",
    bands: {
      small: { min: 60, max: 140, suggested: 100, label: "Small (60-140 m²)" },
      medium: { min: 141, max: 250, suggested: 180, label: "Medium (141-250 m²)" },
      large: { min: 251, max: 450, suggested: 320, label: "Large (251-450 m²)" },
    },
  },
  deck_area_m2: {
    key: "deck_area_m2",
    label: "Deck Area",
    unit: "m2",
    bands: {
      small: { min: 5, max: 20, suggested: 12, label: "Small (5-20 m²)" },
      medium: { min: 21, max: 45, suggested: 30, label: "Medium (21-45 m²)" },
      large: { min: 46, max: 90, suggested: 60, label: "Large (46-90 m²)" },
    },
  },
  patio_area_m2: {
    key: "patio_area_m2",
    label: "Patio Area",
    unit: "m2",
    bands: {
      small: { min: 6, max: 20, suggested: 12, label: "Small (6-20 m²)" },
      medium: { min: 21, max: 45, suggested: 30, label: "Medium (21-45 m²)" },
      large: { min: 46, max: 90, suggested: 60, label: "Large (46-90 m²)" },
    },
  },
  driveway_area_m2: {
    key: "driveway_area_m2",
    label: "Driveway Area",
    unit: "m2",
    bands: {
      small: { min: 15, max: 50, suggested: 30, label: "Small (15-50 m²)" },
      medium: { min: 51, max: 120, suggested: 80, label: "Medium (51-120 m²)" },
      large: { min: 121, max: 220, suggested: 150, label: "Large (121-220 m²)" },
    },
  },
  garage_floor_area_m2: {
    key: "garage_floor_area_m2",
    label: "Garage Floor Area",
    unit: "m2",
    bands: {
      small: { min: 10, max: 30, suggested: 18, label: "Small (10-30 m²)" },
      medium: { min: 31, max: 60, suggested: 42, label: "Medium (31-60 m²)" },
      large: { min: 61, max: 120, suggested: 80, label: "Large (61-120 m²)" },
    },
  },
  epoxy_floor_area_m2: {
    key: "epoxy_floor_area_m2",
    label: "Epoxy Floor Area",
    unit: "m2",
    bands: {
      small: { min: 10, max: 35, suggested: 20, label: "Small (10-35 m²)" },
      medium: { min: 36, max: 80, suggested: 50, label: "Medium (36-80 m²)" },
      large: { min: 81, max: 180, suggested: 100, label: "Large (81-180 m²)" },
    },
  },
  pressure_wash_area_m2: {
    key: "pressure_wash_area_m2",
    label: "Pressure Wash Area",
    unit: "m2",
    bands: {
      small: { min: 20, max: 80, suggested: 40, label: "Small (20-80 m²)" },
      medium: { min: 81, max: 180, suggested: 120, label: "Medium (81-180 m²)" },
      large: { min: 181, max: 400, suggested: 250, label: "Large (181-400 m²)" },
    },
  },
  gutters_length_m: {
    key: "gutters_length_m",
    label: "Gutters Length",
    unit: "m",
    bands: {
      small: { min: 5, max: 20, suggested: 12, label: "Small (5-20 m)" },
      medium: { min: 21, max: 40, suggested: 28, label: "Medium (21-40 m)" },
      large: { min: 41, max: 80, suggested: 55, label: "Large (41-80 m)" },
    },
  },
  fascia_length_m: {
    key: "fascia_length_m",
    label: "Fascia Length",
    unit: "m",
    bands: {
      small: { min: 5, max: 20, suggested: 12, label: "Small (5-20 m)" },
      medium: { min: 21, max: 40, suggested: 28, label: "Medium (21-40 m)" },
      large: { min: 41, max: 80, suggested: 55, label: "Large (41-80 m)" },
    },
  },
  eaves_length_m: {
    key: "eaves_length_m",
    label: "Eaves Length",
    unit: "m",
    bands: {
      small: { min: 5, max: 20, suggested: 12, label: "Small (5-20 m)" },
      medium: { min: 21, max: 40, suggested: 28, label: "Medium (21-40 m)" },
      large: { min: 41, max: 80, suggested: 55, label: "Large (41-80 m)" },
    },
  },
  downpipes_length_m: {
    key: "downpipes_length_m",
    label: "Downpipes Length",
    unit: "m",
    bands: {
      small: { min: 3, max: 12, suggested: 8, label: "Small (3-12 m)" },
      medium: { min: 13, max: 25, suggested: 18, label: "Medium (13-25 m)" },
      large: { min: 26, max: 50, suggested: 35, label: "Large (26-50 m)" },
    },
  },
  trim_length_m: {
    key: "trim_length_m",
    label: "Trim Length",
    unit: "m",
    bands: {
      small: { min: 10, max: 35, suggested: 20, label: "Small (10-35 m)" },
      medium: { min: 36, max: 80, suggested: 55, label: "Medium (36-80 m)" },
      large: { min: 81, max: 160, suggested: 110, label: "Large (81-160 m)" },
    },
  },
  skirting_length_m: {
    key: "skirting_length_m",
    label: "Skirting Length",
    unit: "m",
    bands: {
      small: { min: 8, max: 30, suggested: 18, label: "Small (8-30 m)" },
      medium: { min: 31, max: 70, suggested: 45, label: "Medium (31-70 m)" },
      large: { min: 71, max: 140, suggested: 90, label: "Large (71-140 m)" },
    },
  },
  architrave_length_m: {
    key: "architrave_length_m",
    label: "Architrave Length",
    unit: "m",
    bands: {
      small: { min: 6, max: 25, suggested: 15, label: "Small (6-25 m)" },
      medium: { min: 26, max: 55, suggested: 38, label: "Medium (26-55 m)" },
      large: { min: 56, max: 110, suggested: 75, label: "Large (56-110 m)" },
    },
  },
  handrail_length_m: {
    key: "handrail_length_m",
    label: "Handrail Length",
    unit: "m",
    bands: {
      small: { min: 2, max: 10, suggested: 6, label: "Small (2-10 m)" },
      medium: { min: 11, max: 25, suggested: 16, label: "Medium (11-25 m)" },
      large: { min: 26, max: 50, suggested: 34, label: "Large (26-50 m)" },
    },
  },
  balustrade_length_m: {
    key: "balustrade_length_m",
    label: "Balustrade Length",
    unit: "m",
    bands: {
      small: { min: 2, max: 12, suggested: 8, label: "Small (2-12 m)" },
      medium: { min: 13, max: 28, suggested: 18, label: "Medium (13-28 m)" },
      large: { min: 29, max: 60, suggested: 40, label: "Large (29-60 m)" },
    },
  },
  fence_length_m: {
    key: "fence_length_m",
    label: "Fence Length",
    unit: "m",
    bands: {
      small: { min: 5, max: 20, suggested: 10, label: "Small (5-20 m)" },
      medium: { min: 21, max: 45, suggested: 30, label: "Medium (21-45 m)" },
      large: { min: 46, max: 100, suggested: 60, label: "Large (46-100 m)" },
    },
  },
  doors_count: {
    key: "doors_count",
    label: "Doors Count",
    unit: "count",
    bands: {
      small: { min: 1, max: 4, suggested: 2, label: "Small (1-4)" },
      medium: { min: 5, max: 10, suggested: 6, label: "Medium (5-10)" },
      large: { min: 11, max: 20, suggested: 12, label: "Large (11-20)" },
    },
  },
  windows_count: {
    key: "windows_count",
    label: "Windows Count",
    unit: "count",
    bands: {
      small: { min: 1, max: 6, suggested: 4, label: "Small (1-6)" },
      medium: { min: 7, max: 15, suggested: 10, label: "Medium (7-15)" },
      large: { min: 16, max: 30, suggested: 20, label: "Large (16-30)" },
    },
  },
  gate_count: {
    key: "gate_count",
    label: "Gate Count",
    unit: "count",
    bands: {
      small: { min: 1, max: 2, suggested: 1, label: "Small (1-2)" },
      medium: { min: 3, max: 5, suggested: 3, label: "Medium (3-5)" },
      large: { min: 6, max: 10, suggested: 6, label: "Large (6-10)" },
    },
  },
  columns_count: {
    key: "columns_count",
    label: "Columns Count",
    unit: "count",
    bands: {
      small: { min: 1, max: 4, suggested: 2, label: "Small (1-4)" },
      medium: { min: 5, max: 10, suggested: 6, label: "Medium (5-10)" },
      large: { min: 11, max: 20, suggested: 12, label: "Large (11-20)" },
    },
  },
}

function safeList(lines: string[]) {
  return lines.filter(Boolean).join("\n")
}
