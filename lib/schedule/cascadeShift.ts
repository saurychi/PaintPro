import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildUnavailableDateSet } from "@/lib/schedule/snapPastUnavailable";
import {
  placeWorkSpan,
  snapToNextWorkingMoment,
} from "@/lib/schedule/workHours";

// Shared cascade helper used by:
//
//   1. /api/planning/updateSubTaskStatus — staff marks a subtask done.
//   2. /api/planning/updateGeneratedSubTask — admin edits the schedule
//      on the Generated Task modal.
//
// Both flows want every subtask AFTER the changed one to land in valid
// working windows (9-17 Mon-Sat, lunch 12-13 excluded, blocked days
// skipped) starting from the anchor task's new end. The helper walks a
// cursor through the candidates in canonical schedule order and runs
// each one through placeWorkSpan, so legacy data with multiple subtasks
// pinned to the same timestamp can't pile back up at a boundary.

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
  sort_order?: number | null;
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

  // Pull sort_order alongside the schedule so we can stable-sort
  // candidates by (project_task.sort_order, project_sub_task.sort_order)
  // when their original starts collide — common in the legacy data
  // where multiple subtasks share the same scheduled_start_datetime.
  const { data: subTaskRows, error: subTaskError } = await supabaseAdmin
    .from("project_sub_task")
    .select(
      "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime, estimated_hours, sort_order",
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

  // Need the project_task sort_order so the candidate ordering matches
  // what the schedule wizard / dashboard would render. Without this,
  // candidates whose subtask-level sort_order happens to be lower could
  // pack BEFORE a sibling that belongs to an earlier main-task group.
  const { data: orderRows } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id, sort_order")
    .in("project_task_id", projectTaskIds);
  const taskGroupOrder = new Map<string, number>();
  for (const row of orderRows ?? []) {
    taskGroupOrder.set(
      String(row.project_task_id),
      Number((row as { sort_order?: number | null }).sort_order ?? 0),
    );
  }

  // Stable ordering: original scheduled start (so a chain that was
  // correctly spaced keeps its order), then the project_task sort_order
  // (so legacy rows pinned to the same timestamp pack in the order the
  // admin laid them out), then the per-row sort_order (final tie-break).
  candidates.sort((a, b) => {
    const aStart = parseDate(a.scheduled_start_datetime)?.getTime() ?? 0;
    const bStart = parseDate(b.scheduled_start_datetime)?.getTime() ?? 0;
    if (aStart !== bStart) return aStart - bStart;

    const aTaskOrder = taskGroupOrder.get(String(a.project_task_id)) ?? 0;
    const bTaskOrder = taskGroupOrder.get(String(b.project_task_id)) ?? 0;
    if (aTaskOrder !== bTaskOrder) return aTaskOrder - bTaskOrder;

    const aSubOrder = Number(a.sort_order ?? 0);
    const bSubOrder = Number(b.sort_order ?? 0);
    if (aSubOrder !== bSubOrder) return aSubOrder - bSubOrder;

    return a.project_sub_task_id.localeCompare(b.project_sub_task_id);
  });

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

  // SEQUENTIAL PACKING.
  //
  // Old behaviour computed a single `delta = referenceEnd - earliestCandidateStart`
  // and applied it uniformly to every candidate. That preserves relative
  // spacing but lets bad data through: when several siblings are pinned
  // to the exact same scheduled_start (e.g. multiple rows stuck at
  // 5:00 PM), the cascade walks them all forward by the same offset
  // and they end up stacked at the same new moment too — usually a
  // boundary like 17:00 where snapToNextWorkingMoment can also misfire
  // if the wall clock happens to align.
  //
  // The new flow walks a single cursor through the candidate list, in
  // canonical schedule order, placing each one immediately after the
  // previous via placeWorkSpan. The cursor starts at the finishing
  // task's actual end (referenceEndMs). placeWorkSpan handles every
  // boundary (lunch, 17:00, Sundays, blocked days), so the writes are
  // guaranteed to land in valid working windows AND remain non-overlapping.
  // No threshold check: if the saved chain already matches, the row
  // updates are idempotent no-ops at the DB layer.
  let cursor = snapToNextWorkingMoment(
    new Date(args.referenceEndMs),
    unavailableSet,
  );

  // Track the running delta from each candidate's original position to
  // its new position. Reported as the delta of the FIRST candidate to
  // stay backward-compatible with callers that wanted a single number.
  let firstShiftDeltaMs = 0;
  let firstSeen = false;
  let shiftedCount = 0;

  // Chunked to avoid exhausting Supabase connections on large projects.
  // Even though the placement is sequential, the DB writes are still
  // independent and can fan out per chunk.
  const CHUNK_SIZE = 8;
  type WriteRow = {
    projectSubTaskId: string;
    payload: Record<string, unknown>;
  };
  const writes: WriteRow[] = [];

  for (const row of candidates) {
    const originalStart = parseDate(row.scheduled_start_datetime);
    const originalEnd = parseDate(row.scheduled_end_datetime);
    const originalDurationMs =
      originalStart && originalEnd
        ? originalEnd.getTime() - originalStart.getTime()
        : 0;

    // estimated_hours is canonical (idempotent across cascades).
    // Fall back to clock duration only when the column is empty.
    const estimatedWorkHours = Number(row.estimated_hours);
    const durationHours =
      Number.isFinite(estimatedWorkHours) && estimatedWorkHours > 0
        ? estimatedWorkHours
        : originalDurationMs > 0
          ? originalDurationMs / (60 * 60 * 1000)
          : 0;

    let finalStart: Date;
    let finalEnd: Date;

    if (durationHours > 0) {
      const placed = placeWorkSpan(cursor, durationHours, unavailableSet);
      finalStart = placed.start;
      finalEnd = placed.end;
    } else {
      // Zero-duration row: keep it at the cursor (which is already a
      // valid working moment), end follows start.
      finalStart = new Date(cursor);
      finalEnd = new Date(cursor);
    }

    if (!firstSeen) {
      firstSeen = true;
      const originalStartMs = originalStart?.getTime();
      if (typeof originalStartMs === "number") {
        firstShiftDeltaMs = finalStart.getTime() - originalStartMs;
      }
    }
    shiftedCount += 1;

    writes.push({
      projectSubTaskId: row.project_sub_task_id,
      payload: {
        scheduled_start_datetime: finalStart.toISOString(),
        scheduled_end_datetime: finalEnd.toISOString(),
        updated_at: args.timestampIso,
      },
    });

    // Advance the cursor past the candidate's end, then re-snap so the
    // next candidate skips lunch / overnight gaps cleanly.
    cursor = snapToNextWorkingMoment(new Date(finalEnd), unavailableSet);
  }

  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((entry) =>
        supabaseAdmin
          .from("project_sub_task")
          .update(entry.payload)
          .eq("project_sub_task_id", entry.projectSubTaskId),
      ),
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      return { shifted: 0, deltaMs: 0, error: failed.error.message };
    }
  }

  return {
    shifted: shiftedCount,
    deltaMs: firstShiftDeltaMs,
    error: null,
  };
}
