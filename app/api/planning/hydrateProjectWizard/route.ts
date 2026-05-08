import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  parseEquipmentUsage,
  collectEquipmentUsageIds,
} from "@/lib/planning/equipmentUsage";

/**
 * GET /api/planning/hydrateProjectWizard?projectId=...
 *
 * Returns ALL project wizard data in a single call so the client can seed
 * the sessionStorage wizard cache when no cache exists (e.g. page refresh,
 * direct URL, new tab).
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    // ─── 1. Project metadata ──────────────────────────────────────────────────
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select(
        "project_id, project_code, title, site_address, description, client_id, status, markup_rate",
      )
      .eq("project_id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found.", details: projectError?.message },
        { status: 404 },
      );
    }

    // ─── 2. Main tasks (project_task + main_task join) ────────────────────────
    const { data: projectTasks, error: ptError } = await supabaseAdmin
      .from("project_task")
      .select(
        `
        project_task_id,
        main_task_id,
        sort_order,
        main_task:main_task_id (
          main_task_id,
          name
        )
      `,
      )
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (ptError) {
      return NextResponse.json(
        { error: "Failed to load project tasks.", details: ptError.message },
        { status: 500 },
      );
    }

    const mainTasks = (projectTasks ?? []).map((row: any) => ({
      id: row.main_task_id,
      name: row.main_task?.name ?? "Main Task",
      project_task_id: row.project_task_id,
    }));

    const projectTaskIds = (projectTasks ?? []).map(
      (row: any) => row.project_task_id,
    );

    // ─── 3. Subtasks ──────────────────────────────────────────────────────────
    let subTasks: any[] = [];

    if (projectTaskIds.length > 0) {
      const { data: subTaskRows, error: stError } = await supabaseAdmin
        .from("project_sub_task")
        .select(
          `
          project_sub_task_id,
          project_task_id,
          sub_task_id,
          estimated_hours,
          sort_order,
          scheduled_start_datetime,
          scheduled_end_datetime,
          equipments_used,
          sub_task:sub_task_id (
            sub_task_id,
            description
          ),
          project_task:project_task_id (
            main_task_id
          )
        `,
        )
        .in("project_task_id", projectTaskIds)
        .order("sort_order", { ascending: true });

      if (stError) {
        return NextResponse.json(
          { error: "Failed to load subtasks.", details: stError.message },
          { status: 500 },
        );
      }

      // Resolve equipment names
      const allEquipmentIds = collectEquipmentUsageIds(
        (subTaskRows ?? []).map((r: any) => r.equipments_used),
      );

      let equipmentMap = new Map<string, string>();
      if (allEquipmentIds.length > 0) {
        const { data: eqRows } = await supabaseAdmin
          .from("equipment")
          .select("equipment_id, name")
          .in("equipment_id", allEquipmentIds);

        for (const row of eqRows ?? []) {
          equipmentMap.set(row.equipment_id, row.name);
        }
      }

      // Staff assignments for all subtasks
      const projectSubTaskIds = (subTaskRows ?? []).map(
        (r: any) => r.project_sub_task_id,
      );

      let staffBySubTask = new Map<string, string[]>();
      if (projectSubTaskIds.length > 0) {
        const { data: staffRows } = await supabaseAdmin
          .from("project_sub_task_staff")
          .select("project_sub_task_id, user_id")
          .in("project_sub_task_id", projectSubTaskIds);

        for (const row of staffRows ?? []) {
          const current = staffBySubTask.get(row.project_sub_task_id) ?? [];
          current.push(row.user_id);
          staffBySubTask.set(row.project_sub_task_id, current);
        }
      }

      subTasks = (subTaskRows ?? []).map((row: any) => {
        const parsed = parseEquipmentUsage(row.equipments_used);
        return {
          id: row.project_sub_task_id,
          subTaskId: row.sub_task_id,
          mainTaskId: row.project_task?.main_task_id ?? "",
          projectTaskId: row.project_task_id,
          title: row.sub_task?.description ?? "",
          sortOrder: row.sort_order ?? 0,
          estimatedHours: row.estimated_hours,
          scheduledStartDatetime: row.scheduled_start_datetime,
          scheduledEndDatetime: row.scheduled_end_datetime,
          assignedEmployeeIds: staffBySubTask.get(row.project_sub_task_id) ?? [],
          equipments: parsed.map((eq, idx) => ({
            id:
              eq.equipmentId ||
              `${row.project_sub_task_id}-${idx}-${eq.legacyName}`,
            equipmentId: eq.equipmentId || null,
            name: equipmentMap.get(eq.equipmentId) || eq.legacyName || "Unknown",
            quantity: eq.quantity,
            unitCost: 0,
            notes: eq.notes,
          })),
        };
      });
    }

    // ─── 4. Materials ─────────────────────────────────────────────────────────
    let materials: any[] = [];

    if (projectTaskIds.length > 0) {
      const { data: matRows, error: matError } = await supabaseAdmin
        .from("project_task_material")
        .select(
          `
          project_task_material_id,
          project_task_id,
          material_id,
          estimated_quantity,
          estimated_cost,
          material:material_id (
            material_id,
            name,
            unit,
            unit_cost
          )
        `,
        )
        .in("project_task_id", projectTaskIds);

      if (matError) {
        return NextResponse.json(
          { error: "Failed to load materials.", details: matError.message },
          { status: 500 },
        );
      }

      materials = (matRows ?? []).map((row: any) => ({
        id: row.project_task_material_id,
        projectTaskId: row.project_task_id,
        materialId: row.material?.material_id ?? row.material_id ?? "",
        name: row.material?.name ?? "",
        unit: row.material?.unit ?? null,
        quantity: Number(row.estimated_quantity ?? 0),
        unitCost: Number(row.material?.unit_cost ?? 0),
        estimatedCost: Number(row.estimated_cost ?? 0),
      }));
    }

    // ─── 5. Reference data (catalogs) ─────────────────────────────────────────
    // Staff users
    const { data: staffUsers } = await supabaseAdmin
      .from("users")
      .select("id, username, email, role, hourly_wage, profile_image_url, specialty")
      .eq("role", "staff")
      .eq("status", "active")
      .order("username", { ascending: true });

    // Equipment catalog
    const { data: equipmentCatalog } = await supabaseAdmin
      .from("equipment")
      .select("equipment_id, name, status")
      .order("name", { ascending: true });

    // Material catalog
    const { data: materialCatalog } = await supabaseAdmin
      .from("materials")
      .select("material_id, name, unit, unit_cost, current_in_stock")
      .order("name", { ascending: true });

    // ─── 6. Build response ────────────────────────────────────────────────────
    return NextResponse.json({
      projectId: project.project_id,
      projectCode: project.project_code,
      projectTitle: project.title,
      siteAddress: project.site_address,
      description: project.description,
      clientId: project.client_id,
      status: project.status,
      mainTasks,
      subTasks,
      materials,
      markupRate: Number(project.markup_rate ?? 30),
      refData: {
        staffUsers: staffUsers ?? [],
        equipmentCatalog: (equipmentCatalog ?? []).map((item: any) => ({
          id: item.equipment_id,
          name: item.name,
          unitCost: 0,
          status: item.status ?? "",
        })),
        materialCatalog: (materialCatalog ?? []).map((item: any) => ({
          material_id: item.material_id,
          name: item.name,
          unit: item.unit,
          unit_cost: Number(item.unit_cost ?? 0),
          current_in_stock: Number(item.current_in_stock ?? 0),
        })),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error during project hydration.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
