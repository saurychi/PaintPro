import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  collectEquipmentUsageIds,
  collectLegacyEquipmentNames,
  parseEquipmentUsage,
} from "@/lib/planning/equipmentUsage";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("project_sub_task")
      .select(`
        project_sub_task_id,
        sub_task_id,
        equipments_used,
        status,
        sub_task (
          sub_task_id,
          description,
          sort_order:default_sort_order
        ),
        project_task (
          project_task_id,
          main_task_id,
          main_task (
            main_task_id,
            name,
            sort_order:default_sort_order
          )
        )
      `)
      .eq("project_task.project_id", projectId);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch project subtask equipment." },
        { status: 500 },
      );
    }

    const equipmentIds = collectEquipmentUsageIds(
      (rows ?? []).map((row: any) => row.equipments_used),
    );

    const equipmentNames = collectLegacyEquipmentNames(
      (rows ?? []).map((row: any) => row.equipments_used),
    );

    let equipmentById = new Map<string, any>();
    let equipmentByName = new Map<string, any>();

    if (equipmentIds.length > 0) {
      const { data: equipmentRowsById, error: equipmentByIdError } =
        await supabaseAdmin
          .from("equipment")
          .select(`
            equipment_id,
            name,
            unit_cost,
            condition,
            location,
            status
          `)
          .in("equipment_id", equipmentIds);

      if (equipmentByIdError) {
        return NextResponse.json(
          {
            error:
              equipmentByIdError.message ||
              "Failed to resolve equipment details.",
          },
          { status: 500 },
        );
      }

      equipmentById = new Map(
        (equipmentRowsById ?? []).map((item: any) => [item.equipment_id, item]),
      );
    }

    if (equipmentNames.length > 0) {
      const { data: equipmentRowsByName, error: equipmentByNameError } =
        await supabaseAdmin
          .from("equipment")
          .select(`
            equipment_id,
            name,
            unit_cost,
            condition,
            location,
            status
          `)
          .in("name", equipmentNames);

      if (equipmentByNameError) {
        return NextResponse.json(
          {
            error:
              equipmentByNameError.message ||
              "Failed to resolve equipment details.",
          },
          { status: 500 },
        );
      }

      equipmentByName = new Map(
        (equipmentRowsByName ?? []).map((item: any) => [item.name, item]),
      );
    }

    const projectSubTaskEquipment = (rows ?? []).map((row: any) => {
      const used = parseEquipmentUsage(row.equipments_used);

      return {
        project_sub_task_id: row.project_sub_task_id,
        sub_task_id: row.sub_task_id,
        status: row.status ?? "pending",
        assigned_user: row.assigned_user ?? null,
        sub_task: row.sub_task,
        project_task: row.project_task,
        equipments: used.map((item, index: number) => {
          const equipment =
            equipmentById.get(item.equipmentId) ??
            equipmentByName.get(item.legacyName);
          const resolvedName =
            equipment?.name || item.legacyName || "Unknown Equipment";
          const resolvedEquipmentId =
            equipment?.equipment_id || item.equipmentId || "";
          const rowId =
            resolvedEquipmentId ||
            `${row.project_sub_task_id}-${index}-${resolvedName}`;

          return {
            id: rowId,
            equipmentId: resolvedEquipmentId,
            quantity: item.quantity,
            name: resolvedName,
            unitCost: Number(equipment?.unit_cost ?? 0),
            condition: equipment?.condition ?? "",
            location: equipment?.location ?? "",
            status: equipment?.status ?? "",
            notes: item.notes,
          };
        }),
      };
    });

    return NextResponse.json({ projectSubTaskEquipment });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected error while fetching project subtask equipment." },
      { status: 500 },
    );
  }
}
