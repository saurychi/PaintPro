import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listManualUnavailableDays,
  listScheduleUnavailableDays,
} from "@/lib/schedule/unavailableDays";
import {
  detectFullDayBlock,
  MANUAL_UNAVAILABLE_BLOCK_TYPES,
} from "@/lib/schedule/unavailableDayTypes";

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
      cookieStore,
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
      cookieStore,
    };
  }

  return {
    error: null,
    cookieStore,
    userId: user.id,
  };
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

// Accepts an ISO 8601 datetime string. Returns the canonical ISO string
// the DB should store, or "" if the value is invalid / missing.
function parseBodyDatetime(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function parseBodyBlockType(value: unknown) {
  const normalized = normalizeText(value);
  return MANUAL_UNAVAILABLE_BLOCK_TYPES.includes(
    normalized as (typeof MANUAL_UNAVAILABLE_BLOCK_TYPES)[number],
  )
    ? normalized
    : "";
}

function deriveDateKey(iso: string) {
  return iso.slice(0, 10);
}

type ParsedRange = {
  startIso: string;
  endIso: string;
  error: NextResponse | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Builds an array of midnight-UTC → next-midnight-UTC pairs covering the
// inclusive [startDate, endDate] range. Used by the multi-day create
// path so one request becomes N full-day rows.
function enumerateFullDayRanges(
  startDate: string,
  endDate: string,
): { startIso: string; endIso: string }[] {
  const out: { startIso: string; endIso: string }[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const stop = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(stop.getTime())) return out;

  // Cap iterations defensively — picking a year-long range is a 365-row
  // insert, which Postgres handles fine but we don't want runaway loops.
  for (let i = 0; i < 1000 && cursor.getTime() <= stop.getTime(); i += 1) {
    const startIso = cursor.toISOString();
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    out.push({ startIso, endIso: next.toISOString() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// Resolves the [start, end) datetime range from a request body,
// supporting two shapes:
//   1. fullDayDate: "YYYY-MM-DD"  → midnight UTC → next midnight UTC
//   2. blockedStartDatetime + blockedEndDatetime (ISO strings)
function resolveBodyRange(body: Record<string, unknown>): ParsedRange {
  const fullDayDate = normalizeText(body.fullDayDate);
  if (fullDayDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fullDayDate)) {
      return {
        startIso: "",
        endIso: "",
        error: NextResponse.json(
          { error: "fullDayDate must be a YYYY-MM-DD string." },
          { status: 400 },
        ),
      };
    }
    const start = `${fullDayDate}T00:00:00.000Z`;
    const endDate = new Date(start);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    return { startIso: start, endIso: endDate.toISOString(), error: null };
  }

  const startIso = parseBodyDatetime(body.blockedStartDatetime);
  const endIso = parseBodyDatetime(body.blockedEndDatetime);

  if (!startIso || !endIso) {
    return {
      startIso: "",
      endIso: "",
      error: NextResponse.json(
        { error: "Provide either fullDayDate, or blockedStartDatetime + blockedEndDatetime." },
        { status: 400 },
      ),
    };
  }

  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return {
      startIso: "",
      endIso: "",
      error: NextResponse.json(
        { error: "blockedEndDatetime must be after blockedStartDatetime." },
        { status: 400 },
      ),
    };
  }

  return { startIso, endIso, error: null };
}

export async function GET(request: NextRequest) {
  try {
    // ?manualOnly=true skips the external Nager.at holidays roundtrip and
    // returns rows from the unavailable_days table only. Used by the
    // refresh button in the admin schedule's Unavailable Days panel so a
    // manual save lands fast without the holiday API on the critical path.
    const manualOnly =
      new URL(request.url).searchParams.get("manualOnly") === "true";

    const unavailableDays = manualOnly
      ? await listManualUnavailableDays()
      : await listScheduleUnavailableDays(request.headers.get("cookie"));
    return NextResponse.json({ unavailableDays });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load unavailable days.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
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

  const bodyRecord =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const reason = normalizeText(bodyRecord.reason);
  const blockType = parseBodyBlockType(bodyRecord.blockType);

  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }

  if (!blockType) {
    return NextResponse.json(
      { error: "Choose a valid unavailable day type." },
      { status: 400 },
    );
  }

  // Multi-day shape: the modal sends both multiDayStartDate and
  // multiDayEndDate as YYYY-MM-DD strings. We enumerate one row per
  // calendar day in the inclusive range, each as a full-day block.
  const multiDayStartDate = normalizeText(bodyRecord.multiDayStartDate);
  const multiDayEndDate = normalizeText(bodyRecord.multiDayEndDate);

  if (multiDayStartDate || multiDayEndDate) {
    if (
      !DATE_PATTERN.test(multiDayStartDate) ||
      !DATE_PATTERN.test(multiDayEndDate)
    ) {
      return NextResponse.json(
        { error: "multiDayStartDate and multiDayEndDate must be YYYY-MM-DD." },
        { status: 400 },
      );
    }
    if (multiDayEndDate < multiDayStartDate) {
      return NextResponse.json(
        { error: "End date cannot be earlier than start date." },
        { status: 400 },
      );
    }

    const ranges = enumerateFullDayRanges(multiDayStartDate, multiDayEndDate);
    if (ranges.length === 0) {
      return NextResponse.json(
        { error: "Could not build the multi-day range." },
        { status: 400 },
      );
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("unavailable_days")
      .insert(
        ranges.map((r) => ({
          blocked_start_datetime: r.startIso,
          blocked_end_datetime: r.endIso,
          reason,
          block_type: blockType,
          is_active: true,
          updated_at: updatedAt,
        })),
      )
      .select(
        "unavailable_day_id, blocked_start_datetime, blocked_end_datetime, reason, block_type",
      );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to create unavailable days." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      unavailableDays: (data ?? []).map((row) => ({
        id: row.unavailable_day_id,
        blockedStartDatetime: row.blocked_start_datetime,
        blockedEndDatetime: row.blocked_end_datetime,
        blockedDate: deriveDateKey(String(row.blocked_start_datetime)),
        isFullDay: detectFullDayBlock(
          String(row.blocked_start_datetime),
          String(row.blocked_end_datetime),
        ),
        reason: row.reason,
        blockType: row.block_type,
        source: "manual" as const,
        isEditable: true,
      })),
      createdCount: data?.length ?? 0,
    });
  }

  // Single-row paths (whole-day or specific-time)
  const range = resolveBodyRange(bodyRecord);
  if (range.error) return range.error;

  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .insert({
      blocked_start_datetime: range.startIso,
      blocked_end_datetime: range.endIso,
      reason,
      block_type: blockType,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select(
      "unavailable_day_id, blocked_start_datetime, blocked_end_datetime, reason, block_type",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to create unavailable day." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    unavailableDay: {
      id: data.unavailable_day_id,
      blockedStartDatetime: data.blocked_start_datetime,
      blockedEndDatetime: data.blocked_end_datetime,
      blockedDate: deriveDateKey(String(data.blocked_start_datetime)),
      isFullDay: detectFullDayBlock(
        String(data.blocked_start_datetime),
        String(data.blocked_end_datetime),
      ),
      reason: data.reason,
      blockType: data.block_type,
      source: "manual" as const,
      isEditable: true,
    },
    createdCount: 1,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminOrManager();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bodyRecord = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const unavailableDayId = normalizeText(bodyRecord.unavailableDayId);
  const range = resolveBodyRange(bodyRecord);
  if (range.error) return range.error;

  const reason = normalizeText(bodyRecord.reason);
  const blockType = parseBodyBlockType(bodyRecord.blockType);

  if (!unavailableDayId) {
    return NextResponse.json(
      { error: "Missing unavailable day id." },
      { status: 400 },
    );
  }

  if (!reason || !blockType) {
    return NextResponse.json(
      { error: "Datetime range, reason, and type are required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .update({
      blocked_start_datetime: range.startIso,
      blocked_end_datetime: range.endIso,
      reason,
      block_type: blockType,
      updated_at: new Date().toISOString(),
    })
    .eq("unavailable_day_id", unavailableDayId)
    .eq("is_active", true)
    .select(
      "unavailable_day_id, blocked_start_datetime, blocked_end_datetime, reason, block_type",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update unavailable day." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    unavailableDay: {
      id: data.unavailable_day_id,
      blockedStartDatetime: data.blocked_start_datetime,
      blockedEndDatetime: data.blocked_end_datetime,
      blockedDate: deriveDateKey(String(data.blocked_start_datetime)),
      isFullDay: detectFullDayBlock(
        String(data.blocked_start_datetime),
        String(data.blocked_end_datetime),
      ),
      reason: data.reason,
      blockType: data.block_type,
      source: "manual" as const,
      isEditable: true,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminOrManager();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const unavailableDayId = normalizeText(
    (body as Record<string, unknown>).unavailableDayId,
  );

  if (!unavailableDayId) {
    return NextResponse.json(
      { error: "Missing unavailable day id." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("unavailable_days")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("unavailable_day_id", unavailableDayId);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete unavailable day." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
