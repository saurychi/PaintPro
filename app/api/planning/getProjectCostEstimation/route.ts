import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateProjectCostEstimation,
  normalizeMarkupRate,
  type CostEstimationMainTask,
} from "@/lib/planning/costEstimation";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  description: string | null;
  site_address: string | null;
  status: string | null;
  client_id: string | null;
  markup_rate: number | null;
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
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  sort_order: number | null;
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
};

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  hourly_wage: number | null;
};

type ClientRow = {
  client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim() || "";
    const markupRateInput = searchParams.get("markupRate");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, description, site_address, status, client_id, markup_rate")
      .eq("project_id", projectId)
      .maybeSingle<ProjectRow>();

    if (projectError) {
      return NextResponse.json(
        { error: "Failed to load project.", details: projectError.message },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const markupRate = normalizeMarkupRate(
      markupRateInput !== null && markupRateInput !== ""
        ? Number(markupRateInput)
        : Number(project.markup_rate ?? 30),
    );

    let client: ClientRow | null = null;

    if (project.client_id) {
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("client_id, full_name, email, phone, address")
        .eq("client_id", project.client_id)
        .maybeSingle<ClientRow>();

      if (clientError) {
        return NextResponse.json(
          {
            error: "Failed to load client.",
            details: clientError.message,
          },
          { status: 500 },
        );
      }

      client = clientData ?? null;
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
      .select("main_task_id, name, sort_order:default_sort_order")
      .in("main_task_id", mainTaskIds)
      .returns<MainTaskRow[]>();

    if (mainTasksError) {
      return NextResponse.json(
        { error: "Failed to load main tasks.", details: mainTasksError.message },
        { status: 500 },
      );
    }

    const { data: projectTaskMaterials, error: projectTaskMaterialsError } =
      await supabaseAdmin
        .from("project_task_material")
        .select(
          "project_task_material_id, project_task_id, material_id, estimated_quantity, estimated_cost",
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

    const { data: projectSubTasks, error: projectSubTasksError } =
      await supabaseAdmin
        .from("project_sub_task")
        .select(
          "project_sub_task_id, project_task_id, sub_task_id, estimated_hours, scheduled_start_datetime, scheduled_end_datetime, sort_order",
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

    let subTasks: SubTaskRow[] = [];

    if (subTaskIds.length > 0) {
      const { data: subTasksData, error: subTasksError } = await supabaseAdmin
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

      subTasks = subTasksData ?? [];
    }

    const projectSubTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.project_sub_task_id),
    );

    let projectSubTaskStaff: ProjectSubTaskStaffRow[] = [];

    if (projectSubTaskIds.length > 0) {
      const { data: staffData, error: staffError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .select("project_sub_task_staff_id, project_sub_task_id, user_id")
        .in("project_sub_task_id", projectSubTaskIds)
        .returns<ProjectSubTaskStaffRow[]>();

      if (staffError) {
        return NextResponse.json(
          {
            error: "Failed to load sub task staff assignments.",
            details: staffError.message,
          },
          { status: 500 },
        );
      }

      projectSubTaskStaff = staffData ?? [];
    }

    const userIds = uniqueStrings(projectSubTaskStaff.map((row) => row.user_id));

    let users: UserRow[] = [];

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id, username, email, hourly_wage")
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

    const mainTaskMap = new Map((mainTasks ?? []).map((row) => [row.main_task_id, row]));
    const materialMap = new Map((materials ?? []).map((row) => [row.material_id, row]));
    const subTaskMap = new Map((subTasks ?? []).map((row) => [row.sub_task_id, row]));
    const userMap = new Map((users ?? []).map((row) => [row.id, row]));

    const staffByProjectSubTaskId = new Map<string, UserRow[]>();
    for (const row of projectSubTaskStaff) {
      const current = staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];
      const user = userMap.get(row.user_id);
      if (user) current.push(user);
      staffByProjectSubTaskId.set(row.project_sub_task_id, current);
    }

    const materialsByProjectTaskId = new Map<string, CostEstimationMainTask["materials"]>();
    for (const row of projectTaskMaterials ?? []) {
      const current = materialsByProjectTaskId.get(row.project_task_id) ?? [];
      const material = materialMap.get(row.material_id);

      current.push({
        projectTaskMaterialId: row.project_task_material_id,
        materialId: row.material_id,
        name: material?.name ?? "Material",
        unit: material?.unit ?? null,
        estimatedQuantity: Number(row.estimated_quantity ?? 0),
        unitCost: Number(material?.unit_cost ?? 0),
        estimatedCost: Number(row.estimated_cost ?? 0),
      });

      materialsByProjectTaskId.set(row.project_task_id, current);
    }

    const subtasksByProjectTaskId = new Map<string, CostEstimationMainTask["subtasks"]>();
    for (const row of projectSubTasks ?? []) {
      const current = subtasksByProjectTaskId.get(row.project_task_id) ?? [];
      const subTask = subTaskMap.get(row.sub_task_id);
      const assignedUsers = staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];

      current.push({
        projectSubTaskId: row.project_sub_task_id,
        subTaskId: row.sub_task_id,
        title: subTask?.description ?? "Sub Task",
        estimatedHours: Number(row.estimated_hours ?? 0),
        scheduledStartDatetime: row.scheduled_start_datetime,
        scheduledEndDatetime: row.scheduled_end_datetime,
        assignedStaff: assignedUsers.map((user) => ({
          id: user.id,
          name: user.username || user.email || "Staff",
          hourlyWage: Number(user.hourly_wage ?? 0),
        })),
      });

      subtasksByProjectTaskId.set(row.project_task_id, current);
    }

    const estimationInput = {
      project: {
        projectId: project.project_id,
        projectCode: project.project_code,
        title: project.title,
        description: project.description,
        siteAddress: project.site_address,
        status: project.status,
      },
      markupRate,
      mainTasks: (projectTasks ?? [])
        .map((projectTask) => {
          const mainTask = mainTaskMap.get(projectTask.main_task_id);

          return {
            projectTaskId: projectTask.project_task_id,
            mainTaskId: projectTask.main_task_id,
            title: mainTask?.name ?? "Main Task",
            sortOrder: Number(mainTask?.sort_order ?? 0),
            materials: materialsByProjectTaskId.get(projectTask.project_task_id) ?? [],
            subtasks: subtasksByProjectTaskId.get(projectTask.project_task_id) ?? [],
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };

    const estimation = calculateProjectCostEstimation(estimationInput);

    return NextResponse.json({
      ...estimation,
      client,
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
