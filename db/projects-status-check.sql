-- Drops and recreates the `projects_status_check` CHECK constraint so the
-- new wizard status `client_quotation_pending` is accepted by the DB.
--
-- Background: the application introduced a pre-grant state between
-- overview_pending and quotation_pending. The PDF is generated and the
-- admin lands on the quotation-generation page, but the document isn't
-- exposed to the client until the admin clicks Grant Access (which
-- flips the row to quotation_pending). Without this constraint update,
-- /api/planning/updateProjectStatus returns 500 the first time the
-- overview page tries to advance the project.
--
-- Run this in the Supabase SQL editor. The drop/recreate must be one
-- transaction so the table is never without the guard.

begin;

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (
    status in (
      'main_task_pending',
      'sub_task_pending',
      'materials_pending',
      'equipment_pending',
      'schedule_pending',
      'employee_assignment_pending',
      'cost_estimation_pending',
      'overview_pending',
      'client_quotation_pending',
      'quotation_pending',
      'client_quotation_done',
      'downpayment_pending',
      'ready_to_start',
      'in_progress',
      'review_pending',
      'invoice_pending',
      'invoice_agreement_pending',
      'invoice_signed',
      'payment_pending',
      'employee_management_pending',
      'conclude_job_pending',
      'completed',
      'cancelled'
    )
  );

commit;
