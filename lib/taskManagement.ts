export type TaskManagementMainTask = {
  main_task_id: string;
  name: string;
  is_active: boolean;
  default_sort_order: number | null;
  replaced_by_main_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskManagementSubTask = {
  sub_task_id: string;
  main_task_id: string;
  description: string;
  is_active: boolean;
  replaced_by_sub_task_id: string | null;
  default_equipment: string[];
  default_materials: string[];
  default_sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type TaskManagementResourceOption = {
  id: string;
  name: string;
  meta?: string | null;
};

function uniqueTrimmedStrings(values: string[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function extractObjectString(value: Record<string, unknown>) {
  const candidateKeys = [
    "id",
    "material_id",
    "equipment_id",
    "materialId",
    "equipmentId",
    "name",
  ] as const;

  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueTrimmedStrings(
      value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const extracted = extractObjectString(item as Record<string, unknown>);
          return extracted ? [extracted] : [];
        }
        return [];
      }),
    );
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseStringArray(parsed);
      }
    } catch {
      return [trimmed];
    }
  }

  return [];
}

export function normalizeSortOrder(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortMainTasks<T extends { name: string; default_sort_order: number | null }>(
  tasks: T[],
) {
  return [...tasks].sort((a, b) => {
    const sortGap = Number(a.default_sort_order ?? 0) - Number(b.default_sort_order ?? 0);
    if (sortGap !== 0) return sortGap;
    return a.name.localeCompare(b.name);
  });
}

export function sortSubTasks<
  T extends { description: string; default_sort_order: number | null },
>(tasks: T[]) {
  return [...tasks].sort((a, b) => {
    const sortGap = Number(a.default_sort_order ?? 0) - Number(b.default_sort_order ?? 0);
    if (sortGap !== 0) return sortGap;
    return a.description.localeCompare(b.description);
  });
}
