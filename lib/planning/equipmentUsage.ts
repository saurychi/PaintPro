const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EquipmentUsageRecord = Record<string, unknown>;

export type ParsedEquipmentUsage = {
  equipmentId: string;
  legacyName: string;
  quantity: number;
  notes: string | null;
};

export type StoredEquipmentUsage = {
  equipment_id: string;
  quantity: number;
  notes: string | null;
};

function asRecord(value: unknown): EquipmentUsageRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EquipmentUsageRecord)
    : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readPositiveQuantity(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) return 1;
  return Math.max(1, Math.round(numericValue));
}

export function isEquipmentUsageId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function parseEquipmentUsage(value: unknown): ParsedEquipmentUsage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);

      return {
        equipmentId: isEquipmentUsageId(
          readString(
            record?.equipment_id,
            record?.equipmentId,
            record?.id,
          ),
        )
          ? readString(record?.equipment_id, record?.equipmentId, record?.id)
          : "",
        legacyName: readString(record?.name, record?.title),
        quantity: readPositiveQuantity(record?.quantity),
        notes: readString(record?.notes, record?.note) || null,
      };
    })
    .filter((item) => item.equipmentId || item.legacyName);
}

export function normalizeEquipmentUsageForStorage(
  value: unknown,
): StoredEquipmentUsage[] {
  return parseEquipmentUsage(value)
    .filter((item) => item.equipmentId)
    .map((item) => ({
      equipment_id: item.equipmentId,
      quantity: item.quantity,
      notes: item.notes,
    }));
}

export function collectEquipmentUsageIds(values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        parseEquipmentUsage(value)
          .map((item) => item.equipmentId)
          .filter(Boolean),
      ),
    ),
  );
}

export function collectLegacyEquipmentNames(values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        parseEquipmentUsage(value)
          .map((item) => item.legacyName)
          .filter(Boolean),
      ),
    ),
  );
}
