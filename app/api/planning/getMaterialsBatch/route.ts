import { NextResponse } from "next/server";
import { getPlanningCatalog } from "@/lib/planning/catalogCache";

// Batched counterpart to /api/planning/getMaterials. Resolves every
// (taskName, subTaskTitle) pair against the in-memory planning catalog
// — zero DB round-trips on cache hit.

type Item = { taskName: string; subTaskTitle: string | null };

type MaterialOut = {
  material_id: string;
  name: string;
  unit: string;
  unit_cost: number;
  notes?: string;
};

type ResultEntry = {
  taskName: string;
  subTaskTitle: string | null;
  materials: MaterialOut[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

// sub_task.default_materials is stored as a JSON array of material_id
// strings, sometimes serialized as a string (legacy rows). Tolerate
// both shapes so a stale row doesn't cost the user their generation.
function parseMaterialIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.map((item) => (typeof item === "string" ? item.trim() : "")),
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return uniqueStrings(
          parsed.map((item) => (typeof item === "string" ? item.trim() : "")),
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isObj(body) || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "Body must be { items: Array<{ taskName, subTaskTitle }> }." },
      { status: 400 },
    );
  }

  const items: Item[] = (body.items as unknown[])
    .filter(isObj)
    .map((raw) => ({
      taskName: typeof raw.taskName === "string" ? raw.taskName.trim() : "",
      subTaskTitle:
        typeof raw.subTaskTitle === "string" && raw.subTaskTitle.trim()
          ? raw.subTaskTitle.trim()
          : null,
    }))
    .filter((item) => item.taskName);

  if (items.length === 0) {
    return NextResponse.json({ results: [] });
  }

  let catalog;
  try {
    catalog = await getPlanningCatalog();
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load planning catalog.", details: e?.message },
      { status: 500 },
    );
  }

  const results: ResultEntry[] = items.map((item) => {
    const mainTask = catalog.mainTasksByName.get(item.taskName);
    if (!mainTask) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        materials: [],
      };
    }

    // With a known sub-task, look up that one row. Otherwise union
    // every sub-task under the main task — matches the single-item
    // route's `subTaskTitle === null` fallback.
    const subTaskRows = item.subTaskTitle
      ? [
          catalog.subTasksByPair.get(
            `${mainTask.id}::${item.subTaskTitle.toLowerCase()}`,
          ),
        ].filter((row): row is NonNullable<typeof row> => Boolean(row))
      : (catalog.subTasksByMainTaskId.get(mainTask.id) ?? []);

    const materialIds = uniqueStrings(
      subTaskRows.flatMap((row) => parseMaterialIds(row.defaultMaterials)),
    );

    const materials = materialIds
      .map((id) => catalog.materialsById.get(id))
      .filter((mat): mat is NonNullable<typeof mat> => Boolean(mat))
      .map((mat) => ({
        material_id: mat.id,
        name: mat.name,
        unit: mat.unit,
        unit_cost: Number(mat.unitCost ?? 0),
        notes: mat.notes ?? undefined,
      }));

    return {
      taskName: item.taskName,
      subTaskTitle: item.subTaskTitle,
      materials,
    };
  });

  return NextResponse.json({ results });
}
