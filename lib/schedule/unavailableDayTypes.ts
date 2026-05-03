export const MANUAL_UNAVAILABLE_BLOCK_TYPES = [
  "company_blackout",
  "manual_block",
  "maintenance",
  "other",
] as const;

export type ManualUnavailableBlockType =
  (typeof MANUAL_UNAVAILABLE_BLOCK_TYPES)[number];

export type ScheduleUnavailableDay = {
  id: string;
  blockedDate: string;
  reason: string;
  blockType: string;
  notes: string | null;
  source: "manual" | "holiday";
  isEditable: boolean;
};
