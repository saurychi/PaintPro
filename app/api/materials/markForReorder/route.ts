import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Required columns on `materials` for this endpoint:
//   ALTER TABLE materials ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
//   ALTER TABLE materials ADD COLUMN IF NOT EXISTS needed_stock NUMERIC DEFAULT 0;
//
// Marks the listed materials as needing reorder so the inventory team / dashboard
// can act on them. `needed_stock` is the deficit for the project to be fulfilled
// — accumulated across calls so multiple projects asking for the same material
// don't overwrite each other.

type RequestItem = {
  materialId?: unknown;
  neededStock?: unknown;
};

type StockRow = {
  material_id: string;
  needed_stock: number | null;
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
  // asking for the same material accumulate into one needed_stock value.
  const requestedByMaterial = new Map<string, number>();
  for (const item of items) {
    const materialId =
      typeof item.materialId === "string" ? item.materialId.trim() : "";
    const neededStock = Number(item.neededStock ?? 0);
    if (!materialId || !Number.isFinite(neededStock) || neededStock <= 0) {
      continue;
    }
    requestedByMaterial.set(
      materialId,
      (requestedByMaterial.get(materialId) ?? 0) + neededStock,
    );
  }

  if (requestedByMaterial.size === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ids = Array.from(requestedByMaterial.keys());

  // Try to read existing needed_stock so multiple projects can accumulate.
  // If the column is missing (migration not run), fall through and just write
  // the requested deficit instead of 500'ing.
  const existingById = new Map<string, number>();
  let neededStockAvailable = true;

  const existingResult = await supabaseAdmin
    .from("materials")
    .select("material_id, needed_stock")
    .in("material_id", ids)
    .returns<StockRow[]>();

  if (existingResult.error) {
    if (isMissingColumnError(existingResult.error.message, "needed_stock")) {
      neededStockAvailable = false;
    } else {
      return NextResponse.json(
        {
          error: "Failed to read materials for reorder.",
          details: existingResult.error.message,
        },
        { status: 500 },
      );
    }
  } else {
    for (const row of existingResult.data ?? []) {
      existingById.set(row.material_id, Number(row.needed_stock ?? 0));
    }
  }

  const errors: { materialId: string; details: string }[] = [];
  let updated = 0;
  // The rest of the app stores Pascal-case statuses (Active, Archived,
  // Available) and the materials.status CHECK constraint enforces that
  // set. Don't try to flip status to a sentinel like "reorder" here.
  // needed_stock > 0 is the canonical reorder flag — every inventory
  // surface already keys off it (admin/inventory page filters by
  // needed_stock, the quick-add modal opens against needed_stock).
  // Writing status caused the whole UPDATE to fail the CHECK and silently
  // dropped the needed_stock write along with it.

  for (const [materialId, requested] of requestedByMaterial.entries()) {
    if (!neededStockAvailable) break;

    const existingNeed = existingById.get(materialId) ?? 0;
    // Round up so a partial-unit deficit (e.g. planned 105 minus 2.5 in
    // stock = 102.5) still buys enough stock to cover the project. Also
    // keeps the value compatible with integer-typed needed_stock columns
    // in production — Postgres rejects "102.5" for an int column.
    const next = Math.ceil(Math.max(existingNeed, requested));

    const update: Record<string, unknown> = {
      needed_stock: next,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("materials")
      .update(update)
      .eq("material_id", materialId);

    if (updateError) {
      // Migration not run yet: needed_stock column missing. Flip the
      // capability flag so the response can warn the caller and skip
      // the remaining materials (they'll all hit the same wall).
      if (isMissingColumnError(updateError.message, "needed_stock")) {
        neededStockAvailable = false;
        break;
      }

      errors.push({
        materialId,
        details: updateError.message,
      });
      continue;
    }
    updated += 1;
  }

  if (!neededStockAvailable) {
    return NextResponse.json(
      {
        updated,
        warning:
          "materials.needed_stock column is missing — the reorder flag wasn't persisted. Run the SQL migration in app/api/materials/markForReorder/route.ts.",
      },
      { status: 200 },
    );
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

function isMissingColumnError(message: string, column: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes(`column "${column}"`) ||
    lower.includes(`column ${column}`) ||
    (lower.includes("does not exist") && lower.includes(column.toLowerCase()))
  );
}
