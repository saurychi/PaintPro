import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectSubTasks = Array.isArray(body?.projectSubTasks)
      ? body.projectSubTasks
      : [];

    if (projectSubTasks.length === 0) {
      return NextResponse.json(
        { error: "No projectSubTasks provided." },
        { status: 400 },
      );
    }

    for (const item of projectSubTasks) {
      if (!item?.project_sub_task_id) continue;

      const equipmentsUsed = Array.isArray(item?.equipments)
        ? item.equipments.map((equipment: any) => ({
            equipment_id: asUuidOrNull(equipment.equipmentId ?? equipment.id),
            name:
              typeof equipment.name === "string" ? equipment.name.trim() : "",
            quantity: Number(equipment.quantity ?? 1),
          }))
        : [];

      const { error } = await supabaseAdmin
        .from("project_sub_task")
        .update({
          equipments_used: equipmentsUsed,
        })
        .eq("project_sub_task_id", item.project_sub_task_id);

      if (error) {
        return NextResponse.json(
          {
            error: error.message || "Failed to save project subtask equipment.",
            project_sub_task_id: item.project_sub_task_id,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected error while saving project subtask equipment." },
      { status: 500 },
    );
  }
}
