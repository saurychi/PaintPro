import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/inventory/quick-add
//
// Bump a material's current_in_stock by `amount` (used by the "Resolve
// Deficit" shortcut in the staff/admin inventory pages). The DB
// trigger on materials decrements needed_stock based on the stock
// delta, so we just write the new total and let the trigger do the
// rest. Role-gated to admin/manager/staff, service-role write.

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
    const materialId = String(body?.materialId ?? "").trim();
    const amount = Number(body?.amount);

    if (!materialId) {
      return NextResponse.json({ error: "Missing materialId." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number." },
        { status: 400 },
      );
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("materials")
      .select("current_in_stock")
      .eq("material_id", materialId)
      .maybeSingle();
    if (readError) {
      return NextResponse.json(
        { error: "Failed to read material.", details: readError.message },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Material not found." }, { status: 404 });
    }

    const newStock = Number(existing.current_in_stock ?? 0) + amount;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("materials")
      .update({ current_in_stock: newStock, updated_at: new Date().toISOString() })
      .eq("material_id", materialId)
      .select("needed_stock")
      .single();
    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update stock.", details: updateError.message },
        { status: 500 },
      );
    }

    // Defensive clear: if the new stock now covers the project
    // deficit, drop needed_stock to 0 so the red "Needed for
    // Projects" pill disappears and the row stops being flagged on
    // the dashboard / sidebar badge.
    const needed = Number(updated?.needed_stock ?? 0);
    if (needed > 0 && newStock >= needed) {
      await supabaseAdmin
        .from("materials")
        .update({ needed_stock: 0, updated_at: new Date().toISOString() })
        .eq("material_id", materialId);
    }

    return NextResponse.json({ ok: true, currentInStock: newStock });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error resolving deficit.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
