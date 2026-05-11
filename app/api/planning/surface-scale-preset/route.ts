import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/surface-scale-preset
//
// Inserts a new row into surface_scale_presets. The browser supabase
// client gets blocked by RLS on this table for non-admin sessions
// (and even admin sessions, in practice), so this server route
// writes with the service-role client after gating on the caller's
// role.

async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type SurfacePresetBody = {
  surface_key?: unknown;
  label?: unknown;
  unit?: unknown;
  small_label?: unknown;
  medium_label?: unknown;
  large_label?: unknown;
  small_min?: unknown;
  small_max?: unknown;
  small_suggested?: unknown;
  medium_min?: unknown;
  medium_max?: unknown;
  medium_suggested?: unknown;
  large_min?: unknown;
  large_max?: unknown;
  large_suggested?: unknown;
};

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (
      callerStatus !== "active" ||
      (role !== "admin" && role !== "manager")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as SurfacePresetBody | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

    const surface_key = str(body.surface_key);
    const label = str(body.label);
    const unit = str(body.unit);
    const small_label = str(body.small_label) || "Small";
    const medium_label = str(body.medium_label) || "Medium";
    const large_label = str(body.large_label) || "Large";

    if (!surface_key) {
      return NextResponse.json(
        { error: "surface_key is required." },
        { status: 400 },
      );
    }
    if (!label) {
      return NextResponse.json(
        { error: "label is required." },
        { status: 400 },
      );
    }
    if (unit !== "m2" && unit !== "m" && unit !== "count") {
      return NextResponse.json(
        { error: "unit must be m2, m, or count." },
        { status: 400 },
      );
    }

    const numbers = {
      small_min: num(body.small_min),
      small_max: num(body.small_max),
      small_suggested: num(body.small_suggested),
      medium_min: num(body.medium_min),
      medium_max: num(body.medium_max),
      medium_suggested: num(body.medium_suggested),
      large_min: num(body.large_min),
      large_max: num(body.large_max),
      large_suggested: num(body.large_suggested),
    };

    for (const [key, value] of Object.entries(numbers)) {
      if (value === null) {
        return NextResponse.json(
          { error: `${key} must be a finite number.` },
          { status: 400 },
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("surface_scale_presets")
      .insert({
        surface_key,
        label,
        unit,
        small_label,
        medium_label,
        large_label,
        ...numbers,
      });

    if (error) {
      return NextResponse.json(
        { error: "Failed to create surface preset.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, surface_key });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error creating surface preset.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// PATCH /api/planning/surface-scale-preset
//
// Edit an existing surface_scale_presets row. The primary key
// (surface_key) cannot be changed since it's referenced from formula
// expressions and project dimensions. Only label, unit, band labels,
// and band numbers are updatable. Auth gated to admin/manager.
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (
      callerStatus !== "active" ||
      (role !== "admin" && role !== "manager")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | (SurfacePresetBody & { surface_key?: unknown })
      | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

    const surface_key = str(body.surface_key);
    if (!surface_key) {
      return NextResponse.json(
        { error: "surface_key is required to identify the row." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};

    const label = str(body.label);
    if (label) updates.label = label;

    const unit = str(body.unit);
    if (unit) {
      if (unit !== "m2" && unit !== "m" && unit !== "count") {
        return NextResponse.json(
          { error: "unit must be m2, m, or count." },
          { status: 400 },
        );
      }
      updates.unit = unit;
    }

    const smallLabel = str(body.small_label);
    if (smallLabel) updates.small_label = smallLabel;
    const mediumLabel = str(body.medium_label);
    if (mediumLabel) updates.medium_label = mediumLabel;
    const largeLabel = str(body.large_label);
    if (largeLabel) updates.large_label = largeLabel;

    const numericFields: Array<keyof SurfacePresetBody> = [
      "small_min",
      "small_max",
      "small_suggested",
      "medium_min",
      "medium_max",
      "medium_suggested",
      "large_min",
      "large_max",
      "large_suggested",
    ];
    for (const field of numericFields) {
      if (body[field] === undefined) continue;
      const value = num(body[field]);
      if (value === null) {
        return NextResponse.json(
          { error: `${field} must be a finite number.` },
          { status: 400 },
        );
      }
      updates[field] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields supplied to update." },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("surface_scale_presets")
      .update(updates)
      .eq("surface_key", surface_key);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update surface preset.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, surface_key });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error updating surface preset.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/planning/surface-scale-preset
//
// Remove a surface_scale_presets row. Body must include surface_key.
// Doesn't cascade into project dimensions or formula expressions, so
// the caller is responsible for understanding the side-effects (the
// surface stops appearing in measurement pickers; existing project
// rows that reference it still hold the value).
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (
      callerStatus !== "active" ||
      (role !== "admin" && role !== "manager")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      surface_key?: unknown;
    } | null;
    const surface_key = str(body?.surface_key);
    if (!surface_key) {
      return NextResponse.json(
        { error: "surface_key is required." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("surface_scale_presets")
      .delete()
      .eq("surface_key", surface_key);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete surface preset.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, surface_key });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error deleting surface preset.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
