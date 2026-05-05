import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listScheduleUnavailableDays,
} from "@/lib/schedule/unavailableDays";
import { MANUAL_UNAVAILABLE_BLOCK_TYPES } from "@/lib/schedule/unavailableDayTypes";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function enumerateDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    return dates;
  }

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

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

function parseBodyDate(value: unknown) {
  const normalized = normalizeText(value);
  return DATE_PATTERN.test(normalized) ? normalized : "";
}

function parseBodyBlockType(value: unknown) {
  const normalized = normalizeText(value);
  return MANUAL_UNAVAILABLE_BLOCK_TYPES.includes(
    normalized as (typeof MANUAL_UNAVAILABLE_BLOCK_TYPES)[number],
  )
    ? normalized
    : "";
}

export async function GET(request: NextRequest) {
  try {
    const unavailableDays = await listScheduleUnavailableDays(
      request.headers.get("cookie"),
    );
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

  const blockedDate = parseBodyDate((body as Record<string, unknown>).blockedDate);
  const startDate = parseBodyDate((body as Record<string, unknown>).startDate);
  const endDate = parseBodyDate((body as Record<string, unknown>).endDate);
  const reason = normalizeText((body as Record<string, unknown>).reason);
  const blockType = parseBodyBlockType((body as Record<string, unknown>).blockType);
  const notes = normalizeText((body as Record<string, unknown>).notes) || null;

  const normalizedStartDate = startDate || blockedDate;
  const normalizedEndDate = endDate || normalizedStartDate;

  if (!normalizedStartDate || !normalizedEndDate) {
    return NextResponse.json(
      { error: "Start date and end date are required." },
      { status: 400 },
    );
  }

  if (normalizedEndDate < normalizedStartDate) {
    return NextResponse.json(
      { error: "End date cannot be earlier than start date." },
      { status: 400 },
    );
  }

  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required." },
      { status: 400 },
    );
  }

  if (!blockType) {
    return NextResponse.json(
      { error: "Choose a valid unavailable day type." },
      { status: 400 },
    );
  }

  const daysToCreate = enumerateDateRange(normalizedStartDate, normalizedEndDate);

  if (daysToCreate.length === 0) {
    return NextResponse.json(
      { error: "Failed to build the unavailable day range." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .insert(
      daysToCreate.map((date) => ({
        blocked_date: date,
        reason,
        block_type: blockType,
        notes,
        is_active: true,
        updated_at: new Date().toISOString(),
      })),
    )
    .select("unavailable_day_id, blocked_date, reason, block_type, notes")
    .order("blocked_date", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to create unavailable day." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    unavailableDays: (data ?? []).map((entry) => ({
      id: entry.unavailable_day_id,
      blockedDate: entry.blocked_date,
      reason: entry.reason,
      blockType: entry.block_type,
      notes: entry.notes,
      source: "manual",
      isEditable: true,
    })),
    createdCount: daysToCreate.length,
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

  const unavailableDayId = normalizeText(
    (body as Record<string, unknown>).unavailableDayId,
  );
  const blockedDate = parseBodyDate((body as Record<string, unknown>).blockedDate);
  const reason = normalizeText((body as Record<string, unknown>).reason);
  const blockType = parseBodyBlockType((body as Record<string, unknown>).blockType);
  const notes = normalizeText((body as Record<string, unknown>).notes) || null;

  if (!unavailableDayId) {
    return NextResponse.json(
      { error: "Missing unavailable day id." },
      { status: 400 },
    );
  }

  if (!blockedDate || !reason || !blockType) {
    return NextResponse.json(
      { error: "Date, reason, and type are required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("unavailable_days")
    .update({
      blocked_date: blockedDate,
      reason,
      block_type: blockType,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("unavailable_day_id", unavailableDayId)
    .eq("is_active", true)
    .select("unavailable_day_id, blocked_date, reason, block_type, notes")
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
      blockedDate: data.blocked_date,
      reason: data.reason,
      blockType: data.block_type,
      notes: data.notes,
      source: "manual",
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
