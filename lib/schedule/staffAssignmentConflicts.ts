import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type StaffAssignmentWindow = {
  subtaskId: string;
  projectId: string;
  projectTitle: string | null;
  projectCode: string | null;
  subtaskTitle: string;
  startDatetime: string;
  endDatetime: string;
};

const INACTIVE_PROJECT_STATUSES = new Set(["cancelled", "completed"]);
const FINISHED_SUBTASK_STATUSES = new Set([
  "cancelled",
  "completed",
  "done",
  "finished",
]);

export async function getStaffActiveAssignments(
  userId: string,
): Promise<StaffAssignmentWindow[]> {
  const { data: assignmentRows, error: assignErr } = await supabaseAdmin
    .from("project_sub_task_staff")
    .select("project_sub_task_id")
    .eq("user_id", userId);

  if (assignErr) throw new Error(assignErr.message);

  const subtaskIds = [
    ...new Set(
      (assignmentRows ?? [])
        .map((row) => row.project_sub_task_id as string)
        .filter(Boolean),
    ),
  ];
  if (subtaskIds.length === 0) return [];

  const { data: subtaskRows, error: subtaskErr } = await supabaseAdmin
    .from("project_sub_task")
    .select(
      "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime, status, sub_task_id",
    )
    .in("project_sub_task_id", subtaskIds)
    .not("scheduled_start_datetime", "is", null)
    .not("scheduled_end_datetime", "is", null);

  if (subtaskErr) throw new Error(subtaskErr.message);

  const activeSubtasks = (subtaskRows ?? []).filter(
    (row) =>
      !FINISHED_SUBTASK_STATUSES.has(
        String(row.status ?? "").trim().toLowerCase(),
      ),
  );
  if (activeSubtasks.length === 0) return [];

  const taskIds = [
    ...new Set(activeSubtasks.map((row) => row.project_task_id as string)),
  ];
  const { data: taskRows, error: taskErr } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id, project_id")
    .in("project_task_id", taskIds);
  if (taskErr) throw new Error(taskErr.message);

  const taskToProject = new Map(
    (taskRows ?? []).map((row) => [
      row.project_task_id as string,
      row.project_id as string,
    ]),
  );

  const projectIds = [
    ...new Set(
      Array.from(taskToProject.values()).filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const { data: projectRows, error: projectErr } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, title, status")
    .in("project_id", projectIds);
  if (projectErr) throw new Error(projectErr.message);

  const projectById = new Map(
    (projectRows ?? []).map((row) => [row.project_id as string, row]),
  );

  const subTaskCatalogIds = [
    ...new Set(
      activeSubtasks
        .map((row) => row.sub_task_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const subTaskTitleById = new Map<string, string>();
  if (subTaskCatalogIds.length > 0) {
    const { data: catalogRows, error: catalogErr } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, description")
      .in("sub_task_id", subTaskCatalogIds);
    if (catalogErr) throw new Error(catalogErr.message);
    for (const row of catalogRows ?? []) {
      subTaskTitleById.set(
        row.sub_task_id as string,
        (row.description as string | null) ?? "",
      );
    }
  }

  const windows: StaffAssignmentWindow[] = [];
  for (const row of activeSubtasks) {
    const projectId = taskToProject.get(row.project_task_id as string);
    if (!projectId) continue;
    const project = projectById.get(projectId);
    if (!project) continue;
    if (
      INACTIVE_PROJECT_STATUSES.has(
        String(project.status ?? "").trim().toLowerCase(),
      )
    ) {
      continue;
    }
    const startIso = row.scheduled_start_datetime as string | null;
    const endIso = row.scheduled_end_datetime as string | null;
    if (!startIso || !endIso) continue;
    windows.push({
      subtaskId: row.project_sub_task_id as string,
      projectId,
      projectTitle: (project.title as string | null) ?? null,
      projectCode: (project.project_code as string | null) ?? null,
      subtaskTitle:
        (row.sub_task_id &&
          subTaskTitleById.get(row.sub_task_id as string)) ||
        "Subtask",
      startDatetime: startIso,
      endDatetime: endIso,
    });
  }
  return windows;
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if (
    Number.isNaN(aS) ||
    Number.isNaN(aE) ||
    Number.isNaN(bS) ||
    Number.isNaN(bE)
  ) {
    return false;
  }
  return aS < bE && aE > bS;
}

export function findOverlappingAssignments(
  assignments: StaffAssignmentWindow[],
  requestStart: string,
  requestEnd: string,
): StaffAssignmentWindow[] {
  return assignments.filter((a) =>
    rangesOverlap(a.startDatetime, a.endDatetime, requestStart, requestEnd),
  );
}
