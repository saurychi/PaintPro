// Shared list of common measurement units shown in dropdown selectors
// across the app (inventory modal, formula variable forms, etc.).
// Keeping one source of truth so the options stay in sync everywhere.

export const COMMON_UNITS = [
  "Liter (L)",
  "Gallon (Gal)",
  "Piece (pc)",
  "Set",
  "Meter (m)",
  "Kilogram (kg)",
  "Roll",
  "Tub",
  "Bucket",
  "Sheet",
] as const;

export type CommonUnit = (typeof COMMON_UNITS)[number];
