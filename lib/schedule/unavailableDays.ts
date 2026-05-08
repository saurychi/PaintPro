import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  detectFullDayBlock,
  type ScheduleUnavailableDay,
} from "@/lib/schedule/unavailableDayTypes";
import {
  readHolidaySettingsFromCookieString,
  type HolidaySettings,
} from "@/lib/settings/holidaySettings";

const ONE_DAY_SECONDS = 60 * 60 * 24;

type UnavailableDayRow = {
  unavailable_day_id: string;
  blocked_start_datetime: string;
  blocked_end_datetime: string;
  reason: string | null;
  block_type: string | null;
};

type HolidayResponse = {
  date: string;
  localName: string;
  name: string;
};

function getHolidayYears() {
  const now = new Date();
  return Array.from(new Set([now.getFullYear(), now.getFullYear() + 1]));
}

function deriveDateKey(iso: string) {
  return String(iso || "").slice(0, 10);
}

async function fetchHolidayUnavailableDays(
  settings: HolidaySettings,
): Promise<ScheduleUnavailableDay[]> {
  if (!settings.enabled || !settings.countryCode) return [];

  const results = await Promise.all(
    getHolidayYears().map(async (year) => {
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(
          settings.countryCode,
        )}`,
        {
          next: {
            revalidate: ONE_DAY_SECONDS,
          },
        },
      ).catch(() => null);

      if (!response?.ok) return [] as ScheduleUnavailableDay[];

      const payload = (await response.json().catch(() => null)) as
        | HolidayResponse[]
        | null;
      const holidays = Array.isArray(payload) ? payload : [];

      return holidays.map((holiday) => {
        // Holidays are full-day blocks: midnight UTC → next midnight UTC.
        const start = `${holiday.date}T00:00:00.000Z`;
        const endDate = new Date(`${holiday.date}T00:00:00.000Z`);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        const end = endDate.toISOString();
        return {
          id: `holiday-${holiday.date}-${holiday.localName || holiday.name}`,
          blockedStartDatetime: start,
          blockedEndDatetime: end,
          blockedDate: holiday.date,
          isFullDay: true,
          reason: holiday.localName || holiday.name,
          blockType: "holiday",
          source: "holiday" as const,
          isEditable: false,
        };
      });
    }),
  );

  return results.flat();
}

export async function listManualUnavailableDays() {
  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .select(
      "unavailable_day_id, blocked_start_datetime, blocked_end_datetime, reason, block_type",
    )
    .eq("is_active", true)
    .order("blocked_start_datetime", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load unavailable days.");
  }

  return ((data ?? []) as UnavailableDayRow[]).map((row) => {
    const blockType = String(row.block_type ?? "").trim() || "other";
    const startIso = row.blocked_start_datetime;
    const endIso = row.blocked_end_datetime;

    return {
      id: row.unavailable_day_id,
      blockedStartDatetime: startIso,
      blockedEndDatetime: endIso,
      blockedDate: deriveDateKey(startIso),
      isFullDay: detectFullDayBlock(startIso, endIso),
      reason: String(row.reason ?? "").trim() || "Unavailable day",
      blockType,
      source: blockType === "holiday" ? "holiday" as const : "manual" as const,
      isEditable: blockType !== "holiday",
    };
  });
}

// API holidays are built as `${date}T00:00:00.000Z`; DB rows come back
// from Postgres timestamptz as `${date}T00:00:00+00:00`. Both represent
// the same instant but compare as different strings, which made the
// dedup Map below treat them as distinct keys — that's why a synced
// holiday + the live API fetch showed up twice with the same name.
// Normalizing through `new Date(...).toISOString()` collapses both to
// the canonical "...Z" form so equivalent instants share one key.
function canonicalInstantKey(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? iso : new Date(ms).toISOString();
}

export async function listScheduleUnavailableDays(cookieString?: string | null) {
  const holidaySettings = readHolidaySettingsFromCookieString(cookieString);

  const [manualDays, holidayDays] = await Promise.all([
    listManualUnavailableDays(),
    fetchHolidayUnavailableDays(holidaySettings),
  ]);

  const dedupedDays = new Map<string, ScheduleUnavailableDay>();

  // Iterate holidayDays first; manualDays are pushed second so a synced
  // DB row (a previous Nager.at sync that was persisted) wins over the
  // freshly-fetched API copy when their canonical instants match.
  for (const day of [...holidayDays, ...manualDays]) {
    const startKey = canonicalInstantKey(day.blockedStartDatetime);
    const endKey = canonicalInstantKey(day.blockedEndDatetime);
    dedupedDays.set(`${startKey}::${endKey}::${day.blockType}`, day);
  }

  return Array.from(dedupedDays.values()).sort((left, right) => {
    const leftKey = canonicalInstantKey(left.blockedStartDatetime);
    const rightKey = canonicalInstantKey(right.blockedStartDatetime);
    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);

    if (left.source !== right.source) {
      return left.source === "holiday" ? -1 : 1;
    }

    return left.reason.localeCompare(right.reason);
  });
}
