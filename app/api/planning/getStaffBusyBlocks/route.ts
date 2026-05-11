import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/getStaffBusyBlocks?projectId=...
//
// Returns the time blocks where staff assigned to the given project are
// already booked on OTHER projects, so the wizard's schedule timeline can
// render them as "busy" overlays. This explains gaps in the calendar that
// would otherwise look unexplained.
//
// Cancelled subtasks and subtasks belonging to cancelled/completed projects
// are excluded — they're no longer real conflicts (matches the filtering
// already applied in getProjectSchedule).

type SubtaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  status: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  description: string | null;
  sub_task_id: string | null;
};

type AssignmentRow = {
  user_id: string;
  project_sub_task_id: string;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string;
};

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  status: string | null;
  title: string | null;
};

type SubTaskCatalogRow = {
  sub_task_id: string;
  description: string | null;
};

const INACTIVE_PROJECT_STATUSES = new Set(["cancelled", "completed"]);

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    // Step 1: Find every staff user assigned to this project's subtasks.
    const { data: thisProjectTasks, error: thisTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id")
      .eq("project_id", projectId);

    if (thisTasksError) {
      return NextResponse.json(
        { error: thisTasksError.message },
        { status: 500 },
      );
    }

    const thisProjectTaskIds = (thisProjectTasks ?? []).map(
      (row) => row.project_task_id as string,
    );

    if (thisProjectTaskIds.length === 0) {
      return NextResponse.json({ busyBlocks: [] });
    }

    const { data: thisProjectSubtasks, error: thisSubtasksError } =
      await supabaseAdmin
        .from("project_sub_task")
        .select("project_sub_task_id")
        .in("project_task_id", thisProjectTaskIds);

    if (thisSubtasksError) {
      return NextResponse.json(
        { error: thisSubtasksError.message },
        { status: 500 },
      );
    }

    const thisProjectSubtaskIds = (thisProjectSubtasks ?? []).map(
      (row) => row.project_sub_task_id as string,
    );

    if (thisProjectSubtaskIds.length === 0) {
      return NextResponse.json({ busyBlocks: [] });
    }

    const { data: thisProjectStaff, error: thisStaffError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("user_id")
      .in("project_sub_task_id", thisProjectSubtaskIds);

    if (thisStaffError) {
      return NextResponse.json(
        { error: thisStaffError.message },
        { status: 500 },
      );
    }

    const userIds = [
      ...new Set(
        (thisProjectStaff ?? [])
          .map((row) => row.user_id as string)
          .filter(Boolean),
      ),
    ];

    if (userIds.length === 0) {
      return NextResponse.json({ busyBlocks: [] });
    }

    // Step 2: Find every assignment those staff have on OTHER subtasks.
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("user_id, project_sub_task_id")
      .in("user_id", userIds)
      .returns<AssignmentRow[]>();

    if (assignmentError) {
      return NextResponse.json(
        { error: assignmentError.message },
        { status: 500 },
      );
    }

    const otherSubtaskIds = [
      ...new Set(
        (assignments ?? [])
          .map((row) => row.project_sub_task_id)
          .filter((id) => id && !thisProjectSubtaskIds.includes(id)),
      ),
    ];

    if (otherSubtaskIds.length === 0) {
      return NextResponse.json({ busyBlocks: [] });
    }

    const { data: subtaskRows, error: subtaskError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime, sub_task_id",
      )
      .in("project_sub_task_id", otherSubtaskIds)
      .not("scheduled_start_datetime", "is", null)
      .not("scheduled_end_datetime", "is", null)
      .neq("status", "cancelled")
      .returns<SubtaskRow[]>();

    if (subtaskError) {
      return NextResponse.json(
        { error: subtaskError.message },
        { status: 500 },
      );
    }

    const parentTaskIds = [
      ...new Set(
        (subtaskRows ?? []).map((row) => row.project_task_id).filter(Boolean),
      ),
    ];

    let projectTasks: ProjectTaskRow[] = [];
    if (parentTaskIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("project_task")
        .select("project_task_id, project_id")
        .in("project_task_id", parentTaskIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      projectTasks = (data ?? []) as ProjectTaskRow[];
    }

    const taskToProject = new Map(
      projectTasks.map((row) => [row.project_task_id, row.project_id]),
    );

    const otherProjectIds = [
      ...new Set(projectTasks.map((row) => row.project_id).filter(Boolean)),
    ];

    let projects: ProjectRow[] = [];
    if (otherProjectIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("project_id, project_code, status, title")
        .in("project_id", otherProjectIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      projects = (data ?? []) as ProjectRow[];
    }

    const projectById = new Map(projects.map((row) => [row.project_id, row]));

    const subTaskCatalogIds = [
      ...new Set(
        (subtaskRows ?? [])
          .map((row) => row.sub_task_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    let subTaskCatalog: SubTaskCatalogRow[] = [];
    if (subTaskCatalogIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("sub_task")
        .select("sub_task_id, description")
        .in("sub_task_id", subTaskCatalogIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      subTaskCatalog = (data ?? []) as SubTaskCatalogRow[];
    }

    const subTaskTitleById = new Map(
      subTaskCatalog.map((row) => [row.sub_task_id, row.description ?? ""]),
    );

    // Build the userId index for fast lookup when fanning out blocks.
    const userIdsBySubtask = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      const list = userIdsBySubtask.get(assignment.project_sub_task_id) ?? [];
      if (!list.includes(assignment.user_id)) list.push(assignment.user_id);
      userIdsBySubtask.set(assignment.project_sub_task_id, list);
    }

    const busyBlocks: Array<{
      projectSubTaskId: string;
      projectId: string;
      projectCode: string | null;
      projectTitle: string | null;
      subTaskTitle: string;
      assignedUserIds: string[];
      startDatetime: string;
      endDatetime: string;
    }> = [];

    for (const subtask of subtaskRows ?? []) {
      const parentProjectId = taskToProject.get(subtask.project_task_id);
      if (!parentProjectId) continue;
      const parentProject = projectById.get(parentProjectId);
      if (!parentProject) continue;
      const status = String(parentProject.status ?? "").toLowerCase();
      if (INACTIVE_PROJECT_STATUSES.has(status)) continue;

      const startIso = subtask.scheduled_start_datetime;
      const endIso = subtask.scheduled_end_datetime;
      if (!startIso || !endIso) continue;

      busyBlocks.push({
        projectSubTaskId: subtask.project_sub_task_id,
        projectId: parentProjectId,
        projectCode: parentProject.project_code,
        projectTitle: parentProject.title,
        subTaskTitle:
          (subtask.sub_task_id &&
            subTaskTitleById.get(subtask.sub_task_id)) ||
          "Subtask",
        assignedUserIds: userIdsBySubtask.get(subtask.project_sub_task_id) ?? [],
        startDatetime: startIso,
        endDatetime: endIso,
      });
    }

    busyBlocks.sort(
      (a, b) =>
        new Date(a.startDatetime).getTime() -
        new Date(b.startDatetime).getTime(),
    );

    return NextResponse.json({ busyBlocks });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to load staff busy blocks.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
