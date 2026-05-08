import { Parser } from "expr-eval";
import { getPlanningCatalog } from "@/lib/planning/catalogCache";
import { buildAreaVariableMapFromSummary } from "@/lib/planning/areaVariables";
import type { ScalePresetKey } from "@/lib/planning/surfacePresets";

const parser = new Parser();

// ─── Public types ────────────────────────────────────────────────────────────

export type ProjectScaledField = {
  presetKey: ScalePresetKey;
  sizeBand?: string;
  estimatedValue?: number;
  isManualOverride?: boolean;
  notes?: string;
};

export type ProjectDimensions = {
  scaled?: Partial<Record<ScalePresetKey, ProjectScaledField>>;
  notes?: string;
};

export type MaterialCatalogItem = {
  name: string;
  unit?: string;
  notes?: string;
};

export type MaterialQty = {
  name: string;
  qty: number;
  unit: string;
};

export type AreaSummary = {
  wallAreaM2: number;
  ceilingAreaM2: number;
  featureWallAreaM2: number;
  exteriorWallAreaM2: number;
  roofAreaM2: number;
  wallpaperAreaM2: number;
  pressureWashAreaM2: number;
  deckAreaM2: number;
  patioAreaM2: number;
  drivewayAreaM2: number;
  garageFloorAreaM2: number;
  epoxyFloorAreaM2: number;
  trimLengthM: number;
  skirtingLengthM: number;
  architraveLengthM: number;
  guttersLengthM: number;
  fasciaLengthM: number;
  eavesLengthM: number;
  downpipesLengthM: number;
  handrailLengthM: number;
  balustradeLengthM: number;
  doorsCount: number;
  windowsCount: number;
  fenceLengthM: number;
  gateCount: number;
};

// ─── Dimension helpers ────────────────────────────────────────────────────────

