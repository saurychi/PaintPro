import { supabaseAdmin } from "../supabaseAdmin";
import {
  collectEquipmentUsageIds,
  collectLegacyEquipmentNames,
  parseEquipmentUsage,
} from "../../lib/planning/equipmentUsage";

export type ReportExportProject = {
  projectId: string;
  projectCode: string | null;
  title: string | null;
  description: string | null;
  siteAddress: string | null;
  status: string | null;
  priority: string | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  estimatedBudget: number;
  estimatedCost: number;
  estimatedProfit: number;
  materialsCost: number;
  laborCost: number;
  markupRate: number;
  downpayment: number;
  notes: string | null;
  dimensions: unknown;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ReportExportClient = {
  clientId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export type ReportExportCreator = {
  id: string;
  username: string | null;
  email: string | null;
  role: string | null;
};

export type ReportExportMaterial = {
  project_task_material_id: string;
  material_id: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  estimated_quantity: number | null;
  estimated_cost: number | null;
};

export type ReportExportEquipment = {
  equipment_id: string | null;
  name: string;
  quantity: number;
  notes: string | null;
};

export type ReportExportStaff = {
  project_sub_task_staff_id: string;
  user_id: string;
  role: string | null;
  assignment_status: string | null;
  user: {
    id: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
    specialty: string | null;
    hourly_wage: number | null;
  } | null;
};

export type ReportExportSubTask = {
  project_sub_task_id: string;
  sub_task_id: string;
  description: string;
  estimated_hours: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  actual_start_datetime: string | null;
  actual_end_datetime: string | null;
  status: string | null;
  sort_order: number | null;
  equipments_used: ReportExportEquipment[];
  assigned_staff: ReportExportStaff[];
};

export type ReportExportMainTask = {
  project_task_id: string;
  main_task_id: string;
  title: string;
  sort_order: number | null;
  materials: ReportExportMaterial[];
  subtasks: ReportExportSubTask[];
};

export type ProjectReportExportData = {
  project: ReportExportProject;
  client: ReportExportClient | null;
  creator: ReportExportCreator | null;
  mainTasks: ReportExportMainTask[];
  totals: {
    mainTasks: number;
    subtasks: number;
    materials: number;
    equipment: number;
    hours: number;
    staff: number;
  };
};

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  description: string | null;
  site_address: string | null;
  status: string | null;
  priority: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  estimated_budget: number | string | null;
  estimated_cost: number | string | null;
  estimated_profit: number | string | null;
  materials_cost: number | string | null;
  labor_cost: number | string | null;
  markup_rate: number | string | null;
  downpayment: number | string | null;
  notes: string | null;
  dimensions: unknown;
  created_at: string | null;
  updated_at: string | null;
  client_id: string | null;
  created_by: string | null;
};

type ClientRow = {
  client_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  specialty: string | null;
  hourly_wage: number | string | null;
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
  estimated_hours: number | string | null;
  equipments_used: unknown;
  status: string | null;
  sort_order: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  actual_start_datetime: string | null;
  actual_end_datetime: string | null;
};

type SubTaskRow = {
  sub_task_id: string;
  description: string | null;
};

type ProjectTaskMaterialRow = {
  project_task_material_id: string;
  project_task_id: string;
  material_id: string;
  estimated_quantity: number | string | null;
  estimated_cost: number | string | null;
};

type MaterialRow = {
  material_id: string;
  name: string | null;
  unit: string | null;
  unit_cost: number | string | null;
};

type EquipmentRow = {
  equipment_id: string;
  name: string | null;
};

type ProjectSubTaskStaffRow = {
  project_sub_task_staff_id: string;
  project_sub_task_id: string;
  user_id: string;
  role: string | null;
  assignment_status: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function safeFilePart(value: string | null | undefined, fallback = "project") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function getProjectReportFilename(data: ProjectReportExportData, extension: "pdf" | "csv") {
  return `project-report-${safeFilePart(data.project.projectCode || data.project.projectId)}.${extension}`;
}

function parseEquipment(
  value: unknown,
  equipmentById: Map<string, EquipmentRow>,
  equipmentByName: Map<string, EquipmentRow>,
): ReportExportEquipment[] {
  return parseEquipmentUsage(value).map((item, index) => {
    const equipment =
      equipmentById.get(item.equipmentId) ?? equipmentByName.get(item.legacyName);
    const fallbackName = item.equipmentId
      ? `Equipment ${item.equipmentId.slice(0, 8)}`
      : `Equipment ${index + 1}`;

    return {
      equipment_id: equipment?.equipment_id ?? item.equipmentId ?? null,
      name: (equipment?.name ?? item.legacyName) || fallbackName,
      quantity: item.quantity,
      notes: item.notes,
    };
  });
}

export async function loadProjectReportExport(projectId: string): Promise<ProjectReportExportData> {
  if (!projectId) throw new Error("Missing projectId.");

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select(
      [
        "project_id",
        "project_code",
        "title",
        "description",
        "site_address",
        "status",
        "priority",
        "scheduled_start_datetime",
        "scheduled_end_datetime",
        "estimated_budget",
        "estimated_cost",
        "estimated_profit",
        "materials_cost",
        "labor_cost",
        "markup_rate",
        "downpayment",
        "notes",
        "dimensions",
        "created_at",
        "updated_at",
        "client_id",
        "created_by",
      ].join(", "),
    )
    .eq("project_id", projectId)
    .maybeSingle<ProjectRow>();

  if (projectError) throw new Error(`Failed to load project: ${projectError.message}`);
  if (!project) throw new Error("Project not found.");

  const [clientResult, creatorResult, projectTasksResult] = await Promise.all([
    project.client_id
      ? supabaseAdmin
          .from("clients")
          .select("client_id, full_name, phone, email, address, notes")
          .eq("client_id", project.client_id)
          .maybeSingle<ClientRow>()
      : Promise.resolve({ data: null, error: null }),
    project.created_by
      ? supabaseAdmin
          .from("users")
          .select("id, username, email, role")
          .eq("id", project.created_by)
          .maybeSingle<Pick<UserRow, "id" | "username" | "email" | "role">>()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id")
      .eq("project_id", projectId)
      .returns<ProjectTaskRow[]>(),
  ]);

  if (clientResult.error) throw new Error(`Failed to load client: ${clientResult.error.message}`);
  if (creatorResult.error) throw new Error(`Failed to load creator: ${creatorResult.error.message}`);
  if (projectTasksResult.error) throw new Error(`Failed to load project tasks: ${projectTasksResult.error.message}`);

  const projectTasks = projectTasksResult.data ?? [];
  const projectTaskIds = uniqueStrings(projectTasks.map((row) => row.project_task_id));
  const mainTaskIds = uniqueStrings(projectTasks.map((row) => row.main_task_id));

  const [mainTasksResult, projectSubTasksResult, projectTaskMaterialsResult] = await Promise.all([
    mainTaskIds.length > 0
      ? supabaseAdmin
          .from("main_task")
          .select("main_task_id, name, sort_order:default_sort_order")
          .in("main_task_id", mainTaskIds)
          .returns<MainTaskRow[]>()
      : Promise.resolve({ data: [] as MainTaskRow[], error: null }),
    projectTaskIds.length > 0
      ? supabaseAdmin
          .from("project_sub_task")
          .select(
            [
              "project_sub_task_id",
              "project_task_id",
              "sub_task_id",
              "estimated_hours",
              "equipments_used",
              "status",
              "sort_order",
              "scheduled_start_datetime",
              "scheduled_end_datetime",
              "actual_start_datetime",
              "actual_end_datetime",
            ].join(", "),
          )
          .in("project_task_id", projectTaskIds)
          .returns<ProjectSubTaskRow[]>()
      : Promise.resolve({ data: [] as ProjectSubTaskRow[], error: null }),
    projectTaskIds.length > 0
      ? supabaseAdmin
          .from("project_task_material")
          .select(
            "project_task_material_id, project_task_id, material_id, estimated_quantity, estimated_cost",
          )
          .in("project_task_id", projectTaskIds)
          .returns<ProjectTaskMaterialRow[]>()
      : Promise.resolve({ data: [] as ProjectTaskMaterialRow[], error: null }),
  ]);

  if (mainTasksResult.error) throw new Error(`Failed to load main tasks: ${mainTasksResult.error.message}`);
  if (projectSubTasksResult.error) throw new Error(`Failed to load subtasks: ${projectSubTasksResult.error.message}`);
  if (projectTaskMaterialsResult.error) throw new Error(`Failed to load materials: ${projectTaskMaterialsResult.error.message}`);

  const projectSubTasks = projectSubTasksResult.data ?? [];
  const projectTaskMaterials = projectTaskMaterialsResult.data ?? [];
  const subTaskIds = uniqueStrings(projectSubTasks.map((row) => row.sub_task_id));
  const materialIds = uniqueStrings(projectTaskMaterials.map((row) => row.material_id));
  const projectSubTaskIds = uniqueStrings(projectSubTasks.map((row) => row.project_sub_task_id));
  const equipmentIds = collectEquipmentUsageIds(projectSubTasks.map((row) => row.equipments_used));
  const equipmentNames = collectLegacyEquipmentNames(projectSubTasks.map((row) => row.equipments_used));

  const [subTasksResult, materialsResult, equipmentByIdResult, equipmentByNameResult, staffResult] = await Promise.all([
    subTaskIds.length > 0
      ? supabaseAdmin
          .from("sub_task")
          .select("sub_task_id, description")
          .in("sub_task_id", subTaskIds)
          .returns<SubTaskRow[]>()
      : Promise.resolve({ data: [] as SubTaskRow[], error: null }),
    materialIds.length > 0
      ? supabaseAdmin
          .from("materials")
          .select("material_id, name, unit, unit_cost")
          .in("material_id", materialIds)
          .returns<MaterialRow[]>()
      : Promise.resolve({ data: [] as MaterialRow[], error: null }),
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
          .select("project_sub_task_staff_id, project_sub_task_id, user_id, role, assignment_status")
          .in("project_sub_task_id", projectSubTaskIds)
          .returns<ProjectSubTaskStaffRow[]>()
      : Promise.resolve({ data: [] as ProjectSubTaskStaffRow[], error: null }),
  ]);

  if (subTasksResult.error) throw new Error(`Failed to load sub task catalog: ${subTasksResult.error.message}`);
  if (materialsResult.error) throw new Error(`Failed to load material catalog: ${materialsResult.error.message}`);
  if (equipmentByIdResult.error) throw new Error(`Failed to load equipment catalog: ${equipmentByIdResult.error.message}`);
  if (equipmentByNameResult.error) throw new Error(`Failed to load equipment catalog: ${equipmentByNameResult.error.message}`);
  if (staffResult.error) throw new Error(`Failed to load assigned staff: ${staffResult.error.message}`);

  const assignedStaff = staffResult.data ?? [];
  const userIds = uniqueStrings(assignedStaff.map((row) => row.user_id));
  let users: UserRow[] = [];

  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, username, email, phone, role, specialty, hourly_wage")
      .in("id", userIds)
      .returns<UserRow[]>();

    if (usersError) throw new Error(`Failed to load users: ${usersError.message}`);
    users = usersData ?? [];
  }

  const mainTaskMap = new Map((mainTasksResult.data ?? []).map((row) => [row.main_task_id, row]));
  const subTaskMap = new Map((subTasksResult.data ?? []).map((row) => [row.sub_task_id, row]));
  const materialMap = new Map((materialsResult.data ?? []).map((row) => [row.material_id, row]));
  const userMap = new Map(users.map((row) => [row.id, row]));
  const equipmentById = new Map((equipmentByIdResult.data ?? []).map((row) => [row.equipment_id, row]));
  const equipmentByName = new Map(
    (equipmentByNameResult.data ?? [])
      .filter((row) => Boolean(row.name))
      .map((row) => [String(row.name), row]),
  );

  const staffBySubTaskId = new Map<string, ReportExportStaff[]>();
  for (const row of assignedStaff) {
    const user = userMap.get(row.user_id);
    const current = staffBySubTaskId.get(row.project_sub_task_id) ?? [];
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
            phone: user.phone,
            role: user.role,
            specialty: user.specialty,
            hourly_wage: nullableNumber(user.hourly_wage),
          }
        : null,
    });
    staffBySubTaskId.set(row.project_sub_task_id, current);
  }

  const materialsByProjectTaskId = new Map<string, ReportExportMaterial[]>();
  for (const row of projectTaskMaterials) {
    const material = materialMap.get(row.material_id);
    const current = materialsByProjectTaskId.get(row.project_task_id) ?? [];
    current.push({
      project_task_material_id: row.project_task_material_id,
      material_id: row.material_id,
      name: material?.name ?? "Material",
      unit: material?.unit ?? null,
      unit_cost: nullableNumber(material?.unit_cost),
      estimated_quantity: nullableNumber(row.estimated_quantity),
      estimated_cost: nullableNumber(row.estimated_cost),
    });
    materialsByProjectTaskId.set(row.project_task_id, current);
  }

  const subtasksByProjectTaskId = new Map<string, ReportExportSubTask[]>();
  for (const row of projectSubTasks) {
    const subTask = subTaskMap.get(row.sub_task_id);
    const current = subtasksByProjectTaskId.get(row.project_task_id) ?? [];
    current.push({
      project_sub_task_id: row.project_sub_task_id,
      sub_task_id: row.sub_task_id,
      description: subTask?.description ?? "Sub Task",
      estimated_hours: nullableNumber(row.estimated_hours),
      scheduled_start_datetime: row.scheduled_start_datetime,
      scheduled_end_datetime: row.scheduled_end_datetime,
      actual_start_datetime: row.actual_start_datetime,
      actual_end_datetime: row.actual_end_datetime,
      status: row.status,
      sort_order: row.sort_order,
      equipments_used: parseEquipment(row.equipments_used, equipmentById, equipmentByName),
      assigned_staff: staffBySubTaskId.get(row.project_sub_task_id) ?? [],
    });
    subtasksByProjectTaskId.set(row.project_task_id, current);
  }

  const mainTasks: ReportExportMainTask[] = projectTasks
    .map((projectTask) => {
      const mainTask = mainTaskMap.get(projectTask.main_task_id);
      return {
        project_task_id: projectTask.project_task_id,
        main_task_id: projectTask.main_task_id,
        title: mainTask?.name ?? "Main Task",
        sort_order: mainTask?.sort_order ?? 0,
        materials: (materialsByProjectTaskId.get(projectTask.project_task_id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        subtasks: (subtasksByProjectTaskId.get(projectTask.project_task_id) ?? []).sort(
          (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
        ),
      };
    })
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  const allSubtasks = mainTasks.flatMap((task) => task.subtasks);
  const allMaterials = mainTasks.flatMap((task) => task.materials);
  const equipmentCount = allSubtasks.reduce((sum, subtask) => sum + subtask.equipments_used.length, 0);
  const staffCount = new Set(allSubtasks.flatMap((subtask) => subtask.assigned_staff.map((staff) => staff.user_id))).size;

  return {
    project: {
      projectId: project.project_id,
      projectCode: project.project_code,
      title: project.title,
      description: project.description,
      siteAddress: project.site_address,
      status: project.status,
      priority: project.priority,
      scheduledStartDatetime: project.scheduled_start_datetime,
      scheduledEndDatetime: project.scheduled_end_datetime,
      estimatedBudget: toNumber(project.estimated_budget),
      estimatedCost: toNumber(project.estimated_cost),
      estimatedProfit: toNumber(project.estimated_profit),
      materialsCost: toNumber(project.materials_cost),
      laborCost: toNumber(project.labor_cost),
      markupRate: toNumber(project.markup_rate),
      downpayment: toNumber(project.downpayment),
      notes: project.notes,
      dimensions: project.dimensions,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    client: clientResult.data
      ? {
          clientId: clientResult.data.client_id,
          fullName: clientResult.data.full_name,
          phone: clientResult.data.phone,
          email: clientResult.data.email,
          address: clientResult.data.address,
          notes: clientResult.data.notes,
        }
      : null,
    creator: creatorResult.data
      ? {
          id: creatorResult.data.id,
          username: creatorResult.data.username,
          email: creatorResult.data.email,
          role: creatorResult.data.role,
        }
      : null,
    mainTasks,
    totals: {
      mainTasks: mainTasks.length,
      subtasks: allSubtasks.length,
      materials: allMaterials.length,
      equipment: equipmentCount,
      hours: allSubtasks.reduce((sum, subtask) => sum + Number(subtask.estimated_hours ?? 0), 0),
      staff: staffCount,
    },
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function titleCase(value: string | null | undefined) {
  return normalizeStatus(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "—";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatNumber(value: number | null | undefined, digits = 2) {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0));
}

function formatText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function staffNames(subtask: ReportExportSubTask) {
  const names = subtask.assigned_staff.map((staff) =>
    formatText(staff.user?.username || staff.user?.email, "Assigned staff"),
  );
  return names.length > 0 ? names.join(", ") : "—";
}

function equipmentNames(subtask: ReportExportSubTask) {
  const names = subtask.equipments_used.map((equipment) =>
    equipment.quantity && equipment.quantity !== 1
      ? `${equipment.name} (${equipment.quantity})`
      : equipment.name,
  );
  return names.length > 0 ? names.join(", ") : "—";
}

export function renderProjectReportHtml(data: ProjectReportExportData) {
  const { project, client, creator, mainTasks, totals } = data;
  const reportTitle = project.title || "Untitled Project";
  const reportCode = project.projectCode || project.projectId;
  const profitClass = project.estimatedProfit >= 0 ? "positive" : "negative";

  const taskRows = mainTasks
    .flatMap((task, taskIndex) =>
      task.subtasks.map((subtask, subtaskIndex) => `
        <tr>
          <td>${taskIndex + 1}.${subtaskIndex + 1}</td>
          <td>
            <strong>${escapeHtml(task.title)}</strong><br />
            <span class="muted">${escapeHtml(subtask.description)}</span>
          </td>
          <td>${escapeHtml(titleCase(subtask.status))}</td>
          <td class="text-right">${escapeHtml(formatNumber(subtask.estimated_hours, 2))}</td>
          <td>${escapeHtml(formatDateTime(subtask.scheduled_start_datetime))}</td>
          <td>${escapeHtml(formatDateTime(subtask.scheduled_end_datetime))}</td>
          <td>${escapeHtml(staffNames(subtask))}</td>
          <td>${escapeHtml(equipmentNames(subtask))}</td>
        </tr>`),
    )
    .join("");

  const materialRows = mainTasks
    .flatMap((task) =>
      task.materials.map((material) => `
        <tr>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(material.name)}</td>
          <td>${escapeHtml(material.unit || "—")}</td>
          <td class="text-right">${escapeHtml(formatNumber(material.estimated_quantity, 2))}</td>
          <td class="text-right">${escapeHtml(formatCurrency(material.unit_cost))}</td>
          <td class="text-right">${escapeHtml(formatCurrency(material.estimated_cost))}</td>
        </tr>`),
    )
    .join("");

  const mainTaskSummaryRows = mainTasks
    .map((task, index) => {
      const hours = task.subtasks.reduce((sum, subtask) => sum + Number(subtask.estimated_hours ?? 0), 0);
      const materialTotal = task.materials.reduce((sum, material) => sum + Number(material.estimated_cost ?? 0), 0);
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(task.title)}</strong></td>
          <td class="text-right">${task.subtasks.length}</td>
          <td class="text-right">${task.materials.length}</td>
          <td class="text-right">${escapeHtml(formatNumber(hours, 2))}</td>
          <td class="text-right">${escapeHtml(formatCurrency(materialTotal))}</td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Project Report ${escapeHtml(reportCode)}</title>
    <style>
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        background: #f5f7f6;
        color: #1f2937;
        font-family: Arial, Helvetica, sans-serif;
      }
      .page {
        width: 100%;
        max-width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #ffffff;
        padding: clamp(14px, 4vw, 18mm) clamp(12px, 4vw, 16mm);
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 16px;
        border-bottom: 2px solid #111827;
      }
      .brand-title {
        font-size: clamp(22px, 5vw, 28px);
        font-weight: 800;
        letter-spacing: 0.02em;
        color: #111827;
      }
      .brand-sub {
        margin-top: 4px;
        font-size: 12px;
        color: #6b7280;
      }
      .doc-title {
        text-align: right;
      }
      .doc-title h1 {
        margin: 0;
        font-size: clamp(20px, 5vw, 26px);
        font-weight: 800;
        color: #111827;
      }
      .doc-meta {
        margin-top: 6px;
        font-size: 12px;
        color: #6b7280;
        line-height: 1.5;
      }
      .accent-line {
        height: 5px;
        background: #00c065;
        border-radius: 999px;
        margin: 16px 0 0;
      }
      .section {
        margin-top: 18px;
        break-inside: avoid;
      }
      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .grid-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px 14px;
        background: #ffffff;
      }
      .metric {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px;
        background: #f9fafb;
      }
      .label {
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
      }
      .value {
        margin-top: 5px;
        font-size: 13px;
        color: #111827;
        font-weight: 600;
        line-height: 1.5;
      }
      .metric .value {
        font-size: 16px;
        font-weight: 800;
      }
      .heading {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 9px 6px;
        font-size: 11px;
        vertical-align: top;
        line-height: 1.4;
      }
      th {
        text-align: left;
        color: #6b7280;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .text-right { text-align: right; }
      .muted { color: #6b7280; }
      .positive { color: #047857; }
      .negative { color: #dc2626; }
      .summary-box {
        margin-left: auto;
        width: 100%;
        max-width: 340px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        font-size: 12px;
        border-bottom: 1px solid #e5e7eb;
      }
      .summary-row.total {
        font-size: 14px;
        font-weight: 800;
        color: #111827;
        border-top: 2px solid #111827;
        border-bottom: none;
        margin-top: 8px;
        padding-top: 10px;
      }
      .footer-note {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        font-size: 11px;
        color: #6b7280;
        line-height: 1.5;
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media (max-width: 640px) {
        .topbar, .grid-2, .grid-4 { grid-template-columns: 1fr; display: grid; }
        .doc-title { text-align: left; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="topbar">
        <div>
          <div class="brand-title">PaintPro</div>
          <div class="brand-sub">Field Service Management and Business Intelligence Suite</div>
        </div>
        <div class="doc-title">
          <h1>Project Report</h1>
          <div class="doc-meta">
            Report No. ${escapeHtml(reportCode)}<br />
            Generated ${escapeHtml(formatDate())}
          </div>
        </div>
      </header>
      <div class="accent-line"></div>

      <section class="section grid-2">
        <div class="card">
          <div class="label">Project</div>
          <div class="value">
            ${escapeHtml(reportTitle)}<br />
            <span class="muted">${escapeHtml(project.description || "No description provided.")}</span>
          </div>
        </div>
        <div class="card">
          <div class="label">Client</div>
          <div class="value">
            ${escapeHtml(client?.fullName || "No client assigned")}<br />
            <span class="muted">${escapeHtml(client?.email || "—")} · ${escapeHtml(client?.phone || "—")}</span><br />
            <span class="muted">${escapeHtml(client?.address || project.siteAddress || "—")}</span>
          </div>
        </div>
      </section>

      <section class="section grid-4">
        <div class="metric"><div class="label">Budget</div><div class="value">${escapeHtml(formatCurrency(project.estimatedBudget))}</div></div>
        <div class="metric"><div class="label">Cost</div><div class="value">${escapeHtml(formatCurrency(project.estimatedCost))}</div></div>
        <div class="metric"><div class="label">Profit</div><div class="value ${profitClass}">${escapeHtml(formatCurrency(project.estimatedProfit))}</div></div>
        <div class="metric"><div class="label">Downpayment</div><div class="value">${escapeHtml(formatCurrency(project.downpayment))}</div></div>
      </section>

      <section class="section grid-2">
        <div class="card">
          <div class="heading">Schedule and Status</div>
          <table>
            <tbody>
              <tr><td class="label">Status</td><td>${escapeHtml(titleCase(project.status))}</td></tr>
              <tr><td class="label">Priority</td><td>${escapeHtml(titleCase(project.priority))}</td></tr>
              <tr><td class="label">Start</td><td>${escapeHtml(formatDateTime(project.scheduledStartDatetime))}</td></tr>
              <tr><td class="label">End</td><td>${escapeHtml(formatDateTime(project.scheduledEndDatetime))}</td></tr>
              <tr><td class="label">Site Address</td><td>${escapeHtml(project.siteAddress || "—")}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="heading">Workflow Summary</div>
          <table>
            <tbody>
              <tr><td class="label">Main Tasks</td><td>${totals.mainTasks}</td></tr>
              <tr><td class="label">Subtasks</td><td>${totals.subtasks}</td></tr>
              <tr><td class="label">Material Entries</td><td>${totals.materials}</td></tr>
              <tr><td class="label">Equipment Entries</td><td>${totals.equipment}</td></tr>
              <tr><td class="label">Estimated Hours</td><td>${escapeHtml(formatNumber(totals.hours, 2))}</td></tr>
              <tr><td class="label">Assigned Staff</td><td>${totals.staff}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <div class="heading">Main Task Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Main Task</th>
              <th class="text-right">Subtasks</th>
              <th class="text-right">Materials</th>
              <th class="text-right">Hours</th>
              <th class="text-right">Material Cost</th>
            </tr>
          </thead>
          <tbody>
            ${mainTaskSummaryRows || `<tr><td colspan="6" class="muted">No main tasks available.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="heading">Task and Workflow Details</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Task</th>
              <th>Status</th>
              <th class="text-right">Hours</th>
              <th>Scheduled Start</th>
              <th>Scheduled End</th>
              <th>Staff</th>
              <th>Equipment</th>
            </tr>
          </thead>
          <tbody>
            ${taskRows || `<tr><td colspan="8" class="muted">No subtasks available.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="heading">Material Details</div>
        <table>
          <thead>
            <tr>
              <th>Main Task</th>
              <th>Material</th>
              <th>Unit</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-right">Estimated Cost</th>
            </tr>
          </thead>
          <tbody>
            ${materialRows || `<tr><td colspan="6" class="muted">No materials available.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="summary-box">
          <div class="summary-row"><span>Materials Cost</span><strong>${escapeHtml(formatCurrency(project.materialsCost))}</strong></div>
          <div class="summary-row"><span>Labor Cost</span><strong>${escapeHtml(formatCurrency(project.laborCost))}</strong></div>
          <div class="summary-row"><span>Total Cost</span><strong>${escapeHtml(formatCurrency(project.estimatedCost))}</strong></div>
          <div class="summary-row"><span>Markup Rate</span><strong>${escapeHtml(formatNumber(project.markupRate, 2))}%</strong></div>
          <div class="summary-row total"><span>Estimated Budget</span><span>${escapeHtml(formatCurrency(project.estimatedBudget))}</span></div>
          <div class="summary-row total"><span>Estimated Profit</span><span class="${profitClass}">${escapeHtml(formatCurrency(project.estimatedProfit))}</span></div>
        </div>
      </section>

      <section class="section grid-2">
        <div class="card">
          <div class="label">Record Info</div>
          <div class="value">
            Created: ${escapeHtml(formatDateTime(project.createdAt))}<br />
            Updated: ${escapeHtml(formatDateTime(project.updatedAt))}<br />
            Created by: ${escapeHtml(creator?.username || creator?.email || "—")}
          </div>
        </div>
        <div class="card">
          <div class="label">Notes</div>
          <div class="value">${escapeHtml(project.notes || client?.notes || "No notes provided.")}</div>
        </div>
      </section>

      <div class="footer-note">
        This report is generated from PaintPro project records and is intended for project review, operational monitoring, and financial documentation.
      </div>
    </main>
  </body>
</html>`;
}

function csvValue(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvValue).join(",");
}

function addSection(rows: string[], title: string) {
  if (rows.length > 0) rows.push("");
  rows.push(csvRow([title]));
}

export function renderProjectReportCsv(data: ProjectReportExportData) {
  const { project, client, creator, mainTasks, totals } = data;
  const rows: string[] = [];

  rows.push(csvRow(["PaintPro Project Report"]));
  rows.push(csvRow(["Generated", formatDate(new Date())]));

  addSection(rows, "Project Information");
  rows.push(csvRow(["Field", "Value"]));
  rows.push(csvRow(["Project Code", project.projectCode || project.projectId]));
  rows.push(csvRow(["Project Title", project.title || "Untitled Project"]));
  rows.push(csvRow(["Description", project.description || ""]));
  rows.push(csvRow(["Status", titleCase(project.status)]));
  rows.push(csvRow(["Priority", titleCase(project.priority)]));
  rows.push(csvRow(["Site Address", project.siteAddress || ""]));
  rows.push(csvRow(["Scheduled Start", formatDateTime(project.scheduledStartDatetime)]));
  rows.push(csvRow(["Scheduled End", formatDateTime(project.scheduledEndDatetime)]));
  rows.push(csvRow(["Created", formatDateTime(project.createdAt)]));
  rows.push(csvRow(["Updated", formatDateTime(project.updatedAt)]));
  rows.push(csvRow(["Created By", creator?.username || creator?.email || ""]));

  addSection(rows, "Client Information");
  rows.push(csvRow(["Field", "Value"]));
  rows.push(csvRow(["Client Name", client?.fullName || ""]));
  rows.push(csvRow(["Phone", client?.phone || ""]));
  rows.push(csvRow(["Email", client?.email || ""]));
  rows.push(csvRow(["Address", client?.address || ""]));
  rows.push(csvRow(["Notes", client?.notes || ""]));

  addSection(rows, "Financial Summary");
  rows.push(csvRow(["Metric", "Amount"]));
  rows.push(csvRow(["Estimated Budget", project.estimatedBudget]));
  rows.push(csvRow(["Estimated Cost", project.estimatedCost]));
  rows.push(csvRow(["Estimated Profit", project.estimatedProfit]));
  rows.push(csvRow(["Materials Cost", project.materialsCost]));
  rows.push(csvRow(["Labor Cost", project.laborCost]));
  rows.push(csvRow(["Markup Rate", `${project.markupRate}%`]));
  rows.push(csvRow(["Downpayment", project.downpayment]));

  addSection(rows, "Workflow Summary");
  rows.push(csvRow(["Metric", "Count"]));
  rows.push(csvRow(["Main Tasks", totals.mainTasks]));
  rows.push(csvRow(["Subtasks", totals.subtasks]));
  rows.push(csvRow(["Material Entries", totals.materials]));
  rows.push(csvRow(["Equipment Entries", totals.equipment]));
  rows.push(csvRow(["Estimated Hours", totals.hours]));
  rows.push(csvRow(["Assigned Staff", totals.staff]));

  addSection(rows, "Main Task Breakdown");
  rows.push(csvRow(["Main Task", "Subtasks", "Materials", "Estimated Hours", "Material Cost"]));
  for (const task of mainTasks) {
    rows.push(
      csvRow([
        task.title,
        task.subtasks.length,
        task.materials.length,
        task.subtasks.reduce((sum, subtask) => sum + Number(subtask.estimated_hours ?? 0), 0),
        task.materials.reduce((sum, material) => sum + Number(material.estimated_cost ?? 0), 0),
      ]),
    );
  }

  addSection(rows, "Task Details");
  rows.push(
    csvRow([
      "Main Task",
      "Subtask",
      "Status",
      "Estimated Hours",
      "Scheduled Start",
      "Scheduled End",
      "Actual Start",
      "Actual End",
      "Assigned Staff",
      "Equipment",
    ]),
  );
  for (const task of mainTasks) {
    for (const subtask of task.subtasks) {
      rows.push(
        csvRow([
          task.title,
          subtask.description,
          titleCase(subtask.status),
          subtask.estimated_hours ?? 0,
          formatDateTime(subtask.scheduled_start_datetime),
          formatDateTime(subtask.scheduled_end_datetime),
          formatDateTime(subtask.actual_start_datetime),
          formatDateTime(subtask.actual_end_datetime),
          staffNames(subtask),
          equipmentNames(subtask),
        ]),
      );
    }
  }

  addSection(rows, "Material Details");
  rows.push(csvRow(["Main Task", "Material", "Unit", "Quantity", "Unit Cost", "Estimated Cost"]));
  for (const task of mainTasks) {
    for (const material of task.materials) {
      rows.push(
        csvRow([
          task.title,
          material.name,
          material.unit || "",
          material.estimated_quantity ?? 0,
          material.unit_cost ?? 0,
          material.estimated_cost ?? 0,
        ]),
      );
    }
  }

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
