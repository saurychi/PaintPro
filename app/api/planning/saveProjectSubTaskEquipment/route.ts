import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
            equipment_id: equipment.id,
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
