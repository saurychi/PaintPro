import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/inventory/archive
//
// Flip a material/equipment row between Archived and its restored
// status (Active for materials, Available for equipment). Service-role
// write to bypass RLS; role-gated to admin/manager/staff so the
// browser doesn't need a direct table permission.

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
      (role !== "admin" && role !== "manager" && role !== "staff")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    const type = body?.type as "materials" | "equipment" | undefined;
    const isArchiving = body?.isArchiving === true;

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }
    if (type !== "materials" && type !== "equipment") {
      return NextResponse.json(
        { error: "Invalid type (must be materials or equipment)." },
        { status: 400 },
      );
    }

    const table = type;
    const idField = type === "materials" ? "material_id" : "equipment_id";
    const restoreStatus = type === "materials" ? "Active" : "Available";
    const newStatus = isArchiving ? "Archived" : restoreStatus;

    // Block archiving a material that still has stock on hand. The
    // status flag is what hides a material from quote / project flows,
    // so archiving a row with remaining stock would orphan that
    // inventory. Equipment is unit-tracked, not stock-tracked, so the
    // same gate doesn't apply.
    if (isArchiving && type === "materials") {
      const { data: stockRow, error: stockError } = await supabaseAdmin
        .from("materials")
        .select("current_in_stock")
        .eq("material_id", id)
        .maybeSingle();

      if (stockError) {
        return NextResponse.json(
          {
            error: "Failed to check material stock.",
            details: stockError.message,
          },
          { status: 500 },
        );
      }

      const stock = Number(stockRow?.current_in_stock ?? 0);
      if (Number.isFinite(stock) && stock > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot archive a material with stock on hand. Bring current_in_stock to 0 first.",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await supabaseAdmin
      .from(table)
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq(idField, id);

    if (error) {
      return NextResponse.json(
        {
          error: `Failed to ${isArchiving ? "archive" : "restore"} item.`,
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error updating inventory status.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
