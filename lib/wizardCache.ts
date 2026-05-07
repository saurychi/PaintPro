// Client-side sessionStorage cache for the job-creation wizard.
//
// All project wizard data is stored in a single JSON entry per project.
// Pages read/write from this cache instead of making API calls.
// The overview page performs a single batch-save to persist everything to the DB.

const CACHE_KEY_PREFIX = "paintpro_wizard_";
const CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep =
  | "main_task_pending"
  | "sub_task_pending"
  | "materials_pending"
  | "equipment_pending"
  | "schedule_pending"
  | "employee_assignment_pending"
  | "cost_estimation_pending"
  | "overview_pending"
  | "quotation_pending";

export type CachedMainTask = {
  id: string; // main_task_id
  name: string;
  project_task_id?: string;
};

export type CachedEquipment = {
  id: string;
  equipmentId?: string | null;
  name: string;
  quantity: number;
  unitCost: number;
  notes?: string | null;
};

export type CachedSubTask = {
  id: string; // project_sub_task_id
  subTaskId: string; // sub_task_id (catalog reference)
  mainTaskId: string; // which main task group this belongs to
  projectTaskId: string; // the project_task_id for this main task
  title: string;
  sortOrder: number;
  estimatedHours: number | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  assignedEmployeeIds: string[];
  equipments: CachedEquipment[];
};

export type CachedMaterial = {
  id: string; // project_task_material_id
  projectTaskId: string;
  materialId: string;
  name: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
  estimatedCost: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CachedRefData = {
  equipmentCatalog?: any[];
  materialCatalog?: any[];
  staffUsers?: any[];
};

export type WizardCache = {
  projectId: string;
  projectCode: string | null;
  projectTitle: string | null;
  siteAddress: string | null;
  description: string | null;
  clientId: string | null;
  currentStep: WizardStep;
  mainTasks: CachedMainTask[];
  subTasks: CachedSubTask[];
  materials: CachedMaterial[];
  markupRate: number;
  refData: CachedRefData;
  dirty: boolean; // true when user has made changes not yet saved to DB
  savedAt: string; // ISO timestamp
};

// ─── Core Getters / Setters ───────────────────────────────────────────────────

function cacheKey(projectId: string): string {
  return `${CACHE_KEY_PREFIX}${projectId}`;
}

export function getWizardCache(projectId: string): WizardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardCache;
    // Check staleness
    if (Date.now() - new Date(parsed.savedAt).getTime() > CACHE_MAX_AGE_MS) {
      sessionStorage.removeItem(cacheKey(projectId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setWizardCache(projectId: string, cache: WizardCache): void {
  if (typeof window === "undefined") return;
  try {
    cache.savedAt = new Date().toISOString();
    sessionStorage.setItem(cacheKey(projectId), JSON.stringify(cache));
  } catch {
    // sessionStorage full or unavailable — silently fail
  }
}

export function clearWizardCache(projectId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(cacheKey(projectId));
}

export function hasWizardCache(projectId: string): boolean {
  return getWizardCache(projectId) !== null;
}

/** Returns true only when the cache exists AND has unsaved user changes. */
export function isWizardCacheDirty(projectId: string): boolean {
  const cache = getWizardCache(projectId);
  return cache?.dirty === true;
}

/** Mark the cache as having unsaved changes. */
export function markWizardDirty(projectId: string): void {
  const cache = getWizardCache(projectId);
  if (!cache || cache.dirty) return; // already dirty or no cache
  cache.dirty = true;
  setWizardCache(projectId, cache);
}

// ─── Initialization ───────────────────────────────────────────────────────────

export function initWizardCache(
  projectId: string,
  seed: Omit<WizardCache, "savedAt" | "dirty">,
): void {
  setWizardCache(projectId, { ...seed, dirty: false, savedAt: new Date().toISOString() });
}

// ─── Step Management ──────────────────────────────────────────────────────────

export function getCachedStep(projectId: string): WizardStep | null {
  const cache = getWizardCache(projectId);
  return cache?.currentStep ?? null;
}

export function setCachedStep(projectId: string, step: WizardStep): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.currentStep = step;
  setWizardCache(projectId, cache);
}

// ─── Section Getters ──────────────────────────────────────────────────────────

export function getCachedMainTasks(projectId: string): CachedMainTask[] | null {
  const cache = getWizardCache(projectId);
  return cache?.mainTasks ?? null;
}

export function getCachedSubTasks(projectId: string): CachedSubTask[] | null {
  const cache = getWizardCache(projectId);
  return cache?.subTasks ?? null;
}

export function getCachedMaterials(projectId: string): CachedMaterial[] | null {
  const cache = getWizardCache(projectId);
  return cache?.materials ?? null;
}

export function getCachedMarkupRate(projectId: string): number | null {
  const cache = getWizardCache(projectId);
  return cache?.markupRate ?? null;
}

export function getCachedRefData(projectId: string): CachedRefData | null {
  const cache = getWizardCache(projectId);
  return cache?.refData ?? null;
}

export function getCachedProjectMeta(projectId: string) {
  const cache = getWizardCache(projectId);
  if (!cache) return null;
  return {
    projectCode: cache.projectCode,
    projectTitle: cache.projectTitle,
    siteAddress: cache.siteAddress,
    description: cache.description,
    clientId: cache.clientId,
  };
}

// ─── Section Setters ──────────────────────────────────────────────────────────

export function setCachedMainTasks(
  projectId: string,
  tasks: CachedMainTask[],
): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.mainTasks = tasks;
  setWizardCache(projectId, cache);
}

export function setCachedSubTasks(
  projectId: string,
  subTasks: CachedSubTask[],
): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.subTasks = subTasks;
  setWizardCache(projectId, cache);
}

export function setCachedMaterials(
  projectId: string,
  materials: CachedMaterial[],
): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.materials = materials;
  setWizardCache(projectId, cache);
}

