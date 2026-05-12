// Shared work-hour rules used across the schedule pipeline:
//   - lib/planning/projectScheduling.ts (initial schedule generation)
//   - lib/schedule/snapPastUnavailable.ts (server write paths)
//   - app/api/planning/updateSubTaskStatus/route.ts (status-change cascade
//     fired by the staff JobProgressCard when a task is finished early/late)
//   - app/admin/job-creation/project-schedule/page.tsx (drag/resize +
//     calendar rendering)
//
// Logic that lives here so every call path applies it the same way:
//
//   1. **Work hours**: 09:00–17:00 LOCAL. Anything outside the window is
//      non-working time.
//
//   2. **Lunch** (12:00-13:00 LOCAL) is non-working. A multi-hour task
//      doesn't slide past lunch — it CONTINUES after lunch as a separate
//      segment. `computeWorkSegments` walks forward from the requested
//      start and emits one [segStart, segEnd) chunk per work block,
//      pausing at lunch / work-end / unavailable days and resuming on the
//      next valid block.
//
//   3. **Sundays** are non-working days. Treated like an entry in the
//      unavailable_days set so callers don't have to enumerate every
//      Sunday — `isNonWorkingDay` returns true for them implicitly.

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 17;
export const LUNCH_START_HOUR = 12;
export const LUNCH_END_HOUR = 13;

function localDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Sunday → 0. Treat it the same as a blocked day so callers don't need
// to enumerate every Sunday into their unavailable set.
export function isNonWorkingDay(
  date: Date,
  unavailableDateSet?: Set<string> | null,
): boolean {
  if (date.getDay() === 0) return true;
  if (!unavailableDateSet || unavailableDateSet.size === 0) return false;
  return unavailableDateSet.has(localDateKey(date));
}

