export type AreaVariableDefinition = {
  key: string;
  summaryKey: string;
  label: string;
  unit: string;
  description: string;
};

export const AREA_VARIABLE_DEFINITIONS: AreaVariableDefinition[] = [
  {
    key: "wall_area_m2",
    summaryKey: "wallAreaM2",
    label: "Wall area",
    unit: "m2",
    description: "Measured interior wall area.",
  },
  {
    key: "ceiling_area_m2",
    summaryKey: "ceilingAreaM2",
    label: "Ceiling area",
    unit: "m2",
    description: "Measured ceiling area.",
  },
  {
    key: "feature_wall_area_m2",
    summaryKey: "featureWallAreaM2",
    label: "Feature wall area",
    unit: "m2",
    description: "Measured or derived feature wall area.",
  },
  {
    key: "exterior_wall_area_m2",
    summaryKey: "exteriorWallAreaM2",
    label: "Exterior wall area",
    unit: "m2",
    description: "Measured exterior wall area.",
  },
  {
    key: "roof_area_m2",
    summaryKey: "roofAreaM2",
    label: "Roof area",
    unit: "m2",
    description: "Measured roof area.",
  },
  {
    key: "wallpaper_area_m2",
    summaryKey: "wallpaperAreaM2",
    label: "Wallpaper area",
    unit: "m2",
    description: "Measured wallpaper coverage area.",
  },
  {
    key: "pressure_wash_area_m2",
    summaryKey: "pressureWashAreaM2",
    label: "Pressure wash area",
    unit: "m2",
    description: "Measured pressure washing area.",
  },
  {
    key: "deck_area_m2",
    summaryKey: "deckAreaM2",
    label: "Deck area",
    unit: "m2",
    description: "Measured deck area.",
  },
  {
    key: "patio_area_m2",
    summaryKey: "patioAreaM2",
    label: "Patio area",
    unit: "m2",
    description: "Measured patio area.",
  },
  {
    key: "driveway_area_m2",
    summaryKey: "drivewayAreaM2",
    label: "Driveway area",
    unit: "m2",
    description: "Measured driveway area.",
  },
  {
    key: "garage_floor_area_m2",
    summaryKey: "garageFloorAreaM2",
    label: "Garage floor area",
    unit: "m2",
    description: "Measured garage floor area.",
  },
  {
    key: "epoxy_floor_area_m2",
    summaryKey: "epoxyFloorAreaM2",
    label: "Epoxy floor area",
    unit: "m2",
    description: "Measured epoxy floor area.",
  },
  {
    key: "trim_length_m",
    summaryKey: "trimLengthM",
    label: "Trim length",
    unit: "m",
    description: "Measured trim length.",
  },
  {
    key: "skirting_length_m",
    summaryKey: "skirtingLengthM",
    label: "Skirting length",
    unit: "m",
    description: "Measured skirting length.",
  },
  {
    key: "architrave_length_m",
    summaryKey: "architraveLengthM",
    label: "Architrave length",
    unit: "m",
    description: "Measured architrave length.",
  },
  {
    key: "gutters_length_m",
    summaryKey: "guttersLengthM",
    label: "Gutters length",
    unit: "m",
    description: "Measured gutters length.",
  },
  {
    key: "fascia_length_m",
    summaryKey: "fasciaLengthM",
    label: "Fascia length",
    unit: "m",
    description: "Measured fascia length.",
  },
  {
    key: "eaves_length_m",
    summaryKey: "eavesLengthM",
    label: "Eaves length",
    unit: "m",
    description: "Measured eaves length.",
  },
  {
    key: "downpipes_length_m",
    summaryKey: "downpipesLengthM",
    label: "Downpipes length",
    unit: "m",
    description: "Measured downpipes length.",
  },
  {
    key: "handrail_length_m",
    summaryKey: "handrailLengthM",
    label: "Handrail length",
    unit: "m",
    description: "Measured handrail length.",
  },
  {
    key: "balustrade_length_m",
    summaryKey: "balustradeLengthM",
    label: "Balustrade length",
    unit: "m",
    description: "Measured balustrade length.",
  },
  {
    key: "doors_count",
    summaryKey: "doorsCount",
    label: "Doors count",
    unit: "count",
    description: "Count of doors included in the project.",
  },
  {
    key: "windows_count",
    summaryKey: "windowsCount",
    label: "Windows count",
    unit: "count",
    description: "Count of windows included in the project.",
  },
  {
    key: "fence_length_m",
    summaryKey: "fenceLengthM",
    label: "Fence length",
    unit: "m",
    description: "Measured fence length.",
  },
  {
    key: "gate_count",
    summaryKey: "gateCount",
    label: "Gate count",
    unit: "count",
    description: "Count of gates included in the project.",
  },
];

const areaVariableDefinitionMap = new Map(
  AREA_VARIABLE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function getAreaVariableDefinition(key: string) {
  return areaVariableDefinitionMap.get(key) ?? null;
}

export function buildAreaVariableMapFromSummary(
  summary: Record<string, number | null | undefined>,
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const definition of AREA_VARIABLE_DEFINITIONS) {
    const rawValue = Number(summary[definition.summaryKey] ?? 0);
    map[definition.key] = Number.isFinite(rawValue) ? rawValue : 0;
  }

  return map;
}
