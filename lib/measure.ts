// Shared helpers for the staff "Measure Generator" tool. The staff messages
// page scans incoming messages with `scanSurfacesFromPresets` and, on the
// 3-dot action, stashes the result under `MEASURE_HANDOFF_KEY` for the
// generator page to hydrate from.
//
// The canonical surface list lives in the `surface_scale_presets` table —
// both pages fetch it from /api/planning/getSurfaceScalePresets. There is
// no hard-coded vocabulary here; whatever the admins maintain in the DB is
// what we recognise in messages and offer in the generator.

import type {
  SurfaceScalePresets,
  SurfaceUnit,
} from "@/lib/planning/surfacePresets";

export const MEASURE_HANDOFF_KEY = "paintpro_measure_handoff";

export type SurfacePresetOption = {
  key: string;
  label: string;
  unit: SurfaceUnit;
};

// Build a flat option list from the preset map returned by the API. The
// list is sorted by label so dropdowns render in the same order users see
// in the admin's "basic details" wizard.
export function presetOptions(
  presets: SurfaceScalePresets | null | undefined,
): SurfacePresetOption[] {
  if (!presets) return [];
  return Object.values(presets)
    .map((preset) => ({
      key: preset.key,
      label: preset.label,
      unit: preset.unit,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Scan `content` for any preset label and return the matched preset keys
// (deduped). Match is case-insensitive and word-bounded, with a simple
// plural tolerance (trailing 's' optional) so "walls" still matches the
// "Wall" preset.
export function scanSurfacesFromPresets(
  content: string,
  options: SurfacePresetOption[],
): string[] {
  if (!content || options.length === 0) return [];

  const hits: string[] = [];
  for (const option of options) {
    const escaped = escapeRegex(option.label);
    const pattern = new RegExp(`\\b${escaped}s?\\b`, "i");
    if (pattern.test(content)) hits.push(option.key);
  }
  return Array.from(new Set(hits));
}

export type MeasureHandoff = {
  // Canonical preset keys — the generator looks each up in the fetched
  // presets to pull the display label and the measurement unit.
  surfaceKeys: string[];
  sourceMessage?: string;
  conversationId?: string;
};