export function setCachedMarkupRate(
  projectId: string,
  rate: number,
): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.markupRate = rate;
  setWizardCache(projectId, cache);
}

export function setCachedRefData(
  projectId: string,
  partial: Partial<CachedRefData>,
): void {
  const cache = getWizardCache(projectId);
  if (!cache) return;
  cache.refData = { ...cache.refData, ...partial };
  setWizardCache(projectId, cache);
}

// ─── Hydration (fetch from DB if no cache) ───────────────────────────────────

const STATUS_TO_STEP: Record<string, WizardStep> = {
  main_task_pending: "main_task_pending",
  sub_task_pending: "sub_task_pending",
  materials_pending: "materials_pending",
  equipment_pending: "equipment_pending",
  schedule_pending: "schedule_pending",
  employee_assignment_pending: "employee_assignment_pending",
  cost_estimation_pending: "cost_estimation_pending",
  overview_pending: "overview_pending",
  quotation_pending: "quotation_pending",
};

// Tracks in-flight hydration per projectId so concurrent callers (e.g., the
// double effect run from React StrictMode in dev) share one fetch and one
// `onFetched` callback firing instead of racing.
const hydrationInFlight = new Map<string, Promise<boolean>>();

/**
 * Ensures the wizard cache is populated for the given project.
 * If the cache already exists, returns true immediately.
 * If not, fetches all project data from the DB via a single API call,
 * seeds the cache, and returns true. Returns false only on fetch failure.
 *
 * Call this at the top of every job-creation page's loading function.
 * The `onFetched` callback fires only when data was fetched from DB (not cache),
 * and only once per concurrent batch of callers.
 */
export async function ensureWizardCacheHydrated(
  projectId: string,
  onFetched?: () => void,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!projectId) return false;

  // Already cached AND has subtask data — nothing to do.
  // If cache exists but subtasks are empty, re-hydrate so that pages
  // after sub-task-assignment get the full project data from the DB.
  const existing = getWizardCache(projectId);
  if (existing && existing.subTasks.length > 0) return true;

  // If another caller is already hydrating this project, await its result
  // rather than firing a second fetch and a duplicate onFetched callback.
  const pending = hydrationInFlight.get(projectId);
  if (pending) return pending;

  const promise = (async (): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/planning/hydrateProjectWizard?projectId=${projectId}`,
        { cache: "no-store" },
      );

      if (!res.ok) return false;

      const data = await res.json();

      const step: WizardStep =
        STATUS_TO_STEP[data.status] ?? "main_task_pending";

      initWizardCache(projectId, {
        projectId: data.projectId,
        projectCode: data.projectCode ?? null,
        projectTitle: data.projectTitle ?? null,
        siteAddress: data.siteAddress ?? null,
        description: data.description ?? null,
        clientId: data.clientId ?? null,
        currentStep: step,
        mainTasks: data.mainTasks ?? [],
        subTasks: data.subTasks ?? [],
        materials: data.materials ?? [],
        markupRate: data.markupRate ?? 30,
        refData: data.refData ?? {},
      });

      onFetched?.();
      return true;
    } catch {
      return false;
    } finally {
      hydrationInFlight.delete(projectId);
    }
  })();

  hydrationInFlight.set(projectId, promise);
  return promise;
}
