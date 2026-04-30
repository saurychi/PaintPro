import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeAreasFromDimensions,
  estimateMaterialsForSubTask,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";
import { buildProjectSchedule } from "@/lib/planning/projectScheduling";
import {
  calculateProjectCostEstimation,
  type CostEstimationMainTask,
} from "@/lib/planning/costEstimation";

type UserRole = "staff" | "manager" | "admin" | "client";
type UserStatus = "active" | "inactive" | "pending";

type GeneratedMaterialInput = {
  name?: unknown;
  unit?: unknown;
  notes?: unknown;
};

type GeneratedDurationInput = {
  baseLaborHours?: unknown;
  requiredEmployeeCount?: unknown;
  adjustedDurationHours?: unknown;
  roundedHours?: unknown;
  formula?: unknown;
  driver?: unknown;
  driverUnit?: unknown;
  productivityHoursPerEmployee?: unknown;
  teamEfficiencyFactor?: unknown;
  estimatedHours?: unknown;
};

type GeneratedAssignedEmployeeInput = {
  id?: unknown;
  name?: unknown;
  role?: unknown;
};

type GeneratedEquipmentInput = {
  equipment_id?: unknown;
  equipmentId?: unknown;
  id?: unknown;
  name?: unknown;
  notes?: unknown;
  quantity?: unknown;
};

type GeneratedSubTaskInput = {
  title?: unknown;
  priority?: unknown;
  materials?: unknown;
  equipment?: unknown;
  duration?: unknown;
  assignedEmployees?: unknown;
  employees?: unknown;
  assignedEmployee?: unknown;
  assignmentScore?: unknown;
  assignmentReasons?: unknown;
  requiredEmployeeCount?: unknown;
  scheduledStartDatetime?: unknown;
  scheduledEndDatetime?: unknown;
};

type GeneratedMainTaskInput = {
  name?: unknown;
  priority?: unknown;
  confidence?: unknown;
  reasons?: unknown;
  sub_tasks?: unknown;
  materials?: unknown;
  materialCatalog?: unknown;
};

type CreateProjectRootRequest = {
  client?: {
    client_id?: unknown;
    full_name?: unknown;
    email?: unknown;
    phone?: unknown;
    address?: unknown;
    notes?: unknown;
  };
  project?: {
    project_code?: unknown;
    title?: unknown;
    description?: unknown;
    site_address?: unknown;
    scheduled_start_datetime?: unknown;
    scheduled_end_datetime?: unknown;
    status?: unknown;
    priority?: unknown;
    estimated_budget?: unknown;
    estimated_cost?: unknown;
    estimated_profit?: unknown;
    notes?: unknown;
    dimensions?: unknown;
  };
  createdBy?: {
    userId?: unknown;
  };
  generatedTasks?: unknown;
};

type CreatorRow = {
  id: string;
  role: UserRole | null;
  status: UserStatus | null;
};

type ClientRow = {
  client_id: string;
  email: string | null;
};

type InsertedProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
};

type MainTaskRow = {
  main_task_id: string;
  name: string | null;
  sort_order: number | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  main_task_id?: string | null;
  sort_order?: number | null;
};

type SubTaskRow = {
  sub_task_id: string;
  main_task_id: string | null;
  description: string | null;
  sort_order: number | null;
};

type MaterialRow = {
  material_id: string;
  name: string | null;
  unit: string | null;
  unit_cost: number | null;
};

type StaffCostRow = {
  id: string;
  username: string | null;
  email: string | null;
  hourly_wage: number | null;
};

type InsertedProjectSubTaskCostRow = {
  project_sub_task_id: string;
  project_task_id: string;
  sub_task_id: string;
  estimated_hours: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
};

type InsertedProjectTaskMaterialCostRow = {
  project_task_material_id: string;
  project_task_id: string;
  material_id: string;
  estimated_quantity: number | null;
  estimated_cost: number | null;
};

