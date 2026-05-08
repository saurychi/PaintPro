// "holiday" is intentionally NOT in this list — it's reserved for the
// holidays sync route. The disable-sync flow deactivates every row with
// block_type='holiday', so manual holiday entries would be wiped. Users
// pick from manual types only; sync writes the holiday rows.
export const MANUAL_UNAVAILABLE_BLOCK_TYPES = [
  "company_blackout",
  "manual_block",
  "maintenance",
  "other",
] as const;

export type ManualUnavailableBlockType =
  (typeof MANUAL_UNAVAILABLE_BLOCK_TYPES)[number];

export type ScheduleUnavailableDay = {
  id: string;
  // The block's actual time range. A "full-day" block is stored as
  // start=YYYY-MM-DDT00:00Z and end = next day 00:00Z (24h span).
  blockedStartDatetime: string;
  blockedEndDatetime: string;
  // YYYY-MM-DD slice of blockedStartDatetime in UTC. The calendar /
  // cascade still operate at day granularity; this is the canonical
  // day-key everywhere except the modal.
  blockedDate: string;
  // True iff the block covers exactly one calendar day (UTC midnight to
  // next UTC midnight). Lets the modal/list switch UI between a date
  // chip and a time-range chip.
  isFullDay: boolean;
  reason: string;
  blockType: string;
  source: "manual" | "holiday";
  isEditable: boolean;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A block is "full day" when start lands on UTC midnight and end is
// exactly 24h later. Manual entries through the modal and holidays from
// sync both produce this shape, so the detection is reliable.
export function detectFullDayBlock(
  startIso: string,
  endIso: string,
): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  if (
    start.getUTCHours() !== 0 ||
    start.getUTCMinutes() !== 0 ||
    start.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0
  ) {
    return false;
  }
  return end.getTime() - start.getTime() === ONE_DAY_MS;
}
