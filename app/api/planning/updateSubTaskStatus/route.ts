import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PROJECT_TIME_REFERENCE_COOKIE,
  resolveProjectTimeReferenceDate,
} from "@/lib/time/projectTimeReference";
import {
  buildUnavailableDateSet,
  snapStartPastUnavailableSpan,
} from "@/lib/schedule/snapPastUnavailable";
// Lunch (12-13 LOCAL), Sunday, and segment-aware placement live in
// lib/schedule/workHours so projectScheduling, the schedule-wizard
// drag/resize, and this cascade all enforce the same rules.
import { placeWorkSpan } from "@/lib/schedule/workHours";

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string | null;
  status: string | null;
  scheduled_start_datetime?: string | null;
  scheduled_end_datetime?: string | null;
  estimated_hours?: number | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string | null;
};

type ProjectRow = {
  status: string | null;
};

const CASCADE_THRESHOLD_MS = 60 * 1000;

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isFinishedSubTaskStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "cancelled"
  );
}

function isCompletionStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished"
  );
}

function canMoveProjectToReview(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "in_progress" ||
    normalized === "ongoing" ||
    normalized === "active"
  );
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftIso(value: string | null | undefined, deltaMs: number) {
  const date = parseDate(value);
  if (!date) return null;
  return new Date(date.getTime() + deltaMs).toISOString();
}

