"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  MessageSquare,
  Plus,
  Trash2,
  Check,
  Ruler,
  X,
  Loader2,
  RotateCcw,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

import StaffPageShell from "@/components/staff/StaffPageShell";
import {
  MEASURE_HANDOFF_KEY,
  presetOptions,
  type MeasureHandoff,
  type SurfacePresetOption,
} from "@/lib/measure";
import type {
  ScaleBandKey,
  SurfaceScalePresets,
} from "@/lib/planning/surfacePresets";

const ACCENT = "#00c065";

// Mirrors the wizard's MeasurementModal row model — each row carries a
// preset, a quick "small / medium / large" estimate band, and an exact
// numeric value. `isManualOverride` flips on when the staff types a
// specific number; `isMeasurementPending` flips on when they've added the
// row but haven't picked a value yet. Both flags drive how the row reads
// in the generated message.
//
// Area presets (unit === "m2") additionally let the staff pick how they
// want to provide the value: enter the raw area directly, or enter width
// and height and let the page multiply them. `inputMode` controls which
// inputs render; `width` / `height` hold the dimension-mode entries so a
// page refresh restores them through localStorage.
type AreaInputMode = "area" | "dimensions";

type SurfaceRow = {
  id: string;
  surfaceKey: string;
  sizeBand: ScaleBandKey;
  estimatedValue: number;
  isManualOverride: boolean;
  isMeasurementPending: boolean;
  inputMode: AreaInputMode;
  width: string;
  height: string;
};

// The full row set + source-message banner are persisted under this key so
// the staff can close the tab, walk between rooms, and come back to where
// they left off. sessionStorage handoff from the messages page wins on
// first hydration; afterwards localStorage takes over.
const STORAGE_KEY = "paintpro_measure_generator_state";

type PersistedState = {
  rows: SurfaceRow[];
  sourceMessage: string;
  // Hand-edited textarea content + whether the staff has diverged from
  // the auto-generated preview. Optional for backwards-compat with any
  // earlier localStorage payload.
  editedMessage?: string;
  isDetached?: boolean;
};

const BAND_ORDER: ScaleBandKey[] = ["small", "medium", "large"];

function bandIndex(band: ScaleBandKey): number {
  const i = BAND_ORDER.indexOf(band);
  return i === -1 ? 1 : i;
}

function bandFromIndex(index: number): ScaleBandKey {
  return (
    BAND_ORDER[Math.max(0, Math.min(BAND_ORDER.length - 1, index))] ?? "medium"
  );
}

function unitLabel(unit: string): string {
  if (unit === "m2") return "m²";
  if (unit === "m") return "m";
  return "count";
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function makeRow(
  surfaceKey: string,
  presets: SurfaceScalePresets,
): SurfaceRow {
  const preset = presets[surfaceKey];
  const band: ScaleBandKey = "medium";
  return {
    id: newId(),
    surfaceKey,
    sizeBand: band,
    estimatedValue: preset?.bands[band].suggested ?? 0,
    isManualOverride: false,
    isMeasurementPending: true,
    // Area surfaces start in "dimensions" mode so the staff falls into the
    // intuitive W × H flow by default. They can switch to "area" if they
    // already have the total. Non-area surfaces never read this field but
    // we still seed it for type completeness.
    inputMode: preset?.unit === "m2" ? "dimensions" : "area",
    width: "",
    height: "",
  };
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

function rowLine(
  row: SurfaceRow,
  preset: SurfacePresetOption | undefined,
): string | null {
  // No surface type selected — nothing to render for this row.
  if (!preset) return null;
  // Pending rows still appear in the preview with an em-dash
  // placeholder so the message takes shape as soon as the staff adds
  // a row; the number swaps in once they enter a value.
  const value = row.isMeasurementPending
    ? "—"
    : formatValue(row.estimatedValue);
  if (preset.unit === "count") {
    return `• ${preset.label}: ${value}`;
  }
  return `• ${preset.label}: ${value} ${unitLabel(preset.unit)}`;
}

function buildMessage(
  rows: SurfaceRow[],
  byKey: Map<string, SurfacePresetOption>,
): string {
  const lines = rows
    .map((row) => rowLine(row, byKey.get(row.surfaceKey)))
    .filter((line): line is string => Boolean(line));
  if (lines.length === 0) return "";
  return [
    "Hi, please review the actual surface measurements for the upcoming project:",
    "",
    ...lines,
    "",
    "Please confirm if these measurements are correct or let me know if anything needs to be adjusted.",
    "",
    "Thank you.",
  ].join("\n");
}

function readPersistedState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or disabled — swallow silently; the in-memory
    // state still works for the current session.
  }
}

