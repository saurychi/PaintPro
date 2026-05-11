import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ONE_DAY_SECONDS = 60 * 60 * 24;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

type NagerHoliday = {
  date: string;
  localName: string;
  name: string;
};

type HolidayRow = {
  unavailable_day_id: string;
  blocked_start_datetime: string;
  blocked_end_datetime: string;
  block_type: string | null;
  reason: string | null;
};

function createRouteClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );
}

async function requireAdminOrManager() {
  const cookieStore = await cookies();
  const supabase = createRouteClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { error: null };
}

function getHolidayYears() {
  const now = new Date();
  return Array.from(new Set([now.getFullYear(), now.getFullYear() + 1]));
}

// Holidays are stored as 24h full-day blocks: midnight UTC → next
// midnight UTC. Slicing the start gives the canonical YYYY-MM-DD key.
function holidayDayRange(date: string) {
  const start = `${date}T00:00:00.000Z`;
  const endDate = new Date(start);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { start, end: endDate.toISOString() };
}

async function fetchCountryHolidays(countryCode: string) {
  const results = await Promise.all(
    getHolidayYears().map(async (year) => {
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
        { next: { revalidate: ONE_DAY_SECONDS } },
      );

      if (!response.ok) {
        throw new Error(`Failed to load ${year} holidays.`);
      }

      const payload = (await response.json()) as NagerHoliday[];

      return (Array.isArray(payload) ? payload : []).map((holiday) => {
        const range = holidayDayRange(holiday.date);
        return {
          blocked_start_datetime: range.start,
          blocked_end_datetime: range.end,
          reason: holiday.localName || holiday.name || "Public holiday",
          block_type: "holiday",
          is_active: true,
          updated_at: new Date().toISOString(),
        };
      });
    }),
  );

  // De-dup by start datetime — multiple regional names for the same
  // calendar day collapse into one row, joined by " / " in the reason.
  const byStart = new Map<string, (typeof results)[number][number]>();

  for (const holiday of results.flat()) {
    const existing = byStart.get(holiday.blocked_start_datetime);

    if (!existing) {
      byStart.set(holiday.blocked_start_datetime, holiday);
      continue;
    }

    if (!existing.reason.includes(holiday.reason)) {
      byStart.set(holiday.blocked_start_datetime, {
        ...existing,
        reason: `${existing.reason} / ${holiday.reason}`,
      });
    }
  }

  return Array.from(byStart.values());
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrManager();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const enabled = Boolean(bodyRecord.enabled);
  const countryCode = String(bodyRecord.countryCode ?? "").trim().toUpperCase();

  if (enabled && !COUNTRY_CODE_PATTERN.test(countryCode)) {
    return NextResponse.json(
      { error: "Invalid country code. Expected ISO 3166-1 alpha-2." },
      { status: 400 },
    );
  }

  try {
    if (!enabled) {
      // The MANUAL_UNAVAILABLE_BLOCK_TYPES list excludes "holiday", so any
      // row with block_type='holiday' came from a previous sync run —
      // safe to deactivate them all.
      const { data, error } = await supabaseAdmin
        .from("unavailable_days")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("block_type", "holiday")
        .select("unavailable_day_id");

      if (error) {
        return NextResponse.json(
          { error: "Failed to deactivate synced holidays.", details: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        countryCode: null,
        insertedCount: 0,
        updatedCount: 0,
        deactivatedCount: data?.length ?? 0,
      });
    }

    const holidays = await fetchCountryHolidays(countryCode);

    // Deactivate every previously-synced holiday first. Without this step,
    // holidays unique to a previously-selected country stay is_active=true
    // and keep blocking the schedule even after the user switches countries.
    // The next step re-activates only the rows whose dates match the new
    // country's set; everything else stays inactive.
    const { data: deactivatedRows, error: deactivateError } = await supabaseAdmin
      .from("unavailable_days")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("block_type", "holiday")
      .eq("is_active", true)
      .select("unavailable_day_id");

    if (deactivateError) {
      return NextResponse.json(
        {
          error: "Failed to clear stale holidays.",
          details: deactivateError.message,
        },
        { status: 500 },
      );
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("unavailable_days")
      .select(
        "unavailable_day_id, blocked_start_datetime, blocked_end_datetime, block_type, reason",
      )
      .in(
        "blocked_start_datetime",
        holidays.map((holiday) => holiday.blocked_start_datetime),
      )
      .returns<HolidayRow[]>();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to load existing holidays.", details: existingError.message },
        { status: 500 },
      );
    }

    const existingByStart = new Map(
      (existingRows ?? []).map((row) => [row.blocked_start_datetime, row]),
    );

    const rowsToInsert = holidays.filter(
      (holiday) => !existingByStart.has(holiday.blocked_start_datetime),
    );

    const rowsToUpdate = holidays
      .map((holiday) => {
        const existing = existingByStart.get(holiday.blocked_start_datetime);
        if (!existing || existing.block_type !== "holiday") return null;

        return {
          id: existing.unavailable_day_id,
          reason: holiday.reason,
        };
      })
      .filter((row): row is { id: string; reason: string } => Boolean(row));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("unavailable_days")
        .insert(rowsToInsert);

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to insert synced holidays.", details: insertError.message },
          { status: 500 },
        );
      }
    }

    await Promise.all(
      rowsToUpdate.map(async (row) => {
        const { error } = await supabaseAdmin
          .from("unavailable_days")
          .update({
            reason: row.reason,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("unavailable_day_id", row.id);

        if (error) throw new Error(error.message);
      }),
    );

    return NextResponse.json({
      success: true,
      countryCode,
      insertedCount: rowsToInsert.length,
      updatedCount: rowsToUpdate.length,
      deactivatedCount: deactivatedRows?.length ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync holidays.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
