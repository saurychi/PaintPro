// Single source of truth for "click on a project → which page do we open?"
// Used by /admin/projects, /admin/schedule, and any other surface that lets
// the admin jump into a project. Keeping this in lib/ prevents the same
// status-to-route table being duplicated (and drifting) across pages.
//
// Routing rules by status:
//   • Wizard stages → that stage's editor page
//   • client_quotation_pending → quotation-generation (admin must click
//     Grant Access to expose the document to the client)
//   • client_quotation_done → quotation-generation (admin needs to advance)
//   • downpayment_pending → /admin?openDownpayment=<id> (auto-pops the modal)
//   • ready_to_start → /admin?openKickoff=<id> (auto-pops the kickoff modal)
//   • in_progress / review_pending / wrap-up → /admin?projectId=<id>
//     (dashboard + JobProgressCard pre-selected to this project)
//   • Invoice draft / sent / signed → invoice-generation page
//   • payment_pending → /admin?projectId=<id>&openPayment=<id>
//     (dashboard auto-opens FinalPaymentModal — admin's next action is
//     receiving payment, not editing the invoice)
//   • completed → /admin/report/report-list/<id> (per-project report)
//   • cancelled — depends on cancellation_phase:
//       phase="done" (or null/concluded) → /admin/report/report-list/<id>
//         (fully wrapped up, archive surface)
//       phase="payment" → /admin?projectId=<id>&openCancellationPayment=<id>
//         (settlement modal auto-pops)
//       any other phase (review / document / employee / conclude) →
//         /admin?projectId=<id> (dashboard with the JobProgressCard
//         showing the next cancellation action)

export type ProjectStatusKey =
  | "main_task_pending"
  | "sub_task_pending"
  | "materials_pending"
  | "equipment_pending"
  | "schedule_pending"
  | "employee_assignment_pending"
  | "cost_estimation_pending"
  | "overview_pending"
  | "client_quotation_pending"
  | "quotation_pending"
  | "client_quotation_done"
  | "downpayment_pending"
  | "ready_to_start"
  | "in_progress"
  | "review_pending"
  | "invoice_pending"
  | "invoice_agreement_pending"
  | "invoice_signed"
  | "payment_pending"
  | "employee_management_pending"
  | "conclude_job_pending"
  | "completed"
  | "cancelled";

export const PROJECT_STATUS_KEYS: readonly ProjectStatusKey[] = [
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
  "completed",
  "cancelled",
];

export function normalizeProjectStatus(
  value: string | null | undefined,
): ProjectStatusKey | "unknown" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if ((PROJECT_STATUS_KEYS as readonly string[]).includes(normalized)) {
    return normalized as ProjectStatusKey;
  }
  return "unknown";
}

// Cancellation phases recognised by the dashboard. "done" is the fully
// concluded state — same archive semantics as a completed project, so
// the route falls through to the report list. The other phases mean
// the wrap-up is still in progress and the admin needs to take an
// action from the dashboard.
type CancellationPhaseHint =
  | "review"
  | "document"
  | "payment"
  | "employee"
  | "conclude"
  | "done";

function normalizeCancellationPhaseHint(
  value: string | null | undefined,
): CancellationPhaseHint | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "review":
    case "document":
    case "payment":
    case "employee":
    case "conclude":
    case "done":
      return normalized;
    default:
      return null;
  }
}

export function getProjectRoute(
  projectId: string,
  status: ProjectStatusKey | "unknown",
  // Only honoured when status === "cancelled". Lets the caller route
  // mid-wrap-up cancellations to the dashboard (where the admin can
  // still advance the cancellation phase) while concluded cancellations
  // go straight to the report list.
  cancellationPhase?: string | null,
): string {
  switch (status) {
    case "main_task_pending":
      return `/admin/job-creation/main-task-assignment?projectId=${projectId}`;
    case "sub_task_pending":
      return `/admin/job-creation/sub-task-assignment?projectId=${projectId}`;
    case "materials_pending":
      return `/admin/job-creation/materials-assignment?projectId=${projectId}`;
    case "equipment_pending":
      return `/admin/job-creation/equipment-assignment?projectId=${projectId}`;
    case "schedule_pending":
      return `/admin/job-creation/project-schedule?projectId=${projectId}`;
    case "employee_assignment_pending":
      return `/admin/job-creation/employee-assignment?projectId=${projectId}`;
    case "cost_estimation_pending":
      return `/admin/job-creation/cost-estimation?projectId=${projectId}`;
    case "overview_pending":
      return `/admin/job-creation/overview?projectId=${projectId}`;
    case "client_quotation_pending":
    case "quotation_pending":
    case "client_quotation_done":
      // client_quotation_pending: PDF was generated but admin hasn't
      // clicked Grant Access yet, so the client can't see it.
      // quotation_pending: client has been granted access and we're
      // waiting for their signature.
      // client_quotation_done: already signed; admin still needs to
      // advance to downpayment from this page.
      return `/admin/job-creation/quotation-generation?projectId=${projectId}`;
    case "downpayment_pending":
      return `/admin?openDownpayment=${projectId}`;
    case "ready_to_start":
      return `/admin?openKickoff=${projectId}`;
    case "in_progress":
      return `/admin?projectId=${projectId}`;
    case "invoice_pending":
    case "invoice_agreement_pending":
    case "invoice_signed":
      return `/admin/projects/invoice-generation?projectId=${projectId}`;
    case "payment_pending":
      return `/admin?projectId=${projectId}&openPayment=${projectId}`;
    case "review_pending":
    case "employee_management_pending":
    case "conclude_job_pending":
      // No dedicated editor for these — show them on the dashboard with
      // their JobProgressCard pre-selected so the admin can advance them.
      return `/admin?projectId=${projectId}`;
    case "completed":
      return `/admin/report/report-list/${projectId}`;
    case "cancelled": {
      const phase = normalizeCancellationPhaseHint(cancellationPhase);
      // Concluded cancellation (or no phase known yet — old data fallback):
      // archive surface.
      if (phase === null || phase === "done") {
        return `/admin/report/report-list/${projectId}`;
      }
      // Settlement modal auto-pops only when the wrap-up has reached
      // the payment step. JobProgressCard's effect ignores the param
      // when the phase isn't payment, so passing it on every cancel
      // would be a no-op rather than a problem; we scope it for clarity.
      if (phase === "payment") {
        return `/admin?projectId=${projectId}&openCancellationPayment=${projectId}`;
      }
      // review / document / employee / conclude → dashboard, project
      // pre-selected. The JobProgressCard surfaces the cancellation
      // group with the active phase highlighted so the admin can take
      // the next action.
      return `/admin?projectId=${projectId}`;
    }
    case "unknown":
    default:
      return `/admin/projects`;
  }
}
