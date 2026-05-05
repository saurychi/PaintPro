import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";

type MaterialInput = {
  materialId?: string;
  quantity?: number;
  estimatedCost?: number;
};

type UpdateGeneratedSubTaskBody = {
  projectTaskId?: string;
  projectSubTaskId?: string;
  estimatedHours?: number | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
  employeeIds?: string[];
  equipment?: unknown[];
  materials?: MaterialInput[];
};

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UpdateGeneratedSubTaskBody;
    const projectTaskId =
      typeof body?.projectTaskId === "string" ? body.projectTaskId.trim() : "";
    const projectSubTaskId =
      typeof body?.projectSubTaskId === "string"
        ? body.projectSubTaskId.trim()
        : "";

    if (!projectTaskId || !projectSubTaskId) {
      return NextResponse.json(
        { error: "Missing projectTaskId or projectSubTaskId." },
        { status: 400 },
      );
    }

    const timestamp = new Date().toISOString();
    const estimatedHours =
      typeof body.estimatedHours === "number" &&
      Number.isFinite(body.estimatedHours)
        ? Math.max(0, body.estimatedHours)
        : null;

    const { error: subTaskError } = await supabaseAdmin
      .from("project_sub_task")
      .update({
        estimated_hours: estimatedHours,
        scheduled_start_datetime: body.scheduledStartDatetime || null,
        scheduled_end_datetime: body.scheduledEndDatetime || null,
        equipments_used: normalizeEquipmentUsageForStorage(body.equipment ?? []),
        updated_at: timestamp,
      })
      .eq("project_sub_task_id", projectSubTaskId);

    if (subTaskError) {
      return NextResponse.json(
        {
          error: "Failed to update generated subtask.",
          details: subTaskError.message,
        },
        { status: 500 },
      );
    }

    const { error: staffDeleteError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .delete()
      .eq("project_sub_task_id", projectSubTaskId);

    if (staffDeleteError) {
      return NextResponse.json(
        {
          error: "Failed to clear employee assignments.",
          details: staffDeleteError.message,
        },
        { status: 500 },
      );
    }

    const employeeIds = normalizeStringArray(body.employeeIds);

    if (employeeIds.length > 0) {
      const { error: staffInsertError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .insert(
          employeeIds.map((userId) => ({
            project_sub_task_id: projectSubTaskId,
            user_id: userId,
            role: "staff",
            assignment_status: "assigned",
          })),
        );

      if (staffInsertError) {
        return NextResponse.json(
          {
            error: "Failed to save employee assignments.",
            details: staffInsertError.message,
          },
          { status: 500 },
        );
      }
    }

    const { error: materialDeleteError } = await supabaseAdmin
      .from("project_task_material")
      .delete()
      .eq("project_task_id", projectTaskId);

    if (materialDeleteError) {
      return NextResponse.json(
        {
          error: "Failed to clear materials.",
          details: materialDeleteError.message,
        },
        { status: 500 },
      );
    }

    const materialRows = Array.isArray(body.materials)
      ? body.materials
          .filter((item) => item?.materialId)
          .map((item) => ({
            project_task_id: projectTaskId,
            material_id: String(item.materialId),
            estimated_quantity: Number(item.quantity ?? 0),
            estimated_cost: Number(item.estimatedCost ?? 0),
          }))
      : [];

    if (materialRows.length > 0) {
      const { error: materialInsertError } = await supabaseAdmin
        .from("project_task_material")
        .insert(materialRows);

      if (materialInsertError) {
        return NextResponse.json(
          {
            error: "Failed to save materials.",
            details: materialInsertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
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