async function cascadeShiftLaterSubtasks(args: {
  finishingSubTaskId: string;
  projectTaskId: string;
  originalScheduledEndMs: number;
  // Actual finish time. The shift is computed so the IMMEDIATE next
  // subtask's start lines up with this value, then every later subtask
  // moves by the same offset (preserving their relative spacing).
  actualEndMs: number;
  timestampIso: string;
}): Promise<{ shifted: number; deltaMs: number; error: string | null }> {
  const { data: projectTaskRows, error: projectTaskError } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id, project_id")
    .eq("project_task_id", args.projectTaskId)
    .returns<ProjectTaskRow[]>();

  if (projectTaskError) {
    return { shifted: 0, deltaMs: 0, error: projectTaskError.message };
  }

  const projectId = projectTaskRows?.[0]?.project_id;
  if (!projectId) return { shifted: 0, deltaMs: 0, error: null };

  const { data: allProjectTaskRows, error: allProjectTasksError } =
    await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id")
      .eq("project_id", projectId)
      .returns<ProjectTaskRow[]>();

  if (allProjectTasksError) {
    return { shifted: 0, deltaMs: 0, error: allProjectTasksError.message };
  }

  const projectTaskIds = (allProjectTaskRows ?? []).map(
    (row) => row.project_task_id,
  );

  if (projectTaskIds.length === 0)
    return { shifted: 0, deltaMs: 0, error: null };

  const { data: subTaskRows, error: subTaskError } = await supabaseAdmin
    .from("project_sub_task")
    .select(
      "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime",
    )
    .in("project_task_id", projectTaskIds)
    .returns<ProjectSubTaskRow[]>();

  if (subTaskError) {
    return { shifted: 0, deltaMs: 0, error: subTaskError.message };
  }

  const candidates = (subTaskRows ?? []).filter((row) => {
    if (row.project_sub_task_id === args.finishingSubTaskId) return false;
    if (isFinishedSubTaskStatus(row.status)) return false;
    const startDate = parseDate(row.scheduled_start_datetime);
    if (!startDate) return false;
    return startDate.getTime() >= args.originalScheduledEndMs;
  });

  if (candidates.length === 0)
    return { shifted: 0, deltaMs: 0, error: null };

  // Find the immediate next subtask — the one with the earliest scheduled
  // start among the candidates. The delta we apply is computed relative to
  // THIS subtask, not to the finishing task's old end. That way:
  //   - if there was a gap between the finishing task and the next one,
  //     the gap closes (next task starts when previous actually ended);
  //   - if there was no gap, the behavior matches the old "shift by
  //     completion offset" exactly;
  //   - subsequent subtasks shift by the same delta, preserving the
  //     relative spacing between later subtasks.
  let earliestStartMs = Infinity;
  for (const row of candidates) {
    const startDate = parseDate(row.scheduled_start_datetime);
    if (!startDate) continue;
    if (startDate.getTime() < earliestStartMs) {
      earliestStartMs = startDate.getTime();
    }
  }
  if (!Number.isFinite(earliestStartMs))
    return { shifted: 0, deltaMs: 0, error: null };

  const deltaMs = args.actualEndMs - earliestStartMs;
  if (Math.abs(deltaMs) < CASCADE_THRESHOLD_MS) {
    // Already aligned within the threshold — nothing meaningful to shift.
    return { shifted: 0, deltaMs: 0, error: null };
  }

  // Load active unavailable days (manual blocks; holiday/manual list lives
  // in the same table) so the shifted times can be snapped past them.
  const { data: blockedRows } = await supabaseAdmin
    .from("unavailable_days")
    .select("blocked_start_datetime")
    .eq("is_active", true);
  const unavailableSet = buildUnavailableDateSet(
    (blockedRows ?? [])
      .map((row) => row.blocked_start_datetime as string | null)
      .filter((value): value is string => Boolean(value))
      // Cascade still operates per-day; slice the date portion off the
      // start datetime so buildUnavailableDateSet sees YYYY-MM-DD. Specific-
      // time blocks are treated as full-day for cascade purposes (a future
      // refinement could honor the time range).
      .map((iso) => iso.slice(0, 10)),
  );

  // Chunk the updates so we don't open dozens of parallel Supabase
  // connections at once. A single Promise.all over the full set produced
  // intermittent "TypeError: fetch failed" for projects with many later
  // subtasks (especially behind a VPN). Same pattern batchSaveProject uses.
  const CHUNK_SIZE = 8;
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    const updates = await Promise.all(
      chunk.map((row) => {
        // Naive shift first.
        const naiveStartIso = shiftIso(row.scheduled_start_datetime, deltaMs);
        const naiveEndIso = shiftIso(row.scheduled_end_datetime, deltaMs);

        // Preserve the original duration so end follows whatever start
        // ends up being after snap+lunch adjustments.
        const originalStart = parseDate(row.scheduled_start_datetime);
        const originalEnd = parseDate(row.scheduled_end_datetime);
        const originalDurationMs =
          originalStart && originalEnd
            ? originalEnd.getTime() - originalStart.getTime()
            : 0;
        const durationHours =
          originalDurationMs > 0 ? originalDurationMs / (60 * 60 * 1000) : 0;

        // Snap past unavailable days using the shared helper. If naive
        // start lands on (or its [start, end] span crosses) a blocked day,
        // start jumps forward to the first day where the whole span
        // clears.
        const snapped = snapStartPastUnavailableSpan(
          naiveStartIso,
          durationHours,
          unavailableSet,
        );

        let finalStart = snapped.iso ? new Date(snapped.iso) : null;
        let finalEnd =
          finalStart && originalDurationMs > 0
            ? new Date(finalStart.getTime() + originalDurationMs)
            : naiveEndIso
              ? new Date(naiveEndIso)
              : null;

        // Segment-aware placement: a span that crosses lunch / 17:00 /
        // a non-working day continues in the next available block, and
        // we store the envelope (first segment start, last segment end).
        if (finalStart && durationHours > 0) {
          const placed = placeWorkSpan(
            finalStart,
            durationHours,
            unavailableSet,
          );
          finalStart = placed.start;
          finalEnd = placed.end;
        }

        const payload: Record<string, unknown> = {
          updated_at: args.timestampIso,
        };
        if (finalStart)
          payload.scheduled_start_datetime = finalStart.toISOString();
        if (finalEnd) payload.scheduled_end_datetime = finalEnd.toISOString();

        return supabaseAdmin
          .from("project_sub_task")
          .update(payload)
          .eq("project_sub_task_id", row.project_sub_task_id);
      }),
    );

    const failed = updates.find((result) => result.error);
    if (failed?.error) {
      return { shifted: 0, deltaMs: 0, error: failed.error.message };
    }
  }

  return { shifted: candidates.length, deltaMs, error: null };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const referenceNow =
      resolveProjectTimeReferenceDate(
        cookieStore.get(PROJECT_TIME_REFERENCE_COOKIE)?.value ?? null,
      ) ?? new Date();
    const timestampIso = referenceNow.toISOString();

    const body = await request.json();
    const projectSubTaskId = String(body?.projectSubTaskId ?? "").trim();
    const status = String(body?.status ?? "").trim();

    if (!projectSubTaskId || !status) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId or status." },
        { status: 400 },
      );
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime, estimated_hours",
      )
      .eq("project_sub_task_id", projectSubTaskId)
      .returns<ProjectSubTaskRow[]>();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to load subtask.", details: existingError.message },
        { status: 500 },
      );
    }

    const existingSubTask = existingRows?.[0] ?? null;
    if (!existingSubTask) {
      return NextResponse.json({ error: "Subtask not found." }, { status: 404 });
    }

    const isCompleting = isCompletionStatus(status);
    const originalScheduledEndDate = parseDate(
      existingSubTask.scheduled_end_datetime,
    );

    // The finishing subtask keeps its original `scheduled_start_datetime`,
    // `scheduled_end_datetime`, and `estimated_hours` so the timing label
    // (`completion vs scheduled_start + estimated_hours`) can detect early/late.
    // `updated_at` records the actual completion time.
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: timestampIso,
    };

    const { error: updateError } = await supabaseAdmin
      .from("project_sub_task")
      .update(updatePayload)
      .eq("project_sub_task_id", projectSubTaskId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update subtask status.", details: updateError.message },
        { status: 500 },
      );
    }

    // Cascade runs in the background. Each subtask it shifts emits a
    // project_sub_task UPDATE that the dashboard's realtime
    // subscription patches in place — so the user sees the new times
    // land within ~1s of the response, instead of waiting for the
    // entire cascade to finish before getting "Done". For a project
    // with many remaining subtasks the cascade can take 1-3s to
    // chunk through; making it block the response was the main
    // source of the perceived "Finishing..." lag.
    if (
      isCompleting &&
      originalScheduledEndDate &&
      existingSubTask.project_task_id
    ) {
      const projectTaskId = existingSubTask.project_task_id;
      const originalScheduledEndMs = originalScheduledEndDate.getTime();

      void cascadeShiftLaterSubtasks({
        finishingSubTaskId: projectSubTaskId,
        projectTaskId,
        originalScheduledEndMs,
        actualEndMs: referenceNow.getTime(),
        timestampIso,
      })
        .then((result) => {
          if (result.error) {
            console.error(
              "[updateSubTaskStatus] background cascade shift failed:",
              result.error,
            );
          }
        })
        .catch((err: unknown) => {
          console.error(
            "[updateSubTaskStatus] background cascade shift threw:",
            err instanceof Error ? err.message : String(err),
          );
        });
    }

    let projectStatus: string | null = null;
    let movedToReviewPending = false;

    if (isFinishedSubTaskStatus(status) && existingSubTask.project_task_id) {
      const { data: projectTaskRows, error: projectTaskLookupError } =
        await supabaseAdmin
          .from("project_task")
          .select("project_task_id, project_id")
          .eq("project_task_id", existingSubTask.project_task_id)
          .returns<ProjectTaskRow[]>();

      if (projectTaskLookupError) {
        return NextResponse.json(
          {
            error: "Failed to load project task.",
            details: projectTaskLookupError.message,
          },
          { status: 500 },
        );
      }

      const projectTask = projectTaskRows?.[0] ?? null;

      if (projectTask?.project_id) {
        // Stage 2 — projects.status, all-project-tasks-for-this-project,
        // and (anticipating need) all-subtasks need not be sequential.
        // Fan them out together: the projects.status read tells us if
        // we even need to check; the other two feed the
        // hasRemainingOpenSubTask computation below.
        const [projectResult, allProjectTaskRowsResult] = await Promise.all([
          supabaseAdmin
            .from("projects")
            .select("status")
            .eq("project_id", projectTask.project_id)
            .returns<ProjectRow[]>(),
          supabaseAdmin
            .from("project_task")
            .select("project_task_id, project_id")
            .eq("project_id", projectTask.project_id)
            .returns<ProjectTaskRow[]>(),
        ]);

        if (projectResult.error) {
          return NextResponse.json(
            {
              error: "Failed to load project status.",
              details: projectResult.error.message,
            },
            { status: 500 },
          );
        }
        if (allProjectTaskRowsResult.error) {
          return NextResponse.json(
            {
              error: "Failed to load project tasks.",
              details: allProjectTaskRowsResult.error.message,
            },
            { status: 500 },
          );
        }

        const currentProject = projectResult.data?.[0] ?? null;
        projectStatus = normalizeStatus(currentProject?.status);

        if (canMoveProjectToReview(projectStatus)) {
          const projectTaskIds = (allProjectTaskRowsResult.data ?? []).map(
            (row) => row.project_task_id,
          );

          if (projectTaskIds.length > 0) {
            const { data: projectSubTaskRows, error: projectSubTasksError } =
              await supabaseAdmin
                .from("project_sub_task")
                .select("project_sub_task_id, project_task_id, status")
                .in("project_task_id", projectTaskIds)
                .returns<ProjectSubTaskRow[]>();

            if (projectSubTasksError) {
              return NextResponse.json(
                {
                  error: "Failed to load project subtasks.",
                  details: projectSubTasksError.message,
                },
                { status: 500 },
              );
            }

            const hasRemainingOpenSubTask = (projectSubTaskRows ?? []).some(
              (row) => !isFinishedSubTaskStatus(row.status),
            );

            if (!hasRemainingOpenSubTask) {
              const nextProjectStatus = "review_pending";

              const { error: reviewStatusError } = await supabaseAdmin
                .from("projects")
                .update({
                  status: nextProjectStatus,
                  updated_at: timestampIso,
                })
                .eq("project_id", projectTask.project_id);

              if (reviewStatusError) {
                return NextResponse.json(
                  {
                    error: "Failed to move project to review.",
                    details: reviewStatusError.message,
                  },
                  { status: 500 },
                );
              }

              projectStatus = nextProjectStatus;
              movedToReviewPending = true;
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      projectStatus,
      movedToReviewPending,
      // Cascade now runs in the background; its UPDATE events
      // broadcast via realtime so dashboards patch the shifted
      // subtask times automatically. We no longer carry a per-call
      // shifted/delta/warning summary because awaiting that would
      // re-introduce the slowness this change was made to remove.
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected error.", details: message },
      { status: 500 },
    );
  }
}
