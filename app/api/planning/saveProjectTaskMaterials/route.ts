import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, groups } = body;

    if (!projectId || !Array.isArray(groups)) {
      return NextResponse.json(
        { error: "Missing projectId or groups." },
        { status: 400 },
      );
    }

    for (const group of groups) {
      const { projectTaskId, materials } = group;

      if (!projectTaskId) continue;

      const { error: deleteError } = await supabaseAdmin
        .from("project_task_material")
        .delete()
        .eq("project_task_id", projectTaskId);

      if (deleteError) {
        return NextResponse.json(
          {
            error: "Failed to clear existing materials.",
            details: deleteError.message,
          },
          { status: 500 },
        );
      }

      if (!Array.isArray(materials) || materials.length === 0) continue;

      const validRows = materials
        .filter((m: any) => m?.materialId)
        .map((m: any) => ({
          project_task_id: projectTaskId,
          material_id: m.materialId,
          estimated_quantity: Number(m.quantity ?? 0),
          estimated_cost: Number(m.estimatedCost ?? 0),
        }));

      if (validRows.length === 0) continue;

      const { error: insertError } = await supabaseAdmin
        .from("project_task_material")
        .insert(validRows);

      if (insertError) {
        return NextResponse.json(
          {
            error: "Failed to save materials.",
            details: insertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving project task materials.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
