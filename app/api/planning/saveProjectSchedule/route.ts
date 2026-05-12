import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays";
import {
  addHoursToIso,
  buildUnavailableDateSet,
  snapStartPastUnavailableSpan,
} from "@/lib/schedule/snapPastUnavailable";
// snapStartPastUnavailableSpan only handles non-working DAYS (Sundays +
// the blocked list). We also need to clamp out-of-hours starts
// (e.g. 17:00, lunch, before 09:00) so a buggy client payload can't
// persist a subtask whose start sits outside the work calendar.
import {
  placeWorkSpan,
  snapToNextWorkingMoment,
} from "@/lib/schedule/workHours";

type ScheduleItem = {
  projectSubTaskId?: string;
  estimatedHours?: number | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
};

type SaveProjectScheduleBody = {
  projectId?: string;
  nextStatus?: string;
  schedules?: ScheduleItem[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveProjectScheduleBody;
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const schedules = Array.isArray(body?.schedules) ? body.schedules : [];
    const nextStatus =
      typeof body?.nextStatus === "string" && body.nextStatus.trim()
        ? body.nextStatus.trim()
        : null;

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    if (schedules.length === 0) {
      return NextResponse.json(
        { error: "No schedules provided." },
        { status: 400 },
      );
    }

    const timestamp = new Date().toISOString();

    // Server-side defense: snap every row's start past unavailable days and
    // recompute its end from estimatedHours, so a stale or buggy client
    // payload can't persist subtasks on holidays / manual blocks. The fetch
    // is best-effort — if it fails (DB error, holiday API outage), we still
    // persist what the client sent rather than 500'ing the whole save. The
    // page's own auto-normalize-on-load pass will catch any drift on next
    // open.
    let unavailableSet = new Set<string>();
    try {
      const unavailableDays = await listScheduleUnavailableDays(
        request.headers.get("cookie"),
      );
      unavailableSet = buildUnavailableDateSet(
        unavailableDays.map((day) => day.blockedDate),
      );
    } catch (error) {
      console.error(
        "[saveProjectSchedule] unavailable-days fetch failed; persisting client values without snap:",
        error,
      );
    }

    const scheduleRows = (schedules as ScheduleItem[])
      .filter((item) => item?.projectSubTaskId)
      .map((item) => {
        const estimatedHours =
          typeof item.estimatedHours === "number" ? item.estimatedHours : null;

        // Stage 1: snap past blocked DAYS (Sundays + holiday/manual list).
        // Pure day-level math, preserves time-of-day.
        const snapped = snapStartPastUnavailableSpan(
          item.scheduledStartDatetime ?? null,
          estimatedHours,
          unavailableSet,
        );

        // Stage 2: snap the time-of-day into the working window. The
        // client (e.g. the schedule wizard's drag-and-drop) could send
        // a moment at 17:00, mid-lunch, or before 09:00; without this
        // step we'd persist it verbatim and the dashboard would
        // happily render a task that starts after the workday is over.
        // snapToNextWorkingMoment is idempotent on values that are
        // already valid, so well-behaved payloads are untouched.
        let scheduledStart: string | null = snapped.iso;
        let scheduledEnd: string | null =
          snapped.skippedDays > 0 || !item.scheduledEndDatetime
            ? addHoursToIso(scheduledStart, estimatedHours)
            : item.scheduledEndDatetime ?? null;

        if (scheduledStart) {
          const beforeSnap = new Date(scheduledStart);
          if (!Number.isNaN(beforeSnap.getTime())) {
            const afterSnap = snapToNextWorkingMoment(
              beforeSnap,
              unavailableSet,
            );
            if (afterSnap.getTime() !== beforeSnap.getTime()) {
              // Start moved into a new working block, so the end has to
              // be recomputed against the placed span — letting
              // placeWorkSpan carve out lunch / overnight / unavailable
              // days inside the new envelope.
              if (
                typeof estimatedHours === "number" &&
                estimatedHours > 0
              ) {
                const placed = placeWorkSpan(
                  afterSnap,
                  estimatedHours,
                  unavailableSet,
                );
                scheduledStart = placed.start.toISOString();
                scheduledEnd = placed.end.toISOString();
              } else {
                scheduledStart = afterSnap.toISOString();
                scheduledEnd = afterSnap.toISOString();
              }
            }
          }
        }

        return {
          project_sub_task_id: item.projectSubTaskId as string,
          estimated_hours: estimatedHours,
          scheduled_start_datetime: scheduledStart,
          scheduled_end_datetime: scheduledEnd,
          updated_at: timestamp,
        };
      });

    if (scheduleRows.length === 0) {
      return NextResponse.json(
        { error: "No valid schedules provided." },
        { status: 400 },
      );
    }

    const { error: scheduleError } = await supabaseAdmin
      .from("project_sub_task")
      .upsert(scheduleRows, {
        onConflict: "project_sub_task_id",
      });

    if (scheduleError) {
      console.error(
        "[saveProjectSchedule] upsert failed:",
        scheduleError,
        "rows:",
        scheduleRows,
      );
      return NextResponse.json(
        {
          error: "Failed to save project schedule.",
          details: scheduleError.message,
        },
        { status: 500 },
      );
    }

    if (nextStatus) {
      const { error: statusError } = await supabaseAdmin
        .from("projects")
        .update({
          status: nextStatus,
          updated_at: timestamp,
        })
        .eq("project_id", projectId);

      if (statusError) {
        return NextResponse.json(
          {
            error: "Failed to update project status.",
            details: statusError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      statusUpdated: Boolean(nextStatus),
    });
  } catch (error: any) {
    console.error("[saveProjectSchedule] unexpected error:", error);
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
