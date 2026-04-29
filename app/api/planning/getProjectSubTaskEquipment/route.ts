import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    let equipmentMap = new Map<string, any>();

    if (equipmentNames.length > 0) {
      const { data: equipmentRows, error: equipmentError } = await supabaseAdmin
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

      if (equipmentError) {
        return NextResponse.json(
          { error: equipmentError.message || "Failed to resolve equipment details." },
          { status: 500 },
        );
      }

      equipmentMap = new Map(
        (equipmentRows ?? []).map((item: any) => [item.name, item]),
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
          const equipmentName = item?.name ?? "Unknown Equipment";
          const equipment = equipmentMap.get(equipmentName);

          return {
            id: equipment?.equipment_id ?? `${row.project_sub_task_id}-${index}-${equipmentName}`,
            quantity: Number(item.quantity ?? 1),
            name: equipment?.name ?? equipmentName,
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
