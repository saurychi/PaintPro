// Single source of truth for "click on a project → which page do we open?"
// Used by /admin/projects, /admin/schedule, and any other surface that lets
// the admin jump into a project. Keeping this in lib/ prevents the same
// status-to-route table being duplicated (and drifting) across pages.
//
// Routing rules by status:
//   • Wizard stages → that stage's editor page
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
//   • cancelled → /admin/report/report-list/<id> (per-project report —
//     cancelled projects are archive-state too, so the report view is
//     the right landing instead of bouncing back to the list)

export type ProjectStatusKey =
  | "main_task_pending"
  | "sub_task_pending"
  | "materials_pending"
  | "equipment_pending"
  | "schedule_pending"
  | "employee_assignment_pending"
  | "cost_estimation_pending"
  | "overview_pending"
  | "quotation_pending"
  | "grant_access_quotation"
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
  "quotation_pending",
  "grant_access_quotation",
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

export function getProjectRoute(
  projectId: string,
  status: ProjectStatusKey | "unknown",
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
    case "quotation_pending":
    case "grant_access_quotation":
    case "client_quotation_done":
      // The client may already have signed (client_quotation_done), but the
      // admin still needs to review and ack on the quotation page before
      // advancing to downpayment.
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
    case "cancelled":
      return `/admin/report/report-list/${projectId}`;
    case "unknown":
    default:
      return `/admin/projects`;
  }
}
