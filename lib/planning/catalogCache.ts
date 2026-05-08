// Module-scope cache for the rarely-changing planning catalog tables.
// During a project-generation run the wizard would otherwise hit
// main_task / sub_task / task_duration_rules / formula_templates /
// formula_variables / materials / equipment ~12 times across the
// batched routes — each query carries 100-250ms of Supabase WAN RTT
// even when its result is microseconds of work. Loading the whole
// catalog once and serving from a Map drops the per-route lookup to
// near-zero.
//
// Refresh strategy: in-process TTL plus a manual `invalidatePlanningCatalog()`
// the catalog-edit endpoints can call after a write. The TTL is a
// safety net in case an admin edits the catalog from the Supabase
// dashboard and forgets to bust.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CATALOG_TTL_MS = 5 * 60 * 1000;

export type CachedMainTask = {
  id: string;
  name: string;
  sortOrder: number;
};

export type CachedSubTask = {
  id: string;
  mainTaskId: string;
  description: string;
  sortOrder: number;
  defaultMaterials: unknown;
  defaultEquipment: unknown;
};

export type CachedMaterial = {
  id: string;
  name: string;
  unit: string;
  notes: string | null;
  // Pulled into the cache so createProject's per-material cost calc
  // can read from memory instead of doing a SELECT per material in
  // the insert loop.
  unitCost: number;
};

export type CachedEquipment = {
  id: string;
  name: string;
  status: string | null;
};

export type CachedDurationRule = {
  mainTaskId: string;
  subTaskId: string;
  formulaTemplateId: string;
  minimumHours: number | null;
};

export type CachedFormulaTemplate = {
  id: string;
  expression: string;
  name: string;
};

export type CachedFormulaVariable = {
  templateId: string;
  variableKey: string;
  defaultValue: string | null;
};

export type CachedMaterialEstimationRule = {
  mainTaskId: string;
  materialName: string;
  formulaTemplateId: string;
  minimumQuantity: number | null;
};

export type PlanningCatalog = {
  // Main-task lookups
  mainTasksByName: Map<string, CachedMainTask>; // exact-case
  mainTasksByNameLower: Map<string, CachedMainTask>; // case-insensitive
  mainTasksOrdered: CachedMainTask[]; // sorted by sortOrder

  // Sub-task lookups
  subTasksByPair: Map<string, CachedSubTask>; // `${mainTaskId}::${descLower}`
  subTasksByMainTaskId: Map<string, CachedSubTask[]>; // ordered

  // Material / equipment / rules / formulas
  materialsById: Map<string, CachedMaterial>;
  equipmentById: Map<string, CachedEquipment>;
  equipmentByName: Map<string, CachedEquipment>;
  durationRulesByPair: Map<string, CachedDurationRule>; // `${mainTaskId}::${subTaskId}`
  formulaTemplatesById: Map<string, CachedFormulaTemplate>;
  formulaVariablesByTemplateId: Map<string, CachedFormulaVariable[]>;
  // material_estimation_rules are scoped to a main_task only (sub_task_id is
  // NULL on every row), so the index key is the main_task_id alone.
  materialEstimationRulesByMainTaskId: Map<string, CachedMaterialEstimationRule[]>;
};

let cachedCatalog: PlanningCatalog | null = null;
let cachedAt = 0;
let inflight: Promise<PlanningCatalog> | null = null;

