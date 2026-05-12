import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildUnavailableDateSet,
  snapStartPastUnavailableSpan,
} from "@/lib/schedule/snapPastUnavailable";
import { placeWorkSpan } from "@/lib/schedule/workHours";

// Shared "shift every later subtask by the delta between the anchor task's
// old position and a new reference time" helper. Two callers:
//
//   1. /api/planning/updateSubTaskStatus — when a staff member marks a
//      subtask done, every later sibling slides so the next task starts
//      at the actual finish time.
//
//   2. /api/planning/updateGeneratedSubTask — when an admin edits the
//      schedule on the Generated Task modal, every later sibling slides
//      so the chain keeps the same relative spacing relative to the
//      new end of the edited task.
//
// Both flows want identical downstream behaviour (respect work hours,
// skip lunch, snap past unavailable days, preserve estimated_hours), so
// the math lives here once.

const CASCADE_THRESHOLD_MS = 60 * 1000;

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string | null;
};

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string | null;
  status: string | null;
  scheduled_start_datetime?: string | null;
  scheduled_end_datetime?: string | null;
  estimated_hours?: number | null;
};

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

export async function cascadeShiftLaterSubtasks(args: {
  // Subtask we're shifting AROUND, excluded from the candidate set so it
  // doesn't try to shift itself.
  anchorSubTaskId: string;
  // Any project_task_id that belongs to the project, used only to look
  // up project_id so we can fan out across the entire project.
  projectTaskId: string;
  // The anchor task's ORIGINAL scheduled bounds. The candidate filter
  // uses MIN(start, end) so the cascade also picks up sibling subtasks
  // scheduled in parallel with or overlapping the anchor (real case: a
  // subtask pinned at 5 PM right alongside another subtask also at 5
  // PM the same day).
  originalScheduledStartMs: number;
  originalScheduledEndMs: number;
  // Reference time the cascade aligns subsequent tasks to. For the
  // finish flow that's the actual completion time (now). For the edit
  // flow that's the NEW end of the edited task. In both cases:
  //   delta = referenceEndMs - earliestCandidateStart
  // which closes any gap and propagates the shift forward.
  referenceEndMs: number;
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
      "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime, estimated_hours",
    )
    .in("project_task_id", projectTaskIds)
    .returns<ProjectSubTaskRow[]>();

  if (subTaskError) {
    return { shifted: 0, deltaMs: 0, error: subTaskError.message };
  }

  const anchorFloorMs = Math.min(
    args.originalScheduledStartMs,
    args.originalScheduledEndMs,
  );

  const candidates = (subTaskRows ?? []).filter((row) => {
    if (row.project_sub_task_id === args.anchorSubTaskId) return false;
    if (isFinishedSubTaskStatus(row.status)) return false;
    const startDate = parseDate(row.scheduled_start_datetime);
    if (!startDate) return false;
    return startDate.getTime() >= anchorFloorMs;
  });

  if (candidates.length === 0)
    return { shifted: 0, deltaMs: 0, error: null };

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

  const deltaMs = args.referenceEndMs - earliestStartMs;
  if (Math.abs(deltaMs) < CASCADE_THRESHOLD_MS) {
    return { shifted: 0, deltaMs: 0, error: null };
  }

  const { data: blockedRows } = await supabaseAdmin
    .from("unavailable_days")
    .select("blocked_start_datetime")
    .eq("is_active", true);
  const unavailableSet = buildUnavailableDateSet(
    (blockedRows ?? [])
      .map((row) => row.blocked_start_datetime as string | null)
      .filter((value): value is string => Boolean(value))
      .map((iso) => iso.slice(0, 10)),
  );

  // Chunked to avoid exhausting Supabase connections on large projects.
  const CHUNK_SIZE = 8;
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    const updates = await Promise.all(
      chunk.map((row) => {
        const naiveStartIso = shiftIso(row.scheduled_start_datetime, deltaMs);
        const naiveEndIso = shiftIso(row.scheduled_end_datetime, deltaMs);

        const originalStart = parseDate(row.scheduled_start_datetime);
        const originalEnd = parseDate(row.scheduled_end_datetime);
        const originalDurationMs =
          originalStart && originalEnd
            ? originalEnd.getTime() - originalStart.getTime()
            : 0;

        // Prefer the persisted work-hours estimate over the clock span:
        // spans that cross lunch or overnight measure wider in clock
        // time than they do in actual work hours, and feeding the wider
        // number into placeWorkSpan grows the span on every cascade.
        const estimatedWorkHours = Number(row.estimated_hours);
        const durationHours =
          Number.isFinite(estimatedWorkHours) && estimatedWorkHours > 0
            ? estimatedWorkHours
            : originalDurationMs > 0
              ? originalDurationMs / (60 * 60 * 1000)
              : 0;

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