type InsertedProjectSubTaskStaffCostRow = {
  project_sub_task_id: string;
  user_id: string;
};

type ProjectScheduleRow = {
  project_schedule_id: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableTrimmedString(value: unknown): string | null {
  const parsed = asTrimmedString(value);
  return parsed ? parsed : null;
}

function asLowerEmail(value: unknown): string {
  return asTrimmedString(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNumberOrFallback(value: unknown, fallback: number) {
  const parsed = asNullableNumber(value);
  return parsed ?? fallback;
}

function norm(value: string) {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, arr) => arr.indexOf(value) === index);
}

function findEstimatedMaterialByName(
  items: Array<{ name: string; qty: number; unit: string }>,
  name: string
) {
  return items.find((item) => norm(item.name) === norm(name)) ?? null;
}

function parseGeneratedTasks(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObject)
    .map((task) => ({
      name: asTrimmedString(task.name),
      priority: asNumberOrFallback(task.priority, 0),
      sub_tasks: Array.isArray(task.sub_tasks)
        ? task.sub_tasks
            .filter(isObject)
            .map((subTask) => ({
              title: asTrimmedString(subTask.title),
              priority: asNumberOrFallback(subTask.priority, 0),
              materials: Array.isArray(subTask.materials)
                ? subTask.materials
                    .filter(isObject)
                    .map((material) => ({
                      name: asTrimmedString(material.name),
                      unit: asNullableTrimmedString(material.unit),
                      notes: asNullableTrimmedString(material.notes),
                    }))
                    .filter((material) => material.name)
                : [],
              equipment: Array.isArray(subTask.equipment)
                ? subTask.equipment
                    .filter(isObject)
                    .map((equipment) => ({
                      equipment_id: asTrimmedString(
                        (equipment as GeneratedEquipmentInput).equipment_id ??
                          (equipment as GeneratedEquipmentInput).equipmentId ??
                          (equipment as GeneratedEquipmentInput).id,
                      ),
                      name: asTrimmedString(equipment.name),
                      notes: asNullableTrimmedString(equipment.notes),
                      quantity: asNumberOrFallback(
                        (equipment as GeneratedEquipmentInput).quantity,
                        1,
                      ),
                    }))
                    .filter(
                      (equipment) => equipment.equipment_id || equipment.name,
                    )
                : [],
              duration: isObject(subTask.duration)
                ? {
                    baseLaborHours: asNullableNumber(subTask.duration.baseLaborHours),
                    requiredEmployeeCount: asNullableNumber(
                      subTask.duration.requiredEmployeeCount
                    ),
                    adjustedDurationHours: asNullableNumber(
                      subTask.duration.adjustedDurationHours
                    ),
                    roundedHours: asNullableNumber(subTask.duration.roundedHours),
                    estimatedHours: asNullableNumber(subTask.duration.estimatedHours),
                  }
                : null,
                            assignedEmployees: Array.isArray(subTask.assignedEmployees)
                ? subTask.assignedEmployees
                    .filter(isObject)
                    .map((employee) => ({
                      id: asNullableTrimmedString(employee.id),
                      name: asNullableTrimmedString(employee.name),
                      role: asNullableTrimmedString(employee.role),
                    }))
                    .filter((employee) => employee.id)
                : Array.isArray(subTask.employees)
                ? subTask.employees
                    .filter(isObject)
                    .map((employee) => ({
                      id: asNullableTrimmedString(employee.id),
                      name: asNullableTrimmedString(employee.name),
                      role: asNullableTrimmedString(employee.role),
                    }))
                    .filter((employee) => employee.id)
                : [],
              assignedEmployee: isObject(subTask.assignedEmployee)
                ? {
                    id: asNullableTrimmedString(subTask.assignedEmployee.id),
                    name: asNullableTrimmedString(subTask.assignedEmployee.name),
                    role: asNullableTrimmedString(subTask.assignedEmployee.role),
                  }
                : null,
              requiredEmployeeCount: asNullableNumber(subTask.requiredEmployeeCount),
              scheduledStartDatetime: asNullableTrimmedString(
                subTask.scheduledStartDatetime
              ),
              scheduledEndDatetime: asNullableTrimmedString(
                subTask.scheduledEndDatetime
              ),
            }))
            .filter((subTask) => subTask.title)
        : [],
    }))
    .filter((task) => task.name);
}

