export type ScaleBandKey = "small" | "medium" | "large"

export type ScalePresetKey = string

export type SurfaceUnit = "m2" | "m" | "count"

export type ScaleBand = {
  min: number
  max: number
  suggested: number
  label: string
}

export type SurfaceScalePreset = {
  key: string
  label: string
  unit: SurfaceUnit
  bands: Record<ScaleBandKey, ScaleBand>
}

export type SurfaceScalePresets = Record<string, SurfaceScalePreset>
