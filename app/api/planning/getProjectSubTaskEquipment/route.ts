import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

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

    const equipmentIds = Array.from(
      new Set(
        (rows ?? []).flatMap((row: any) =>
          Array.isArray(row.equipments_used)
            ? row.equipments_used
                .map(
                  (item: any) =>
                    item?.equipment_id ?? item?.equipmentId ?? item?.id,
                )
                .filter(isUuid)
            : [],
        ),
      ),
    );

    const equipmentNames = Array.from(
      new Set(
        (rows ?? []).flatMap((row: any) =>
          Array.isArray(row.equipments_used)
            ? row.equipments_used
                .map((item: any) => item?.name)
                .filter(Boolean)
            : [],
        ),
      ),
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
      const used = Array.isArray(row.equipments_used) ? row.equipments_used : [];

      return {
        project_sub_task_id: row.project_sub_task_id,
        sub_task_id: row.sub_task_id,
        status: row.status ?? "pending",
        assigned_user: row.assigned_user ?? null,
        sub_task: row.sub_task,
        project_task: row.project_task,
        equipments: used.map((item: any, index: number) => {
          const rawEquipmentId =
            item?.equipment_id ?? item?.equipmentId ?? item?.id ?? "";
          const equipmentId = isUuid(rawEquipmentId) ? rawEquipmentId : "";
          const equipmentName = item?.name ?? "";
          const equipment =
            equipmentById.get(equipmentId) ?? equipmentByName.get(equipmentName);
          const resolvedName =
            equipment?.name || equipmentName || "Unknown Equipment";
          const resolvedEquipmentId = equipment?.equipment_id || equipmentId || "";
          const rowId =
            resolvedEquipmentId ||
            `${row.project_sub_task_id}-${index}-${resolvedName}`;

          return {
            id: rowId,
            equipmentId: resolvedEquipmentId,
            quantity: Number(item.quantity ?? 1),
            name: resolvedName,
            unitCost: Number(equipment?.unit_cost ?? 0),
            condition: equipment?.condition ?? "",
            location: equipment?.location ?? "",
            status: equipment?.status ?? "",
            notes: item?.notes ?? null,
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
