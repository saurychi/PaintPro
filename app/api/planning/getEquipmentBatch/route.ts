import { NextResponse } from "next/server";
import { getPlanningCatalog } from "@/lib/planning/catalogCache";

// Batched counterpart to /api/planning/getEquipment. Same shape as
// getMaterialsBatch — resolves entirely from the in-memory planning
// catalog so a cold catalog load is the only DB cost.

type Item = { taskName: string; subTaskTitle: string | null };

type EquipmentOut = {
  equipment_id: string;
  name: string;
  status?: string;
};

type ResultEntry = {
  taskName: string;
  subTaskTitle: string | null;
  equipment: EquipmentOut[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

// sub_task.default_equipment may carry uuids OR free-form names — keep
// every ref shape (id, equipment_id, name, title) so the caller can
// fall back to name-based lookup when an id isn't present. Without
// the name fallback, rows that only carry `{ name: "Hammer" }` (a
// real shape we've found in older catalog rows) silently drop and
// the project ends up with zero equipment even though the catalog
// has equipment defined for those sub-tasks.
function extractEquipmentRef(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (!isObj(item)) return "";
  const fromEquipmentId =
    typeof item.equipment_id === "string" ? item.equipment_id.trim() : "";
  const fromId = typeof item.id === "string" ? item.id.trim() : "";
  const fromName = typeof item.name === "string" ? item.name.trim() : "";
  const fromTitle = typeof item.title === "string" ? item.title.trim() : "";
  return fromEquipmentId || fromId || fromName || fromTitle || "";
}

function parseEquipmentRefs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(extractEquipmentRef));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return uniqueStrings(parsed.map(extractEquipmentRef));
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
        equipment: [],
      };
    }

    const subTaskRows = item.subTaskTitle
      ? [
          catalog.subTasksByPair.get(
            `${mainTask.id}::${item.subTaskTitle.toLowerCase()}`,
          ),
        ].filter((row): row is NonNullable<typeof row> => Boolean(row))
      : (catalog.subTasksByMainTaskId.get(mainTask.id) ?? []);

    const refs = uniqueStrings(
      subTaskRows.flatMap((row) => parseEquipmentRefs(row.defaultEquipment)),
    );

    const seen = new Set<string>();
    const equipment: EquipmentOut[] = [];
    for (const ref of refs) {
      const matched = UUID_RE.test(ref)
        ? catalog.equipmentById.get(ref)
        : catalog.equipmentByName.get(ref);
      if (!matched) continue;
      if (seen.has(matched.id)) continue;
      seen.add(matched.id);
      equipment.push({
        equipment_id: matched.id,
        name: matched.name,
        status: matched.status ?? undefined,
      });
    }

    return {
      taskName: item.taskName,
      subTaskTitle: item.subTaskTitle,
      equipment,
    };
  });

  return NextResponse.json({ results });
}
