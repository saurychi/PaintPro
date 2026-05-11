import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";
import {
  calculateProjectCostEstimation,
  type CostEstimationInput,
  type CostEstimationMainTask,
} from "@/lib/planning/costEstimation";

type IncomingMainTask = {
  id: string; // main_task_id
  name: string;
  project_task_id?: string;
};

type IncomingEquipment = {
  id: string;
  equipmentId?: string | null;
  name: string;
  quantity: number;
  unitCost: number;
  notes?: string | null;
};

type IncomingSubTask = {
  id: string; // project_sub_task_id
  subTaskId: string;
  mainTaskId: string;
  projectTaskId: string;
  title: string;
  sortOrder: number;
  estimatedHours: number | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  assignedEmployeeIds: string[];
  equipments: IncomingEquipment[];
};

type IncomingMaterial = {
  id: string; // project_task_material_id
  projectTaskId: string;
  materialId: string;
  name: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
  estimatedCost: number;
};

type BatchSaveBody = {
  projectId: string;
  mainTasks: IncomingMainTask[];
  subTasks: IncomingSubTask[];
  materials: IncomingMaterial[];
  markupRate: number;
  status?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BatchSaveBody;

    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const mainTasks = Array.isArray(body?.mainTasks) ? body.mainTasks : [];
    const subTasks = Array.isArray(body?.subTasks) ? body.subTasks : [];
    const materials = Array.isArray(body?.materials) ? body.materials : [];
    const markupRate = typeof body?.markupRate === "number" ? body.markupRate : 30;
    const status = typeof body?.status === "string" && body.status.trim() ? body.status.trim() : "overview_pending";

    const timestamp = new Date().toISOString();

    // ─── 1. Sync main tasks (project_task) ────────────────────────────────────
    const incomingMainTaskIds = mainTasks.map((t) => t.id).filter(Boolean);

    const { data: existingProjectTasks, error: existingPTError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, main_task_id")
      .eq("project_id", projectId);

    if (existingPTError) {
      return NextResponse.json(
        { error: "Failed to load existing project tasks.", details: existingPTError.message },
        { status: 500 },
      );
    }

    const existingByMainTaskId = new Map(
      (existingProjectTasks ?? []).map((r) => [r.main_task_id, r.project_task_id]),
    );

    // Snapshot the pre-delete project_task_id → main_task_id mapping so we
    // can translate stale cached projectTaskIds (carried by materials) when
    // the DB row was deleted-and-recreated below.
    const oldProjectTaskToMainTask = new Map<string, string>(
      (existingProjectTasks ?? []).map((r) => [
        r.project_task_id as string,
        r.main_task_id as string,
      ]),
    );

    // Delete removed main tasks (cascades to subtasks)
    const toDeletePTIds = (existingProjectTasks ?? [])
      .filter((row) => !incomingMainTaskIds.includes(row.main_task_id))
      .map((row) => row.project_task_id);

    if (toDeletePTIds.length > 0) {
      await supabaseAdmin.from("project_sub_task").delete().in("project_task_id", toDeletePTIds);
      await supabaseAdmin.from("project_task_material").delete().in("project_task_id", toDeletePTIds);
      await supabaseAdmin.from("project_task").delete().in("project_task_id", toDeletePTIds);
    }

    // Insert new main tasks
    const newMainTaskIds = incomingMainTaskIds.filter((id) => !existingByMainTaskId.has(id));
    let insertedPTMap = new Map<string, string>(); // main_task_id -> project_task_id

    if (newMainTaskIds.length > 0) {
      const { data: inserted, error: insertPTError } = await supabaseAdmin
        .from("project_task")
        .insert(
          newMainTaskIds.map((mainTaskId, i) => ({
            project_id: projectId,
            main_task_id: mainTaskId,
            sort_order: i,
          })),
        )
        .select("project_task_id, main_task_id");

      if (insertPTError) {
        return NextResponse.json(
          { error: "Failed to insert new main tasks.", details: insertPTError.message },
          { status: 500 },
        );
      }

      for (const row of inserted ?? []) {
        insertedPTMap.set(row.main_task_id, row.project_task_id);
      }
    }

    // Build final main_task_id -> project_task_id map
    const ptIdMap = new Map<string, string>();
    for (const [mainTaskId, ptId] of existingByMainTaskId) {
      if (incomingMainTaskIds.includes(mainTaskId)) {
        ptIdMap.set(mainTaskId, ptId);
      }
    }
    for (const [mainTaskId, ptId] of insertedPTMap) {
      ptIdMap.set(mainTaskId, ptId);
    }

    // ─── 2. Sync subtasks (project_sub_task) ──────────────────────────────────
    const existingSubTaskIds = subTasks.map((st) => st.id).filter(Boolean);

    // Update existing subtasks (schedule + equipment).
    // Process in small chunks rather than firing all updates in parallel —
    // a single Promise.all over dozens of requests can exhaust connection
    // limits (especially behind a VPN), causing Node to throw "fetch failed".
    if (existingSubTaskIds.length > 0) {
      const updatable = subTasks.filter((st) => st.id);
      const CHUNK_SIZE = 8;
      for (let i = 0; i < updatable.length; i += CHUNK_SIZE) {
        const chunk = updatable.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map((st) =>
            supabaseAdmin
              .from("project_sub_task")
              .update({
                estimated_hours: st.estimatedHours,
                scheduled_start_datetime: st.scheduledStartDatetime,
                scheduled_end_datetime: st.scheduledEndDatetime,
                equipments_used: normalizeEquipmentUsageForStorage(st.equipments),
                updated_at: timestamp,
              })
              .eq("project_sub_task_id", st.id),
          ),
        );

        const failed = results.find((r) => r.error);
        if (failed?.error) {
          return NextResponse.json(
            { error: "Failed to update subtasks.", details: failed.error.message },
            { status: 500 },
          );
        }
      }
    }

    // ─── 3. Sync materials (project_task_material) ────────────────────────────
    // Get all current project_task_ids
    const allPTIds = Array.from(ptIdMap.values());

    if (allPTIds.length > 0) {
      // Delete all existing materials for this project's tasks
      const { error: deleteMaterialsError } = await supabaseAdmin
        .from("project_task_material")
        .delete()
        .in("project_task_id", allPTIds);

      if (deleteMaterialsError) {
        return NextResponse.json(
          { error: "Failed to clear materials.", details: deleteMaterialsError.message },
          { status: 500 },
        );
      }

      // Resolve each material's project_task_id against the current set of
      // valid IDs. If the cache carries a stale projectTaskId (because the
      // row was deleted+recreated above, or because the cache survived
      // across sessions), translate via main_task_id when possible. Drop
      // materials whose parent task no longer exists — they're orphans.
      const validPtIds = new Set<string>(ptIdMap.values());

      const orphanedMaterials: IncomingMaterial[] = [];
      const materialRows = materials
        .filter((m) => m.materialId)
        .map((m) => {
          let projectTaskId = m.projectTaskId;
          if (!validPtIds.has(projectTaskId)) {
            const mainTaskId = oldProjectTaskToMainTask.get(projectTaskId);
            const translated = mainTaskId ? ptIdMap.get(mainTaskId) : undefined;
            if (translated) projectTaskId = translated;
          }
          return { material: m, projectTaskId };
        })
        .filter(({ material, projectTaskId }) => {
          if (validPtIds.has(projectTaskId)) return true;
          orphanedMaterials.push(material);
          return false;
        })
        .map(({ material, projectTaskId }) => ({
          project_task_id: projectTaskId,
          material_id: material.materialId,
          estimated_quantity: Number(material.quantity ?? 0),
          estimated_cost: Number(material.estimatedCost ?? 0),
        }));

      if (orphanedMaterials.length > 0) {
        console.warn(
          "[batchSaveProject] dropped %d orphaned materials with no matching project_task: %j",
          orphanedMaterials.length,
          orphanedMaterials.map((m) => ({
            id: m.id,
            cachedProjectTaskId: m.projectTaskId,
            materialId: m.materialId,
          })),
        );
      }

      if (materialRows.length > 0) {
        const { error: insertMaterialsError } = await supabaseAdmin
          .from("project_task_material")
          .insert(materialRows);

        if (insertMaterialsError) {
          console.error(
            "[batchSaveProject] insert project_task_material failed:",
            insertMaterialsError,
            "rows sample:",
            materialRows.slice(0, 3),
          );
          return NextResponse.json(
            {
              error: "Failed to save materials.",
              details: insertMaterialsError.message,
              code: insertMaterialsError.code ?? null,
              hint: insertMaterialsError.hint ?? null,
            },
            { status: 500 },
          );
        }
      }
    }

    // ─── 4. Sync staff assignments (project_sub_task_staff) ──────────────────
    if (existingSubTaskIds.length > 0) {
      // Delete all existing staff for this project's subtasks
      const { error: deleteStaffError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .delete()
        .in("project_sub_task_id", existingSubTaskIds);

      if (deleteStaffError) {
        return NextResponse.json(
          { error: "Failed to clear staff assignments.", details: deleteStaffError.message },
          { status: 500 },
        );
      }

      // Confirm which of the cached subtask IDs actually exist in the DB
      // right now — staff assignments referencing a deleted subtask would
      // FK-fail the insert. The earlier project_task delete cascades into
      // project_sub_task, so cache rows from a removed main task become
      // orphans here.
      const { data: liveSubTaskRows } = await supabaseAdmin
        .from("project_sub_task")
        .select("project_sub_task_id")
        .in("project_sub_task_id", existingSubTaskIds);

      const liveSubTaskIds = new Set(
        (liveSubTaskRows ?? []).map(
          (r) => r.project_sub_task_id as string,
        ),
      );

      // Insert current assignments
      const staffRows = subTasks.flatMap((st) =>
        liveSubTaskIds.has(st.id)
          ? (st.assignedEmployeeIds ?? []).map((userId) => ({
              project_sub_task_id: st.id,
              user_id: userId,
              role: "staff",
              assignment_status: "assigned",
            }))
          : [],
      );

      if (staffRows.length > 0) {
        const { error: insertStaffError } = await supabaseAdmin
          .from("project_sub_task_staff")
          .insert(staffRows);

        if (insertStaffError) {
          console.error(
            "[batchSaveProject] insert project_sub_task_staff failed:",
            insertStaffError,
            "rows sample:",
            staffRows.slice(0, 3),
          );
          return NextResponse.json(
            {
              error: "Failed to save staff assignments.",
              details: insertStaffError.message,
              code: insertStaffError.code ?? null,
              hint: insertStaffError.hint ?? null,
            },
            { status: 500 },
          );
        }
      }
    }

    // ─── 5. Compute and save cost estimation ──────────────────────────────────
    // Build the cost estimation input from the same data we just saved
    const staffUserIds = Array.from(
      new Set(subTasks.flatMap((st) => st.assignedEmployeeIds ?? [])),
    );

    let staffWageMap = new Map<string, number>();
    if (staffUserIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from("users")
        .select("id, hourly_wage")
        .in("id", staffUserIds);

      for (const row of staffRows ?? []) {
        staffWageMap.set(row.id, Number(row.hourly_wage ?? 0));
      }
    }

    const costMainTasks: CostEstimationMainTask[] = mainTasks.map((mt, i) => {
      const ptId = ptIdMap.get(mt.id) ?? mt.project_task_id ?? mt.id;
      const taskSubTasks = subTasks.filter((st) => st.mainTaskId === mt.id);
      const taskMaterials = materials.filter((m) => m.projectTaskId === ptId);

      return {
        projectTaskId: ptId,
        mainTaskId: mt.id,
        title: mt.name,
        sortOrder: i,
        materials: taskMaterials.map((m) => ({
          projectTaskMaterialId: m.id,
          materialId: m.materialId,
          name: m.name,
          unit: m.unit,
          estimatedQuantity: m.quantity,
          unitCost: m.unitCost,
          estimatedCost: m.estimatedCost,
        })),
        subtasks: taskSubTasks.map((st) => ({
          projectSubTaskId: st.id,
          subTaskId: st.subTaskId,
          title: st.title,
          estimatedHours: st.estimatedHours ?? 0,
          assignedStaff: (st.assignedEmployeeIds ?? []).map((uid) => ({
            id: uid,
            name: "",
            hourlyWage: staffWageMap.get(uid) ?? 0,
          })),
          equipment: (st.equipments ?? []).map((eq) => ({
            id: eq.id,
            equipmentId: eq.equipmentId,
            name: eq.name,
            quantity: eq.quantity,
            unitCost: eq.unitCost,
          })),
          scheduledStartDatetime: st.scheduledStartDatetime,
          scheduledEndDatetime: st.scheduledEndDatetime,
        })),
      };
    });

    const costInput: CostEstimationInput = {
      project: {
        projectId,
        projectCode: null,
        title: null,
        description: null,
        siteAddress: null,
        status,
      },
      markupRate,
      mainTasks: costMainTasks,
    };

    const estimation = calculateProjectCostEstimation(costInput);

    // ─── 6. Update project record ─────────────────────────────────────────────
    const { error: projectUpdateError } = await supabaseAdmin
      .from("projects")
      .update({
        status,
        estimated_cost: estimation.summary.totalCost,
        estimated_budget: estimation.summary.quotationTotal,
        materials_cost: estimation.summary.materialTotal,
        labor_cost: estimation.summary.laborTotal,
        markup_rate: markupRate,
        updated_at: timestamp,
      })
      .eq("project_id", projectId);

    if (projectUpdateError) {
      return NextResponse.json(
        { error: "Failed to update project.", details: projectUpdateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      summary: estimation.summary,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error during batch save.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
