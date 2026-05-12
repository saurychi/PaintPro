import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  estimated_budget: number | null;
  estimated_cost: number | null;
  estimated_profit: number | null;
  downpayment: number | null;
  downpayment_rate: number | null;
  cancelled_at: string | null;
  cancelled_from_status: string | null;
  cancellation_phase: string | null;
  cancellation_earned_cost: number | null;
  cancellation_earned_revenue: number | null;
  cancellation_balance: number | null;
  cancellation_settled: number | null;
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
  actual_start_datetime: string | null;
  actual_end_datetime: string | null;
  updated_at: string | null;
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

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  specialty: string | null;
  profile_image_url: string | null;
  hourly_wage: number | null;
};

type ParsedEquipment = {
  equipment_id: string | null;
  name: string;
  quantity: number;
  notes: string | null;
};

type AssignedStaffOverviewRow = {
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
    profile_image_url: string | null;
    hourly_wage: number | null;
  } | null;
};

type MaterialOverviewRow = {
  project_task_material_id: string;
  material_id: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  estimated_quantity: number | null;
  estimated_cost: number | null;
};

type ProjectSubTaskOverviewRow = {
  project_sub_task_id: string;
  sub_task_id: string;
  description: string;
  estimated_hours: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  actual_start_datetime: string | null;
  actual_end_datetime: string | null;
  updated_at: string | null;
  status: string | null;
  sort_order: number | null;
  equipments_used: ParsedEquipment[];
  assigned_staff: AssignedStaffOverviewRow[];
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseEquipment(
  value: unknown,
  equipmentById: Map<string, EquipmentRow>,
  equipmentByName: Map<string, EquipmentRow>,
): ParsedEquipment[] {
  return parseEquipmentUsage(value).map((item, index) => {
    const equipment =
      equipmentById.get(item.equipmentId) ??
      equipmentByName.get(item.legacyName);
    const resolvedName = equipment?.name ?? item.legacyName;

    // Fall back to a stable placeholder when the catalog reference is
    // broken (equipment row was deleted after assignment, the saved
    // JSON only carries an id, etc.) instead of dropping the entry
    // entirely. Materials use the same "Material" fallback — without
    // this, equipment usage silently disappears from review/audit
    // surfaces and the count card reads 0 even when the project has
    // assigned equipment.
    const fallbackName = item.equipmentId
      ? `Equipment ${item.equipmentId.slice(0, 8)}`
      : `Equipment ${index + 1}`;

    return {
      equipment_id: equipment?.equipment_id ?? item.equipmentId ?? null,
      name: resolvedName || fallbackName,
      quantity: item.quantity,
      notes: item.notes,
    };
  });
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isFinishedSubTaskStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "cancelled"
  );
}

