"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  Ruler,
  X,
  Loader2,
  RotateCcw,
  Gauge,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import StaffPageShell from "@/components/staff/StaffPageShell";
import type { DraftSummary } from "@/components/project-creation/DraftsModal";
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
  // Project code/title that the source message belongs to. Both optional
  // for backwards-compat. Pre-handoff state and direct-DM threads have
  // no project to label.
  projectCode?: string;
  projectTitle?: string;
  // Stashed so a page refresh can re-resolve the project context from the
  // conversation if the original handoff didn't carry projectCode/title.
  conversationId?: string;
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
  // Pending rows still appear in the preview with a placeholder so the
  // message takes shape as soon as the staff adds a row; the number
  // swaps in once they enter a value.
  const value = row.isMeasurementPending
    ? "..."
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

// Shared message used by the auto-recap that fires after Save
// Surfaces. Splits the rows into an
// "added" section and a "still need" section, and switches to a
// "complete" tone once every row has a value.
function buildManagerMessage(
  rows: SurfaceRow[],
  byKey: Map<string, SurfacePresetOption>,
): string {
  const measuredRows = rows.filter((row) => !row.isMeasurementPending);
  const pendingRows = rows.filter((row) => row.isMeasurementPending);
  const allDone = pendingRows.length === 0 && measuredRows.length > 0;

  const measuredLines = measuredRows.map((row) => {
    const preset = byKey.get(row.surfaceKey);
    const label = preset?.label || row.surfaceKey;
    const unit = preset ? unitLabel(preset.unit) : "";
    if (preset?.unit === "count") {
      return `- ${label}: ${formatValue(row.estimatedValue)}`;
    }
    return `- ${label}: ${formatValue(row.estimatedValue)} ${unit}`.trim();
  });

  const pendingLines = pendingRows.map((row) => {
    const preset = byKey.get(row.surfaceKey);
    return `- ${preset?.label || row.surfaceKey}`;
  });

  const lines: string[] = [];
  if (allDone) {
    lines.push("All surface measurements are complete and saved.");
  } else if (measuredLines.length > 0) {
    lines.push("Measurement update.");
  } else {
    lines.push("Measurements still pending.");
  }
  if (measuredLines.length > 0) {
    lines.push("", "Measurements added:", ...measuredLines);
  }
  if (pendingLines.length > 0) {
    lines.push("", "Still need to measure:", ...pendingLines);
  }
  if (allDone) {
    lines.push("", "Ready for your review.");
  }
  return lines.join("\n");
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
  const [rows, setRows] = useState<SurfaceRow[]>([]);
  const [sourceMessage, setSourceMessage] = useState<string>("");
  // Project the staged surfaces belong to, populated from the messages-page
  // handoff (or rehydrated from localStorage). Rendered as a small banner
  // above the source-message excerpt so the staff knows which project
  // they're measuring for.
  const [projectCode, setProjectCode] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  // Source conversation id, kept so we can re-resolve the project from
  // the server if the handoff payload didn't carry projectCode (or
  // localStorage from before this feature shipped).
  const [conversationId, setConversationId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
    if (!raw) {
      // No fresh handoff. Pre-seed conversationId from persisted state so
      // the project resolver can fire even after a page reload, when the
      // sessionStorage handoff is already consumed but localStorage still
      // remembers which conversation the staged surfaces came from.
      try {
        const persisted = window.localStorage.getItem(STORAGE_KEY);
        if (persisted) {
          const parsed = JSON.parse(persisted) as PersistedState;
          if (typeof parsed?.conversationId === "string" && parsed.conversationId) {
            setConversationId(parsed.conversationId);
          }
          if (typeof parsed?.projectCode === "string" && parsed.projectCode) {
            setProjectCode(parsed.projectCode);
          }
          if (typeof parsed?.projectTitle === "string" && parsed.projectTitle) {
            setProjectTitle(parsed.projectTitle);
          }
        }
      } catch {}
      return;
    }
    window.sessionStorage.removeItem(MEASURE_HANDOFF_KEY);
    try {
      const handoff = JSON.parse(raw) as MeasureHandoff;
      setPendingHandoff(handoff);
      if (handoff.sourceMessage) setSourceMessage(handoff.sourceMessage);
      // Seed conversationId / projectCode immediately (not via the
      // presets-gated hydration effect) so the chip shows up the moment
      // we arrive on the page, and the resolver can fire while presets
      // are still loading in the background.
      if (handoff.conversationId) setConversationId(handoff.conversationId);
      if (handoff.projectCode) setProjectCode(handoff.projectCode);
      if (handoff.projectTitle) setProjectTitle(handoff.projectTitle);
    } catch {
      // Bad payload. Fall through to the persisted state.
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
      // Only overwrite project context from the handoff if it actually
      // carried values. The earlier mount effect already seeded these
      // synchronously, and the resolver may have populated projectCode by
      // now, so we must not stomp it with empty strings.
      if (pendingHandoff.projectCode) {
        setProjectCode(pendingHandoff.projectCode);
      }
      if (pendingHandoff.projectTitle) {
        setProjectTitle(pendingHandoff.projectTitle);
      }
      if (pendingHandoff.conversationId) {
        setConversationId(pendingHandoff.conversationId);
      }
      setEditedMessage("");
      setIsDetached(false);
      clearPersistedState();
    } else {
      const persisted = readPersistedState();
      const persistedRows = (persisted?.rows ?? []).filter((row) =>
        byKey.has(row.surfaceKey),
      );
      if (persisted?.sourceMessage) setSourceMessage(persisted.sourceMessage);
      if (typeof persisted?.projectCode === "string") {
        setProjectCode(persisted.projectCode);
      }
      if (typeof persisted?.projectTitle === "string") {
        setProjectTitle(persisted.projectTitle);
      }
      if (typeof persisted?.conversationId === "string") {
        setConversationId(persisted.conversationId);
      }
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
    writePersistedState({
      rows,
      sourceMessage,
      editedMessage,
      isDetached,
      projectCode,
      projectTitle,
      conversationId,
    });
  }, [
    rows,
    sourceMessage,
    editedMessage,
    isDetached,
    projectCode,
    projectTitle,
    conversationId,
    hydrated,
  ]);

  // Resolver state: tracks whether we've actually finished checking the
  // server for project info for the current conversationId. Drives the
  // "Resolving..." chip so the staff can see something is happening even
  // when the conversation isn't tied to a project.
  const [projectResolveState, setProjectResolveState] = useState<
    "idle" | "loading" | "resolved" | "none" | "error"
  >("idle");

  // Drafts the staff can pick from in the project-code dropdown. Loaded
  // once on mount; lets the staff retarget which draft these measurements
  // get saved into without having to re-open the page from a message.
  // /api/planning/listDrafts returns every draft in the org, so staff
  // see manager-created drafts here (not just their own).
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/planning/listDrafts", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as {
          drafts?: DraftSummary[];
          error?: string;
        } | null;
        if (cancelled) return;
        if (response.ok && Array.isArray(data?.drafts)) {
          setDrafts(data.drafts);
        }
      } catch {
        // Silent — the dropdown just falls back to whatever was set by
        // the message handoff.
      } finally {
        if (!cancelled) setDraftsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the staff picks a different draft from the dropdown, swap the
  // active project code and title to that draft. Also clears the saved
  // signature so the Notify button can't fire with measurements that
  // were saved against a different project.
  const handleProjectCodeChange = useCallback(
    (nextCode: string) => {
      setProjectCode(nextCode);
      const match = drafts.find((d) => d.draft_code === nextCode);
      setProjectTitle(match?.project_name ?? "");
    },
    [drafts],
  );

  // Authoritative resolver: whenever we have a conversationId, fetch
  // that conversation's project binding and use it as the source of
  // truth for projectCode. The conversation row in the DB is the only
  // thing that knows which project (or draft) the staff is actually
  // measuring for; the handoff is just a hint that may be stale.
  // We deliberately accept any code the conversation returns — draft
  // OR real project — since the save endpoint resolves either via
  // resolveOwner, and a "no project linked" toast at save time is a
  // better UX than silently clearing the field here.
  useEffect(() => {
    if (!conversationId) {
      setProjectResolveState("idle");
      return;
    }

    let cancelled = false;
    setProjectResolveState("loading");
    (async () => {
      try {
        const response = await fetch(
          `/api/messages/conversation-project?conversationId=${encodeURIComponent(conversationId)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!response.ok) {
          setProjectResolveState("error");
          return;
        }
        const data = (await response.json()) as {
          project?: {
            project_id?: string | null;
            project_code?: string | null;
            title?: string | null;
            is_draft?: boolean;
          } | null;
        };
        if (cancelled) return;
        const code = data?.project?.project_code ?? "";
        const title = data?.project?.title ?? "";
        if (code) {
          setProjectCode(code);
          setProjectTitle(title);
          setProjectResolveState("resolved");
        } else {
          // Conversation exists but isn't linked to any project / draft
          // (direct DM, or the linked row was deleted). Leave the
          // projectCode untouched in case the staff manually picked
          // something from the dropdown; the save endpoint will reject
          // it with a toast if it can't resolve.
          setProjectResolveState("none");
        }
      } catch {
        if (!cancelled) setProjectResolveState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

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

  // Save is gated on (a) a known project to write to and (b) at least
  // one row with a real value. Pending rows are allowed: they ride
  // along in the recap message as "not measured yet" so the manager
  // knows what's still outstanding.
  const hasPendingRows = rows.some((row) => row.isMeasurementPending);
  const hasMeasuredRows = rows.some((row) => !row.isMeasurementPending);
  // Enabled the moment every row has a value. projectCode is verified
  // at submit time (with a toast on miss) rather than gating the
  // button, so a missing/cleared draft doesn't leave the staff
  // wondering why the button is dead after they've filled everything
  // in. `!saving` prevents the double-fire from a fast second click.
  const allRowsMeasured = rows.length > 0 && !hasPendingRows;
  const canSaveSurfaces = allRowsMeasured && !saving;

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addRow = useCallback(() => {
    if (options.length === 0) return;
    const firstKey = options[0].key;
    setRows((prev) => [...prev, makeRow(firstKey, presets)]);
  }, [options, presets]);

  // Slider / band-button change: snap the row to the band's suggested
  // value AND surface that value in the visible input. For area presets
  // that means flipping out of W × H mode into "Area only" so the
  // suggested square-metre number shows up in the single field instead
  // of being hidden behind two empty dimension inputs.
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
            inputMode: "area",
            width: "",
            height: "",
          };
        }),
      );
    },
    [presets],
  );

  // Exact input change: empty string clears the value back to "pending";
  // any number flips the row into manual-override mode. Count surfaces
  // (e.g. doors, gates) are whole units only. The decimal portion is
  // truncated so "3.7 doors" can't make it into the saved dimensions.
  const handleExactChange = useCallback(
    (id: string, raw: string) => {
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
          const unit = presets[r.surfaceKey]?.unit;
          const nextValue =
            unit === "count" ? Math.trunc(numeric) : numeric;
          return {
            ...r,
            estimatedValue: nextValue,
            isManualOverride: true,
            isMeasurementPending: false,
          };
        }),
      );
    },
    [presets],
  );

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

  // Push the staged measurements into the project's `dimensions.scaled`
  // map. The server only updates surface keys that already exist on the
  // project. Surfaces the project doesn't track come back as `unknownKeys`
  // so we can warn the staff that part of their input was ignored.
  async function handleSaveSurfaces() {
    if (!canSaveSurfaces) return;
    if (!projectCode) {
      toast.error(
        "No project code attached. Pick one from the dropdown, or open this page from a project message.",
      );
      return;
    }

    const measurements = rows
      .filter((row) => !row.isMeasurementPending)
      .map((row) => ({
        surfaceKey: row.surfaceKey,
        estimatedValue: row.estimatedValue,
      }));

    setSaving(true);
    try {
      const response = await fetch("/api/planning/saveSurfaceMeasurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectCode, measurements }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as {
        success?: boolean;
        error?: string;
        details?: string;
        updatedKeys?: string[];
        createdKeys?: string[];
      } | null;

      if (!response.ok || !data?.success) {
        const message = data?.error || "Failed to save surface measurements.";
        toast.error(
          data?.details ? `${message} ${data.details}` : message,
        );
        return;
      }

      const total =
        (data.updatedKeys?.length ?? 0) + (data.createdKeys?.length ?? 0);
      toast.success(
        `Saved ${total} measurement${total === 1 ? "" : "s"} to ${projectCode}.`,
      );
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 1500);

      // Auto-notify the manager. When the save lands with no pending
      // rows the message switches to the "all complete" tone; otherwise
      // it reads as a progress update with the still-pending surfaces
      // called out separately.
      if (conversationId) {
        try {
          const messageText = buildManagerMessage(rows, byKey);
          const sendResponse = await fetch("/api/messages/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId,
              content: messageText,
            }),
          });
          if (!sendResponse.ok) {
            toast.message(
              "Measurements saved, but I couldn't post the recap message.",
            );
          }
        } catch {
          toast.message(
            "Measurements saved, but I couldn't post the recap message.",
          );
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save measurements.",
      );
    } finally {
      setSaving(false);
    }
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
    if (
      rows.length === 0 &&
      !sourceMessage &&
      !editedMessage &&
      !projectCode &&
      !projectTitle
    ) {
      return;
    }
    const confirmed = window.confirm(
      "Clear all measurements, the source message, and the edited reply?",
    );
    if (!confirmed) return;
    setRows([]);
    setSourceMessage("");
    setProjectCode("");
    setProjectTitle("");
    setConversationId("");
    setEditedMessage("");
    setIsDetached(false);
    clearPersistedState();
  }

  return (
    <StaffPageShell
      title="Measure Generator"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {projectResolveState === "loading" && !projectCode ? (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Resolving project...
            </div>
          ) : (
            <div
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow-sm ${
                projectCode
                  ? "border-emerald-200 bg-emerald-50 text-[#00a054] dark:border-[#00c065]/30 dark:bg-[#00c065]/10 dark:text-emerald-300"
                  : "border-gray-200 bg-white text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              }`}
              title={projectTitle || projectCode || "Pick a draft to save into"}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Project
              </span>
              <select
                value={projectCode}
                onChange={(e) => handleProjectCodeChange(e.target.value)}
                disabled={draftsLoading && drafts.length === 0}
                className="cursor-pointer border-none bg-transparent pr-1 text-xs font-semibold outline-none disabled:cursor-not-allowed"
              >
                <option value="">
                  {draftsLoading
                    ? "Loading drafts..."
                    : drafts.length === 0
                      ? "No drafts available"
                      : "Select a draft..."}
                </option>
                {/* Preserve the currently-selected code if it's not in the
                    drafts list (e.g. a real project carried in via a
                    message handoff) so switching away and back works. */}
                {projectCode &&
                !drafts.some((d) => d.draft_code === projectCode) ? (
                  <option value={projectCode}>
                    {projectCode}
                    {projectTitle ? ` - ${projectTitle}` : ""}
                  </option>
                ) : null}
                {drafts.map((draft) => (
                  <option key={draft.draft_id} value={draft.draft_code}>
                    {draft.draft_code}
                    {draft.project_name ? ` - ${draft.project_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!projectCode &&
          conversationId &&
          projectResolveState === "error" ? (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Project lookup failed
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleClearAll}
            disabled={
              rows.length === 0 &&
              !sourceMessage &&
              !projectCode &&
              !projectTitle
            }
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

          {sourceMessage || projectCode || projectTitle ? (
            <div className="shrink-0 border-b border-gray-200 bg-emerald-50/50 px-4 py-3 dark:border-slate-700 dark:bg-[#00c065]/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {projectCode || projectTitle ? (
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        Project
                      </span>
                      {projectCode ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#00a054] dark:border-[#00c065]/30 dark:bg-slate-900 dark:text-emerald-300">
                          {projectCode}
                        </span>
                      ) : null}
                      {projectTitle ? (
                        <span className="truncate text-[11px] text-gray-700 dark:text-slate-300">
                          {projectTitle}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {sourceMessage ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#00c065]">
                        From the manager's message
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs text-gray-700 dark:text-slate-300">
                        {sourceMessage}
                      </p>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMessage("");
                    setProjectCode("");
                    setProjectTitle("");
                  }}
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
                              inputMode={
                                preset.unit === "count" ? "numeric" : "decimal"
                              }
                              min={0}
                              step={preset.unit === "count" ? "1" : "0.1"}
                              onKeyDown={(e) => {
                                if (
                                  preset.unit === "count" &&
                                  (e.key === "." || e.key === ",")
                                ) {
                                  e.preventDefault();
                                }
                              }}
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

          {/* Footer. Save Surfaces writes the staged measurements back to
              the project's `dimensions.scaled` map. Stays disabled until
              every row has a value AND we have a project to write to. */}
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
            <button
              type="button"
              onClick={handleSaveSurfaces}
              disabled={!canSaveSurfaces}
              title={
                rows.length === 0
                  ? "Add at least one surface measurement before saving."
                  : hasPendingRows
                    ? "Enter a value for every surface before saving."
                    : !projectCode
                      ? "No draft attached — clicking Save will show the project error. Pick a draft from the dropdown first."
                      : undefined
              }
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              style={{ backgroundColor: ACCENT }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedAt ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : savedAt ? "Saved" : "Save Surfaces"}
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

                {/* Band labels double as tap targets — sliding the thumb
                    is fiddly on touch, so clicking Small / Medium / Large
                    snaps the row directly without dragging. */}
                <div className="grid grid-cols-3 gap-1 text-[11px] font-medium">
                  {BAND_ORDER.map((bandKey, i) => {
                    const isActive =
                      !row.isManualOverride && row.sizeBand === bandKey;
                    return (
                      <button
                        key={bandKey}
                        type="button"
                        onClick={() => handleBandChange(row.id, bandKey)}
                        className={[
                          "rounded-md px-2 py-1 capitalize transition-colors",
                          i === 0
                            ? "text-left"
                            : i === BAND_ORDER.length - 1
                              ? "text-right"
                              : "text-center",
                          isActive
                            ? "bg-emerald-50 font-semibold text-[#00a054] dark:bg-[#00c065]/15 dark:text-emerald-300"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                        ].join(" ")}
                      >
                        {bandKey}
                      </button>
                    );
                  })}
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
                  onClick={() => {
                    // Done means "use what the modal is showing". For a
                    // freshly-added row that's the default medium band;
                    // for a slid-to or tapped band it's whatever the
                    // staff already picked. Re-applying the same band is
                    // idempotent, so this is safe to fire either way.
                    handleBandChange(row.id, row.sizeBand);
                    setQuickEstimateRowId(null);
                  }}
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
