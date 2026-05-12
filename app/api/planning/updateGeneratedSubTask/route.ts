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
import {
  placeWorkSpan,
  snapToNextWorkingMoment,
} from "@/lib/schedule/workHours";

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
    let scheduledStartDatetime: string | null = snapped.iso;
    let scheduledEndDatetime: string | null =
      snapped.skippedDays > 0 || !body.scheduledEndDatetime
        ? addHoursToIso(scheduledStartDatetime, estimatedHours)
        : body.scheduledEndDatetime ?? null;

    // Server-side defense: even if the modal's client-side validation
    // is bypassed (curl, stale tab, etc.), make sure the persisted
    // start lands inside the work calendar. snapToNextWorkingMoment
    // pushes 17:00 → next-day 09:00, lunch → 13:00, pre-09:00 → 09:00,
    // and rolls over Sundays / blocked days. placeWorkSpan then
    // re-derives the end so the saved row matches what the dashboard
    // would render via the same helpers.
    if (scheduledStartDatetime) {
      const beforeSnap = new Date(scheduledStartDatetime);
      if (!Number.isNaN(beforeSnap.getTime())) {
        const afterSnap = snapToNextWorkingMoment(
          beforeSnap,
          unavailableSet,
        );
        if (afterSnap.getTime() !== beforeSnap.getTime()) {
          if (
            typeof estimatedHours === "number" &&
            estimatedHours > 0
          ) {
            const placed = placeWorkSpan(
              afterSnap,
              estimatedHours,
              unavailableSet,
            );
            scheduledStartDatetime = placed.start.toISOString();
            scheduledEndDatetime = placed.end.toISOString();
          } else {
            scheduledStartDatetime = afterSnap.toISOString();
            scheduledEndDatetime = afterSnap.toISOString();
          }
        }
      }
    }

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
    // with the edited end. Awaited so the response only returns after
    // the chain is coherent — every datetime change must propagate
    // through to later subtasks before the dashboard hears about it,
    // otherwise the admin sees the edited row in its new slot while
    // siblings sit at stale times for several seconds.
    let cascadeShifted = 0;
    let cascadeWarning: string | null = null;

    // Accept either bound as the anchor when only one is known —
    // mirrors the relaxed gate in updateSubTaskStatus so a row with a
    // missing scheduled_end still triggers a cascade.
    const anchorPreviousStartMs = previousStartMs ?? previousEndMs;
    const anchorPreviousEndMs = previousEndMs ?? previousStartMs;
    const newEndDate = scheduledEndDatetime
      ? new Date(scheduledEndDatetime)
      : null;
    const newStartDate = scheduledStartDatetime
      ? new Date(scheduledStartDatetime)
      : null;
    const newEndMs =
      newEndDate && !Number.isNaN(newEndDate.getTime())
        ? newEndDate.getTime()
        : newStartDate && !Number.isNaN(newStartDate.getTime())
          ? newStartDate.getTime()
          : null;

    if (
      anchorPreviousStartMs !== null &&
      anchorPreviousEndMs !== null &&
      newEndMs !== null
    ) {
      try {
        const cascadeResult = await cascadeShiftLaterSubtasks({
          anchorSubTaskId: projectSubTaskId,
          projectTaskId,
          originalScheduledStartMs: anchorPreviousStartMs,
          originalScheduledEndMs: anchorPreviousEndMs,
          referenceEndMs: newEndMs,
          timestampIso: timestamp,
        });

        if (cascadeResult.error) {
          console.error(
            "[updateGeneratedSubTask] cascade shift failed:",
            cascadeResult.error,
          );
          cascadeWarning = cascadeResult.error;
        } else {
          cascadeShifted = cascadeResult.shifted;
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "Unknown error");
        console.error(
          "[updateGeneratedSubTask] cascade shift threw:",
          message,
        );
        cascadeWarning = message;
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

    return NextResponse.json({
      success: true,
      cascadeShifted,
      cascadeWarning,
    });
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
