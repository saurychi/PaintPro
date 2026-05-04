import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Required columns on `materials` for this endpoint:
//   ALTER TABLE materials ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
//   ALTER TABLE materials ADD COLUMN IF NOT EXISTS stock_needed NUMERIC DEFAULT 0;
//
// Marks the listed materials as needing reorder so the inventory team / dashboard
// can act on them. `stock_needed` is the deficit for the project to be fulfilled
// — accumulated across calls so multiple projects asking for the same material
// don't overwrite each other.

type RequestItem = {
  materialId?: unknown;
  stockNeeded?: unknown;
};

type StockRow = {
  material_id: string;
  stock_needed: number | null;
};

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isObj(body)) {
    return NextResponse.json(
      { error: "Invalid body shape." },
      { status: 400 },
    );
  }

  const items = Array.isArray(body.items) ? (body.items as RequestItem[]) : [];

  // De-dupe by materialId, sum the requested deficits so multiple project rows
  // asking for the same material accumulate into one stock_needed value.
  const requestedByMaterial = new Map<string, number>();
  for (const item of items) {
    const materialId =
      typeof item.materialId === "string" ? item.materialId.trim() : "";
    const stockNeeded = Number(item.stockNeeded ?? 0);
    if (!materialId || !Number.isFinite(stockNeeded) || stockNeeded <= 0) {
      continue;
    }
    requestedByMaterial.set(
      materialId,
      (requestedByMaterial.get(materialId) ?? 0) + stockNeeded,
    );
  }

  if (requestedByMaterial.size === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ids = Array.from(requestedByMaterial.keys());

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("materials")
    .select("material_id, stock_needed")
    .in("material_id", ids)
    .returns<StockRow[]>();

  if (existingError) {
    return NextResponse.json(
      {
        error: "Failed to read materials for reorder.",
        details: existingError.message,
      },
      { status: 500 },
    );
  }

  const existingById = new Map(
    (existing ?? []).map((row) => [
      row.material_id,
      Number(row.stock_needed ?? 0),
    ]),
  );

  const errors: { materialId: string; details: string }[] = [];
  let updated = 0;

  for (const [materialId, requested] of requestedByMaterial.entries()) {
    const existingNeed = existingById.get(materialId) ?? 0;
    const next = Math.max(existingNeed, requested);

    const { error: updateError } = await supabaseAdmin
      .from("materials")
      .update({
        status: "reorder",
        stock_needed: next,
        updated_at: new Date().toISOString(),
      })
      .eq("material_id", materialId);

    if (updateError) {
      errors.push({
        materialId,
        details: updateError.message,
      });
      continue;
    }
    updated += 1;
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        updated,
        errors,
        error: "Some materials could not be marked for reorder.",
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ updated });
}
