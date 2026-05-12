import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateProjectCostEstimation,
  normalizeMarkupRate,
  type CostEstimationMainTask,
} from "@/lib/planning/costEstimation";

type CostEstimationResult = ReturnType<typeof calculateProjectCostEstimation>;
import {
  collectEquipmentUsageIds,
  collectLegacyEquipmentNames,
  parseEquipmentUsage,
} from "@/lib/planning/equipmentUsage";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  description: string | null;
  site_address: string | null;
  status: string | null;
  client_id: string | null;
  markup_rate: number | null;
  downpayment: number | null;
  downpayment_rate: number | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string;
  main_task_id: string;
  sort_order: number | null;
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
  equipments_used: unknown;
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

type EquipmentRow = {
  equipment_id: string;
  name: string | null;
};

export type ClientRow = {
  client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export class CostEstimationLoadError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 500, details?: string) {
    super(message);
    this.name = "CostEstimationLoadError";
    this.status = status;
    this.details = details;
  }
}

export type CostEstimationResponse = CostEstimationResult & {
  client: ClientRow | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

// Loads + assembles everything the quotation/cost-estimation views need.
// Used by both:
//   - GET /api/planning/getProjectCostEstimation (the public read endpoint)
//   - GET /api/quotation/html (server-side HTML render for the PDF pipeline)
//
// Inlining this avoids a server-to-server HTTP roundtrip during quotation
// generation. Queries are batched into 4 parallel Promise.all tiers based
// on dependency order, so a project with many subtasks finishes in ~800ms
// instead of the ~3s the original sequential pipeline took.
export async function loadProjectCostEstimation(
  projectId: string,
  markupRateOverride?: number | string | null,
): Promise<CostEstimationResponse> {
  if (!projectId) {
    throw new CostEstimationLoadError("Missing projectId.", 400);
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select(
      "project_id, project_code, title, description, site_address, status, client_id, markup_rate, downpayment, downpayment_rate",
    )
    .eq("project_id", projectId)
    .maybeSingle<ProjectRow>();

  if (projectError) {
    throw new CostEstimationLoadError(
      "Failed to load project.",
      500,
      projectError.message,
    );
  }
  if (!project) {
    throw new CostEstimationLoadError("Project not found.", 404);
  }

  const markupRate = normalizeMarkupRate(
    markupRateOverride !== null &&
      markupRateOverride !== undefined &&
      markupRateOverride !== ""
      ? Number(markupRateOverride)
      : Number(project.markup_rate ?? 30),
  );

  // Tier 1: client + project_task in parallel.
  const [clientResult, projectTasksResult] = await Promise.all([
    project.client_id
      ? supabaseAdmin
          .from("clients")
          .select("client_id, full_name, email, phone, address")
          .eq("client_id", project.client_id)
          .maybeSingle<ClientRow>()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id, sort_order")
      .eq("project_id", projectId)
      .returns<ProjectTaskRow[]>(),
  ]);

  if (clientResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load client.",
      500,
      clientResult.error.message,
    );
  }
  if (projectTasksResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load project tasks.",
      500,
      projectTasksResult.error.message,
    );
  }

  const client = clientResult.data ?? null;
  const projectTasks = projectTasksResult.data ?? [];

  const projectTaskIds = uniqueStrings(
    projectTasks.map((row) => row.project_task_id),
  );
  const mainTaskIds = uniqueStrings(
    projectTasks.map((row) => row.main_task_id),
  );

  // Tier 2: main_task + project_task_material + project_sub_task in parallel.
  const [mainTasksResult, projectTaskMaterialsResult, projectSubTasksResult] =
    await Promise.all([
      mainTaskIds.length > 0
        ? supabaseAdmin
            .from("main_task")
            .select("main_task_id, name, sort_order:default_sort_order")
            .in("main_task_id", mainTaskIds)
            .returns<MainTaskRow[]>()
        : Promise.resolve({ data: [] as MainTaskRow[], error: null }),
      projectTaskIds.length > 0
        ? supabaseAdmin
            .from("project_task_material")
            .select(
              "project_task_material_id, project_task_id, material_id, estimated_quantity, estimated_cost",
            )
            .in("project_task_id", projectTaskIds)
            .returns<ProjectTaskMaterialRow[]>()
        : Promise.resolve({
            data: [] as ProjectTaskMaterialRow[],
            error: null,
          }),
      projectTaskIds.length > 0
        ? supabaseAdmin
            .from("project_sub_task")
            .select(
              "project_sub_task_id, project_task_id, sub_task_id, estimated_hours, scheduled_start_datetime, scheduled_end_datetime, sort_order, equipments_used",
            )
            .in("project_task_id", projectTaskIds)
            .order("sort_order", { ascending: true })
            .returns<ProjectSubTaskRow[]>()
        : Promise.resolve({ data: [] as ProjectSubTaskRow[], error: null }),
    ]);

  if (mainTasksResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load main tasks.",
      500,
      mainTasksResult.error.message,
    );
  }
  if (projectTaskMaterialsResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load project materials.",
      500,
      projectTaskMaterialsResult.error.message,
    );
  }
  if (projectSubTasksResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load project subtasks.",
      500,
      projectSubTasksResult.error.message,
    );
  }

  const mainTasks = mainTasksResult.data ?? [];
  const projectTaskMaterials = projectTaskMaterialsResult.data ?? [];
  const projectSubTasks = projectSubTasksResult.data ?? [];

  const materialIds = uniqueStrings(
    projectTaskMaterials.map((row) => row.material_id),
  );
  const subTaskIds = uniqueStrings(
    projectSubTasks.map((row) => row.sub_task_id),
  );
  const equipmentIds = collectEquipmentUsageIds(
    projectSubTasks.map((row) => row.equipments_used),
  );
  const equipmentNames = collectLegacyEquipmentNames(
    projectSubTasks.map((row) => row.equipments_used),
  );
  const projectSubTaskIds = uniqueStrings(
    projectSubTasks.map((row) => row.project_sub_task_id),
  );

  // Tier 3: materials + sub_task + equipment(by id, by name) +
  // project_sub_task_staff in parallel.
  const [
    materialsResult,
    subTasksResult,
    equipmentByIdResult,
    equipmentByNameResult,
    projectSubTaskStaffResult,
  ] = await Promise.all([
    materialIds.length > 0
      ? supabaseAdmin
          .from("materials")
          .select("material_id, name, unit, unit_cost")
          .in("material_id", materialIds)
          .returns<MaterialRow[]>()
      : Promise.resolve({ data: [] as MaterialRow[], error: null }),
    subTaskIds.length > 0
      ? supabaseAdmin
          .from("sub_task")
          .select("sub_task_id, description")
          .in("sub_task_id", subTaskIds)
          .returns<SubTaskRow[]>()
      : Promise.resolve({ data: [] as SubTaskRow[], error: null }),
    equipmentIds.length > 0
      ? supabaseAdmin
          .from("equipment")
          .select("equipment_id, name")
          .in("equipment_id", equipmentIds)
          .returns<EquipmentRow[]>()
      : Promise.resolve({ data: [] as EquipmentRow[], error: null }),
    equipmentNames.length > 0
      ? supabaseAdmin
          .from("equipment")
          .select("equipment_id, name")
          .in("name", equipmentNames)
          .returns<EquipmentRow[]>()
      : Promise.resolve({ data: [] as EquipmentRow[], error: null }),
    projectSubTaskIds.length > 0
      ? supabaseAdmin
          .from("project_sub_task_staff")
          .select("project_sub_task_staff_id, project_sub_task_id, user_id")
          .in("project_sub_task_id", projectSubTaskIds)
          .returns<ProjectSubTaskStaffRow[]>()
      : Promise.resolve({
          data: [] as ProjectSubTaskStaffRow[],
          error: null,
        }),
  ]);

  if (materialsResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load material catalog.",
      500,
      materialsResult.error.message,
    );
  }
  if (subTasksResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load sub task catalog.",
      500,
      subTasksResult.error.message,
    );
  }
  if (equipmentByIdResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load equipment catalog.",
      500,
      equipmentByIdResult.error.message,
    );
  }
  if (equipmentByNameResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load equipment catalog.",
      500,
      equipmentByNameResult.error.message,
    );
  }
  if (projectSubTaskStaffResult.error) {
    throw new CostEstimationLoadError(
      "Failed to load sub task staff assignments.",
      500,
      projectSubTaskStaffResult.error.message,
    );
  }

  const materials = materialsResult.data ?? [];
  const subTasks = subTasksResult.data ?? [];
  const equipmentById = new Map(
    (equipmentByIdResult.data ?? []).map((row) => [row.equipment_id, row]),
  );
  const equipmentByName = new Map(
    (equipmentByNameResult.data ?? [])
      .filter((row) => Boolean(row.name))
      .map((row) => [String(row.name), row]),
  );
  const projectSubTaskStaff = projectSubTaskStaffResult.data ?? [];

  // Tier 4: users (depends on staff).
  const userIds = uniqueStrings(projectSubTaskStaff.map((row) => row.user_id));
  let users: UserRow[] = [];

  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, username, email, hourly_wage")
      .in("id", userIds)
      .returns<UserRow[]>();

    if (usersError) {
      throw new CostEstimationLoadError(
        "Failed to load assigned users.",
        500,
        usersError.message,
      );
    }
    users = usersData ?? [];
  }

  const mainTaskMap = new Map(mainTasks.map((row) => [row.main_task_id, row]));
  const materialMap = new Map(materials.map((row) => [row.material_id, row]));
  const subTaskMap = new Map(subTasks.map((row) => [row.sub_task_id, row]));
  const userMap = new Map(users.map((row) => [row.id, row]));

  const staffByProjectSubTaskId = new Map<string, UserRow[]>();
  for (const row of projectSubTaskStaff) {
    const current = staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];
    const user = userMap.get(row.user_id);
    if (user) current.push(user);
    staffByProjectSubTaskId.set(row.project_sub_task_id, current);
  }

  const materialsByProjectTaskId = new Map<
    string,
    CostEstimationMainTask["materials"]
  >();
  for (const row of projectTaskMaterials) {
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

  const subtasksByProjectTaskId = new Map<
    string,
    CostEstimationMainTask["subtasks"]
  >();
  for (const row of projectSubTasks) {
    const current = subtasksByProjectTaskId.get(row.project_task_id) ?? [];
    const subTask = subTaskMap.get(row.sub_task_id);
    const assignedUsers =
      staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];
    const usedEquipment = parseEquipmentUsage(row.equipments_used);

    current.push({
      projectSubTaskId: row.project_sub_task_id,
      subTaskId: row.sub_task_id,
      title: subTask?.description ?? "Sub Task",
      estimatedHours: Number(row.estimated_hours ?? 0),
      equipment: usedEquipment.map((item, index: number) => {
        const equipment =
          equipmentById.get(item.equipmentId) ??
          equipmentByName.get(item.legacyName);
        const resolvedName =
          equipment?.name || item.legacyName || "Equipment";
        const resolvedEquipmentId =
          equipment?.equipment_id ?? item.equipmentId ?? "";

        return {
          id:
            resolvedEquipmentId ||
            `${row.project_sub_task_id}-${index}-${resolvedName}`,
          equipmentId: resolvedEquipmentId || null,
          name: resolvedName,
          quantity: item.quantity,
          unitCost: 0,
          notes: item.notes,
        };
      }),
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
      downpayment: Number(project.downpayment ?? 0),
      downpaymentRate: Number(project.downpayment_rate ?? 0),
    },
    markupRate,
    mainTasks: projectTasks
      .map((projectTask) => {
        const mainTask = mainTaskMap.get(projectTask.main_task_id);

        return {
          projectTaskId: projectTask.project_task_id,
          mainTaskId: projectTask.main_task_id,
          title: mainTask?.name ?? "Main Task",
          sortOrder: Number(
            projectTask.sort_order ?? mainTask?.sort_order ?? 0,
          ),
          materials:
            materialsByProjectTaskId.get(projectTask.project_task_id) ?? [],
          subtasks:
            subtasksByProjectTaskId.get(projectTask.project_task_id) ?? [],
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };

  const estimation = calculateProjectCostEstimation(estimationInput);

  return {
    ...estimation,
    client,
  };
}
