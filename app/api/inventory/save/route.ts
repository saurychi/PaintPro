import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/inventory/save
//
// Add or update a material/equipment row. Runs through the service-role
// client so RLS on public.materials / public.equipment doesn't block
// non-admin writers — instead we role-check here. Allowed roles:
// admin, manager, staff. Staff inventory page calls this; admin can
// too (same payload).

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
    const mode = body?.mode as "add" | "edit" | undefined;
    const type = body?.type as "materials" | "equipment" | undefined;
    const dataRaw = body?.data;

    if (mode !== "add" && mode !== "edit") {
      return NextResponse.json(
        { error: "Invalid mode (must be add or edit)." },
        { status: 400 },
      );
    }
    if (type !== "materials" && type !== "equipment") {
      return NextResponse.json(
        { error: "Invalid type (must be materials or equipment)." },
        { status: 400 },
      );
    }
    if (!dataRaw || typeof dataRaw !== "object") {
      return NextResponse.json({ error: "Missing payload data." }, { status: 400 });
    }

    const table = type;
    const idField = type === "materials" ? "material_id" : "equipment_id";

    // Strip joined relations the modal carries around for display so the
    // INSERT/UPDATE only sees real columns. Normalise empty-string FKs
    // to null so Postgres doesn't choke on bad UUIDs.
    const payload: Record<string, any> = { ...dataRaw };
    delete payload.tag;
    delete payload.supplier;
    delete payload.location;
    if (payload.tag_id === "") payload.tag_id = null;
    if (payload.supplier_id === "") payload.supplier_id = null;
    if (payload.location_id === "") payload.location_id = null;

    if (mode === "add") {
      // Don't let the caller pre-set the primary key or timestamps —
      // the DB defaults handle them.
      delete payload[idField];
      delete payload.created_at;
      delete payload.updated_at;

      const { data: inserted, error } = await supabaseAdmin
        .from(table)
        .insert([payload])
        .select()
        .single();
      if (error) {
        return NextResponse.json(
          { error: "Failed to add item.", details: error.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, item: inserted });
    }

    // edit: caller MUST include the id field so we know which row to
    // update; the rest of the payload overwrites whatever's there.
    const id = String(payload[idField] ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { error: `Missing ${idField} for edit.` },
        { status: 400 },
      );
    }
    payload.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from(table)
      .update(payload)
      .eq(idField, id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: "Failed to update item.", details: error.message },
        { status: 500 },
      );
    }

    // Defensive clear: if current_in_stock now covers needed_stock,
    // the deficit is no longer real — zero it out so the red "Needed
    // for Projects" pill drops and the sidebar badge stops flagging
    // it. The DB trigger should normally do this, but we mirror the
    // logic here so a stock edit through this endpoint always leaves
    // the row in a consistent state.
    if (type === "materials" && updated) {
      const stock = Number(updated.current_in_stock ?? 0);
      const needed = Number(updated.needed_stock ?? 0);
      if (needed > 0 && stock >= needed) {
        const { data: cleared, error: clearError } = await supabaseAdmin
          .from("materials")
          .update({
            needed_stock: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("material_id", id)
          .select()
          .single();
        if (!clearError && cleared) {
          return NextResponse.json({ ok: true, item: cleared });
        }
      }
    }

    return NextResponse.json({ ok: true, item: updated });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error saving inventory item.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