// Walk forward from `start`, placing `totalHours` of work split across
// the available work blocks (09-12 morning, 13-17 afternoon, Mon-Sat,
// minus any unavailable_days entries / Sundays). Returns one segment per
// work block consumed — the renderer fans these out as adjacent chips so
// a task that crosses lunch shows as two pieces with the lunch row empty
// between them, not as a single span painting through 12:00.
//
// Cursor normalization happens inline each iteration (skip non-working
// days, jump past lunch if landed inside, jump to next workday if past
// 17:00) so callers can pass in any moment and get back a valid run.
export function computeWorkSegments(
  start: Date,
  totalHours: number,
  unavailableDateSet?: Set<string> | null,
): Array<{ start: Date; end: Date }> {
  const set = unavailableDateSet ?? new Set<string>();
  const segments: Array<{ start: Date; end: Date }> = [];

  if (totalHours <= 0 || Number.isNaN(start.getTime())) {
    return segments;
  }

  const cursor = new Date(start);
  let remainingMs = totalHours * 60 * 60 * 1000;

  // Bounded loop: each pass either consumes a work block or advances
  // the cursor past a non-working interval. 365 days × 2 blocks/day is
  // a generous ceiling that still terminates if logic upstream is bad.
  for (let guard = 0; guard < 365 * 2 && remainingMs > 0; guard++) {
    if (isNonWorkingDay(cursor, set)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    const cursorMinutes = cursor.getHours() * 60 + cursor.getMinutes();
    const workStartMin = WORK_START_HOUR * 60;
    const workEndMin = WORK_END_HOUR * 60;
    const lunchStartMin = LUNCH_START_HOUR * 60;
    const lunchEndMin = LUNCH_END_HOUR * 60;

    if (cursorMinutes < workStartMin) {
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    if (cursorMinutes >= workEndMin) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    if (cursorMinutes >= lunchStartMin && cursorMinutes < lunchEndMin) {
      cursor.setHours(LUNCH_END_HOUR, 0, 0, 0);
      continue;
    }

    // Block end = next forced break (lunch start in the morning,
    // work end in the afternoon).
    const blockEnd = new Date(cursor);
    if (cursorMinutes < lunchStartMin) {
      blockEnd.setHours(LUNCH_START_HOUR, 0, 0, 0);
    } else {
      blockEnd.setHours(WORK_END_HOUR, 0, 0, 0);
    }

    const blockMs = blockEnd.getTime() - cursor.getTime();
    if (blockMs <= 0) {
      // Defensive: shouldn't happen given the checks above, but bail
      // rather than spin if the cursor lands exactly on a boundary.
      cursor.setTime(blockEnd.getTime());
      continue;
    }

    if (blockMs >= remainingMs) {
      const segEnd = new Date(cursor.getTime() + remainingMs);
      segments.push({ start: new Date(cursor), end: segEnd });
      remainingMs = 0;
    } else {
      segments.push({ start: new Date(cursor), end: new Date(blockEnd) });
      remainingMs -= blockMs;
      cursor.setTime(blockEnd.getTime());
    }
  }

  return segments;
}

// Inverse of `computeWorkSegments`: given a [start, end) span (typically
// `project_sub_tasks.scheduled_start_datetime` ↔ `scheduled_end_datetime`),
// return the number of working hours inside it. Sundays, unavailable days,
// time outside 09-17, and the lunch hour are all excluded — so a span
// that "looks" like 24 hours of clock time but spans an overnight gap
// reports the actual ~7 hours of work it represents.
export function workHoursBetween(
  start: Date,
  end: Date,
  unavailableDateSet?: Set<string> | null,
): number {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() <= start.getTime()) return 0;

  const set = unavailableDateSet ?? new Set<string>();
  let totalMs = 0;

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  for (let guard = 0; guard < 365 * 2 && cursor.getTime() <= end.getTime(); guard += 1) {
    if (!isNonWorkingDay(cursor, set)) {
      const blocks: Array<[number, number]> = [
        [WORK_START_HOUR, LUNCH_START_HOUR],
        [LUNCH_END_HOUR, WORK_END_HOUR],
      ];
      for (const [bh, eh] of blocks) {
        const blockStart = new Date(cursor);
        blockStart.setHours(bh, 0, 0, 0);
        const blockEnd = new Date(cursor);
        blockEnd.setHours(eh, 0, 0, 0);

        const overlapStart = Math.max(blockStart.getTime(), start.getTime());
        const overlapEnd = Math.min(blockEnd.getTime(), end.getTime());
        if (overlapEnd > overlapStart) {
          totalMs += overlapEnd - overlapStart;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMs / 3_600_000;
}

// Snap an arbitrary moment forward to the next valid working second:
// past lunch, past 17:00 to next day, past Sunday, past every entry in
// the unavailable set. Used by callers that need to normalize a single
// timestamp without computing a span — e.g. the cascade applied to a
// subtask that has no estimated_hours value, where placeWorkSpan would
// otherwise be skipped and leave a 17:00 start untouched.
//
// Mirrors the cursor-normalization loop inside computeWorkSegments so
// the result is the same start placeWorkSpan would have picked anyway.
export function snapToNextWorkingMoment(
  start: Date,
  unavailableDateSet?: Set<string> | null,
): Date {
  const cursor = new Date(start);
  const set = unavailableDateSet ?? new Set<string>();

  for (let guard = 0; guard < 365 * 2; guard++) {
    if (isNonWorkingDay(cursor, set)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    const minutes = cursor.getHours() * 60 + cursor.getMinutes();

    if (minutes < WORK_START_HOUR * 60) {
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }
    if (minutes >= WORK_END_HOUR * 60) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }
    if (
      minutes >= LUNCH_START_HOUR * 60 &&
      minutes < LUNCH_END_HOUR * 60
    ) {
      cursor.setHours(LUNCH_END_HOUR, 0, 0, 0);
      continue;
    }

    return cursor;
  }

  return cursor;
}

// Convenience wrapper for callers that only need the overall envelope
// (first segment's start, last segment's end). Returns the start
// untouched on a zero-hour input so DB rows stay stable.
export function placeWorkSpan(
  start: Date,
  totalHours: number,
  unavailableDateSet?: Set<string> | null,
): { start: Date; end: Date; segments: Array<{ start: Date; end: Date }> } {
  const segments = computeWorkSegments(start, totalHours, unavailableDateSet);
  if (segments.length === 0) {
    return { start: new Date(start), end: new Date(start), segments };
  }
  return {
    start: new Date(segments[0].start),
    end: new Date(segments[segments.length - 1].end),
    segments,
  };
}
