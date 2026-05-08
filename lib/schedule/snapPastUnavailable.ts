// Mirror of the schedule-page client snap (LOCAL-day semantics). The cascade
// works at day granularity; callers slice the date portion off
// unavailable_days.blocked_start_datetime before handing the set in here.
// Used by the server write paths (create / save / update) so the DB can never
// hold a project_sub_task whose start lands on — or whose [start, end) span
// crosses — a blocked day. Sundays are also treated as non-working via
// isNonWorkingDay, so callers don't have to enumerate every Sunday.

import { isNonWorkingDay } from "./workHours";

export function addHoursToIso(startIso: string | null, hours: number | null) {
  if (!startIso || hours === null) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString();
}

// Pushes the start forward until the FULL [start, end) span clears every
// non-working day (Sundays + every entry in the unavailable set). End =
// start + hours; preserves time-of-day across moves so the user's chosen
// hour isn't lost.
export function snapStartPastUnavailableSpan(
  startIso: string | null,
  hours: number | null,
  unavailable: Set<string>,
): { iso: string | null; skippedDays: number } {
  if (!startIso) return { iso: startIso, skippedDays: 0 };

  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return { iso: startIso, skippedDays: 0 };

  const safeHours = typeof hours === "number" && hours > 0 ? hours : 0;

  let skipped = 0;
  for (let guard = 0; guard < 365; guard++) {
    if (safeHours === 0) {
      if (!isNonWorkingDay(date, unavailable)) {
        return { iso: date.toISOString(), skippedDays: skipped };
      }
      date.setDate(date.getDate() + 1);
      skipped += 1;
      continue;
    }

    const end = new Date(date.getTime() + safeHours * 60 * 60 * 1000);
    const cursor = new Date(date);
    cursor.setHours(0, 0, 0, 0);

    let firstBlocked: Date | null = null;
    while (cursor < end) {
      if (isNonWorkingDay(cursor, unavailable)) {
        firstBlocked = new Date(cursor);
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!firstBlocked) {
      return { iso: date.toISOString(), skippedDays: skipped };
    }

    const moved = new Date(firstBlocked);
    moved.setHours(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    );
    moved.setDate(moved.getDate() + 1);
    date.setTime(moved.getTime());
    skipped += 1;
  }

  return { iso: date.toISOString(), skippedDays: skipped };
}

export function buildUnavailableDateSet(blockedDates: string[]) {
  const set = new Set<string>();
  for (const date of blockedDates) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      set.add(date);
    }
  }
  return set;
}