function normalizeAssignedEmployees(subTask: any) {
  if (Array.isArray(subTask?.assignedEmployees)) {
    return subTask.assignedEmployees
      .filter((employee: any) => employee && typeof employee.id === "string")
      .map((employee: any) => ({
        id: employee.id,
        name: employee.name ?? employee.username ?? "",
        role: employee.role ?? null,
      }));
  }

  if (Array.isArray(subTask?.employees)) {
    return subTask.employees
      .filter((employee: any) => employee && typeof employee.id === "string")
      .map((employee: any) => ({
        id: employee.id,
        name: employee.name ?? employee.username ?? "",
        role: employee.role ?? null,
      }));
  }

  if (subTask?.assignedEmployee && typeof subTask.assignedEmployee.id === "string") {
    return [
      {
        id: subTask.assignedEmployee.id,
        name:
          subTask.assignedEmployee.name ??
          subTask.assignedEmployee.username ??
          "",
        role: subTask.assignedEmployee.role ?? null,
      },
    ];
  }

  return [];
}

async function generateProjectCode() {
  const year = new Date().getFullYear();
  const prefix = `PRJ-${year}-`;

  const { count, error } = await supabaseAdmin
    .from("projects")
    .select("*", { count: "exact", head: true })
    .ilike("project_code", `${prefix}%`);

  if (error) {
    throw new Error(`Failed to generate project code: ${error.message}`);
  }

  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  let body: CreateProjectRootRequest;

  try {
    body = (await req.json()) as CreateProjectRootRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  if (!isObject(body) || !isObject(body.client) || !isObject(body.project) || !isObject(body.createdBy)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body shape.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  const incomingClientId = asNullableTrimmedString(body.client.client_id);
  const clientFullName = asTrimmedString(body.client.full_name);
  const clientEmail = asLowerEmail(body.client.email);
  const clientPhone = asNullableTrimmedString(body.client.phone);
  const clientAddress = asNullableTrimmedString(body.client.address);
  const clientNotes = asNullableTrimmedString(body.client.notes);

  const title = asTrimmedString(body.project.title);
  const description = asNullableTrimmedString(body.project.description);
  const siteAddress = asNullableTrimmedString(body.project.site_address);
  const scheduledStartDatetime = asNullableTrimmedString(body.project.scheduled_start_datetime);
  const scheduledEndDatetime = asNullableTrimmedString(body.project.scheduled_end_datetime);
  const incomingStatus = asTrimmedString(body.project.status);
  const incomingPriority = asTrimmedString(body.project.priority);
  const estimatedBudget = asNullableNumber(body.project.estimated_budget);
  const estimatedCost = asNullableNumber(body.project.estimated_cost);
  const notes = asNullableTrimmedString(body.project.notes);
  const dimensions = body.project.dimensions;
  const creatorId = asTrimmedString(body.createdBy.userId);
  const requestedProjectCode = asNullableTrimmedString(body.project.project_code);
  const generatedTasks = parseGeneratedTasks(body.generatedTasks);

  console.log(
    "parsed generatedTasks first subtask",
    generatedTasks?.[0]?.sub_tasks?.[0]
  );
  const projectDimensions = dimensions as ProjectDimensions;
  const areas = computeAreasFromDimensions(projectDimensions);

  if (!title) {
    return NextResponse.json(
      {
        ok: false,
        error: "Project title is required.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  if (!creatorId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Creator user ID is required.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  if (!isPlainObject(dimensions)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Project dimensions must be a JSON object.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  if (!generatedTasks.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Generated tasks are required before saving the project.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  if (
    scheduledStartDatetime &&
    scheduledEndDatetime &&
    scheduledStartDatetime > scheduledEndDatetime
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Scheduled end datetime cannot be earlier than scheduled start datetime.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  const projectStatus = incomingStatus || "main_task_pending";
  const projectPriority = incomingPriority || "normal";

  const { data: creator, error: creatorError } = await supabaseAdmin
    .from("users")
    .select("id, role, status")
    .eq("id", creatorId)
    .maybeSingle<CreatorRow>();

  if (creatorError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to verify the creator account.",
        code: "CREATOR_LOOKUP_FAILED",
        details: creatorError.message,
      },
      { status: 500 }
    );
  }

  if (!creator?.id || creator.status !== "active" || (creator.role !== "admin" && creator.role !== "manager")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only active admin or manager accounts can create a project.",
        code: "FORBIDDEN",
      },
      { status: 403 }
    );
  }

  let savedClientId: string | null = incomingClientId;

  if (!savedClientId) {
    if (!clientFullName) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client full name is required.",
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    if (!clientEmail || !isValidEmail(clientEmail)) {
      return NextResponse.json(
        {
          ok: false,
          error: "A valid client email is required.",
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    if (!clientPhone) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client phone is required.",
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    if (!clientAddress) {
      return NextResponse.json(
        {
          ok: false,
          error: "Client address is required.",
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    const { data: existingClient, error: existingClientError } = await supabaseAdmin
      .from("clients")
      .select("client_id, email")
      .eq("email", clientEmail)
      .maybeSingle<ClientRow>();

    if (existingClientError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to check for an existing client.",
          code: "CLIENT_LOOKUP_FAILED",
          details: existingClientError.message,
        },
        { status: 500 }
      );
    }

    if (existingClient?.client_id) {
      savedClientId = existingClient.client_id;
    } else {
      const { data: insertedClient, error: clientInsertError } = await supabaseAdmin
        .from("clients")
        .insert({
          full_name: clientFullName,
          email: clientEmail,
          phone: clientPhone,
          address: clientAddress,
          notes: clientNotes,
        })
        .select("client_id")
        .single();

      if (clientInsertError || !insertedClient?.client_id) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to create the client row.",
            code: "CLIENT_CREATE_FAILED",
            details: clientInsertError?.message || "Client insert failed.",
          },
          { status: 500 }
        );
      }

      savedClientId = insertedClient.client_id;
    }
  }

  if (!savedClientId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Client could not be resolved.",
        code: "CLIENT_RESOLUTION_FAILED",
      },
      { status: 400 }
    );
  }

  const projectCode = requestedProjectCode || (await generateProjectCode());

  const fallbackProjectSchedule = buildProjectSchedule({
    project: {
      scheduled_start_datetime: scheduledStartDatetime,
      scheduled_end_datetime: scheduledEndDatetime,
      dimensions: projectDimensions,
    },
    generatedTasks: generatedTasks as any,
    existingBlocks: [],
  });

  const resolvedScheduledEndDatetime =
    scheduledEndDatetime || fallbackProjectSchedule.projectScheduledEndDatetime || null;

  const { data: insertedProject, error: projectInsertError } = await supabaseAdmin
    .from("projects")
    .insert({
      project_code: projectCode,
      title,
      description,
      site_address: siteAddress,
      scheduled_start_datetime: scheduledStartDatetime,
      scheduled_end_datetime: resolvedScheduledEndDatetime,
      status: projectStatus,
      priority: projectPriority,
      estimated_budget: estimatedBudget ?? 0,
      estimated_cost: estimatedCost ?? 0,
      notes,
      dimensions,
      client_id: savedClientId,
      created_by: creatorId,
    })
    .select("project_id, project_code, title")
    .single<InsertedProjectRow>();

    if (projectInsertError || !insertedProject?.project_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create the project row.",
          code: "PROJECT_CREATE_FAILED",
          details: projectInsertError?.message || "Project insert failed.",
        },
        { status: 500 }
      );
    }

    if (scheduledStartDatetime && resolvedScheduledEndDatetime) {
      const { error: projectScheduleInsertError } = await supabaseAdmin
        .from("project_schedule")
        .insert({
          project_id: insertedProject.project_id,
          start_datetime: scheduledStartDatetime,
          end_datetime: resolvedScheduledEndDatetime,
          status: "scheduled",
          notes: null,
        })
        .select("project_schedule_id")
        .single<ProjectScheduleRow>();

      if (projectScheduleInsertError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to create the project schedule row.",
            code: "PROJECT_SCHEDULE_CREATE_FAILED",
            details: projectScheduleInsertError.message,
          },
          { status: 500 }
        );
      }
    }

  const materialNameSet = uniqueStrings(
    generatedTasks.flatMap((task) =>
      task.sub_tasks.flatMap((subTask) =>
        subTask.materials.map((material) => material.name).filter(Boolean)
      )
    )
  );

  const { data: catalogMainTasks, error: catalogMainTaskError } = await supabaseAdmin
    .from("main_task")
    .select("main_task_id, name, sort_order:default_sort_order");

  if (catalogMainTaskError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load main task catalog.",
        code: "MAIN_TASK_LOOKUP_FAILED",
        details: catalogMainTaskError.message,
      },
      { status: 500 }
    );
  }

  const { data: catalogSubTasks, error: catalogSubTaskError } = await supabaseAdmin
    .from("sub_task")
    .select("sub_task_id, main_task_id, description, sort_order:default_sort_order");

  if (catalogSubTaskError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load sub task catalog.",
        code: "SUB_TASK_LOOKUP_FAILED",
        details: catalogSubTaskError.message,
      },
      { status: 500 }
    );
  }

  let catalogMaterials: MaterialRow[] = [];
  if (materialNameSet.length) {
    const { data, error } = await supabaseAdmin
      .from("materials")
      .select("material_id, name, unit, unit_cost");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load material catalog.",
          code: "MATERIAL_LOOKUP_FAILED",
          details: error.message,
        },
        { status: 500 }
      );
    }

    catalogMaterials = (data ?? []) as MaterialRow[];
  }

  const mainTaskMap = new Map<string, MainTaskRow>(
    ((catalogMainTasks ?? []) as MainTaskRow[])
      .filter((row) => row.main_task_id && row.name)
      .map((row) => [norm(String(row.name)), row])
  );

  const subTaskMap = new Map<string, SubTaskRow>(
    ((catalogSubTasks ?? []) as SubTaskRow[])
      .filter((row) => row.sub_task_id && row.main_task_id && row.description)
      .map((row) => [
        `${row.main_task_id}::${norm(String(row.description))}`,
        row,
      ])
  );

  const materialMap = new Map<string, MaterialRow>(
    catalogMaterials
      .filter((row) => row.material_id && row.name)
      .map((row) => [norm(String(row.name)), row])
  );

  const insertedProjectTasksForCost: Array<{
    project_task_id: string;
    main_task_id: string;
  }> = [];

  const insertedProjectSubTasksForCost: InsertedProjectSubTaskCostRow[] = [];
  const insertedProjectTaskMaterialsForCost: InsertedProjectTaskMaterialCostRow[] = [];
  const insertedProjectSubTaskStaffForCost: InsertedProjectSubTaskStaffCostRow[] = [];

  for (const task of generatedTasks) {
    const matchedMainTask = mainTaskMap.get(norm(task.name));

    if (!matchedMainTask?.main_task_id) {
      return NextResponse.json(
        {
          ok: false,
          error: `Generated main task "${task.name}" was not found in main_task.`,
          code: "MAIN_TASK_NOT_FOUND",
        },
        { status: 400 }
      );
    }

    const { data: insertedProjectTask, error: projectTaskInsertError } = await supabaseAdmin
      .from("project_task")
      .insert({
        project_id: insertedProject.project_id,
        main_task_id: matchedMainTask.main_task_id,
        sort_order: Number(matchedMainTask.sort_order ?? 0),
      })
      .select("project_task_id, main_task_id, sort_order")
      .single<ProjectTaskRow>();

    const insertedMaterialNames = new Set<string>();

    if (projectTaskInsertError || !insertedProjectTask?.project_task_id) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to create project_task for "${task.name}".`,
          code: "PROJECT_TASK_CREATE_FAILED",
          details: projectTaskInsertError?.message || "project_task insert failed.",
        },
        { status: 500 }
      );
    }

    insertedProjectTasksForCost.push({
      project_task_id: insertedProjectTask.project_task_id,
      main_task_id: matchedMainTask.main_task_id,
    });

    for (const subTask of task.sub_tasks) {
      const matchedSubTask = subTaskMap.get(
        `${matchedMainTask.main_task_id}::${norm(subTask.title)}`
      );

      if (!matchedSubTask?.sub_task_id) {
        return NextResponse.json(
          {
            ok: false,
            error: `Generated sub task "${subTask.title}" under "${task.name}" was not found in sub_task.`,
            code: "SUB_TASK_NOT_FOUND",
          },
          { status: 400 }
        );
      }

      const assignedEmployees = normalizeAssignedEmployees(subTask);
      const estimatedHours =
        subTask.duration?.estimatedHours ??
        subTask.duration?.roundedHours ??
        subTask.duration?.adjustedDurationHours ??
        null;

      const equipmentPayload = normalizeEquipmentUsageForStorage(
        subTask.equipment,
      );

      const { data: insertedProjectSubTask, error: projectSubTaskInsertError } =
        await supabaseAdmin
          .from("project_sub_task")
          .insert({
            project_task_id: insertedProjectTask.project_task_id,
            sub_task_id: matchedSubTask.sub_task_id,
            estimated_hours: estimatedHours,
            equipments_used: equipmentPayload,
            scheduled_start_datetime: subTask.scheduledStartDatetime ?? null,
            scheduled_end_datetime: subTask.scheduledEndDatetime ?? null,
            status: "pending",
            sort_order: Number(matchedSubTask.sort_order ?? 0),
            notes: null,
          })
          .select(
            "project_sub_task_id, project_task_id, sub_task_id, estimated_hours, scheduled_start_datetime, scheduled_end_datetime"
          )
          .single<InsertedProjectSubTaskCostRow>();

      if (projectSubTaskInsertError || !insertedProjectSubTask?.project_sub_task_id) {
        return NextResponse.json(
          {
            ok: false,
            error: `Failed to create project_sub_task for "${subTask.title}".`,
            code: "PROJECT_SUB_TASK_CREATE_FAILED",
            details:
              projectSubTaskInsertError?.message ||
              "project_sub_task insert did not return an id.",
          },
          { status: 500 }
        );
      }

      insertedProjectSubTasksForCost.push(insertedProjectSubTask);

      if (assignedEmployees.length > 0) {
        const projectSubTaskStaffRows = assignedEmployees.map(
          (
            employee: { id: string; name: string; role: string | null },
            index: number
          ) => ({
            project_sub_task_id: insertedProjectSubTask.project_sub_task_id,
            user_id: employee.id,
            role: index === 0 ? "lead" : "assigned",
            assignment_status: "assigned",
          })
        );

        const { error: projectSubTaskStaffInsertError } = await supabaseAdmin
          .from("project_sub_task_staff")
          .insert(projectSubTaskStaffRows);

        if (projectSubTaskStaffInsertError) {
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to create project_sub_task_staff for "${subTask.title}".`,
              code: "PROJECT_SUB_TASK_STAFF_CREATE_FAILED",
              details: projectSubTaskStaffInsertError.message,
            },
            { status: 500 }
          );
        }

        insertedProjectSubTaskStaffForCost.push(
          ...projectSubTaskStaffRows.map((row: {
            project_sub_task_id: string;
            user_id: string;
          }) => ({
            project_sub_task_id: row.project_sub_task_id,
            user_id: row.user_id,
          }))
        );
      }

      const estimatedMaterials = await estimateMaterialsForSubTask({
        mainTaskId: matchedMainTask.main_task_id,
        subTaskId: matchedSubTask.sub_task_id,
        areas,
        materialCatalog: subTask.materials.map((material) => ({
          name: material.name,
          unit: material.unit ?? "",
          notes: material.notes ?? undefined,
        })),
      });

      for (const material of subTask.materials) {
        const matchedMaterial = materialMap.get(norm(material.name));
        if (!matchedMaterial?.material_id) {
          continue;
        }

        const materialKey = norm(material.name);
        if (insertedMaterialNames.has(materialKey)) {
          continue;
        }
        insertedMaterialNames.add(materialKey);

        const estimatedMaterial = findEstimatedMaterialByName(
          estimatedMaterials,
          material.name
        );

        // Fall back to 1 unit when no formula rule is configured for this material
        const estimatedQuantity = estimatedMaterial?.qty ?? 1;
        const unitCostRow = await supabaseAdmin
          .from("materials")
          .select("unit_cost")
          .eq("material_id", matchedMaterial.material_id)
          .maybeSingle();

        if (unitCostRow.error) {
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to load unit cost for "${material.name}".`,
              code: "MATERIAL_COST_LOOKUP_FAILED",
              details: unitCostRow.error.message,
            },
            { status: 500 }
          );
        }

        const unitCost =
          typeof unitCostRow.data?.unit_cost === "number"
            ? unitCostRow.data.unit_cost
            : Number(unitCostRow.data?.unit_cost ?? 0) || 0;

        const estimatedCost = estimatedQuantity * unitCost;

        const { data: insertedProjectTaskMaterial, error: projectTaskMaterialInsertError } =
          await supabaseAdmin
            .from("project_task_material")
            .insert({
              project_task_id: insertedProjectTask.project_task_id,
              material_id: matchedMaterial.material_id,
              estimated_quantity: estimatedQuantity,
              estimated_cost: estimatedCost,
            })
            .select(
              "project_task_material_id, project_task_id, material_id, estimated_quantity, estimated_cost"
            )
            .single<InsertedProjectTaskMaterialCostRow>();

        if (projectTaskMaterialInsertError || !insertedProjectTaskMaterial) {
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to create project_task_material for "${material.name}".`,
              code: "PROJECT_TASK_MATERIAL_CREATE_FAILED",
              details:
                projectTaskMaterialInsertError?.message ||
                "project_task_material insert failed.",
            },
            { status: 500 }
          );
        }

        insertedProjectTaskMaterialsForCost.push(insertedProjectTaskMaterial);
      }
    }
  }

  const insertedStaffUserIds = uniqueStrings(
    insertedProjectSubTaskStaffForCost.map((row) => row.user_id)
  );

  let staffUsersForCost: StaffCostRow[] = [];

  if (insertedStaffUserIds.length > 0) {
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, username, email, hourly_wage")
      .in("id", insertedStaffUserIds)
      .returns<StaffCostRow[]>();

    if (usersError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load staff hourly wages for cost estimation.",
          code: "STAFF_COST_LOOKUP_FAILED",
          details: usersError.message,
        },
        { status: 500 }
      );
    }

    staffUsersForCost = usersData ?? [];
  }

  const mainTaskCatalogMap = new Map(
    ((catalogMainTasks ?? []) as MainTaskRow[]).map((row) => [row.main_task_id, row])
  );

  const subTaskCatalogMap = new Map(
    ((catalogSubTasks ?? []) as SubTaskRow[]).map(
      (row) => [row.sub_task_id, row]
    )
  );

  const materialCatalogMap = new Map(
    catalogMaterials.map((row) => [row.material_id, row])
  );

  const staffUserMap = new Map(
    staffUsersForCost.map((row) => [row.id, row])
  );

  const materialsByProjectTaskId = new Map<string, CostEstimationMainTask["materials"]>();
  for (const row of insertedProjectTaskMaterialsForCost) {
    const current = materialsByProjectTaskId.get(row.project_task_id) ?? [];
    const material = materialCatalogMap.get(row.material_id);

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

  const staffByProjectSubTaskId = new Map<string, StaffCostRow[]>();
  for (const row of insertedProjectSubTaskStaffForCost) {
    const current = staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];
    const user = staffUserMap.get(row.user_id);

    if (user) current.push(user);

    staffByProjectSubTaskId.set(row.project_sub_task_id, current);
  }

  const subtasksByProjectTaskId = new Map<string, CostEstimationMainTask["subtasks"]>();
  for (const row of insertedProjectSubTasksForCost) {
    const current = subtasksByProjectTaskId.get(row.project_task_id) ?? [];
    const subTask = subTaskCatalogMap.get(row.sub_task_id);
    const assignedUsers = staffByProjectSubTaskId.get(row.project_sub_task_id) ?? [];

    current.push({
      projectSubTaskId: row.project_sub_task_id,
      subTaskId: row.sub_task_id,
      title: subTask?.description ?? "Sub Task",
      estimatedHours: Number(row.estimated_hours ?? 0),
      scheduledStartDatetime: row.scheduled_start_datetime ?? null,
      scheduledEndDatetime: row.scheduled_end_datetime ?? null,
      assignedStaff: assignedUsers.map((user) => ({
        id: user.id,
        name: user.username || user.email || "Staff",
        hourlyWage: Number(user.hourly_wage ?? 0),
      })),
      equipment: [],
    });

    subtasksByProjectTaskId.set(row.project_task_id, current);
  }

  const estimation = calculateProjectCostEstimation({
    project: {
      projectId: insertedProject.project_id,
      projectCode: insertedProject.project_code,
      title: insertedProject.title ?? title,
      description: description ?? null,
      siteAddress: siteAddress ?? null,
      status: projectStatus,
    },
    markupRate: 30,
    mainTasks: insertedProjectTasksForCost.map((projectTask) => {
      const mainTask = mainTaskCatalogMap.get(projectTask.main_task_id);

      return {
        projectTaskId: projectTask.project_task_id,
        mainTaskId: projectTask.main_task_id,
        title: mainTask?.name ?? "Main Task",
        sortOrder: Number(mainTask?.sort_order ?? 0),
        materials: materialsByProjectTaskId.get(projectTask.project_task_id) ?? [],
        subtasks: subtasksByProjectTaskId.get(projectTask.project_task_id) ?? [],
      };
    }),
  });

  const { error: projectTotalsUpdateError } = await supabaseAdmin
    .from("projects")
    .update({
      estimated_cost: estimation.summary.totalCost,
      estimated_budget: estimation.summary.quotationTotal,
      materials_cost: estimation.summary.materialTotal,
      labor_cost: estimation.summary.laborTotal,
      markup_rate: 30,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", insertedProject.project_id);

  if (projectTotalsUpdateError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save initial project cost totals.",
        code: "PROJECT_COST_UPDATE_FAILED",
        details: projectTotalsUpdateError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    client: {
      client_id: savedClientId,
      full_name: clientFullName || null,
      email: clientEmail || null,
      phone: clientPhone || null,
      address: clientAddress || null,
      notes: clientNotes,
    },
    project: {
      projectId: insertedProject.project_id,
      projectCode: insertedProject.project_code,
      title: insertedProject.title ?? title,
    },
  });
}
