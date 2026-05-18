// In-memory optimistic status cache for the job-creation flow.
//
// Navigation handlers call setOptimisticProjectStatus(projectId, status) right
// before router.push so JobCreationStatusGuard can trust the user's intent
// while the background updateProjectStatus API call is in flight. Without
// this, fast backward navigation would race with the guard and get bounced.

const STATUS_ORDER: readonly string[] = [
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "client_quotation_pending",
  "quotation_pending",
];

const OPTIMISTIC_TTL_MS = 30_000;

type Entry = { status: string; expiresAt: number };

const optimisticByProject = new Map<string, Entry>();

export function setOptimisticProjectStatus(
  projectId: string,
  status: string,
): void {
  if (!projectId || !status) return;
  optimisticByProject.set(projectId, {
    status,
    expiresAt: Date.now() + OPTIMISTIC_TTL_MS,
  });
}

export function getOptimisticProjectStatus(projectId: string): string | null {
  const entry = optimisticByProject.get(projectId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    optimisticByProject.delete(projectId);
    return null;
  }
  return entry.status;
}

export function clearOptimisticProjectStatus(projectId: string): void {
  optimisticByProject.delete(projectId);
}

export function getStatusOrdinal(status: string | null | undefined): number {
  if (!status) return -1;
  return STATUS_ORDER.indexOf(status);
}

// Pick whichever of two statuses is further along in the workflow.
export function maxStatus(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const ia = getStatusOrdinal(a ?? null);
  const ib = getStatusOrdinal(b ?? null);
  if (ia < 0 && ib < 0) return null;
  if (ia >= ib) return a ?? null;
  return b ?? null;
}