function canMoveProjectToReview(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "in_progress" ||
    normalized === "ongoing" ||
    normalized === "active"
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    // Stage 1 — both queries only need projectId, so fan them out in
    // parallel. Was sequential before; saves ~one RTT on every project
    // switch in the dashboard.
    const [projectResult, projectTasksResult] = await Promise.all([
      supabaseAdmin
        .from("projects")
        .select(
          `
          project_id,
          project_code,
          title,
          description,
          site_address,
          status,
          scheduled_start_datetime,
          scheduled_end_datetime,
          estimated_budget,
          estimated_cost,
          estimated_profit,
          downpayment,
          downpayment_rate,
          cancelled_at,
          cancelled_from_status,
          cancellation_phase,
          cancellation_earned_cost,
          cancellation_earned_revenue,
          cancellation_balance,
          cancellation_settled
          `,
        )
        .eq("project_id", projectId)
        .maybeSingle<ProjectRow>(),
      supabaseAdmin
        .from("project_task")
        .select("project_task_id, project_id, main_task_id")
        .eq("project_id", projectId)
        .returns<ProjectTaskRow[]>(),
    ]);

    const { data: project, error: projectError } = projectResult;
    const { data: projectTasks, error: projectTasksError } = projectTasksResult;

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

    // Stage 2 — main_task / project_sub_task / project_task_material all
    // depend only on the IDs we just derived from project_task. Fan them
    // out in parallel; previously this was three sequential round-trips.
    const [mainTasksResult, projectSubTasksResult, projectTaskMaterialsResult] =
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
                scheduled_end_datetime,
                actual_start_datetime,
                actual_end_datetime,
                updated_at
              `,
              )
              .in("project_task_id", projectTaskIds)
              .returns<ProjectSubTaskRow[]>()
          : Promise.resolve({ data: [] as ProjectSubTaskRow[], error: null }),
        projectTaskIds.length > 0
          ? supabaseAdmin
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
              .returns<ProjectTaskMaterialRow[]>()
          : Promise.resolve({ data: [] as ProjectTaskMaterialRow[], error: null }),
      ]);

    const { data: mainTasks, error: mainTasksError } = mainTasksResult;
    const { data: projectSubTasks, error: projectSubTasksError } =
      projectSubTasksResult;
    const { data: projectTaskMaterials, error: projectTaskMaterialsError } =
      projectTaskMaterialsResult;

    if (mainTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load main tasks.",
          details: mainTasksError.message,
        },
        { status: 500 },
      );
    }

    if (projectSubTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project subtasks.",
          details: projectSubTasksError.message,
        },
        { status: 500 },
      );
    }

    if (projectTaskMaterialsError) {
      return NextResponse.json(
        {
          error: "Failed to load project materials.",
          details: projectTaskMaterialsError.message,
        },
        { status: 500 },
      );
    }

    // The "all subtasks finished -> bump project to review" transition
    // used to block this response. Fire it without await — the client
    // gets the in-memory updated status in the response, and the DB
    // write reaches Supabase asynchronously. Errors land in the server
    // log but don't fail the read.
    let nextProjectStatus = project.status;
    if (
      canMoveProjectToReview(project.status) &&
      (projectSubTasks ?? []).length > 0 &&
      !(projectSubTasks ?? []).some((row) => !isFinishedSubTaskStatus(row.status))
    ) {
      nextProjectStatus = "review_pending";
      void supabaseAdmin
        .from("projects")
        .update({
          status: nextProjectStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", project.project_id)
        .then(({ error }) => {
          if (error) {
            console.error(
              "[getProjectOverview] background review-status bump failed:",
              error.message,
            );
          }
        });
    }

    const subTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.sub_task_id),
    );

    const materialIds = uniqueStrings(
      (projectTaskMaterials ?? []).map((row) => row.material_id),
    );

    const equipmentIds = collectEquipmentUsageIds(
      (projectSubTasks ?? []).map((row) => row.equipments_used),
    );

    const equipmentNames = collectLegacyEquipmentNames(
      (projectSubTasks ?? []).map((row) => row.equipments_used),
    );

    const projectSubTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.project_sub_task_id),
    );

    // Stage 3 — sub_task / materials / equipment-by-id / equipment-by-name
    // / project_sub_task_staff are all independent of each other; only
    // the project_sub_task_staff -> users hop has to wait. Fire them
    // in parallel so we cover all five round-trips in one wall-clock
    // window instead of five.
    const [
      subTasksResult,
      materialsResult,
      equipmentByIdResult,
      equipmentByNameResult,
      projectSubTaskStaffResult,
    ] = await Promise.all([
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
            .returns<ProjectSubTaskStaffRow[]>()
        : Promise.resolve({
            data: [] as ProjectSubTaskStaffRow[],
            error: null,
          }),
    ]);

    if (subTasksResult.error) {
      return NextResponse.json(
        {
          error: "Failed to load sub tasks.",
          details: subTasksResult.error.message,
        },
        { status: 500 },
      );
    }
    if (materialsResult.error) {
      return NextResponse.json(
        {
          error: "Failed to load material catalog.",
          details: materialsResult.error.message,
        },
        { status: 500 },
      );
    }
    if (equipmentByIdResult.error) {
      return NextResponse.json(
        {
          error: "Failed to load equipment catalog.",
          details: equipmentByIdResult.error.message,
        },
        { status: 500 },
      );
    }
    if (equipmentByNameResult.error) {
      return NextResponse.json(
        {
          error: "Failed to load equipment catalog.",
          details: equipmentByNameResult.error.message,
        },
        { status: 500 },
      );
    }
    if (projectSubTaskStaffResult.error) {
      return NextResponse.json(
        {
          error: "Failed to load project sub task staff.",
          details: projectSubTaskStaffResult.error.message,
        },
        { status: 500 },
      );
    }

    const subTasks = subTasksResult.data ?? [];
    const materials = materialsResult.data ?? [];
    const equipmentById = new Map<string, EquipmentRow>(
      (equipmentByIdResult.data ?? []).map((row) => [row.equipment_id, row]),
    );
    const equipmentByName = new Map<string, EquipmentRow>(
      (equipmentByNameResult.data ?? [])
        .filter((row) => Boolean(row.name))
        .map((row) => [String(row.name), row]),
    );
    const projectSubTaskStaff = projectSubTaskStaffResult.data ?? [];

    const userIds = uniqueStrings(
      projectSubTaskStaff.map((row) => row.user_id),
    );

    // Stage 4 — users is the only query that has to wait for staff.
    let users: UserRow[] = [];
    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select(
          "id, username, email, phone, role, specialty, profile_image_url, hourly_wage",
        )
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

    const projectSubTaskStaffMap = new Map<string, AssignedStaffOverviewRow[]>();
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
              phone: user.phone,
              role: user.role,
              specialty: user.specialty,
              profile_image_url: user.profile_image_url,
              hourly_wage: user.hourly_wage,
            }
          : null,
      });

      projectSubTaskStaffMap.set(row.project_sub_task_id, current);
    }

    const materialsByProjectTaskId = new Map<string, MaterialOverviewRow[]>();
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

    const subtasksByProjectTaskId = new Map<string, ProjectSubTaskOverviewRow[]>();
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
        actual_start_datetime: row.actual_start_datetime,
        actual_end_datetime: row.actual_end_datetime,
        updated_at: row.updated_at,
        status: row.status,
        sort_order: row.sort_order,
        equipments_used: parseEquipment(
          row.equipments_used,
          equipmentById,
          equipmentByName,
        ),
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
      project: {
        ...project,
        status: nextProjectStatus,
      },
      mainTasks: overviewMainTasks,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: message,
      },
      { status: 500 },
    );
  }
}
