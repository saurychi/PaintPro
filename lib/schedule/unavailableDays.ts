import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  type ScheduleUnavailableDay,
} from "@/lib/schedule/unavailableDayTypes";
import {
  readHolidaySettingsFromCookieString,
  type HolidaySettings,
} from "@/lib/settings/holidaySettings";

const ONE_DAY_SECONDS = 60 * 60 * 24;

type UnavailableDayRow = {
  unavailable_day_id: string;
  blocked_date: string;
  reason: string | null;
  block_type: string | null;
  notes: string | null;
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

      return holidays.map((holiday) => ({
        id: `holiday-${holiday.date}-${holiday.localName || holiday.name}`,
        blockedDate: holiday.date,
        reason: holiday.localName || holiday.name,
        blockType: "holiday",
        notes: null,
        source: "holiday" as const,
        isEditable: false,
      }));
    }),
  );

  return results.flat();
}

export async function listManualUnavailableDays() {
  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .select("unavailable_day_id, blocked_date, reason, block_type, notes")
    .eq("is_active", true)
    .order("blocked_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load unavailable days.");
  }

  return ((data ?? []) as UnavailableDayRow[]).map((row) => ({
    id: row.unavailable_day_id,
    blockedDate: row.blocked_date,
    reason: String(row.reason ?? "").trim() || "Unavailable day",
    blockType: String(row.block_type ?? "").trim() || "other",
    notes: row.notes,
    source: "manual" as const,
    isEditable: true,
  }));
}

export async function listScheduleUnavailableDays(cookieString?: string | null) {
  const holidaySettings = readHolidaySettingsFromCookieString(cookieString);

  const [manualDays, holidayDays] = await Promise.all([
    listManualUnavailableDays(),
    fetchHolidayUnavailableDays(holidaySettings),
  ]);

  return [...manualDays, ...holidayDays].sort((left, right) => {
    if (left.blockedDate !== right.blockedDate) {
      return left.blockedDate.localeCompare(right.blockedDate);
    }

    if (left.source !== right.source) {
      return left.source === "holiday" ? -1 : 1;
    }

    return left.reason.localeCompare(right.reason);
  });
}
