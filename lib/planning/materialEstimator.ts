import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateFormula } from "@/lib/planning/formulaEngine";
import type { ScalePresetKey } from "@/lib/planning/surfacePresets";

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

// ─── DB-driven material estimator ────────────────────────────────────────────

type MaterialRuleRow = {
  material_name: string;
  formula_template_id: string;
  minimum_quantity: number | null;
};

/**
 * Fetches all active material_estimation_rules for the given mainTaskId +
 * subTaskId, evaluates each rule's formula_template against the project's
 * AreaSummary via expr-eval, applies the minimum_quantity floor, and returns
 * the resulting list of MaterialQty items.
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

  // Material rules are defined at the main-task level (sub_task_id is NULL in
  // material_estimation_rules). Filter by main_task_id only.
  const { data: rules, error } = await supabaseAdmin
    .from("material_estimation_rules")
    .select("material_name, formula_template_id, minimum_quantity")
    .eq("main_task_id", mainTaskId)
    .eq("is_active", true);

  if (error) {
    throw new Error(
      `materialEstimator: failed to fetch rules for mainTaskId=${mainTaskId}: ${error.message}`,
    );
  }

  if (!rules || rules.length === 0) return [];

  const out: MaterialQty[] = [];

  for (const rule of rules as MaterialRuleRow[]) {
    const { value } = await evaluateFormula({
      formulaTemplateId: rule.formula_template_id,
      areas,
    });

    const minimumQty = Number.isFinite(Number(rule.minimum_quantity))
      ? Math.max(Number(rule.minimum_quantity), 0)
      : 0;

    const rawQty = Math.max(value, minimumQty);
    if (rawQty <= 0) continue;

    const unit = getUnitForMaterial(rule.material_name, materialCatalog);
    const qty = roundUpQty(rawQty, unit);

    if (qty > 0) {
      out.push({ name: rule.material_name, qty, unit });
    }
  }

  return out;
}
