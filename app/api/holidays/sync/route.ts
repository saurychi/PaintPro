import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ONE_DAY_SECONDS = 60 * 60 * 24;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const SYNCED_HOLIDAY_NOTE_PREFIX = "Synced public holiday";

type NagerHoliday = {
  date: string;
  localName: string;
  name: string;
};

type HolidayRow = {
  unavailable_day_id: string;
  blocked_date: string;
  block_type: string | null;
  reason: string | null;
  notes: string | null;
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

      return (Array.isArray(payload) ? payload : []).map((holiday) => ({
        blocked_date: holiday.date,
        reason: holiday.localName || holiday.name || "Public holiday",
        block_type: "holiday",
        notes: `${SYNCED_HOLIDAY_NOTE_PREFIX} (${countryCode})`,
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
    }),
  );

  const byDate = new Map<string, (typeof results)[number][number]>();

  for (const holiday of results.flat()) {
    const existing = byDate.get(holiday.blocked_date);

    if (!existing) {
      byDate.set(holiday.blocked_date, holiday);
      continue;
    }

    if (!existing.reason.includes(holiday.reason)) {
      byDate.set(holiday.blocked_date, {
        ...existing,
        reason: `${existing.reason} / ${holiday.reason}`,
      });
    }
  }

  return Array.from(byDate.values());
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
      const { data, error } = await supabaseAdmin
        .from("unavailable_days")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("block_type", "holiday")
        .ilike("notes", `${SYNCED_HOLIDAY_NOTE_PREFIX}%`)
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

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("unavailable_days")
      .select("unavailable_day_id, blocked_date, block_type, reason, notes")
      .in("blocked_date", holidays.map((holiday) => holiday.blocked_date))
      .returns<HolidayRow[]>();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to load existing holidays.", details: existingError.message },
        { status: 500 },
      );
    }

    const existingByDate = new Map(
      (existingRows ?? []).map((row) => [row.blocked_date, row]),
    );

    const rowsToInsert = holidays.filter(
      (holiday) => !existingByDate.has(holiday.blocked_date),
    );

    const rowsToUpdate = holidays
      .map((holiday) => {
        const existing = existingByDate.get(holiday.blocked_date);
        if (!existing || existing.block_type !== "holiday") return null;

        return {
          id: existing.unavailable_day_id,
          reason: holiday.reason,
          notes: holiday.notes,
        };
      })
      .filter((row): row is { id: string; reason: string; notes: string } => Boolean(row));

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
            notes: row.notes,
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
      deactivatedCount: 0,
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
