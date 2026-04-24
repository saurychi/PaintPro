import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  description: string | null;
  site_address: string | null;
  status: string | null;
  estimated_budget: number | null;
  estimated_cost: number | null;
  estimated_profit: number | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string;
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
  equipments_used: unknown;
  status: string | null;
  sort_order: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
};

type SubTaskRow = {
  sub_task_id: string;
  description: string | null;
};

type ProjectTaskMaterialRow = {
  project_task_material_id: string;
  project_task_id: string;
  material_id: string;
  estimated_quantity: number | null;
  estimated_cost: number | null;
};

type MaterialRow = {
  material_id: string;
  name: string | null;
  unit: string | null;
  unit_cost: number | null;
};

type ProjectSubTaskStaffRow = {
  project_sub_task_staff_id: string;
  project_sub_task_id: string;
  user_id: string;
  role: string | null;
  assignment_status: string | null;
};

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  specialty: string | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseEquipment(value: unknown): { name: string; notes: string | null }[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => ({
      name: typeof item?.name === "string" ? item.name : "",
      notes: typeof item?.notes === "string" ? item.notes : null,
    }))
    .filter((item) => item.name);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select(
        `
        project_id,
        project_code,
        title,
        description,
        site_address,
        status,
        estimated_budget,
        estimated_cost,
        estimated_profit
        `,
      )
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
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id")
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

    const { data: mainTasks, error: mainTasksError } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id, name, sort_order")
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

    const { data: projectSubTasks, error: projectSubTasksError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        `
        project_sub_task_id,
        project_task_id,
        sub_task_id,
        estimated_hours,
        equipments_used,
        status,
        sort_order,
        scheduled_start_datetime,
        scheduled_end_datetime
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
          error: "Failed to load sub tasks.",
          details: subTasksError.message,
        },
        { status: 500 },
      );
    }

    const { data: projectTaskMaterials, error: projectTaskMaterialsError } =
      await supabaseAdmin
        .from("project_task_material")
        .select(
          `
          project_task_material_id,
          project_task_id,
          material_id,
          estimated_quantity,
          estimated_cost
        `,
        )
        .in("project_task_id", projectTaskIds)
        .returns<ProjectTaskMaterialRow[]>();

    if (projectTaskMaterialsError) {
      return NextResponse.json(
        {
          error: "Failed to load project materials.",
          details: projectTaskMaterialsError.message,
        },
        { status: 500 },
      );
    }

    const materialIds = uniqueStrings(
      (projectTaskMaterials ?? []).map((row) => row.material_id),
    );

    let materials: MaterialRow[] = [];

    if (materialIds.length > 0) {
      const { data: materialsData, error: materialsError } = await supabaseAdmin
        .from("materials")
        .select("material_id, name, unit, unit_cost")
        .in("material_id", materialIds)
        .returns<MaterialRow[]>();

      if (materialsError) {
        return NextResponse.json(
          {
            error: "Failed to load material catalog.",
            details: materialsError.message,
          },
          { status: 500 },
        );
      }

      materials = materialsData ?? [];
    }

    const projectSubTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.project_sub_task_id),
    );

    const { data: projectSubTaskStaff, error: projectSubTaskStaffError } =
      await supabaseAdmin
        .from("project_sub_task_staff")
        .select(
          `
          project_sub_task_staff_id,
          project_sub_task_id,
          user_id,
          role,
          assignment_status
        `,
        )
        .in("project_sub_task_id", projectSubTaskIds)
        .returns<ProjectSubTaskStaffRow[]>();

    if (projectSubTaskStaffError) {
      return NextResponse.json(
        {
          error: "Failed to load project sub task staff.",
          details: projectSubTaskStaffError.message,
        },
        { status: 500 },
      );
    }

    const userIds = uniqueStrings(
      (projectSubTaskStaff ?? []).map((row) => row.user_id),
    );

    let users: UserRow[] = [];

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id, username, email, specialty")
        .in("id", userIds)
        .returns<UserRow[]>();

      if (usersError) {
        return NextResponse.json(
          {
            error: "Failed to load users.",
            details: usersError.message,
          },
          { status: 500 },
        );
      }

      users = usersData ?? [];
    }

    const mainTaskMap = new Map((mainTasks ?? []).map((row) => [row.main_task_id, row]));
    const subTaskMap = new Map((subTasks ?? []).map((row) => [row.sub_task_id, row]));
    const materialMap = new Map((materials ?? []).map((row) => [row.material_id, row]));
    const userMap = new Map((users ?? []).map((row) => [row.id, row]));

    const projectSubTaskStaffMap = new Map<string, any[]>();
    for (const row of projectSubTaskStaff ?? []) {
      const current = projectSubTaskStaffMap.get(row.project_sub_task_id) ?? [];
      const user = userMap.get(row.user_id);

      current.push({
        project_sub_task_staff_id: row.project_sub_task_staff_id,
        user_id: row.user_id,
        role: row.role,
        assignment_status: row.assignment_status,
        user: user
          ? {
              id: user.id,
              username: user.username,
              email: user.email,
              specialty: user.specialty,
            }
          : null,
      });

      projectSubTaskStaffMap.set(row.project_sub_task_id, current);
    }

    const materialsByProjectTaskId = new Map<string, any[]>();
    for (const row of projectTaskMaterials ?? []) {
      const current = materialsByProjectTaskId.get(row.project_task_id) ?? [];
      const material = materialMap.get(row.material_id);

      current.push({
        project_task_material_id: row.project_task_material_id,
        material_id: row.material_id,
        name: material?.name ?? "Material",
        unit: material?.unit ?? null,
        unit_cost: material?.unit_cost ?? null,
        estimated_quantity: row.estimated_quantity,
        estimated_cost: row.estimated_cost,
      });

      materialsByProjectTaskId.set(row.project_task_id, current);
    }

    const subtasksByProjectTaskId = new Map<string, any[]>();
    for (const row of projectSubTasks ?? []) {
      const current = subtasksByProjectTaskId.get(row.project_task_id) ?? [];
      const subTask = subTaskMap.get(row.sub_task_id);

      current.push({
        project_sub_task_id: row.project_sub_task_id,
        sub_task_id: row.sub_task_id,
        description: subTask?.description ?? "Sub Task",
        estimated_hours: row.estimated_hours,
        scheduled_start_datetime: row.scheduled_start_datetime,
        scheduled_end_datetime: row.scheduled_end_datetime,
        status: row.status,
        sort_order: row.sort_order,
        equipments_used: parseEquipment(row.equipments_used),
        assigned_staff: projectSubTaskStaffMap.get(row.project_sub_task_id) ?? [],
      });

      subtasksByProjectTaskId.set(row.project_task_id, current);
    }

    const overviewMainTasks = (projectTasks ?? [])
      .map((projectTask) => {
        const mainTask = mainTaskMap.get(projectTask.main_task_id);

        return {
          project_task_id: projectTask.project_task_id,
          main_task_id: projectTask.main_task_id,
          title: mainTask?.name ?? "Main Task",
          sort_order: mainTask?.sort_order ?? 0,
          materials: materialsByProjectTaskId.get(projectTask.project_task_id) ?? [],
          subtasks: (subtasksByProjectTaskId.get(projectTask.project_task_id) ?? []).sort(
            (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
          ),
        };
      })
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

    return NextResponse.json({
      project,
      mainTasks: overviewMainTasks,
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
