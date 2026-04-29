import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  site_address: string | null;
  status: string | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  main_task_id: string;
};

type MainTaskRow = {
  main_task_id: string;
  name: string | null;
  sort_order: number | null;
};

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  sub_task_id: string;
  estimated_hours: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  status: string | null;
  sort_order: number | null;
  notes: string | null;
};

type SubTaskRow = {
  sub_task_id: string;
  description: string | null;
};

type ProjectSubTaskStaffRow = {
  project_sub_task_staff_id: string;
  project_sub_task_id: string;
  user_id: string;
  role: string | null;
  assignment_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  role: string | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, site_address, status")
      .eq("project_id", projectId)
      .maybeSingle<ProjectRow>();

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to load project.",
          details: projectError.message,
        },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, main_task_id")
      .eq("project_id", projectId)
      .returns<ProjectTaskRow[]>();

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project tasks.",
          details: projectTasksError.message,
        },
        { status: 500 },
      );
    }

    const projectTaskIds = uniqueStrings(
      (projectTasks ?? []).map((row) => row.project_task_id),
    );
    const mainTaskIds = uniqueStrings(
      (projectTasks ?? []).map((row) => row.main_task_id),
    );

    if (projectTaskIds.length === 0) {
      return NextResponse.json({
        project,
        projectSubTaskStaff: [],
      });
    }

    const { data: mainTasks, error: mainTasksError } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id, name, sort_order:default_sort_order")
      .in("main_task_id", mainTaskIds)
      .returns<MainTaskRow[]>();

    if (mainTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load main tasks.",
          details: mainTasksError.message,
        },
        { status: 500 },
      );
    }

    const { data: projectSubTasks, error: projectSubTasksError } =
      await supabaseAdmin
        .from("project_sub_task")
        .select(
          `
          project_sub_task_id,
          project_task_id,
          sub_task_id,
          estimated_hours,
          scheduled_start_datetime,
          scheduled_end_datetime,
          status,
          sort_order,
          notes
        `,
        )
        .in("project_task_id", projectTaskIds)
        .returns<ProjectSubTaskRow[]>();

    if (projectSubTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project subtasks.",
          details: projectSubTasksError.message,
        },
        { status: 500 },
      );
    }

    const subTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.sub_task_id),
    );

    const { data: subTasks, error: subTasksError } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, description")
      .in("sub_task_id", subTaskIds)
      .returns<SubTaskRow[]>();

    if (subTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load sub task catalog.",
          details: subTasksError.message,
        },
        { status: 500 },
      );
    }

    const projectSubTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.project_sub_task_id),
    );

    const { data: staffAssignments, error: staffAssignmentsError } =
      await supabaseAdmin
        .from("project_sub_task_staff")
        .select(
          `
          project_sub_task_staff_id,
          project_sub_task_id,
          user_id,
          role,
          assignment_status,
          created_at,
          updated_at
        `,
        )
        .in("project_sub_task_id", projectSubTaskIds)
        .returns<ProjectSubTaskStaffRow[]>();

    if (staffAssignmentsError) {
      return NextResponse.json(
        {
          error: "Failed to load sub task staff assignments.",
          details: staffAssignmentsError.message,
        },
        { status: 500 },
      );
    }

    const userIds = uniqueStrings(
      (staffAssignments ?? []).map((row) => row.user_id),
    );

    let users: UserRow[] = [];

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id, username, email, role")
        .in("id", userIds)
        .returns<UserRow[]>();

      if (usersError) {
        return NextResponse.json(
          {
            error: "Failed to load assigned users.",
            details: usersError.message,
          },
          { status: 500 },
        );
      }

      users = usersData ?? [];
    }

    const projectTaskMap = new Map(
      (projectTasks ?? []).map((row) => [row.project_task_id, row]),
    );

    const mainTaskMap = new Map(
      (mainTasks ?? []).map((row) => [row.main_task_id, row]),
    );

    const subTaskMap = new Map(
      (subTasks ?? []).map((row) => [row.sub_task_id, row]),
    );

    const userMap = new Map(users.map((row) => [row.id, row]));

    const assignmentsByProjectSubTaskId = new Map<string, any[]>();

    for (const assignment of staffAssignments ?? []) {
      const current = assignmentsByProjectSubTaskId.get(
        assignment.project_sub_task_id,
      ) ?? [];

      current.push({
        ...assignment,
        user: userMap.get(assignment.user_id)
          ? {
              id: userMap.get(assignment.user_id)!.id,
              username: userMap.get(assignment.user_id)!.username,
              email: userMap.get(assignment.user_id)!.email,
              role: userMap.get(assignment.user_id)!.role,
            }
          : null,
      });

      assignmentsByProjectSubTaskId.set(
        assignment.project_sub_task_id,
        current,
      );
    }

    const rows = (projectSubTasks ?? [])
      .map((row) => {
        const projectTask = projectTaskMap.get(row.project_task_id) ?? null;
        const mainTask = projectTask
          ? mainTaskMap.get(projectTask.main_task_id) ?? null
          : null;
        const subTask = subTaskMap.get(row.sub_task_id) ?? null;

        return {
          project_sub_task_id: row.project_sub_task_id,
          project_task_id: row.project_task_id,
          main_task_id: projectTask?.main_task_id ?? null,
          main_task_name: mainTask?.name ?? null,
          main_task_sort_order: mainTask?.sort_order ?? 0,
          sub_task_id: row.sub_task_id,
          sub_task: subTask
            ? {
                sub_task_id: subTask.sub_task_id,
                description: subTask.description,
              }
            : null,
          estimated_hours: row.estimated_hours,
          scheduled_start_datetime: row.scheduled_start_datetime,
          scheduled_end_datetime: row.scheduled_end_datetime,
          status: row.status,
          sort_order: row.sort_order,
          notes: row.notes,
          project_sub_task_staff:
            assignmentsByProjectSubTaskId.get(row.project_sub_task_id) ?? [],
        };
      })
      .sort((a, b) => {
        const mainTaskOrder =
          Number(a.main_task_sort_order ?? 0) - Number(b.main_task_sort_order ?? 0);

        if (mainTaskOrder !== 0) return mainTaskOrder;

        return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      });

    return NextResponse.json({
      project,
      projectSubTaskStaff: rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
