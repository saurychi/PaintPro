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
  downpayment?: number;
  downpaymentRate?: number;
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
    const downpayment =
      typeof body?.downpayment === "number" && body.downpayment >= 0
        ? body.downpayment
        : null;
    const downpaymentRate =
      typeof body?.downpaymentRate === "number" && body.downpaymentRate >= 0
        ? Math.min(100, body.downpaymentRate)
        : null;
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
    // Split incoming subtasks into "already in DB" (real UUID id) and
    // "new this session" (temp-prefixed id from the manual-mode
    // auto-populate flow in main-task-assignment). Existing ones get
    // UPDATEd by project_sub_task_id; new ones get INSERTed and we
    // capture the real ids the DB hands back so downstream steps
    // (staff assignments, etc.) reference them instead of the temp ids.
    const TEMP_SUBTASK_ID_RE = /^temp-/;
    const newSubTasks = subTasks.filter(
      (st) => !st.id || TEMP_SUBTASK_ID_RE.test(st.id),
    );
    const existingSubTasks = subTasks.filter(
      (st) => st.id && !TEMP_SUBTASK_ID_RE.test(st.id),
    );

    // temp id → real project_sub_task_id, populated as we insert.
    const subTaskIdMap = new Map<string, string>();
    const liveSubTaskIds = new Set<string>(existingSubTasks.map((st) => st.id));

    if (newSubTasks.length > 0) {
      const insertableNewSubTasks = newSubTasks.filter((st) => {
        const projectTaskId = ptIdMap.get(st.mainTaskId) ?? st.projectTaskId;
        return Boolean(projectTaskId);
      });

      if (insertableNewSubTasks.length > 0) {
        const rowsToInsert = insertableNewSubTasks.map((st, idx) => ({
          project_task_id: ptIdMap.get(st.mainTaskId) ?? st.projectTaskId,
          sub_task_id: st.subTaskId,
          // project_sub_task.estimated_hours is NOT NULL — manual-mode
          // subtasks start without an estimate so default to 0 here.
          // The admin can adjust it on the project-schedule or
          // cost-estimation pages, and the existing UPDATE path
          // already accepts null when overwriting an estimate.
          estimated_hours: Number(st.estimatedHours ?? 0),
          scheduled_start_datetime: st.scheduledStartDatetime,
          scheduled_end_datetime: st.scheduledEndDatetime,
          equipments_used: normalizeEquipmentUsageForStorage(st.equipments),
          sort_order: typeof st.sortOrder === "number" ? st.sortOrder : idx,
          status: "pending",
        }));

        const { data: inserted, error: insertSubTasksError } =
          await supabaseAdmin
            .from("project_sub_task")
            .insert(rowsToInsert)
            .select("project_sub_task_id");

        if (insertSubTasksError) {
          console.error(
            "[batchSaveProject] insert project_sub_task failed:",
            insertSubTasksError,
            "rows sample:",
            rowsToInsert.slice(0, 3),
          );
          return NextResponse.json(
            {
              error: "Failed to insert new subtasks.",
              details: insertSubTasksError.message,
              code: insertSubTasksError.code ?? null,
              hint: insertSubTasksError.hint ?? null,
            },
            { status: 500 },
          );
        }

        const insertedRows = inserted ?? [];
        for (let i = 0; i < insertableNewSubTasks.length && i < insertedRows.length; i++) {
          const realId = insertedRows[i].project_sub_task_id as string;
          subTaskIdMap.set(insertableNewSubTasks[i].id, realId);
          liveSubTaskIds.add(realId);
        }
      }
    }

    // Update existing subtasks (schedule + equipment).
    // Process in small chunks rather than firing all updates in parallel —
    // a single Promise.all over dozens of requests can exhaust connection
    // limits (especially behind a VPN), causing Node to throw "fetch failed".
    if (existingSubTasks.length > 0) {
      const CHUNK_SIZE = 8;
      for (let i = 0; i < existingSubTasks.length; i += CHUNK_SIZE) {
        const chunk = existingSubTasks.slice(i, i + CHUNK_SIZE);
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
      // across sessions), translate via main_task_id when possible. Manual
      // mode seeds materials with the main_task_id directly (no project_task
      // row exists yet), so try ptIdMap as the primary lookup too. Drop
      // materials whose parent task no longer exists — they're orphans.
      const validPtIds = new Set<string>(ptIdMap.values());

      const orphanedMaterials: IncomingMaterial[] = [];
      const materialRows = materials
        .filter((m) => m.materialId)
        .map((m) => {
          let projectTaskId = m.projectTaskId;
          if (!validPtIds.has(projectTaskId)) {
            const staleMainTaskId =
              oldProjectTaskToMainTask.get(projectTaskId);
            const translated =
              ptIdMap.get(projectTaskId) ??
              (staleMainTaskId ? ptIdMap.get(staleMainTaskId) : undefined);
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
    if (liveSubTaskIds.size > 0) {
      const liveIds = Array.from(liveSubTaskIds);

      // Delete all existing staff for this project's subtasks
      const { error: deleteStaffError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .delete()
        .in("project_sub_task_id", liveIds);

      if (deleteStaffError) {
        return NextResponse.json(
          { error: "Failed to clear staff assignments.", details: deleteStaffError.message },
          { status: 500 },
        );
      }

      // Confirm which subtask IDs actually exist in the DB right now —
      // staff assignments referencing a deleted subtask would FK-fail
      // the insert. The earlier project_task delete cascades into
      // project_sub_task, so cache rows from a removed main task
      // become orphans here.
      const { data: liveSubTaskRows } = await supabaseAdmin
        .from("project_sub_task")
        .select("project_sub_task_id")
        .in("project_sub_task_id", liveIds);

      const liveIdsSet = new Set(
        (liveSubTaskRows ?? []).map(
          (r) => r.project_sub_task_id as string,
        ),
      );

      // Insert current assignments — temp ids from the cache need to be
      // resolved to the real DB ids we captured during the insert pass.
      const staffRows = subTasks.flatMap((st) => {
        const resolvedId = subTaskIdMap.get(st.id) ?? st.id;
        if (!liveIdsSet.has(resolvedId)) return [];
        return (st.assignedEmployeeIds ?? []).map((userId) => ({
          project_sub_task_id: resolvedId,
          user_id: userId,
          role: "staff",
          assignment_status: "assigned",
        }));
      });

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
    const projectUpdatePayload: Record<string, unknown> = {
      status,
      estimated_cost: estimation.summary.totalCost,
      estimated_budget: estimation.summary.quotationTotal,
      materials_cost: estimation.summary.materialTotal,
      labor_cost: estimation.summary.laborTotal,
      markup_rate: markupRate,
      updated_at: timestamp,
    };
    if (downpayment !== null) {
      projectUpdatePayload.downpayment = downpayment;
    }
    if (downpaymentRate !== null) {
      projectUpdatePayload.downpayment_rate = downpaymentRate;
    }

    const { error: projectUpdateError } = await supabaseAdmin
      .from("projects")
      .update(projectUpdatePayload)
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
