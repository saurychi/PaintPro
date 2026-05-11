import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CancellationSettlement = {
  earnedCost: number;
  earnedRevenue: number;
  downpayment: number;
  balance: number;
  completedSubtaskCount: number;
  completedMainTaskCount: number;
};

const COMPLETED_STATUSES = new Set([
  "completed",
  "done",
  "finished",
]);

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCompletedStatus(value: unknown): boolean {
  return COMPLETED_STATUSES.has(String(value ?? "").trim().toLowerCase());
}

// Computes how much the admin has "earned" on a project at the moment of
// cancellation, and how that nets against the recorded downpayment.
//
// Logic:
//   For each completed subtask: labor_cost += sum(staff hourly_wage × hours)
//   For each main task with ≥1 completed subtask: materials_cost += sum of its materials
//   earned_cost     = labor + materials
//   earned_revenue  = earned_cost × (1 + markup_rate / 100)
//   balance         = downpayment - earned_revenue
//     positive → refund client (the admin owes them this much)
//     negative → bill client (the client owes the admin |balance|)
export async function calculateCancellationSettlement(
  projectId: string,
): Promise<CancellationSettlement> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_id, downpayment, markup_rate")
    .eq("project_id", projectId)
    .maybeSingle();

  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Project not found.");

  const downpayment = toNumber(project.downpayment);
  const markupRate = toNumber(project.markup_rate);

  const { data: projectTasks, error: taskError } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id")
    .eq("project_id", projectId);

  if (taskError) throw new Error(taskError.message);

  const projectTaskIds = (projectTasks ?? []).map(
    (t) => t.project_task_id as string,
  );

  if (projectTaskIds.length === 0) {
    return {
      earnedCost: 0,
      earnedRevenue: 0,
      downpayment,
      balance: downpayment,
      completedSubtaskCount: 0,
      completedMainTaskCount: 0,
    };
  }

  const { data: subtasks, error: subtaskError } = await supabaseAdmin
    .from("project_sub_task")
    .select("project_sub_task_id, project_task_id, status, estimated_hours")
    .in("project_task_id", projectTaskIds);

  if (subtaskError) throw new Error(subtaskError.message);

  const completedSubtasks = (subtasks ?? []).filter((s) =>
    isCompletedStatus(s.status),
  );

  const completedSubtaskIds = completedSubtasks.map(
    (s) => s.project_sub_task_id as string,
  );

  const taskIdsWithCompletedWork = new Set(
    completedSubtasks.map((s) => s.project_task_id as string),
  );

  let laborCost = 0;
  if (completedSubtaskIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("project_sub_task_id, user_id")
      .in("project_sub_task_id", completedSubtaskIds);

    if (staffError) throw new Error(staffError.message);

    const userIds = Array.from(
      new Set(
        (staffRows ?? [])
          .map((r) => r.user_id as string)
          .filter(Boolean),
      ),
    );

    let wagesById = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id, hourly_wage")
        .in("id", userIds);

      if (usersError) throw new Error(usersError.message);

      wagesById = new Map(
        (users ?? []).map((u) => [
          u.id as string,
          toNumber(u.hourly_wage),
        ]),
      );
    }

    const hoursById = new Map(
      completedSubtasks.map((s) => [
        s.project_sub_task_id as string,
        toNumber(s.estimated_hours),
      ]),
    );

    for (const row of staffRows ?? []) {
      const hours = hoursById.get(row.project_sub_task_id as string) ?? 0;
      const wage = wagesById.get(row.user_id as string) ?? 0;
      laborCost += hours * wage;
    }
  }

  let materialsCost = 0;
  if (taskIdsWithCompletedWork.size > 0) {
    const { data: materialRows, error: materialsError } = await supabaseAdmin
      .from("project_task_material")
      .select("project_task_id, estimated_cost")
      .in("project_task_id", Array.from(taskIdsWithCompletedWork));

    if (materialsError) throw new Error(materialsError.message);

    for (const row of materialRows ?? []) {
      materialsCost += toNumber(row.estimated_cost);
    }
  }

  const earnedCost = laborCost + materialsCost;
  const earnedRevenue = earnedCost * (1 + markupRate / 100);
  const balance = downpayment - earnedRevenue;

  return {
    earnedCost,
    earnedRevenue,
    downpayment,
    balance,
    completedSubtaskCount: completedSubtasks.length,
    completedMainTaskCount: taskIdsWithCompletedWork.size,
  };
}

// The lifecycle stages where hard delete is the correct action. Past this set
// the project has been exposed to the client (signed quotation visible, money
// possibly collected) and we soft-cancel instead to preserve audit trail.
export const PRE_CLIENT_STATUSES = new Set([
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "quotation_pending",
]);

export function shouldHardDelete(status: string | null | undefined): boolean {
  return PRE_CLIENT_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

export function isTerminal(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(String(status ?? "").trim().toLowerCase());
}