export function getScaledValue(
  dimensions: ProjectDimensions | null | undefined,
  key: ScalePresetKey,
): number {
  const value = Number(dimensions?.scaled?.[key]?.estimatedValue);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function computeAreasFromDimensions(
  dimensions: ProjectDimensions | null | undefined,
): AreaSummary {
  const wallArea = getScaledValue(dimensions, "interior_wall_area_m2");
  const featureWallArea = getScaledValue(dimensions, "feature_wall_area_m2");
  const ceilingArea = getScaledValue(dimensions, "ceiling_area_m2");
  const exteriorWallArea = getScaledValue(dimensions, "exterior_wall_area_m2");
  const roofArea = getScaledValue(dimensions, "roof_area_m2");
  const wallpaperArea = getScaledValue(dimensions, "wallpaper_area_m2");
  const pressureWashArea = getScaledValue(dimensions, "pressure_wash_area_m2");
  const deckArea = getScaledValue(dimensions, "deck_area_m2");
  const patioArea = getScaledValue(dimensions, "patio_area_m2");
  const drivewayArea = getScaledValue(dimensions, "driveway_area_m2");
  const garageFloorArea = getScaledValue(dimensions, "garage_floor_area_m2");
  const epoxyFloorArea = getScaledValue(dimensions, "epoxy_floor_area_m2");
  const trimLength = getScaledValue(dimensions, "trim_length_m");
  const skirtingLength = getScaledValue(dimensions, "skirting_length_m");
  const architraveLength = getScaledValue(dimensions, "architrave_length_m");
  const guttersLength = getScaledValue(dimensions, "gutters_length_m");
  const fasciaLength = getScaledValue(dimensions, "fascia_length_m");
  const eavesLength = getScaledValue(dimensions, "eaves_length_m");
  const downpipesLength = getScaledValue(dimensions, "downpipes_length_m");
  const handrailLength = getScaledValue(dimensions, "handrail_length_m");
  const balustradeLength = getScaledValue(dimensions, "balustrade_length_m");
  const doorsCount = getScaledValue(dimensions, "doors_count");
  const windowsCount = getScaledValue(dimensions, "windows_count");
  const fenceLength = getScaledValue(dimensions, "fence_length_m");
  const gateCount = getScaledValue(dimensions, "gate_count");

  return {
    wallAreaM2: wallArea,
    ceilingAreaM2: ceilingArea,
    featureWallAreaM2:
      featureWallArea > 0
        ? featureWallArea
        : wallArea > 0
        ? Math.max(12, Math.min(wallArea * 0.18, 24))
        : 0,
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
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function norm(s: string): string {
  return String(s || "").trim().toLowerCase();
}

function roundUpQty(qty: number, unit: string): number {
  const u = norm(unit);
  if (u === "l" || u === "kg") return Math.ceil(qty * 2) / 2; // 0.5 steps
  return Math.ceil(qty);
}

function getUnitForMaterial(
  name: string,
  catalog: readonly MaterialCatalogItem[],
): string {
  const found = catalog.find((item) => norm(item.name) === norm(name));
  return found?.unit ?? "";
}

// ─── Cache-driven material estimator ─────────────────────────────────────────

/**
 * Resolves all material_estimation_rules for the given mainTaskId from the
 * in-memory planning catalog and evaluates each formula_template locally
 * against the project's AreaSummary. Equivalent to the previous DB-only
 * version but with zero round-trips on warm cache (rules + templates +
 * variables are all loaded once at catalog warm-up).
 *
 * material_estimation_rules are defined at the main-task level (sub_task_id
 * is NULL on every row), so the subTaskId arg is accepted for call-site
 * symmetry but ignored.
 *
 * Returns an empty array when no rules exist (no error thrown).
 */
export async function estimateMaterialsForSubTask(args: {
  mainTaskId: string;
  subTaskId: string;
  areas: AreaSummary;
  materialCatalog: readonly MaterialCatalogItem[];
}): Promise<MaterialQty[]> {
  const { mainTaskId, areas, materialCatalog } = args;

  const catalog = await getPlanningCatalog();
  const rules = catalog.materialEstimationRulesByMainTaskId.get(mainTaskId);
  if (!rules || rules.length === 0) return [];

  const areaMap = buildAreaVariableMapFromSummary(
    areas as Record<string, number | null | undefined>,
  );

  const out: MaterialQty[] = [];

  for (const rule of rules) {
    const template = catalog.formulaTemplatesById.get(rule.formulaTemplateId);
    if (!template) continue;

    // Build the eval scope once per rule: variable rows first (with
    // default_value fallback when the matching area is zero / missing),
    // then layer every area variable so formulas referencing area keys
    // directly still resolve.
    const scope: Record<string, number> = {};
    for (const v of catalog.formulaVariablesByTemplateId.get(template.id) ?? []) {
      const fromArea = areaMap[v.variableKey];
      if (fromArea !== undefined && fromArea !== 0) {
        scope[v.variableKey] = fromArea;
      } else {
        const fallback = Number(v.defaultValue ?? 0);
        scope[v.variableKey] = Number.isFinite(fallback) ? fallback : 0;
      }
    }
    for (const [key, value] of Object.entries(areaMap)) {
      if (!(key in scope)) scope[key] = value;
    }

    let value = 0;
    try {
      const parsed = parser.parse(template.expression);
      const raw = parsed.evaluate(scope);
      value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    } catch {
      // Bad formula in the catalog — skip this rule rather than fail the
      // whole project save. The original DB version threw here; the
      // tradeoff is "don't bring down a 70-step save for one bad row".
      continue;
    }

    const minimumQty =
      rule.minimumQuantity != null && Number.isFinite(rule.minimumQuantity)
        ? Math.max(rule.minimumQuantity, 0)
        : 0;

    const rawQty = Math.max(value, minimumQty);
    if (rawQty <= 0) continue;

    const unit = getUnitForMaterial(rule.materialName, materialCatalog);
    const qty = roundUpQty(rawQty, unit);

    if (qty > 0) {
      out.push({ name: rule.materialName, qty, unit });
    }
  }

  return out;
}
