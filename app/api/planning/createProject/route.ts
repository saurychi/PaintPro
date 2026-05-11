import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeAreasFromDimensions,
  estimateMaterialsForSubTask,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";
import { buildProjectSchedule } from "@/lib/planning/projectScheduling";
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays";
import {
  calculateProjectCostEstimation,
  type CostEstimationMainTask,
} from "@/lib/planning/costEstimation";
import { getPlanningCatalog } from "@/lib/planning/catalogCache";
import { placeWorkSpan } from "@/lib/schedule/workHours";

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

  // Same set the schedule pages render — manual blocks + public holidays —
  // so the fallback recompute on save also lands on a valid working day.
  const unavailableDays = await listScheduleUnavailableDays(
    req.headers.get("cookie"),
  );

  const fallbackProjectSchedule = buildProjectSchedule({
    project: {
      scheduled_start_datetime: scheduledStartDatetime,
      scheduled_end_datetime: scheduledEndDatetime,
      dimensions: projectDimensions,
    },
    generatedTasks,
    existingBlocks: [],
    unavailableDates: unavailableDays.map((day) => day.blockedDate),
  });

  // Server-authoritative per-subtask schedule, keyed by (taskName, subTaskTitle).
  // Used at the project_sub_task insert site below so we don't trust whatever
  // the client put in `subTask.scheduledStartDatetime` — the client schedule
  // can drift past unavailable days if a holiday gets added between the
  // schedule preview call and the create call.
  const serverScheduleByKey = new Map<
    string,
    { scheduledStartDatetime: string | null; scheduledEndDatetime: string | null }
  >();
  for (const item of fallbackProjectSchedule.scheduledItems) {
    serverScheduleByKey.set(`${item.taskName}__${item.subTaskTitle}`, {
      scheduledStartDatetime: item.scheduledStartDatetime,
      scheduledEndDatetime: item.scheduledEndDatetime,
    });
  }

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

  // ── Catalog from cache (replaces 3 SELECT *)
  // The whole catalog is already loaded into memory at module scope by
  // catalogCache.ts (5-min TTL). What used to be three full-table
  // SELECTs is now a Map lookup; on a cold cache one Promise.all
  // refresh fires inside getPlanningCatalog().
  let planningCatalog;
  try {
    planningCatalog = await getPlanningCatalog();
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load planning catalog.",
        code: "CATALOG_LOOKUP_FAILED",
        details: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }

  // Adapt cache → existing row shapes so the cost-estimation block at
  // the bottom of the route (which reads catalogMainTasks / catalogSubTasks /
  // catalogMaterials) keeps working without any further changes.
  const catalogMainTasks: MainTaskRow[] = planningCatalog.mainTasksOrdered.map(
    (t) => ({
      main_task_id: t.id,
      name: t.name,
      sort_order: t.sortOrder,
    }),
  );
  const catalogSubTasks: SubTaskRow[] = [];
  for (const list of planningCatalog.subTasksByMainTaskId.values()) {
    for (const sub of list) {
      catalogSubTasks.push({
        sub_task_id: sub.id,
        main_task_id: sub.mainTaskId,
        description: sub.description,
        sort_order: sub.sortOrder,
      });
    }
  }
  const catalogMaterials: MaterialRow[] = Array.from(
    planningCatalog.materialsById.values(),
  ).map((m) => ({
    material_id: m.id,
    name: m.name,
    unit: m.unit,
    unit_cost: m.unitCost,
  }));

  const mainTaskMap = new Map<string, MainTaskRow>(
    catalogMainTasks
      .filter((row) => row.main_task_id && row.name)
      .map((row) => [norm(String(row.name)), row]),
  );

  const subTaskMap = new Map<string, SubTaskRow>(
    catalogSubTasks
      .filter((row) => row.sub_task_id && row.main_task_id && row.description)
      .map((row) => [
        `${row.main_task_id}::${norm(String(row.description))}`,
        row,
      ]),
  );

  // The materials catalog can hold multiple rows that share a name but are
  // priced differently (e.g. same paint from two suppliers). When the
  // estimator looks up a material by name, prefer the *cheapest* unit_cost
  // so the project's estimated cost matches the lowest available source.
  const materialMap = new Map<string, MaterialRow>();
  for (const row of catalogMaterials) {
    if (!row.material_id || !row.name) continue;
    const key = norm(String(row.name));
    const existing = materialMap.get(key);
    if (!existing) {
      materialMap.set(key, row);
      continue;
    }
    const existingCost = Number(existing.unit_cost ?? Number.POSITIVE_INFINITY);
    const candidateCost = Number(row.unit_cost ?? Number.POSITIVE_INFINITY);
    if (candidateCost < existingCost) {
      materialMap.set(key, row);
    }
  }

  // ── PHASE A: validate every (main_task, sub_task) up front so a bad
  // catalog entry returns a 400 before we write a single row. Building
  // the project_task / project_sub_task plans here also lets the bulk
  // inserts below run without per-row re-derivation.
  type SubTaskPlan = {
    matchedSubTask: SubTaskRow;
    subTaskTitle: string;
    estimatedHours: number | null;
    equipmentPayload: ReturnType<typeof normalizeEquipmentUsageForStorage>;
    subTaskScheduledStart: string | null;
    subTaskScheduledEnd: string | null;
    assignedEmployees: ReturnType<typeof normalizeAssignedEmployees>;
    materials: Array<{
      name: string;
      unit: string | null;
      notes: string | null;
    }>;
  };
  type MainTaskPlan = {
    matchedMainTask: MainTaskRow;
    taskName: string;
    subTaskPlans: SubTaskPlan[];
  };

  const taskPlans: MainTaskPlan[] = [];

  for (const task of generatedTasks) {
    const matchedMainTask = mainTaskMap.get(norm(task.name));
    if (!matchedMainTask?.main_task_id) {
      return NextResponse.json(
        {
          ok: false,
          error: `Generated main task "${task.name}" was not found in main_task.`,
          code: "MAIN_TASK_NOT_FOUND",
        },
        { status: 400 },
      );
    }

    const subTaskPlans: SubTaskPlan[] = [];

    for (const subTask of task.sub_tasks) {
      const matchedSubTask = subTaskMap.get(
        `${matchedMainTask.main_task_id}::${norm(subTask.title)}`,
      );
      if (!matchedSubTask?.sub_task_id) {
        return NextResponse.json(
          {
            ok: false,
            error: `Generated sub task "${subTask.title}" under "${task.name}" was not found in sub_task.`,
            code: "SUB_TASK_NOT_FOUND",
          },
          { status: 400 },
        );
      }

      const estimatedHours =
        subTask.duration?.estimatedHours ??
        subTask.duration?.roundedHours ??
        subTask.duration?.adjustedDurationHours ??
        null;

      // Prefer the server-side schedule (already snapped past holidays +
      // manual unavailable days AND sequenced via projectCursor so two
      // subtasks under the same project can't overlap each other) over
      // the client payload. Falls back to the client value only if the
      // schedule lib didn't produce a slot.
      const serverScheduleForSubTask = serverScheduleByKey.get(
        `${task.name}__${subTask.title}`,
      );
      const subTaskScheduledStart =
        serverScheduleForSubTask?.scheduledStartDatetime ??
        subTask.scheduledStartDatetime ??
        null;
      const subTaskScheduledEnd =
        serverScheduleForSubTask?.scheduledEndDatetime ??
        subTask.scheduledEndDatetime ??
        null;

      const assignedEmployees = normalizeAssignedEmployees(subTask);

      // Default equipment quantity to the number of assigned employees:
      // if a subtask needs ladders and has 2 employees on it, two ladders
      // should be reserved by default. Only applies when the incoming
      // quantity is at the default 1 — if the admin explicitly bumped a
      // single shared item up (e.g. one scaffold for the whole crew),
      // we honor that. `Math.max(1, ...)` keeps a sensible floor when no
      // employees have been assigned yet.
      const defaultEquipmentQuantity = Math.max(1, assignedEmployees.length);
      const normalizedEquipment = normalizeEquipmentUsageForStorage(
        subTask.equipment,
      ).map((entry) =>
        entry.quantity <= 1
          ? { ...entry, quantity: defaultEquipmentQuantity }
          : entry,
      );

      subTaskPlans.push({
        matchedSubTask,
        subTaskTitle: subTask.title,
        estimatedHours,
        equipmentPayload: normalizedEquipment,
        subTaskScheduledStart,
        subTaskScheduledEnd,
        assignedEmployees,
        materials: subTask.materials,
      });
    }

    taskPlans.push({
      matchedMainTask,
      taskName: task.name,
      subTaskPlans,
    });
  }

  // ── Schedule overlap guard: single-cursor walk over resolved
  // subtask plans (mirrors the single projectCursor in
  // buildProjectSchedule). Each subtask must start at or after the
  // previous subtask's end across the WHOLE project — strict serial,
  // no two subtasks ever share a time slot.
  {
    const unavailableDateSet = new Set(
      unavailableDays.map((day) => day.blockedDate),
    );
    let cursorMs: number | null = null;
    for (const taskPlan of taskPlans) {
      for (const subPlan of taskPlan.subTaskPlans) {
        if (!subPlan.subTaskScheduledStart || !subPlan.subTaskScheduledEnd) {
          continue;
        }
        const startMs = new Date(subPlan.subTaskScheduledStart).getTime();
        const endMs = new Date(subPlan.subTaskScheduledEnd).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

        const baseStartMs =
          cursorMs !== null && startMs < cursorMs ? cursorMs : startMs;

        if (baseStartMs !== startMs) {
          const hours =
            typeof subPlan.estimatedHours === "number" &&
            subPlan.estimatedHours > 0
              ? subPlan.estimatedHours
              : Math.max((endMs - startMs) / 3_600_000, 0.25);
          const placed = placeWorkSpan(
            new Date(baseStartMs),
            hours,
            unavailableDateSet,
          );
          subPlan.subTaskScheduledStart = placed.start.toISOString();
          subPlan.subTaskScheduledEnd = placed.end.toISOString();
          cursorMs = placed.end.getTime();
        } else {
          cursorMs = endMs;
        }
      }
    }
  }

  const insertedProjectTasksForCost: Array<{
    project_task_id: string;
    main_task_id: string;
  }> = [];

  const insertedProjectSubTasksForCost: InsertedProjectSubTaskCostRow[] = [];
  const insertedProjectTaskMaterialsForCost: InsertedProjectTaskMaterialCostRow[] = [];
  const insertedProjectSubTaskStaffForCost: InsertedProjectSubTaskStaffCostRow[] = [];

  // ── PHASE B: bulk INSERT all project_task rows, get back IDs.
  const projectTaskRowsToInsert = taskPlans.map((plan) => ({
    project_id: insertedProject.project_id,
    main_task_id: plan.matchedMainTask.main_task_id,
    sort_order: Number(plan.matchedMainTask.sort_order ?? 0),
  }));

  const { data: insertedProjectTaskRows, error: projectTaskBulkError } =
    await supabaseAdmin
      .from("project_task")
      .insert(projectTaskRowsToInsert)
      .select("project_task_id, main_task_id, sort_order")
      .returns<ProjectTaskRow[]>();

  if (
    projectTaskBulkError ||
    !insertedProjectTaskRows ||
    insertedProjectTaskRows.length !== projectTaskRowsToInsert.length
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create project_task rows.",
        code: "PROJECT_TASK_CREATE_FAILED",
        details:
          projectTaskBulkError?.message ||
          "Bulk project_task insert returned a partial result.",
      },
      { status: 500 },
    );
  }

  // Map main_task_id → project_task_id. main_task_id is unique within a
  // project (each main task appears at most once), so no collision risk.
  const projectTaskIdByMainTaskId = new Map<string, string>();
  for (const row of insertedProjectTaskRows) {
    if (row.project_task_id && row.main_task_id) {
      projectTaskIdByMainTaskId.set(row.main_task_id, row.project_task_id);
    }
  }

  for (const plan of taskPlans) {
    const projectTaskId = projectTaskIdByMainTaskId.get(
      plan.matchedMainTask.main_task_id,
    );
    if (projectTaskId) {
      insertedProjectTasksForCost.push({
        project_task_id: projectTaskId,
        main_task_id: plan.matchedMainTask.main_task_id,
      });
    }
  }

  // ── PHASE C: bulk INSERT all project_sub_task rows, get back IDs.
  // Each row's project_task_id comes from the phase-B mapping above.
  type SubTaskInsertContext = {
    plan: SubTaskPlan;
    mainTaskId: string;
    projectTaskId: string;
  };
  const subTaskInsertContexts: SubTaskInsertContext[] = [];
  const subTaskRowsToInsert: Array<{
    project_task_id: string;
    sub_task_id: string;
    estimated_hours: number | null;
    equipments_used: ReturnType<typeof normalizeEquipmentUsageForStorage>;
    scheduled_start_datetime: string | null;
    scheduled_end_datetime: string | null;
    status: string;
    sort_order: number;
    notes: string | null;
  }> = [];

  for (const plan of taskPlans) {
    const projectTaskId = projectTaskIdByMainTaskId.get(
      plan.matchedMainTask.main_task_id,
    );
    if (!projectTaskId) continue;
    for (const subPlan of plan.subTaskPlans) {
      subTaskInsertContexts.push({
        plan: subPlan,
        mainTaskId: plan.matchedMainTask.main_task_id,
        projectTaskId,
      });
      subTaskRowsToInsert.push({
        project_task_id: projectTaskId,
        sub_task_id: subPlan.matchedSubTask.sub_task_id,
        estimated_hours: subPlan.estimatedHours,
        equipments_used: subPlan.equipmentPayload,
        scheduled_start_datetime: subPlan.subTaskScheduledStart,
        scheduled_end_datetime: subPlan.subTaskScheduledEnd,
        status: "pending",
        sort_order: Number(subPlan.matchedSubTask.sort_order ?? 0),
        notes: null,
      });
    }
  }

  let insertedSubTaskRows: InsertedProjectSubTaskCostRow[] = [];
  if (subTaskRowsToInsert.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("project_sub_task")
      .insert(subTaskRowsToInsert)
      .select(
        "project_sub_task_id, project_task_id, sub_task_id, estimated_hours, scheduled_start_datetime, scheduled_end_datetime",
      )
      .returns<InsertedProjectSubTaskCostRow[]>();

    if (
      error ||
      !data ||
      data.length !== subTaskRowsToInsert.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create project_sub_task rows.",
          code: "PROJECT_SUB_TASK_CREATE_FAILED",
          details:
            error?.message ||
            "Bulk project_sub_task insert returned a partial result.",
        },
        { status: 500 },
      );
    }
    insertedSubTaskRows = data;
    insertedProjectSubTasksForCost.push(...data);
  }

  // ── PHASE D: build staff + material rows (parallel-safe — no
  // cross-table dependency) and bulk INSERT both.
  const staffRowsToInsert: Array<{
    project_sub_task_id: string;
    user_id: string;
    role: string;
    assignment_status: string;
  }> = [];
  const materialRowsToInsert: Array<{
    project_task_id: string;
    material_id: string;
    estimated_quantity: number;
    estimated_cost: number;
  }> = [];

  // Track inserted material names PER project_task (matches the legacy
  // dedup behavior — same material shouldn't get a second row inside the
  // same main task).
  const insertedMaterialNamesByProjectTask = new Map<string, Set<string>>();

  for (let i = 0; i < subTaskInsertContexts.length; i++) {
    const ctx = subTaskInsertContexts[i];
    const insertedRow = insertedSubTaskRows[i];
    if (!insertedRow?.project_sub_task_id) continue;

    for (const [employeeIdx, employee] of ctx.plan.assignedEmployees.entries()) {
      staffRowsToInsert.push({
        project_sub_task_id: insertedRow.project_sub_task_id,
        user_id: employee.id,
        role: employeeIdx === 0 ? "lead" : "assigned",
        assignment_status: "assigned",
      });
    }

    // estimateMaterialsForSubTask is now cache-backed (no DB on warm
    // cache) so awaiting it in this loop is cheap. We still need it
    // sequentially per subtask because each result depends only on its
    // own (mainTaskId, subTaskId, areas).
    const estimatedMaterials = await estimateMaterialsForSubTask({
      mainTaskId: ctx.mainTaskId,
      subTaskId: ctx.plan.matchedSubTask.sub_task_id,
      areas,
      materialCatalog: ctx.plan.materials.map((material) => ({
        name: material.name,
        unit: material.unit ?? "",
        notes: material.notes ?? undefined,
      })),
    });

    const namesSet =
      insertedMaterialNamesByProjectTask.get(ctx.projectTaskId) ??
      new Set<string>();

    for (const material of ctx.plan.materials) {
      const matchedMaterial = materialMap.get(norm(material.name));
      if (!matchedMaterial?.material_id) continue;

      const materialKey = norm(material.name);
      if (namesSet.has(materialKey)) continue;
      namesSet.add(materialKey);

      const estimatedMaterial = findEstimatedMaterialByName(
        estimatedMaterials,
        material.name,
      );
      const estimatedQuantity = estimatedMaterial?.qty ?? 1;
      const unitCost =
        typeof matchedMaterial.unit_cost === "number"
          ? matchedMaterial.unit_cost
          : Number(matchedMaterial.unit_cost ?? 0) || 0;
      const estimatedCost = estimatedQuantity * unitCost;

      materialRowsToInsert.push({
        project_task_id: ctx.projectTaskId,
        material_id: matchedMaterial.material_id,
        estimated_quantity: estimatedQuantity,
        estimated_cost: estimatedCost,
      });
    }

    insertedMaterialNamesByProjectTask.set(ctx.projectTaskId, namesSet);
  }

  // Run the two final bulk inserts in parallel — they touch separate
  // tables and have no cross-dependency.
  const [staffInsertResult, materialInsertResult] = await Promise.all([
    staffRowsToInsert.length > 0
      ? supabaseAdmin
          .from("project_sub_task_staff")
          .insert(staffRowsToInsert)
          .select("project_sub_task_id, user_id")
      : Promise.resolve({ data: [], error: null }),
    materialRowsToInsert.length > 0
      ? supabaseAdmin
          .from("project_task_material")
          .insert(materialRowsToInsert)
          .select(
            "project_task_material_id, project_task_id, material_id, estimated_quantity, estimated_cost",
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffInsertResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create project_sub_task_staff rows.",
        code: "PROJECT_SUB_TASK_STAFF_CREATE_FAILED",
        details: staffInsertResult.error.message,
      },
      { status: 500 },
    );
  }
  if (materialInsertResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create project_task_material rows.",
        code: "PROJECT_TASK_MATERIAL_CREATE_FAILED",
        details: materialInsertResult.error.message,
      },
      { status: 500 },
    );
  }

  for (const row of (staffInsertResult.data ?? []) as Array<{
    project_sub_task_id: string;
    user_id: string;
  }>) {
    insertedProjectSubTaskStaffForCost.push({
      project_sub_task_id: row.project_sub_task_id,
      user_id: row.user_id,
    });
  }
  for (const row of (materialInsertResult.data ??
    []) as InsertedProjectTaskMaterialCostRow[]) {
    insertedProjectTaskMaterialsForCost.push(row);
  }

  // (Stock decrement intentionally NOT done at draft/creation time. The
  // materials-assignment page compares each project's planned quantity to
  // current_in_stock and blocks "Next" when the project would over-consume
  // — at which point the user either restocks or lowers the planned quantity.
  // Actual stock consumption can be wired into the project lifecycle later,
  // e.g. when the project moves into in_progress.)

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