function buildCatalog(rows: {
  mainTasks: any[];
  subTasks: any[];
  materials: any[];
  equipment: any[];
  durationRules: any[];
  formulaTemplates: any[];
  formulaVariables: any[];
  materialEstimationRules: any[];
}): PlanningCatalog {
  const mainTasksByName = new Map<string, CachedMainTask>();
  const mainTasksByNameLower = new Map<string, CachedMainTask>();
  const mainTasksOrdered: CachedMainTask[] = [];

  for (const row of rows.mainTasks) {
    if (row?.is_active === false) continue;
    const id = String(row?.main_task_id ?? "").trim();
    const name = String(row?.name ?? "").trim();
    if (!id || !name) continue;
    const sortRaw = Number(row?.sort_order ?? row?.default_sort_order);
    const cached: CachedMainTask = {
      id,
      name,
      sortOrder: Number.isFinite(sortRaw) ? sortRaw : 999,
    };
    mainTasksByName.set(name, cached);
    mainTasksByNameLower.set(name.toLowerCase(), cached);
    mainTasksOrdered.push(cached);
  }
  mainTasksOrdered.sort((a, b) => a.sortOrder - b.sortOrder);

  const subTasksByPair = new Map<string, CachedSubTask>();
  const subTasksByMainTaskId = new Map<string, CachedSubTask[]>();

  for (const row of rows.subTasks) {
    if (row?.is_active === false) continue;
    const id = String(row?.sub_task_id ?? "").trim();
    const mainTaskId = String(row?.main_task_id ?? "").trim();
    const description = String(row?.description ?? "").trim();
    if (!id || !mainTaskId || !description) continue;
    const sortRaw = Number(row?.sort_order ?? row?.default_sort_order);
    const cached: CachedSubTask = {
      id,
      mainTaskId,
      description,
      sortOrder: Number.isFinite(sortRaw) ? sortRaw : 999,
      defaultMaterials: row?.default_materials ?? null,
      defaultEquipment: row?.default_equipment ?? null,
    };
    subTasksByPair.set(`${mainTaskId}::${description.toLowerCase()}`, cached);
    const list = subTasksByMainTaskId.get(mainTaskId) ?? [];
    list.push(cached);
    subTasksByMainTaskId.set(mainTaskId, list);
  }
  for (const list of subTasksByMainTaskId.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const materialsById = new Map<string, CachedMaterial>();
  for (const row of rows.materials) {
    const id = String(row?.material_id ?? "").trim();
    const name = String(row?.name ?? "").trim();
    const unit = String(row?.unit ?? "").trim();
    if (!id || !name || !unit) continue;
    const unitCostRaw = Number(row?.unit_cost);
    materialsById.set(id, {
      id,
      name,
      unit,
      notes: row?.notes ? String(row.notes).trim() : null,
      unitCost: Number.isFinite(unitCostRaw) ? unitCostRaw : 0,
    });
  }

  const equipmentById = new Map<string, CachedEquipment>();
  const equipmentByName = new Map<string, CachedEquipment>();
  for (const row of rows.equipment) {
    const id = String(row?.equipment_id ?? "").trim();
    const name = String(row?.name ?? "").trim();
    if (!id || !name) continue;
    const cached: CachedEquipment = {
      id,
      name,
      status: row?.status ? String(row.status).trim() : null,
    };
    equipmentById.set(id, cached);
    equipmentByName.set(name, cached);
  }

  const durationRulesByPair = new Map<string, CachedDurationRule>();
  for (const row of rows.durationRules) {
    if (row?.is_active === false) continue;
    const mainTaskId = String(row?.main_task_id ?? "").trim();
    const subTaskId = String(row?.sub_task_id ?? "").trim();
    const formulaTemplateId = String(row?.formula_template_id ?? "").trim();
    if (!mainTaskId || !subTaskId || !formulaTemplateId) continue;
    durationRulesByPair.set(`${mainTaskId}::${subTaskId}`, {
      mainTaskId,
      subTaskId,
      formulaTemplateId,
      minimumHours:
        row?.minimum_hours != null && Number.isFinite(Number(row.minimum_hours))
          ? Number(row.minimum_hours)
          : null,
    });
  }

  const formulaTemplatesById = new Map<string, CachedFormulaTemplate>();
  for (const row of rows.formulaTemplates) {
    if (row?.is_active === false) continue;
    const id = String(row?.formula_template_id ?? "").trim();
    const expression = String(row?.formula_expression ?? "").trim();
    if (!id || !expression) continue;
    formulaTemplatesById.set(id, {
      id,
      expression,
      name: String(row?.name ?? "").trim(),
    });
  }

  const formulaVariablesByTemplateId = new Map<string, CachedFormulaVariable[]>();
  for (const row of rows.formulaVariables) {
    const templateId = String(row?.formula_template_id ?? "").trim();
    const variableKey = String(row?.variable_key ?? "").trim();
    if (!templateId || !variableKey) continue;
    const list = formulaVariablesByTemplateId.get(templateId) ?? [];
    list.push({
      templateId,
      variableKey,
      defaultValue:
        row?.default_value != null ? String(row.default_value) : null,
    });
    formulaVariablesByTemplateId.set(templateId, list);
  }

  const materialEstimationRulesByMainTaskId = new Map<
    string,
    CachedMaterialEstimationRule[]
  >();
  for (const row of rows.materialEstimationRules) {
    if (row?.is_active === false) continue;
    const mainTaskId = String(row?.main_task_id ?? "").trim();
    const materialName = String(row?.material_name ?? "").trim();
    const formulaTemplateId = String(row?.formula_template_id ?? "").trim();
    if (!mainTaskId || !materialName || !formulaTemplateId) continue;
    const cached: CachedMaterialEstimationRule = {
      mainTaskId,
      materialName,
      formulaTemplateId,
      minimumQuantity:
        row?.minimum_quantity != null &&
        Number.isFinite(Number(row.minimum_quantity))
          ? Number(row.minimum_quantity)
          : null,
    };
    const list = materialEstimationRulesByMainTaskId.get(mainTaskId) ?? [];
    list.push(cached);
    materialEstimationRulesByMainTaskId.set(mainTaskId, list);
  }

  return {
    mainTasksByName,
    mainTasksByNameLower,
    mainTasksOrdered,
    subTasksByPair,
    subTasksByMainTaskId,
    materialsById,
    equipmentById,
    equipmentByName,
    durationRulesByPair,
    formulaTemplatesById,
    formulaVariablesByTemplateId,
    materialEstimationRulesByMainTaskId,
  };
}

async function loadCatalog(): Promise<PlanningCatalog> {
  // Now also pulls `unit_cost` from materials (used by createProject's
  // cost calculation — was previously fetched per-material in a hot
  // loop) and `material_estimation_rules` so the per-subtask material
  // estimator can run entirely from cache instead of the DB.
  const [
    mainTasksRes,
    subTasksRes,
    materialsRes,
    equipmentRes,
    durationRulesRes,
    formulaTemplatesRes,
    formulaVariablesRes,
    materialEstimationRulesRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("main_task")
      .select("main_task_id, name, default_sort_order, is_active"),
    supabaseAdmin
      .from("sub_task")
      .select(
        "sub_task_id, main_task_id, description, default_sort_order, default_materials, default_equipment, is_active",
      ),
    supabaseAdmin
      .from("materials")
      .select("material_id, name, unit, notes, unit_cost"),
    supabaseAdmin.from("equipment").select("equipment_id, name, status"),
    supabaseAdmin
      .from("task_duration_rules")
      .select(
        "main_task_id, sub_task_id, formula_template_id, minimum_hours, is_active",
      ),
    supabaseAdmin
      .from("formula_templates")
      .select("formula_template_id, formula_expression, name, is_active"),
    supabaseAdmin
      .from("formula_variables")
      .select("formula_template_id, variable_key, default_value"),
    supabaseAdmin
      .from("material_estimation_rules")
      .select(
        "main_task_id, material_name, formula_template_id, minimum_quantity, is_active",
      ),
  ]);

  // Surface the first table-level error so a misconfigured catalog
  // fails loudly instead of silently returning a half-built map.
  const errors = [
    ["main_task", mainTasksRes.error],
    ["sub_task", subTasksRes.error],
    ["materials", materialsRes.error],
    ["equipment", equipmentRes.error],
    ["task_duration_rules", durationRulesRes.error],
    ["formula_templates", formulaTemplatesRes.error],
    ["formula_variables", formulaVariablesRes.error],
    ["material_estimation_rules", materialEstimationRulesRes.error],
  ] as const;
  for (const [table, err] of errors) {
    if (err) {
      throw new Error(`catalog load: failed to fetch ${table}: ${err.message}`);
    }
  }

  return buildCatalog({
    mainTasks: mainTasksRes.data ?? [],
    subTasks: subTasksRes.data ?? [],
    materials: materialsRes.data ?? [],
    equipment: equipmentRes.data ?? [],
    durationRules: durationRulesRes.data ?? [],
    formulaTemplates: formulaTemplatesRes.data ?? [],
    formulaVariables: formulaVariablesRes.data ?? [],
    materialEstimationRules: materialEstimationRulesRes.data ?? [],
  });
}

export async function getPlanningCatalog(): Promise<PlanningCatalog> {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CATALOG_TTL_MS) {
    return cachedCatalog;
  }

  // Coalesce concurrent cold misses so a flurry of generation requests
  // at server boot only kicks off one fetch. Without this, ten parallel
  // batched calls would all racey-fetch the catalog seven times each.
  if (inflight) return inflight;

  inflight = (async () => {
    const fresh = await loadCatalog();
    cachedCatalog = fresh;
    cachedAt = Date.now();
    return fresh;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// Catalog-edit endpoints (createMainTask, createSubTaskCatalogItem, etc.)
// can call this to bust the cache after a write. The TTL also limits
// staleness on its own.
export function invalidatePlanningCatalog() {
  cachedCatalog = null;
  cachedAt = 0;
}