function clearPersistedState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function MeasureGeneratorPage() {
  const router = useRouter();

  const [rows, setRows] = useState<SurfaceRow[]>([]);
  const [sourceMessage, setSourceMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const [presets, setPresets] = useState<SurfaceScalePresets>({});
  const [options, setOptions] = useState<SurfacePresetOption[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const [pendingHandoff, setPendingHandoff] = useState<MeasureHandoff | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  // Row id whose Quick Estimate modal is currently open. Null = closed.
  const [quickEstimateRowId, setQuickEstimateRowId] = useState<string | null>(
    null,
  );

  // The textarea content for the preview pane. Starts in sync with the
  // auto-generated `preview`; once the staff types something different,
  // `isDetached` flips so subsequent row changes don't clobber their
  // edits. The Reset button re-attaches.
  const [editedMessage, setEditedMessage] = useState("");
  const [isDetached, setIsDetached] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(MEASURE_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(MEASURE_HANDOFF_KEY);
    try {
      const handoff = JSON.parse(raw) as MeasureHandoff;
      setPendingHandoff(handoff);
      if (handoff.sourceMessage) setSourceMessage(handoff.sourceMessage);
    } catch {
      // Bad payload — fall through to the persisted state.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPresetsLoading(true);
        const response = await fetch("/api/planning/getSurfaceScalePresets", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          surfaceScalePresets?: SurfaceScalePresets;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load surface presets.");
        }
        const next = data?.surfaceScalePresets ?? {};
        setPresets(next);
        setOptions(presetOptions(next));
      } catch (error) {
        if (cancelled) return;
        setPresetsError(
          error instanceof Error ? error.message : "Failed to load surfaces.",
        );
      } finally {
        if (!cancelled) setPresetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byKey = useMemo(() => {
    const map = new Map<string, SurfacePresetOption>();
    for (const option of options) map.set(option.key, option);
    return map;
  }, [options]);

  // First-pass hydration: once presets are loaded, decide whether to
  // resume from localStorage or hard-reset from the messages-page
  // handoff. A handoff means the staff just clicked "Open in Measure
  // Generator" on a specific message, so we wipe any previous work and
  // seed fresh rows from that message's surfaces with no measurements
  // entered yet. Without a handoff, we replay whatever was persisted.
  // Runs exactly once.
  useEffect(() => {
    if (presetsLoading) return;
    if (hydrated) return;

    if (pendingHandoff && Array.isArray(pendingHandoff.surfaceKeys)) {
      const seedRows = pendingHandoff.surfaceKeys
        .filter((key) => byKey.has(key))
        .map((key) => makeRow(key, presets));
      setRows(seedRows);
      setSourceMessage(pendingHandoff.sourceMessage ?? "");
      setEditedMessage("");
      setIsDetached(false);
      clearPersistedState();
    } else {
      const persisted = readPersistedState();
      const persistedRows = (persisted?.rows ?? []).filter((row) =>
        byKey.has(row.surfaceKey),
      );
      if (persisted?.sourceMessage) setSourceMessage(persisted.sourceMessage);
      if (typeof persisted?.editedMessage === "string") {
        setEditedMessage(persisted.editedMessage);
      }
      if (typeof persisted?.isDetached === "boolean") {
        setIsDetached(persisted.isDetached);
      }
      setRows(persistedRows);
    }

    setPendingHandoff(null);
    setHydrated(true);
  }, [presetsLoading, hydrated, pendingHandoff, byKey, presets]);

  // Persist rows + banner + textarea state on every change once we've
  // hydrated, so a refresh or tab close mid-job doesn't wipe the work.
  useEffect(() => {
    if (!hydrated) return;
    writePersistedState({ rows, sourceMessage, editedMessage, isDetached });
  }, [rows, sourceMessage, editedMessage, isDetached, hydrated]);

  const preview = useMemo(() => buildMessage(rows, byKey), [rows, byKey]);

  // Measurements are the source of truth — whenever the generated
  // preview changes, the textarea re-syncs unconditionally. Manual
  // edits between measurement changes are still possible (the
  // textarea is editable), but any subsequent row add / remove /
  // value update overwrites them. Empty rows clear the preview too.
  useEffect(() => {
    setEditedMessage(preview);
    setIsDetached(false);
  }, [preview]);

  // Copy is gated on (a) having actual content in the textarea AND
  // (b) every added row having a real measurement — otherwise the
  // staff would ship a message with em-dash placeholders to the
  // manager. Pure free-text (no rows) is still copyable so a quick
  // custom reply works.
  const hasPendingRows = rows.some((row) => row.isMeasurementPending);
  const hasCopyableMessage =
    editedMessage.trim().length > 0 && !hasPendingRows;

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addRow = useCallback(() => {
    if (options.length === 0) return;
    const firstKey = options[0].key;
    setRows((prev) => [...prev, makeRow(firstKey, presets)]);
  }, [options, presets]);

  // Slider change: snap the row to the band's suggested value. Clears the
  // pending/manual-override flags + width/height so the row reads as a
  // clean band estimate again.
  const handleBandChange = useCallback(
    (id: string, band: ScaleBandKey) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const preset = presets[r.surfaceKey];
          if (!preset) return r;
          return {
            ...r,
            sizeBand: band,
            estimatedValue: preset.bands[band].suggested,
            isManualOverride: false,
            isMeasurementPending: false,
            width: "",
            height: "",
          };
        }),
      );
    },
    [presets],
  );

  // Exact input change: empty string clears the value back to "pending";
  // any number flips the row into manual-override mode.
  const handleExactChange = useCallback((id: string, raw: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const trimmed = raw.trim();
        if (trimmed === "") {
          return {
            ...r,
            estimatedValue: 0,
            isManualOverride: false,
            isMeasurementPending: true,
          };
        }
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric)) return r;
        return {
          ...r,
          estimatedValue: numeric,
          isManualOverride: true,
          isMeasurementPending: false,
        };
      }),
    );
  }, []);

  // Dimensions input change: track each side independently so the staff
  // can fill them in any order. The estimated area only counts as "set"
  // once both sides have a numeric value — partial entry stays pending
  // so the message preview doesn't claim a half-baked number.
  const handleDimensionChange = useCallback(
    (id: string, field: "width" | "height", raw: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, [field]: raw } as SurfaceRow;
          const w = Number(next.width.trim());
          const h = Number(next.height.trim());
          const bothFilled =
            next.width.trim() !== "" &&
            next.height.trim() !== "" &&
            Number.isFinite(w) &&
            Number.isFinite(h);
          if (bothFilled) {
            next.estimatedValue = Math.round(w * h * 100) / 100;
            next.isManualOverride = true;
            next.isMeasurementPending = false;
          } else {
            next.estimatedValue = 0;
            next.isManualOverride = false;
            next.isMeasurementPending = true;
          }
          return next;
        }),
      );
    },
    [],
  );

  // Toggle area entry mode. Clears partial entry going either direction so
  // the staff never sees stale numbers behind a freshly-switched mode.
  const handleInputModeChange = useCallback(
    (id: string, mode: AreaInputMode) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (r.inputMode === mode) return r;
          return {
            ...r,
            inputMode: mode,
            width: "",
            height: "",
            estimatedValue: 0,
            isManualOverride: false,
            isMeasurementPending: true,
          };
        }),
      );
    },
    [],
  );

  const handlePresetChange = useCallback(
    (id: string, surfaceKey: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const preset = presets[surfaceKey];
          const band: ScaleBandKey = "medium";
          return {
            ...r,
            surfaceKey,
            sizeBand: band,
            estimatedValue: preset?.bands[band].suggested ?? 0,
            isManualOverride: false,
            isMeasurementPending: true,
            inputMode: preset?.unit === "m2" ? "dimensions" : "area",
            width: "",
            height: "",
          };
        }),
      );
    },
    [presets],
  );

  async function handleCopy() {
    const text = editedMessage.trim();
    if (!text) {
      toast.error("Type or generate a message before copying.");
      return;
    }
    try {
      await navigator.clipboard.writeText(editedMessage);
      setCopied(true);
      toast.success("Message copied to clipboard.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  function handleGoToMessages() {
    router.push("/staff/messages");
  }

  function handleMessageChange(value: string) {
    // Manual edits persist only until the next measurement change —
    // the mirror effect overwrites editedMessage whenever `preview`
    // updates. `isDetached` is kept around for the persisted state
    // shape but no longer gates the sync.
    setEditedMessage(value);
    setIsDetached(value !== preview);
  }

  function handleClearAll() {
    if (rows.length === 0 && !sourceMessage && !editedMessage) return;
    const confirmed = window.confirm(
      "Clear all measurements, the source message, and the edited reply?",
    );
    if (!confirmed) return;
    setRows([]);
    setSourceMessage("");
    setEditedMessage("");
    setIsDetached(false);
    clearPersistedState();
  }

  return (
    <StaffPageShell
      title="Measure Generator"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={rows.length === 0 && !sourceMessage}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Clear
          </button>
        </div>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        {/* Surfaces */}
        <section className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-3 dark:border-slate-700 dark:bg-slate-900">
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-[#00c065]" />
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Measurements
                <span className="ml-2 text-[11px] font-normal text-gray-500 dark:text-slate-400">
                  {rows.length} added
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={addRow}
              disabled={presetsLoading || options.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-[#00c065] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Measurement
            </button>
          </header>

          {sourceMessage ? (
            <div className="shrink-0 border-b border-gray-200 bg-emerald-50/50 px-4 py-3 dark:border-slate-700 dark:bg-[#00c065]/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#00c065]">
                    From the manager's message
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs text-gray-700 dark:text-slate-300">
                    {sourceMessage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceMessage("")}
                  aria-label="Dismiss source message"
                  className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
            {presetsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading surfaces...
              </div>
            ) : presetsError ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <div>
                  <p className="text-sm font-semibold text-red-600">
                    {presetsError}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Check your connection and refresh the page.
                  </p>
                </div>
              </div>
            ) : options.length === 0 ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <p className="text-sm font-semibold text-gray-500">
                  No surfaces configured.
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <div>
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100">
                    <Plus className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-slate-200">
                    No measurements added
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Click <strong>Add Measurement</strong> to start, or open a
                    message with surfaces to auto-fill.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const preset = presets[row.surfaceKey];
                  if (!preset) return null;

                  return (
                    <div
                      key={row.id}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                            Surface Type
                          </label>
                          <select
                            value={row.surfaceKey}
                            onChange={(e) =>
                              handlePresetChange(row.id, e.target.value)
                            }
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            {options.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove measurement"
                          className="mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:-rotate-6 hover:scale-110 hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Exact measurement input */}
                      <div className="mt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                            Exact Measurement
                          </label>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Area presets get a Dimensions ⇄ Area toggle so
                                the staff can either let the page multiply
                                W × H or paste in the total area directly. */}
                            {preset.unit === "m2" ? (
                              <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-[10px] font-semibold dark:border-slate-700 dark:bg-slate-900">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInputModeChange(row.id, "dimensions")
                                  }
                                  className={
                                    row.inputMode === "dimensions"
                                      ? "bg-[#00c065] px-2 py-1 text-white"
                                      : "px-2 py-1 text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  }
                                >
                                  W × H
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInputModeChange(row.id, "area")
                                  }
                                  className={
                                    row.inputMode === "area"
                                      ? "bg-[#00c065] px-2 py-1 text-white"
                                      : "px-2 py-1 text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  }
                                >
                                  Area only
                                </button>
                              </div>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setQuickEstimateRowId(row.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-[#00a054] transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] dark:border-[#00c065]/30 dark:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/20"
                            >
                              <Gauge className="h-3 w-3" />
                              Quick Estimate
                            </button>
                          </div>
                        </div>

                        {preset.unit === "m2" && row.inputMode === "dimensions" ? (
                          <>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <div className="flex overflow-hidden rounded-md border border-gray-200 bg-white transition-colors focus-within:border-[#00c065] focus-within:ring-1 focus-within:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-900">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.1"
                                  value={row.width}
                                  onChange={(e) =>
                                    handleDimensionChange(
                                      row.id,
                                      "width",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Width"
                                  className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-gray-900 outline-none dark:text-slate-100"
                                />
                                <div className="flex items-center border-l border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  m
                                </div>
                              </div>
                              <div className="flex overflow-hidden rounded-md border border-gray-200 bg-white transition-colors focus-within:border-[#00c065] focus-within:ring-1 focus-within:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-900">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.1"
                                  value={row.height}
                                  onChange={(e) =>
                                    handleDimensionChange(
                                      row.id,
                                      "height",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Height"
                                  className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-gray-900 outline-none dark:text-slate-100"
                                />
                                <div className="flex items-center border-l border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  m
                                </div>
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] text-gray-500 dark:text-slate-400">
                              Area auto-computes once both width and height
                              are entered.
                            </p>
                          </>
                        ) : (
                          <div className="mt-1 flex overflow-hidden rounded-md border border-gray-200 bg-white transition-colors focus-within:border-[#00c065] focus-within:ring-1 focus-within:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-900">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.1"
                              value={
                                row.isMeasurementPending
                                  ? ""
                                  : row.estimatedValue
                              }
                              onChange={(e) =>
                                handleExactChange(row.id, e.target.value)
                              }
                              placeholder="Enter measurement"
                              className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-gray-900 outline-none dark:text-slate-100"
                            />
                            <div className="flex items-center border-l border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {unitLabel(preset.unit)}
                            </div>
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {row.isMeasurementPending ? (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              Pending
                            </span>
                          ) : row.isManualOverride ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#00a054] dark:border-[#00c065]/30 dark:bg-[#00c065]/10 dark:text-emerald-300">
                              Exact
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {row.sizeBand} estimate
                            </span>
                          )}
                          {!row.isMeasurementPending ? (
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">
                              Current:{" "}
                              <span className="font-semibold text-gray-700 dark:text-slate-200">
                                {formatValue(row.estimatedValue)}{" "}
                                {unitLabel(preset.unit)}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Preview */}
        <section className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2 dark:border-slate-700 dark:bg-slate-900">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Message Preview
              </p>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                Auto-built from your measurements.
              </p>
            </div>
          </header>

          <div className="flex-1 min-h-0 p-3">
            <textarea
              value={editedMessage}
              onChange={(e) => handleMessageChange(e.target.value)}
              placeholder="Add a measurement to get started, or type your reply here."
              className="h-full w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-3 font-sans text-sm text-gray-800 outline-none transition-colors focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
            />
          </div>

          {/* Footer — Copy + Go to Messages live with the preview they
              act on, instead of in the page-level action bar. */}
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
            <button
              type="button"
              onClick={handleGoToMessages}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <MessageSquare className="h-4 w-4" />
              Go to Messages
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!hasCopyableMessage}
              title={
                hasPendingRows
                  ? "Fill in every measurement before copying — the message still has placeholder values."
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              style={{ backgroundColor: ACCENT }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy Message"}
            </button>
          </footer>
        </section>
      </div>

      {/* Quick Estimate modal — slide between Small / Medium / Large to
          snap the row's value to that band's suggested area/length/count.
          Mutations commit immediately (same as the wizard's slider) so
          the staff can close the modal and see the preview already
          reflects the change. */}
      {(() => {
        if (!quickEstimateRowId) return null;
        const row = rows.find((r) => r.id === quickEstimateRowId);
        if (!row) return null;
        const preset = presets[row.surfaceKey];
        if (!preset) return null;
        const band = preset.bands[row.sizeBand];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
            <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-700">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-[#00a054] dark:border-[#00c065]/30 dark:bg-[#00c065]/10 dark:text-emerald-300">
                    <Gauge className="h-3 w-3" />
                    Quick Estimate
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-gray-900 dark:text-slate-100">
                    {preset.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickEstimateRowId(null)}
                  aria-label="Close quick estimate"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:rotate-90 hover:scale-110 hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    Size Scale
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#00a054] ring-1 ring-emerald-100 dark:bg-[#00c065]/10 dark:text-emerald-300 dark:ring-emerald-700/40">
                    {row.isManualOverride ? "Overridden" : band.label}
                  </span>
                </div>

                {/* `appearance-none` strips the native thumb. Without
                    explicit ::-webkit-slider-thumb / ::-moz-range-thumb
                    styles below, the track renders but the draggable
                    thumb is invisible — staff can't move the slider.
                    The thumb rules are scoped to .quick-estimate-slider
                    so the bump-up doesn't bleed into other inputs. */}
                <style>{`
                  .quick-estimate-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 18px;
                    height: 18px;
                    border-radius: 9999px;
                    background: ${ACCENT};
                    border: 2px solid #ffffff;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
                    cursor: pointer;
                  }
                  .quick-estimate-slider::-moz-range-thumb {
                    width: 18px;
                    height: 18px;
                    border-radius: 9999px;
                    background: ${ACCENT};
                    border: 2px solid #ffffff;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
                    cursor: pointer;
                  }
                  .quick-estimate-slider:focus {
                    outline: none;
                  }
                  .quick-estimate-slider:focus::-webkit-slider-thumb {
                    box-shadow: 0 0 0 4px rgba(0, 192, 101, 0.18);
                  }
                  .quick-estimate-slider:focus::-moz-range-thumb {
                    box-shadow: 0 0 0 4px rgba(0, 192, 101, 0.18);
                  }
                `}</style>

                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={bandIndex(row.sizeBand)}
                  onChange={(e) =>
                    handleBandChange(
                      row.id,
                      bandFromIndex(Number(e.target.value)),
                    )
                  }
                  className="quick-estimate-slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-emerald-100 dark:bg-emerald-900/40"
                  style={{ accentColor: ACCENT }}
                />

                <div className="grid grid-cols-3 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                  <span>Small</span>
                  <span className="text-center">Medium</span>
                  <span className="text-right">Large</span>
                </div>

                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400">
                    Suggested value
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {formatValue(row.estimatedValue)} {unitLabel(preset.unit)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => setQuickEstimateRowId(null)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#00c065] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97]"
                >
                  <Check className="h-3.5 w-3.5" />
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </StaffPageShell>
  );
}
