import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listScheduleUnavailableDays } from "@/lib/schedule/unavailableDays";
import { buildUnavailableDateSet } from "@/lib/schedule/snapPastUnavailable";
import {
  placeWorkSpan,
  snapToNextWorkingMoment,
} from "@/lib/schedule/workHours";

// POST /api/planning/shiftProjectSchedule
// Body: { projectId: string, offsetMs: number }
//
// Adds `offsetMs` (signed, in milliseconds) to every subtask's
// scheduled_start_datetime / scheduled_end_datetime that belongs to the
// given project, and to the project's own scheduled_start_datetime /
// scheduled_end_datetime. Used by the dashboard's "Start Project" flow to
// keep the rest of the schedule consistent when the user actually starts
// early or late versus the original plan.
//
// Negative offsetMs pulls the schedule earlier; positive pushes it later.
//
// Both the project and the subtasks are run through the same work-hour
// helpers as the rest of the scheduler (snapToNextWorkingMoment +
// placeWorkSpan) so a kickoff at 17:00 / on a Sunday / inside lunch
// can't persist a "starts at 5 PM" / similarly invalid value. This was
// the root cause of "Start of Work shows 5:00 PM" after a late kickoff.

export const runtime = "nodejs";

type SubTaskRow = {
  project_sub_task_id: string;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  estimated_hours: number | null;
};

function shiftIso(value: string | null, offsetMs: number): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + offsetMs).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const offsetMs = Number(body?.offsetMs);

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(offsetMs) || offsetMs === 0) {
      return NextResponse.json({ ok: true, shifted: 0 });
    }

    // Find every project_task for this project, then every subtask under
    // those tasks. We update in chunks to avoid firing dozens of parallel
    // requests against Supabase (same reason batchSaveProject chunks).
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id")
      .eq("project_id", projectId);

    if (tasksError) {
      return NextResponse.json(
        { error: "Failed to load project tasks.", details: tasksError.message },
        { status: 500 },
      );
    }

    const taskIds = (tasks ?? []).map((t) => t.project_task_id as string);
    let shifted = 0;

    // Load the blocked-day set once. snapToNextWorkingMoment and
    // placeWorkSpan both use it to push past holidays / manual blocks.
    let unavailableSet = new Set<string>();
    try {
      const days = await listScheduleUnavailableDays(
        request.headers.get("cookie"),
      );
      unavailableSet = buildUnavailableDateSet(
        days.map((day) => day.blockedDate),
      );
    } catch {
      // Soft failure: the snap still respects Sunday + work hours.
    }

    if (taskIds.length > 0) {
      const { data: subTasks, error: subError } = await supabaseAdmin
        .from("project_sub_task")
        .select(
          "project_sub_task_id, scheduled_start_datetime, scheduled_end_datetime, estimated_hours",
        )
        .in("project_task_id", taskIds);

      if (subError) {
        return NextResponse.json(
          { error: "Failed to load subtasks.", details: subError.message },
          { status: 500 },
        );
      }

      const updatable = (subTasks ?? []) as SubTaskRow[];
      const CHUNK_SIZE = 8;
      const timestamp = new Date().toISOString();

      for (let i = 0; i < updatable.length; i += CHUNK_SIZE) {
        const chunk = updatable.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map((row) => {
            const naiveStart = shiftIso(row.scheduled_start_datetime, offsetMs);
            const naiveEnd = shiftIso(row.scheduled_end_datetime, offsetMs);
            if (naiveStart === null && naiveEnd === null) {
              return Promise.resolve({ error: null as unknown as Error });
            }

            // Run the shifted start through snapToNextWorkingMoment so a
            // naive value at 17:00 (the common "started late" case) rolls
            // forward to the next valid working second. placeWorkSpan
            // re-derives the end from the original work hours so the row
            // stays inside the work calendar instead of bleeding past it.
            let newStart = naiveStart;
            let newEnd = naiveEnd;
            if (naiveStart) {
              const beforeSnap = new Date(naiveStart);
              if (!Number.isNaN(beforeSnap.getTime())) {
                const afterSnap = snapToNextWorkingMoment(
                  beforeSnap,
                  unavailableSet,
                );

                const estimatedWorkHours = Number(row.estimated_hours);
                const durationHours =
                  Number.isFinite(estimatedWorkHours) &&
                  estimatedWorkHours > 0
                    ? estimatedWorkHours
                    : 0;

                if (durationHours > 0) {
                  const placed = placeWorkSpan(
                    afterSnap,
                    durationHours,
                    unavailableSet,
                  );
                  newStart = placed.start.toISOString();
                  newEnd = placed.end.toISOString();
                } else {
                  newStart = afterSnap.toISOString();
                  newEnd = naiveEnd;
                }
              }
            }

            return supabaseAdmin
              .from("project_sub_task")
              .update({
                scheduled_start_datetime: newStart,
                scheduled_end_datetime: newEnd,
                updated_at: timestamp,
              })
              .eq("project_sub_task_id", row.project_sub_task_id);
          }),
        );
        const failed = results.find((r) => (r as { error: unknown }).error);
        if (failed && (failed as { error: { message?: string } }).error) {
          const errMsg = (failed as { error: { message?: string } }).error
            .message;
          return NextResponse.json(
            {
              error: "Failed to shift subtask schedule.",
              details: errMsg ?? "Unknown error",
            },
            { status: 500 },
          );
        }
        shifted += chunk.length;
      }
    }

    // Now shift the project's own scheduled start/end so admin/projects and
    // any other consumer of those fields stays accurate.
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("scheduled_start_datetime, scheduled_end_datetime")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: "Failed to load project.", details: projectError.message },
        { status: 500 },
      );
    }

    if (project) {
      const naiveStart = shiftIso(project.scheduled_start_datetime, offsetMs);
      const naiveEnd = shiftIso(project.scheduled_end_datetime, offsetMs);

      // Same snap as the subtasks so the project header on the dashboard
      // (Start of Work) never reads a stray boundary value like 17:00.
      let newStart = naiveStart;
      let newEnd = naiveEnd;
      if (naiveStart) {
        const beforeSnap = new Date(naiveStart);
        if (!Number.isNaN(beforeSnap.getTime())) {
          const afterSnap = snapToNextWorkingMoment(
            beforeSnap,
            unavailableSet,
          );
          newStart = afterSnap.toISOString();
        }
      }
      if (naiveEnd) {
        const beforeSnap = new Date(naiveEnd);
        if (!Number.isNaN(beforeSnap.getTime())) {
          const afterSnap = snapToNextWorkingMoment(
            beforeSnap,
            unavailableSet,
          );
          newEnd = afterSnap.toISOString();
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("projects")
        .update({
          scheduled_start_datetime: newStart,
          scheduled_end_datetime: newEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to shift project schedule.",
            details: updateError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, shifted, offsetMs });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error shifting schedule.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
