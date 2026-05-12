import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays";
import {
  addHoursToIso,
  buildUnavailableDateSet,
  snapStartPastUnavailableSpan,
} from "@/lib/schedule/snapPastUnavailable";
import { cascadeShiftLaterSubtasks } from "@/lib/schedule/cascadeShift";

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

    // Snap the start past any holiday / manual block so an edit can't
    // persist a subtask whose span touches a red day.
    const unavailableDays = await listScheduleUnavailableDays(
      request.headers.get("cookie"),
    );
    const unavailableSet = buildUnavailableDateSet(
      unavailableDays.map((day) => day.blockedDate),
    );
    const snapped = snapStartPastUnavailableSpan(
      body.scheduledStartDatetime || null,
      estimatedHours,
      unavailableSet,
    );
    const scheduledStartDatetime = snapped.iso;
    const scheduledEndDatetime =
      snapped.skippedDays > 0 || !body.scheduledEndDatetime
        ? addHoursToIso(scheduledStartDatetime, estimatedHours)
        : body.scheduledEndDatetime;

    // Snapshot the OLD scheduled bounds before the update so the
    // cascade can anchor on where this subtask used to sit and shift
    // every later sibling by the corresponding delta.
    const { data: existingRows } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, scheduled_start_datetime, scheduled_end_datetime",
      )
      .eq("project_sub_task_id", projectSubTaskId)
      .limit(1);

    const existing = existingRows?.[0] ?? null;
    const previousStartDate = existing?.scheduled_start_datetime
      ? new Date(existing.scheduled_start_datetime)
      : null;
    const previousEndDate = existing?.scheduled_end_datetime
      ? new Date(existing.scheduled_end_datetime)
      : null;
    const previousStartMs =
      previousStartDate && !Number.isNaN(previousStartDate.getTime())
        ? previousStartDate.getTime()
        : null;
    const previousEndMs =
      previousEndDate && !Number.isNaN(previousEndDate.getTime())
        ? previousEndDate.getTime()
        : null;

    const { error: subTaskError } = await supabaseAdmin
      .from("project_sub_task")
      .update({
        estimated_hours: estimatedHours,
        scheduled_start_datetime: scheduledStartDatetime,
        scheduled_end_datetime: scheduledEndDatetime,
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

    // Cascade-shift every later subtask so the chain stays consistent
    // with the edited end. Fired as a background task: each shift
    // emits a realtime UPDATE the dashboard patches in place, so the
    // response can return as soon as the primary write lands.
    if (previousStartMs !== null && previousEndMs !== null) {
      const newEndDate = scheduledEndDatetime
        ? new Date(scheduledEndDatetime)
        : null;
      const newEndMs =
        newEndDate && !Number.isNaN(newEndDate.getTime())
          ? newEndDate.getTime()
          : null;

      if (newEndMs !== null) {
        void cascadeShiftLaterSubtasks({
          anchorSubTaskId: projectSubTaskId,
          projectTaskId,
          originalScheduledStartMs: previousStartMs,
          originalScheduledEndMs: previousEndMs,
          referenceEndMs: newEndMs,
          timestampIso: timestamp,
        })
          .then((result) => {
            if (result.error) {
              console.error(
                "[updateGeneratedSubTask] background cascade shift failed:",
                result.error,
              );
            }
          })
          .catch((err: unknown) => {
            console.error(
              "[updateGeneratedSubTask] background cascade shift threw:",
              err instanceof Error ? err.message : String(err),
            );
          });
      }
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
