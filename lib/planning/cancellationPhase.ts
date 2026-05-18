// Cancellation phase model — drives the post-cancel "Project Cancellation"
// group in JobProgressCard. Mirrors the shape of the normal end-of-work
// flow (review -> invoice -> payment -> employee -> conclude) but with
// cancellation-specific semantics: settlement instead of invoicing, and
// a Cancellation Agreement document instead of an invoice.

export const CANCELLATION_PHASES = [
  "review",
  "document",
  "payment",
  "employee",
  "conclude",
  "done",
] as const;

export type CancellationPhase = (typeof CANCELLATION_PHASES)[number];

export const CANCELLATION_STEP_IDS = [
  "cancellation-review",
  "cancellation-payment",
  "cancellation-document",
  "cancellation-employee",
  "cancellation-conclude",
] as const;

export type CancellationStepId = (typeof CANCELLATION_STEP_IDS)[number];

export type CancellationStepConfig = {
  id: CancellationStepId;
  title: string;
  // The phase value at which this child becomes "active". Once the phase
  // moves past `pendingPhase`, the child is "done"; before, "pending".
  pendingPhase: Exclude<CancellationPhase, "done">;
  // The phase the project should advance to once this step is finished.
  nextPhase: CancellationPhase;
  // Button label shown when the child is the active step.
  activeLabel: string;
};

export const CANCELLATION_STEPS: readonly CancellationStepConfig[] = [
  {
    id: "cancellation-review",
    title: "Review and Final Checks",
    pendingPhase: "review",
    nextPhase: "document",
    activeLabel: "Review",
  },
  {
    // Document signing moved ahead of payment so the client formally
    // acknowledges the close-out terms first; settlement amounts are
    // captured in the agreement they sign.
    id: "cancellation-document",
    title: "Cancellation Agreement",
    pendingPhase: "document",
    nextPhase: "payment",
    activeLabel: "Manage",
  },
  {
    id: "cancellation-payment",
    title: "Payment Management",
    pendingPhase: "payment",
    nextPhase: "employee",
    activeLabel: "Manage",
  },
  {
    id: "cancellation-employee",
    title: "Employee Management",
    pendingPhase: "employee",
    nextPhase: "conclude",
    activeLabel: "Manage",
  },
  {
    id: "cancellation-conclude",
    title: "Conclude Project",
    pendingPhase: "conclude",
    nextPhase: "done",
    activeLabel: "Conclude",
  },
] as const;

export const CANCELLATION_STEP_BY_ID: Record<
  CancellationStepId,
  CancellationStepConfig
> = Object.fromEntries(
  CANCELLATION_STEPS.map((step) => [step.id, step]),
) as Record<CancellationStepId, CancellationStepConfig>;

export type CancellationVisualStatus = "done" | "active" | "pending";

export function normalizeCancellationPhase(
  value: string | null | undefined,
): CancellationPhase | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  return (CANCELLATION_PHASES as readonly string[]).includes(trimmed)
    ? (trimmed as CancellationPhase)
    : null;
}

function phaseIndex(phase: CancellationPhase) {
  return CANCELLATION_PHASES.indexOf(phase);
}

// Visual status for one cancellation child given the current phase.
export function getCancellationStepVisualStatus(
  stepId: CancellationStepId,
  phase: CancellationPhase | null,
): CancellationVisualStatus {
  // Defensive default — if we somehow have a cancelled project with no
  // phase recorded (shouldn't happen post-migration), treat the first
  // step as active so the admin still has somewhere to click.
  const effectivePhase: CancellationPhase = phase ?? "review";
  if (effectivePhase === "done") return "done";

  const step = CANCELLATION_STEP_BY_ID[stepId];
  if (!step) return "pending";

  const stepIdx = phaseIndex(step.pendingPhase);
  const currentIdx = phaseIndex(effectivePhase);

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

// Group-level status — done if every child is done, active if any are
// done or active, otherwise pending. The "Project Cancellation" group is
// only ever rendered for cancelled projects, so we always have at least
// one active step until the phase reaches "done".
export function getCancellationGroupVisualStatus(
  phase: CancellationPhase | null,
): CancellationVisualStatus {
  const effectivePhase = phase ?? "review";
  if (effectivePhase === "done") return "done";
  return "active";
}

// Returns null if no advance is possible (e.g. mismatch with current
// phase). Caller decides whether to advance based on real state.
export function getNextCancellationPhase(
  current: CancellationPhase | null,
): CancellationPhase | null {
  if (!current || current === "done") return null;
  const idx = phaseIndex(current);
  if (idx < 0 || idx >= CANCELLATION_PHASES.length - 1) return null;
  return CANCELLATION_PHASES[idx + 1] ?? null;
}

// Used by buildProcessItems to know which workflow groups (Job Creation,
// Start of Work, Main Tasks) were already done before the cancellation
// fired. Anything past `cancelled_from_status` is hidden — those steps
// never happened.
const ORDERED_LIFECYCLE_STATUSES = [
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
  "client_quotation_done",
  "downpayment_pending",
  "ready_to_start",
  "in_progress",
  "review_pending",
  "invoice_pending",
  "invoice_agreement_pending",
  "invoice_signed",
  "payment_pending",
  "employee_management_pending",
  "conclude_job_pending",
] as const;

export function getCancelledFromIndex(
  cancelledFromStatus: string | null | undefined,
): number {
  if (!cancelledFromStatus) return -1;
  const normalized = String(cancelledFromStatus).trim().toLowerCase();
  return ORDERED_LIFECYCLE_STATUSES.indexOf(
    normalized as (typeof ORDERED_LIFECYCLE_STATUSES)[number],
  );
}

// Whether the project had reached "in_progress" or later (subtasks
// actually started executing) before being cancelled. Drives whether
// the dashboard shows main task groups in the truncated view.
export function wasProjectInExecution(
  cancelledFromStatus: string | null | undefined,
): boolean {
  const idx = getCancelledFromIndex(cancelledFromStatus);
  if (idx < 0) return false;
  const inProgressIdx = ORDERED_LIFECYCLE_STATUSES.indexOf("in_progress");
  return idx >= inProgressIdx;
}
