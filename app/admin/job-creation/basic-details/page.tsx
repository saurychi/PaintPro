"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Settings2,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import { initWizardCache, setCachedStep } from "@/lib/wizardCache";
import { supabase } from "@/lib/supabaseClient";
import CreateClientModal from "@/components/project-creation/CreateClientModal";
import DraftsModal from "@/components/project-creation/DraftsModal";
import MeasurementModal, {
  type MeasurementRow,
} from "@/components/project-creation/MeasurementModal";
import type {
  ScaleBandKey,
  ScalePresetKey,
  SurfaceScalePresets,
} from "@/lib/planning/surfacePresets";
import { type WeekdayKey } from "@/lib/planning/aiContext";
import {
  type ProjectDimensions,
  type ProjectScaledField,
} from "@/lib/planning/materialEstimator";
import countryCallingCodes from "@/lib/data/country-by-calling-code.json";
import ScheduleCalendarModal from "@/components/project-creation/scheduleCalendarModal";
import { useHolidaySettings } from "@/lib/settings/useHolidaySettings";
import { useProjectNow } from "@/lib/time/useProjectNow";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200 dark:border-slate-700";
const SESSION_DRAFT_KEY = "paintpro_job_creation_draft";

type MaterialOut = {
  name: string;
  unit: string;
  notes?: string;
};

type EquipmentOut = {
  equipment_id?: string;
  equipmentId?: string;
  id?: string;
  name: string;
  notes?: string;
  quantity?: number;
};

type DurationOut = {
  mainTaskId: string;
  subTaskId: string;
  baseLaborHours: number;
  requiredEmployeeCount: number;
  adjustedDurationHours: number;
  roundedHours: number;
  estimatedHours: number;
  minimumHours: number;
  formula: string;
  scope: Record<string, number>;
  productivityHoursPerEmployee: number;
  teamEfficiencyFactor: number;
};

type AssignedEmployeeOut = {
  id: string;
  name: string;
  role: "staff" | "manager" | "admin" | "client";
};

type GeneratedSubTask = {
  title: string;
  priority: number;
  materials: MaterialOut[];
  equipment: EquipmentOut[];
  duration: DurationOut | null;
  assignedEmployees: AssignedEmployeeOut[];
  requiredEmployeeCount: number;
  assignmentScore: number | null;
  assignmentReasons: string[];
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
};

type ClientOption = {
  client_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type StaffUsersResponse = {
  staffUsers?: Array<{
    id: string | number | null;
    username?: string | null;
    email?: string | null;
    specialties?: unknown;
  }>;
};

type GeneratedMainTask = {
  name: string;
  priority: number;
  confidence: number;
  reasons: string[];
  sub_tasks: GeneratedSubTask[];
  materials: string[];
  materialCatalog: MaterialOut[];
};

type GetTasksApiResponse =
  | {
      main_tasks: Array<{
        name: string;
        priority: number;
        confidence: number;
        reasons: string[];
        sub_tasks: Array<{
          title: string;
          priority: number;
        }>;
      }>;
      dimensions?: ProjectDimensions | null;
      raw?: string;
    }
  | { error: string; raw?: string; details?: string };

type GetMaterialsApiResponse =
  | {
      taskName: string;
      subTaskTitle: string | null;
      materials: MaterialOut[];
    }
  | { error: string; details?: string };

type GetEquipmentApiResponse =
  | {
      taskName: string;
      subTaskTitle: string | null;
      equipment: EquipmentOut[];
    }
  | { error: string; details?: string };

type GetDurationApiResponse =
  | {
      mainTaskId: string;
      subTaskId: string;
      duration: DurationOut;
    }
  | { error: string; details?: string };

type GetMaterialsBatchApiResponse =
  | {
      results: Array<{
        taskName: string;
        subTaskTitle: string | null;
        materials: MaterialOut[];
      }>;
    }
  | { error: string; details?: string };

type GetEquipmentBatchApiResponse =
  | {
      results: Array<{
        taskName: string;
        subTaskTitle: string | null;
        equipment: EquipmentOut[];
      }>;
    }
  | { error: string; details?: string };

type GetDurationBatchApiResponse =
  | {
      results: Array<{
        taskName: string;
        subTaskTitle: string;
        duration: DurationOut | null;
        error: string | null;
      }>;
    }
  | { error: string; details?: string };

type GetEmployeesApiResponse =
  | {
      day: WeekdayKey | null;
      assignments: Array<{
        taskName: string;
        assignments: Array<{
          taskName: string;
          subTaskTitle: string;
          requiredEmployeeCount: number;
          employees: AssignedEmployeeOut[];
          score: number;
          reasons: string[];
        }>;
      }>;
    }
  | { error: string; details?: string };

type GetProjectScheduleApiResponse =
  | {
      scheduledItems: Array<{
        taskName: string;
        subTaskTitle: string;
        assignedUserId: string | null;
        estimatedHours: number | null;
        scheduledStartDatetime: string | null;
        scheduledEndDatetime: string | null;
        sortOrder: number;
      }>;
      projectScheduledEndDatetime: string | null;
    }
  | { error: string; details?: string };

type GetProjectNameApiResponse =
  | {
      projectName: string;
    }
  | { error: string; details?: string };

type CreateClientApiResponse =
  | {
      client: ClientOption;
    }
  | { error: string; details?: string };

type GetSurfaceScalePresetsApiResponse =
  | {
      surfaceScalePresets: SurfaceScalePresets;
    }
  | { error: string; details?: string };

type PreviewMainTask = {
  name: string;
  priority: number;
  confidence: number;
  sub_tasks: Array<{ title: string; priority: number }>;
};

// Maps each known main task name to the surface preset keys it requires.
// Derived from materialEstimator.ts task logic.
const TASK_TO_SURFACES: Record<string, string[]> = {
  "Interior Painting": ["interior_wall_area_m2"],
  "Ceiling Painting": ["ceiling_area_m2"],
  "Feature Wall Painting": ["feature_wall_area_m2"],
  "Exterior Painting": ["exterior_wall_area_m2"],
  "Roof Tile Painting": ["roof_area_m2"],
  "Colourbond Roof Painting": ["roof_area_m2"],
  "Gutters, Fascia & Eaves Painting": [
    "gutters_length_m",
    "fascia_length_m",
    "eaves_length_m",
  ],
  "Trim, Doors & Frames Painting": ["trim_length_m", "doors_count"],
  "Stain Blocking / Primer Work": ["interior_wall_area_m2"],
  "Plaster & Patching": ["interior_wall_area_m2"],
  "Surface Preparation (Sanding, Scraping, Filling)": ["interior_wall_area_m2"],
  "Mould Treatment": ["interior_wall_area_m2"],
  "High-Pressure Cleaning": ["pressure_wash_area_m2"],
  "Decking Staining & Coating": ["deck_area_m2"],
  "Fence & Gate Painting": ["fence_length_m", "gate_count"],
  "Epoxy Floor Coatings": ["epoxy_floor_area_m2"],
  "Wallpaper Installation": ["wallpaper_area_m2"],
  "Wallpaper Removal": ["wallpaper_area_m2"],
  "Protective / Industrial Coatings": ["exterior_wall_area_m2"],
  "Anti-Corrosion Coatings": ["exterior_wall_area_m2"],
};

function generateProjectCode() {
  const partA = Math.random().toString(36).slice(2, 6).toUpperCase();
  const partB = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PP-${partA}-${partB}`;
}

function norm(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function unitLabel(unit: string) {
  if (unit === "m2") return "m²";
  if (unit === "m") return "m";
  return "count";
}

function makeRowFromPreset(
  presets: SurfaceScalePresets,
  presetKey: ScalePresetKey,
  band: ScaleBandKey = "medium",
  overrides?: Partial<MeasurementRow>,
): MeasurementRow {
  const preset = presets[presetKey];

  if (!preset) {
    throw new Error(`Surface preset not found: ${presetKey}`);
  }

  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${presetKey}-${Date.now()}-${Math.random()}`,
    presetKey,
    sizeBand: band,
    estimatedValue: preset.bands[band].suggested,
    isManualOverride: false,
    ...(overrides ?? {}),
  };
}

function makeRecommendedSurfaceRow(
  presets: SurfaceScalePresets,
  presetKey: ScalePresetKey,
): MeasurementRow {
  return makeRowFromPreset(presets, presetKey, "medium", {
    estimatedValue: 0,
    isMeasurementPending: true,
  });
}

function rowsToProjectDimensions(rows: MeasurementRow[]): ProjectDimensions {
  const scaled: Record<string, ProjectScaledField> = {};

  for (const row of rows) {
    if (row.isMeasurementPending) continue;

    const currentValue = Number.isFinite(row.estimatedValue)
      ? row.estimatedValue
      : 0;

    const existing = scaled[row.presetKey];
    const existingValue =
      existing && Number.isFinite(Number(existing.estimatedValue))
        ? Number(existing.estimatedValue)
        : 0;

    scaled[row.presetKey] = {
      presetKey: row.presetKey as ProjectScaledField["presetKey"],
      estimatedValue: existingValue + currentValue,
    };
  }

  return {
    scaled: scaled as ProjectDimensions["scaled"],
    notes: "",
  };
}

function uniqueByName<T extends { name: string }>(items: readonly T[]) {
  return items.filter(
    (item, index, arr) =>
      arr.findIndex((x) => norm(x.name) === norm(item.name)) === index,
  );
}

async function postJson<TResponse>(
  url: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  let data: any = null;
  let rawText = "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    rawText = await response.text();
  }

  if (!response.ok) {
    const shortMessage =
      data?.error ||
      `Request failed for ${url} with status ${response.status}.`;

    console.error(`Request failed: ${url}`, {
      status: response.status,
      data,
      rawText,
    });

    throw new Error(shortMessage);
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    console.error(`API returned error: ${url}`, data);
    throw new Error(data.error);
  }

  return (data as TResponse) ?? ({} as TResponse);
}

export default function BasicDetails() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId") || "";
  const { settings: holidaySettings } = useHolidaySettings();
  const { now: projectNow } = useProjectNow();

  useEffect(() => {
    router.prefetch("/admin/job-creation/main-task-assignment");
  }, [router]);

  const [projectCode, setProjectCode] = useState(() => generateProjectCode());
  const [projectName, setProjectName] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [isScheduleCalendarOpen, setIsScheduleCalendarOpen] = useState(false);
  const [address, setAddress] = useState("");

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("+63");
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState("+63");
  const [description, setDescription] = useState("");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);

  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [newClientFullName, setNewClientFullName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("+63");
  const [newClientPhoneCountry, setNewClientPhoneCountry] = useState("+63");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(
    projectIdFromUrl || null,
  );
  // Draft handle for the in-progress wizard. Set when "Recommend Surfaces"
  // creates a drafts row so subsequent "Message Employee" / measure-
  // generator flows have something to attach to. Cleared once createProject
  // promotes the draft to a real project.
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftsModalOpen, setDraftsModalOpen] = useState(false);

  const [assignmentDay, setAssignmentDay] = useState<WeekdayKey>("monday");
  const [loading, setLoading] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  // Counter for the loading modal so the user sees discrete progress
  // ("3 of 5 phases done") instead of just rotating stage labels.
  const [generationProgress, setGenerationProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedMainTask[]>([]);
  const [isGeneratingProjectName, setIsGeneratingProjectName] = useState(false);

  // Manual mode skips the AI-driven description / surfaces / generated-tasks
  // sections entirely. The admin provides only name + client + start date,
  // then proceeds straight to main-task-assignment where they add tasks by
  // hand. Persisted in the draft so reloads stay in the chosen mode.
  const [manualMode, setManualMode] = useState(false);

  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[]>([]);
  // Field keys that failed validation on the last Generate click. Used to
  // outline the offending inputs in red until the admin starts editing
  // them — flagging gets cleared per-field on next change.
  const [formErrors, setFormErrors] = useState<Set<string>>(() => new Set());
  const hasFormError = (key: string) => formErrors.has(key);
  const errorRing = (key: string) =>
    hasFormError(key)
      ? "border-red-400 focus:ring-red-300/50 dark:border-red-500 dark:focus:ring-red-500/30"
      : "";
  const clearFormError = (key: string) => {
    setFormErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [previewTasks, setPreviewTasks] = useState<PreviewMainTask[]>([]);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);

  type SurfaceEmployee = {
    id: string;
    name: string;
    email: string;
    specialties: string[];
  };

  const [surfaceMsgEmployees, setSurfaceMsgEmployees] = useState<
    SurfaceEmployee[]
  >([]);
  const [surfaceMsgLoadingEmployees, setSurfaceMsgLoadingEmployees] =
    useState(false);
  const [surfaceMsgLoadError, setSurfaceMsgLoadError] = useState<string | null>(
    null,
  );
  const [surfaceMsgSending, setSurfaceMsgSending] = useState(false);
  const surfaceMsgEmployeesLoadedRef = useRef(false);

  const [surfacePresets, setSurfacePresets] = useState<SurfaceScalePresets>({});
  const [surfacePresetsLoading, setSurfacePresetsLoading] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Restore draft from localStorage on mount — must run before loadSurfacePresets
  // so the measurementRows guard (prev.length > 0) prevents overwriting draft rows.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.projectCode) setProjectCode(draft.projectCode);
      if (draft.projectName) setProjectName(draft.projectName);
      if (draft.scheduledStart) setScheduledStart(draft.scheduledStart);
      if (draft.scheduledEnd) setScheduledEnd(draft.scheduledEnd);
      if (draft.address) setAddress(draft.address);
      if (draft.clientName) setClientName(draft.clientName);
      if (draft.clientEmail) setClientEmail(draft.clientEmail);
      if (draft.clientPhone) setClientPhone(draft.clientPhone);
      if (draft.selectedPhoneCountry)
        setSelectedPhoneCountry(draft.selectedPhoneCountry);
      if (draft.description) setDescription(draft.description);
      if (draft.selectedClientId) {
        setSelectedClientId(draft.selectedClientId);
      } else {
        clearSelectedClientForm();
      }
      if (draft.assignmentDay) setAssignmentDay(draft.assignmentDay);
      if (typeof draft.manualMode === "boolean") setManualMode(draft.manualMode);
      if (
        Array.isArray(draft.measurementRows) &&
        draft.measurementRows.length > 0
      ) {
        setMeasurementRows(draft.measurementRows);
      }
      if (Array.isArray(draft.previewTasks) && draft.previewTasks.length > 0) {
        setPreviewTasks(draft.previewTasks);
      }
      const hasMeaningfulContent = Boolean(
        draft.projectName ||
        draft.description ||
        draft.address ||
        draft.clientName ||
        draft.clientEmail ||
        (Array.isArray(draft.measurementRows) &&
          draft.measurementRows.length > 0) ||
        (Array.isArray(draft.previewTasks) && draft.previewTasks.length > 0),
      );
      if (hasMeaningfulContent) {
        toast.info("Draft restored", {
          description: "Your previous progress has been loaded.",
        });
      }
    } catch {
      // corrupt draft — ignore
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSurfacePresets() {
      try {
        setSurfacePresetsLoading(true);

        const response = await fetch("/api/planning/getSurfaceScalePresets", {
          cache: "no-store",
        });

        const data =
          (await response.json()) as GetSurfaceScalePresetsApiResponse;

        if (!response.ok || "error" in data) {
          throw new Error(
            "error" in data
              ? data.details || data.error
              : "Failed to fetch surface presets.",
          );
        }

        if (cancelled) return;

        const nextPresets = data.surfaceScalePresets ?? {};

        setSurfacePresets(nextPresets);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch surface presets.";

        console.error(error);

        toast.error("Could not load surface presets", {
          description: message,
        });
      } finally {
        if (!cancelled) {
          setSurfacePresetsLoading(false);
        }
      }
    }

    loadSurfacePresets();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist form progress to localStorage so navigating away and back restores state.
  // Only save when the user has entered meaningful content — an auto-populated
  // measurement row alone (no other fields filled) should not create a draft.
  useEffect(() => {
    if (!draftLoaded) return;

    const hasUserContent = Boolean(
      projectName ||
      scheduledStart ||
      address ||
      clientName ||
      clientEmail ||
      description ||
      selectedClientId ||
      clientPhone !== "+63" ||
      previewTasks.length > 0,
    );

    if (!hasUserContent) {
      localStorage.removeItem(SESSION_DRAFT_KEY);
      return;
    }

    try {
      localStorage.setItem(
        SESSION_DRAFT_KEY,
        JSON.stringify({
          projectCode,
          projectName,
          scheduledStart,
          scheduledEnd,
          address,
          clientName,
          clientEmail,
          clientPhone,
          selectedPhoneCountry,
          description,
          selectedClientId,
          assignmentDay,
          measurementRows,
          previewTasks,
          manualMode,
        }),
      );
    } catch {
      // storage full or unavailable — ignore
    }
  }, [
    draftLoaded,
    projectCode,
    projectName,
    scheduledStart,
    scheduledEnd,
    address,
    clientName,
    clientEmail,
    clientPhone,
    selectedPhoneCountry,
    description,
    selectedClientId,
    assignmentDay,
    measurementRows,
    previewTasks,
    manualMode,
  ]);

  const normalizedDimensions = useMemo(
    () => rowsToProjectDimensions(measurementRows),
    [measurementRows],
  );

  // True when there's at least one surface row whose value hasn't been
  // filled in yet (auto-recommended rows from "Generate Tasks" land
  // pending until the admin opens the measurement modal). Drives both
  // the Generate button's disabled state and a clearer tooltip so the
  // user knows WHY the button is greyed out.
  const hasUnfilledMeasurements = useMemo(() => {
    if (measurementRows.length === 0) return true;
    return measurementRows.some(
      (row) =>
        row.isMeasurementPending ||
        !Number.isFinite(row.estimatedValue) ||
        row.estimatedValue <= 0,
    );
  }, [measurementRows]);

  const summaryChips = useMemo(() => {
    return measurementRows
      .slice(0, 4)
      .map((row) => {
        const preset = surfacePresets[row.presetKey];
        if (!preset) return null;

        return {
          id: row.id,
          label: preset.label,
        };
      })
      .filter(
        (
          chip,
        ): chip is {
          id: string;
          label: string;
        } => Boolean(chip),
      );
  }, [measurementRows, surfacePresets]);

  const phoneCountryOptions = useMemo(() => {
    return (
      countryCallingCodes as { country: string; calling_code: number }[]
    ).map((item) => ({
      country: item.country,
      calling_code: `+${item.calling_code}`,
    }));
  }, []);

  const [availableDateEvents, setAvailableDateEvents] = useState<
    Array<{
      title: string;
      date: string;
      display: "background";
      className: string;
    }>
  >([]);

  async function handleGenerateProjectName() {
    if (isGeneratingProjectName) return;

    const missingFields: string[] = [];

    if (!description.trim()) missingFields.push("description");
    if (!selectedClientId) {
      missingFields.push("client");
    } else {
      if (!clientName.trim()) missingFields.push("selected client name");
      if (!address.trim()) missingFields.push("selected client address");
    }

    if (missingFields.length > 0) {
      toast.error(`Please fill out: ${missingFields.join(", ")}`);
      return;
    }

    try {
      setIsGeneratingProjectName(true);

      const data = await postJson<GetProjectNameApiResponse>(
        "/api/planning/getProjectName",
        {
          description: description.trim(),
          clientName: clientName.trim(),
          address: address.trim(),
        },
      );

      if ("error" in data) {
        throw new Error(data.error);
      }

      setProjectName(String(data.projectName || "").trim());
      toast.success("Project name generated");
    } catch {
      const shortDescription = description
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(" ");

      const shortAddress = address
        .trim()
        .split(",")[0]
        .split(/\s+/)
        .slice(0, 3)
        .join(" ");

      setProjectName(
        `${shortDescription || "Project"} - ${clientName.trim() || "Client"}, ${shortAddress || "Address"}`,
      );

      toast.error(
        "AI project name generation failed. Used fallback format instead.",
      );
    } finally {
      setIsGeneratingProjectName(false);
    }
  }

  function updateRow(
    id: string,
    updater: (row: MeasurementRow) => MeasurementRow,
  ) {
    setMeasurementRows((prev) =>
      prev.map((row) => (row.id === id ? updater(row) : row)),
    );
  }

  function handleBandChange(id: string, nextBand: ScaleBandKey) {
    updateRow(id, (row) => {
      const preset = surfacePresets[row.presetKey];

      if (!preset) return row;

      return {
        ...row,
        sizeBand: nextBand,
        estimatedValue:
          row.isManualOverride && !row.isMeasurementPending
            ? row.estimatedValue
            : preset.bands[nextBand].suggested,
        isMeasurementPending: false,
      };
    });
  }

  function handlePresetChange(id: string, nextPresetKey: ScalePresetKey) {
    const preset = surfacePresets[nextPresetKey];

    if (!preset) return;

    updateRow(id, () => ({
      id,
      presetKey: nextPresetKey,
      sizeBand: "medium",
      estimatedValue: preset.bands.medium.suggested,
      isManualOverride: false,
      isMeasurementPending: false,
    }));
  }

  function handleManualValueChange(id: string, rawValue: string) {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      updateRow(id, (row) => ({
        ...row,
        estimatedValue: 0,
        isManualOverride: true,
        isMeasurementPending: true,
      }));
      return;
    }

    const nextValue = Number(trimmedValue);
    updateRow(id, (row) => ({
      ...row,
      estimatedValue: Number.isFinite(nextValue) ? nextValue : 0,
      isManualOverride: true,
      isMeasurementPending: !Number.isFinite(nextValue),
    }));
  }

  function addMeasurement(presetKey: ScalePresetKey) {
    if (!surfacePresets[presetKey]) return;

    setMeasurementRows((prev) => [
      makeRowFromPreset(surfacePresets, presetKey, "medium"),
      ...prev,
    ]);
  }

  function removeMeasurement(id: string) {
    setMeasurementRows((prev) => prev.filter((row) => row.id !== id));
  }

  const [refreshingMeasurements, setRefreshingMeasurements] = useState(false);

  // Pull the latest dimensions from the DB and rebuild measurementRows
  // from them. Used by the refresh button in MeasurementModal so the
  // admin can see updates that staff just pushed via the measure
  // generator's Save Surfaces button without leaving the wizard.
  async function refreshMeasurementsFromDb() {
    const code = projectCode.trim();
    if (!code && !createdDraftId && !createdProjectId) {
      toast.message(
        "Generate surfaces first. There's nothing to refresh from yet.",
      );
      return;
    }
    if (refreshingMeasurements) return;
    setRefreshingMeasurements(true);
    try {
      const queryParam = createdDraftId
        ? `draftId=${encodeURIComponent(createdDraftId)}`
        : createdProjectId
          ? `projectId=${encodeURIComponent(createdProjectId)}`
          : `projectCode=${encodeURIComponent(code)}`;
      const response = await fetch(
        `/api/planning/getProjectDimensions?${queryParam}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as {
        dimensions?: {
          scaled?: Record<
            string,
            {
              presetKey?: string;
              estimatedValue?: number;
            }
          > | null;
        } | null;
        error?: string;
      } | null;

      if (!response.ok) {
        toast.error(data?.error || "Failed to load latest measurements.");
        return;
      }

      const scaled = data?.dimensions?.scaled ?? {};
      const nextRows: MeasurementRow[] = Object.entries(scaled)
        .filter(([key]) => Boolean(surfacePresets[key as ScalePresetKey]))
        .map(([key, value]) => {
          const presetKey = key as ScalePresetKey;
          const numericValue = Number(value?.estimatedValue);
          const hasValue =
            Number.isFinite(numericValue) && numericValue > 0;
          return makeRowFromPreset(
            surfacePresets,
            presetKey,
            "medium",
            {
              estimatedValue: hasValue ? numericValue : 0,
              isMeasurementPending: !hasValue,
            },
          );
        });

      setMeasurementRows(nextRows);
      toast.success("Measurements refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh measurements.",
      );
    } finally {
      setRefreshingMeasurements(false);
    }
  }

  // Persist the current wizard state into the drafts table. If a draft is
  // already open in this session it's updated in place; otherwise a new
  // draft row is inserted and its id is cached for the rest of the
  // session. Pure save: no surface generation, no validation gate.
  async function handleSaveDraft() {
    if (draftSaving) return;
    setDraftSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const creatorId = authData?.user?.id ?? null;
      if (!creatorId) {
        toast.error("Sign in to save a draft.");
        return;
      }

      const draftDimensions = (() => {
        const base = rowsToProjectDimensions(measurementRows);
        const scaled = {
          ...(base.scaled ?? {}),
        } as Record<string, unknown>;
        for (const row of measurementRows) {
          if (scaled[row.presetKey]) continue;
          scaled[row.presetKey] = {
            presetKey: row.presetKey,
            estimatedValue: 0,
          };
        }
        return { ...base, scaled };
      })();

      const response = await fetch("/api/planning/createProjectDraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: createdDraftId || null,
          client: {
            client_id: selectedClientId || null,
            full_name: clientName.trim() || null,
            email: clientEmail.trim() || null,
            phone: clientPhone.trim() || null,
            address: address.trim() || null,
          },
          project: {
            title: projectName.trim() || null,
            description: description.trim() || null,
            site_address: address.trim() || null,
            scheduled_start_datetime: scheduledStart || null,
            scheduled_end_datetime: scheduledEnd || null,
            dimensions: draftDimensions as unknown as Record<string, unknown>,
            // Only honored on the insert path. The endpoint ignores
            // project_code on updates so existing conversations attached
            // to drafts.draft_code keep matching.
            project_code: projectCode.trim() || null,
          },
          createdBy: { userId: creatorId },
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        draft?: { draft_id?: string; draft_code?: string };
      } | null;

      if (!response.ok || !data?.draft?.draft_id) {
        toast.error(data?.error || "Failed to save draft.");
        return;
      }

      setCreatedDraftId(data.draft.draft_id);
      if (data.draft.draft_code) setProjectCode(data.draft.draft_code);
      toast.success("Draft saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save draft.",
      );
    } finally {
      setDraftSaving(false);
    }
  }

  // Repopulate the basic-details form fields from a stored draft. Used
  // by the See Drafts modal so the admin can resume an older draft. The
  // measurementRows are rebuilt from drafts.dimensions.scaled.
  async function handlePickDraft(draftId: string) {
    try {
      const response = await fetch(
        `/api/planning/getDraft?draftId=${encodeURIComponent(draftId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as {
        draft?: {
          draft_id: string;
          draft_code: string;
          project_name: string | null;
          description: string | null;
          site_address: string | null;
          scheduled_start_datetime: string | null;
          scheduled_end_datetime: string | null;
          dimensions: {
            scaled?: Record<
              string,
              {
                presetKey?: string;
                estimatedValue?: number;
              }
            > | null;
          } | null;
          client_id: string | null;
          client_full_name: string | null;
          client_email: string | null;
          client_phone: string | null;
          client_address: string | null;
        };
        error?: string;
      } | null;

      if (!response.ok || !data?.draft) {
        toast.error(data?.error || "Failed to load draft.");
        return;
      }

      const draft = data.draft;

      setCreatedDraftId(draft.draft_id);
      setProjectCode(draft.draft_code || generateProjectCode());
      setProjectName(draft.project_name ?? "");
      setDescription(draft.description ?? "");
      setAddress(draft.site_address ?? draft.client_address ?? "");

      // Stored as a full ISO timestamptz. The form input is a yyyy-mm-dd
      // value so strip the time portion when restoring.
      if (draft.scheduled_start_datetime) {
        setScheduledStart(draft.scheduled_start_datetime.slice(0, 10));
      } else {
        setScheduledStart("");
      }
      if (draft.scheduled_end_datetime) {
        setScheduledEnd(draft.scheduled_end_datetime.slice(0, 10));
      } else {
        setScheduledEnd("");
      }

      setSelectedClientId(draft.client_id ?? "");
      setClientName(draft.client_full_name ?? "");
      setClientEmail(draft.client_email ?? "");
      setClientPhone(draft.client_phone ?? "+63");

      const scaled = draft.dimensions?.scaled ?? {};
      const nextRows: MeasurementRow[] = Object.entries(scaled)
        .filter(([key]) => Boolean(surfacePresets[key as ScalePresetKey]))
        .map(([key, value]) => {
          const presetKey = key as ScalePresetKey;
          const numericValue = Number(value?.estimatedValue);
          const hasValue =
            Number.isFinite(numericValue) && numericValue > 0;
          return makeRowFromPreset(
            surfacePresets,
            presetKey,
            "medium",
            {
              estimatedValue: hasValue ? numericValue : 0,
              isMeasurementPending: !hasValue,
            },
          );
        });
      setMeasurementRows(nextRows);

      setDraftsModalOpen(false);
      toast.success(`Loaded draft ${draft.draft_code}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load draft.",
      );
    }
  }

  function handleNewClientPhoneCountryChange(callingCode: string) {
    setNewClientPhoneCountry(callingCode);

    const trimmedPhone = newClientPhone.trim();

    if (!trimmedPhone) {
      setNewClientPhone(callingCode);
      return;
    }

    const matchedExistingCode = phoneCountryOptions.find((item) =>
      trimmedPhone.startsWith(item.calling_code),
    );

    if (matchedExistingCode) {
      setNewClientPhone(
        `${callingCode}${trimmedPhone.slice(matchedExistingCode.calling_code.length)}`,
      );
      return;
    }

    const normalizedPhone = trimmedPhone.replace(/^\+/, "");
    setNewClientPhone(`${callingCode}${normalizedPhone}`);
  }

  function resolvePhoneCountry(phone: string | null | undefined) {
    const rawPhone = String(phone ?? "").trim();

    if (!rawPhone) return "+63";

    const matchedCountry = phoneCountryOptions.find((item) =>
      rawPhone.startsWith(item.calling_code),
    );

    if (matchedCountry) {
      return matchedCountry.calling_code;
    }

    const extractedCountry = rawPhone.match(/^(\+\d+)/)?.[1];
    return extractedCountry || "+63";
  }

  function clearSelectedClientForm() {
    setSelectedClientId("");
    setClientName("");
    setClientEmail("");
    setClientPhone("+63");
    setSelectedPhoneCountry("+63");
    setAddress("");
  }

  function applyClientToForm(client: ClientOption) {
    setSelectedClientId(client.client_id);
    setClientName(client.full_name ?? "");
    setClientEmail(client.email ?? "");
    setClientPhone(client.phone ?? "");
    setAddress(client.address ?? "");
    setSelectedPhoneCountry(resolvePhoneCountry(client.phone));
    clearFormError("client");
  }

  function handleClientSelect(clientId: string) {
    if (!clientId) {
      clearSelectedClientForm();
      return;
    }

    const client = clients.find((item) => item.client_id === clientId);
    if (!client) return;
    applyClientToForm(client);
  }

  function openCreateClientModal() {
    setNewClientFullName("");
    setNewClientEmail("");
    setNewClientPhone("+63");
    setNewClientPhoneCountry("+63");
    setNewClientAddress("");
    setNewClientNotes("");
    setIsCreateClientModalOpen(true);
  }

  function closeCreateClientModal() {
    if (creatingClient) return;
    setIsCreateClientModalOpen(false);
  }

  async function handleCreateClient() {
    const fullName = newClientFullName.trim();
    const email = newClientEmail.trim().toLowerCase();
    const phone = newClientPhone.trim();
    const clientAddress = newClientAddress.trim();
    const notes = newClientNotes.trim();

    if (!fullName) {
      toast.error("Please enter the client name.");
      return;
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid client email.");
      return;
    }

    if (!phone) {
      toast.error("Please enter the client phone.");
      return;
    }

    if (!clientAddress) {
      toast.error("Please enter the client address.");
      return;
    }

    try {
      setCreatingClient(true);

      const response = await fetch("/api/client/createClient", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          address: clientAddress,
          notes: notes || null,
        }),
      });

      const data = (await response.json()) as CreateClientApiResponse;

      if (!response.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "Failed to create client.",
        );
      }

      const createdClient = data.client;

      setClients((prev) =>
        [...prev, createdClient].sort((a, b) =>
          String(a.full_name || "").localeCompare(String(b.full_name || "")),
        ),
      );

      applyClientToForm(createdClient);
      setIsCreateClientModalOpen(false);
      toast.success("Client created successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to create client.");
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleGenerateTasks() {
    if (isGeneratingTasks) return;

    if (!description.trim()) {
      toast.error("Please enter a project description first.");
      return;
    }

    try {
      setIsGeneratingTasks(true);

      const tasksData = await postJson<GetTasksApiResponse>(
        "/api/planning/getTasks",
        { description: description.trim() },
      );

      if ("error" in tasksData) throw new Error(tasksData.error);

      const tasks: PreviewMainTask[] = (tasksData.main_tasks ?? []).map(
        (task) => ({
          name: String(task.name || "").trim(),
          priority: Number.isFinite(Number(task.priority))
            ? Number(task.priority)
            : 0,
          confidence: clamp01(Number(task.confidence || 0)),
          sub_tasks: Array.isArray(task.sub_tasks)
            ? task.sub_tasks.map((st) => ({
                title: String(st.title || "").trim(),
                priority: Number.isFinite(Number(st.priority))
                  ? Number(st.priority)
                  : 0,
              }))
            : [],
        }),
      );

      setPreviewTasks(tasks);
      // Mark previewTasks-related validation as resolved — admin just
      // generated tasks, so the red flag on the Generate-tasks area
      // (if any) should drop.
      clearFormError("previewTasks");

      // Collect unique surface keys needed by the generated tasks
      const surfaceKeys: string[] = [];
      const seen = new Set<string>();
      for (const task of tasks) {
        for (const key of TASK_TO_SURFACES[task.name] ?? []) {
          if (!seen.has(key) && surfacePresets[key]) {
            seen.add(key);
            surfaceKeys.push(key);
          }
        }
      }

      let nextRows = measurementRows;
      const hadExistingSurfaces = measurementRows.length > 0;
      if (surfaceKeys.length > 0) {
        nextRows = surfaceKeys.map((key) =>
          makeRecommendedSurfaceRow(surfacePresets, key),
        );
        setMeasurementRows(nextRows);
        toast.success(
          hadExistingSurfaces ? "Surfaces updated" : "Surfaces added",
        );
      }

      // Pre-seed every recommended surface key so the staff measure
      // generator's Save Surfaces has a target slot for each key.
      const recommendedDimensions = (() => {
        const base = rowsToProjectDimensions(nextRows);
        const scaled = {
          ...(base.scaled ?? {}),
        } as Record<string, unknown>;
        for (const row of nextRows) {
          if (scaled[row.presetKey]) continue;
          scaled[row.presetKey] = {
            presetKey: row.presetKey,
            estimatedValue: 0,
          };
        }
        return { ...base, scaled };
      })();

      // If the project row already exists (re-entry via ?projectId=…),
      // write the freshly recommended dimensions onto it. If a draft row
      // already exists from a prior click, update that. Otherwise insert
      // a new draft.
      if (createdProjectId && surfaceKeys.length > 0) {
        postJson<{ success?: boolean; error?: string }>(
          "/api/planning/updateProjectDimensions",
          {
            projectId: createdProjectId,
            dimensions: recommendedDimensions as unknown as Record<
              string,
              unknown
            >,
          },
        ).catch((error) => {
          console.error("Failed to persist recommended dimensions", error);
        });
      } else if (createdDraftId && surfaceKeys.length > 0) {
        postJson<{ success?: boolean; error?: string }>(
          "/api/planning/updateProjectDimensions",
          {
            draftId: createdDraftId,
            dimensions: recommendedDimensions as unknown as Record<
              string,
              unknown
            >,
          },
        ).catch((error) => {
          console.error("Failed to persist draft dimensions", error);
        });
      } else if (!createdProjectId && surfaceKeys.length > 0) {
        // No project row yet. Create a stub one tied to the freshly
        // recommended dimensions so the "Message Employee" flow has
        // somewhere to attach the conversation. Without this, the staff
        // measure-generator shows "No project linked" because the
        // conversation has no project_id. Best-effort: a missing client /
        // sign-in surfaces as a toast warning but doesn't block the rest
        // of the generation flow.
        try {
          const { data: authData } = await supabase.auth.getUser();
          const creatorId = authData?.user?.id ?? null;
          if (!creatorId) {
            toast.message(
              "Sign in to enable messaging staff with project context.",
            );
          } else {
            const draftResponse = await fetch(
              "/api/planning/createProjectDraft",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  client: {
                    client_id: selectedClientId || null,
                    full_name: clientName.trim() || null,
                    email: clientEmail.trim() || null,
                    phone: clientPhone.trim() || null,
                    address: address.trim() || null,
                  },
                  project: {
                    title: projectName.trim() || null,
                    description: description.trim() || null,
                    site_address: address.trim() || null,
                    scheduled_start_datetime: scheduledStart || null,
                    scheduled_end_datetime: scheduledEnd || null,
                    dimensions: recommendedDimensions as unknown as Record<
                      string,
                      unknown
                    >,
                  },
                  createdBy: { userId: creatorId },
                }),
              },
            );
            const draftData = (await draftResponse
              .json()
              .catch(() => null)) as {
              success?: boolean;
              error?: string;
              draft?: { draft_id?: string; draft_code?: string };
            } | null;
            if (draftResponse.ok && draftData?.draft?.draft_id) {
              setCreatedDraftId(draftData.draft.draft_id);
              if (draftData.draft.draft_code) {
                setProjectCode(draftData.draft.draft_code);
              }
            } else {
              toast.message(
                draftData?.error ||
                  "Fill in client info to enable messaging staff with project context.",
              );
            }
          }
        } catch (draftError) {
          console.error("Failed to create draft", draftError);
        }
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate tasks.");
    } finally {
      setIsGeneratingTasks(false);
    }
  }

  async function generateProjectDraft(inputTasks: PreviewMainTask[]) {
    setGenerationError("");
    setGeneratedTasks([]);

    setLoading(true);

    try {
      setGenerationStage("Building main tasks and sub tasks");

      let nextTasks: GeneratedMainTask[] = inputTasks.map((task) => ({
        name: String(task.name || "").trim(),
        priority: Number.isFinite(Number(task.priority))
          ? Number(task.priority)
          : 0,
        confidence: clamp01(Number(task.confidence || 0)),
        reasons: [],
        sub_tasks: Array.isArray(task.sub_tasks)
          ? task.sub_tasks.map((subTask) => ({
              title: String(subTask.title || "").trim(),
              priority: Number.isFinite(Number(subTask.priority))
                ? Number(subTask.priority)
                : 0,
              materials: [],
              equipment: [],
              duration: null,
              assignedEmployees: [],
              requiredEmployeeCount: 1,
              assignmentScore: null,
              assignmentReasons: [],
              scheduledStartDatetime: null,
              scheduledEndDatetime: null,
            }))
          : [],
        materials: [],
        materialCatalog: [],
      }));

      // Materials, equipment, and duration are independent — fire all
      // three batched lookups in parallel via a single round-trip each.
      // Old code was 3N sequential per-subtask requests across three
      // phases; new code is 3 parallel requests total. Phase counter
      // fires as each batch resolves so the modal still ticks.
      setGenerationStage("Estimating materials, equipment, and durations");
      setGenerationProgress({ done: 0, total: 3 });

      const flatPairs = nextTasks.flatMap((task) =>
        task.sub_tasks.map((subTask) => ({
          taskName: task.name,
          subTaskTitle: subTask.title,
        })),
      );

      const tickProgress = () =>
        setGenerationProgress((prev) =>
          prev ? { done: prev.done + 1, total: prev.total } : prev,
        );

      const materialsPromise = postJson<GetMaterialsBatchApiResponse>(
        "/api/planning/getMaterialsBatch",
        { items: flatPairs },
      ).then((res) => {
        tickProgress();
        return res;
      });

      const equipmentPromise = postJson<GetEquipmentBatchApiResponse>(
        "/api/planning/getEquipmentBatch",
        { items: flatPairs },
      ).then((res) => {
        tickProgress();
        return res;
      });

      const durationPromise = postJson<GetDurationBatchApiResponse>(
        "/api/planning/getDurationBatch",
        { items: flatPairs, dimensions: normalizedDimensions },
      ).then((res) => {
        tickProgress();
        return res;
      });

      const [materialsData, equipmentData, durationData] = await Promise.all([
        materialsPromise,
        equipmentPromise,
        durationPromise,
      ]);

      if ("error" in materialsData) throw new Error(materialsData.error);
      if ("error" in durationData) throw new Error(durationData.error);
      // Equipment failures are soft — fall back to empty arrays per
      // subtask so a bad catalog entry doesn't abort the whole save.
      const equipmentResults =
        "error" in equipmentData
          ? ([] as Array<{
              taskName: string;
              subTaskTitle: string | null;
              equipment: EquipmentOut[];
            }>)
          : equipmentData.results;
      if ("error" in equipmentData) {
        console.warn("Equipment batch lookup failed:", equipmentData.error);
      }

      // Build per-pair lookup maps so we can stitch results back into
      // the nested task/subtask structure in O(N) total.
      const pairKey = (taskName: string, subTaskTitle: string | null) =>
        `${taskName}::${(subTaskTitle ?? "").toLowerCase()}`;

      const materialsByPair = new Map<string, MaterialOut[]>();
      for (const row of materialsData.results) {
        materialsByPair.set(
          pairKey(row.taskName, row.subTaskTitle),
          Array.isArray(row.materials) ? row.materials : [],
        );
      }
      const equipmentByPair = new Map<string, EquipmentOut[]>();
      for (const row of equipmentResults) {
        equipmentByPair.set(
          pairKey(row.taskName, row.subTaskTitle),
          Array.isArray(row.equipment) ? row.equipment : [],
        );
      }
      const durationByPair = new Map<string, DurationOut | null>();
      for (const row of durationData.results) {
        durationByPair.set(pairKey(row.taskName, row.subTaskTitle), row.duration);
        if (row.error && !row.duration) {
          console.warn(
            `Duration lookup failed for "${row.taskName}" / "${row.subTaskTitle}":`,
            row.error,
          );
        }
      }

      nextTasks = nextTasks.map((task) => {
        const subTasks = task.sub_tasks.map((subTask) => {
          const key = pairKey(task.name, subTask.title);
          return {
            ...subTask,
            materials: materialsByPair.get(key) ?? [],
            equipment: equipmentByPair.get(key) ?? [],
            duration: durationByPair.get(key) ?? null,
          };
        });
        const materialCatalog = uniqueByName(
          subTasks.flatMap((s) => s.materials),
        );
        return {
          ...task,
          sub_tasks: subTasks,
          materials: materialCatalog.map((item) => item.name),
          materialCatalog,
        };
      });

      setGenerationProgress(null);

      setGenerationStage("Assigning employees");

      const employeeData = await postJson<GetEmployeesApiResponse>(
        "/api/planning/getEmployees",
        {
          scheduledDate: scheduledStart,
          tasks: nextTasks.map((task) => ({
            taskName: task.name,
            subTasks: task.sub_tasks.map((subTask) => ({
              title: subTask.title,
              priority: subTask.priority,
              estimatedHours: subTask.duration?.baseLaborHours ?? 0,
              requiredEmployeeCount:
                subTask.duration?.requiredEmployeeCount ?? 1,
            })),
          })),
        },
      );

      if ("error" in employeeData) {
        throw new Error(employeeData.error);
      }

      const assignmentMap = new Map<
        string,
        {
          employees: AssignedEmployeeOut[];
          requiredEmployeeCount: number;
          score: number;
          reasons: string[];
        }
      >();

      for (const taskGroup of employeeData.assignments ?? []) {
        for (const assignment of taskGroup.assignments ?? []) {
          const key = `${taskGroup.taskName}__${assignment.subTaskTitle}`;
          assignmentMap.set(key, {
            employees: Array.isArray(assignment.employees)
              ? assignment.employees
              : [],
            requiredEmployeeCount: Number.isFinite(
              Number(assignment.requiredEmployeeCount),
            )
              ? Number(assignment.requiredEmployeeCount)
              : 1,
            score: Number.isFinite(Number(assignment.score))
              ? Number(assignment.score)
              : 0,
            reasons: Array.isArray(assignment.reasons)
              ? assignment.reasons.map(String)
              : [],
          });
        }
      }

      nextTasks = nextTasks.map((task) => ({
        ...task,
        sub_tasks: task.sub_tasks.map((subTask) => {
          const key = `${task.name}__${subTask.title}`;
          const matched = assignmentMap.get(key);

          return {
            ...subTask,
            assignedEmployees: matched?.employees ?? [],
            requiredEmployeeCount: matched?.requiredEmployeeCount ?? 1,
            assignmentScore: matched ? matched.score : null,
            assignmentReasons: matched?.reasons ?? [],
          };
        }),
      }));

      setGenerationStage("Scheduling tasks");

      const projectScheduleData = await postJson<GetProjectScheduleApiResponse>(
        "/api/planning/getProjectSchedule",
        {
          project: {
            scheduled_start_datetime: scheduledStart
              ? new Date(`${scheduledStart}T08:00:00`).toISOString()
              : null,
            scheduled_end_datetime: null,
            dimensions: normalizedDimensions,
          },
          generatedTasks: nextTasks.map((task) => ({
            name: task.name,
            priority: task.priority,
            sub_tasks: task.sub_tasks.map((subTask) => ({
              title: subTask.title,
              priority: subTask.priority,
              duration: subTask.duration
                ? {
                    baseLaborHours: subTask.duration.baseLaborHours,
                    requiredEmployeeCount:
                      subTask.duration.requiredEmployeeCount,
                    adjustedDurationHours:
                      subTask.duration.adjustedDurationHours,
                    roundedHours: subTask.duration.roundedHours,
                    estimatedHours: subTask.duration.estimatedHours,
                    minimumHours: subTask.duration.minimumHours,
                    formula: subTask.duration.formula,
                    productivityHoursPerEmployee:
                      subTask.duration.productivityHoursPerEmployee,
                    teamEfficiencyFactor: subTask.duration.teamEfficiencyFactor,
                  }
                : null,
              employees: subTask.assignedEmployees.map((employee) => ({
                id: employee.id,
                name: employee.name,
                role: employee.role,
              })),
              requiredEmployeeCount: subTask.requiredEmployeeCount,
            })),
          })),
        },
      );

      if ("error" in projectScheduleData) {
        throw new Error(projectScheduleData.error);
      }

      const scheduleMap = new Map<
        string,
        {
          scheduledStartDatetime: string | null;
          scheduledEndDatetime: string | null;
        }
      >();

      for (const item of projectScheduleData.scheduledItems ?? []) {
        const key = `${item.taskName}__${item.subTaskTitle}`;
        scheduleMap.set(key, {
          scheduledStartDatetime: item.scheduledStartDatetime ?? null,
          scheduledEndDatetime: item.scheduledEndDatetime ?? null,
        });
      }

      nextTasks = nextTasks.map((task) => ({
        ...task,
        sub_tasks: task.sub_tasks.map((subTask) => {
          const key = `${task.name}__${subTask.title}`;
          const matched = scheduleMap.get(key);

          return {
            ...subTask,
            scheduledStartDatetime: matched?.scheduledStartDatetime ?? null,
            scheduledEndDatetime: matched?.scheduledEndDatetime ?? null,
          };
        }),
      }));

      setScheduledEnd(projectScheduleData.projectScheduledEndDatetime ?? "");
      setGenerationStage("Finalizing generated draft");
      setGeneratedTasks(nextTasks);

      return nextTasks;
    } catch (error: any) {
      const message = error?.message || "Unexpected generation error.";
      setGenerationError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
      setGenerationStage("");
      setGenerationProgress(null);
    }
  }

  async function handleSaveAndContinue() {
    setGenerationError("");

    const title = projectName.trim();
    const scheduledStartDatetime = scheduledStart.trim()
      ? new Date(`${scheduledStart}T08:00:00`).toISOString()
      : "";
    const siteAddress = address.trim();
    const cName = clientName.trim();
    const cEmail = clientEmail.trim().toLowerCase();
    const cPhone = clientPhone.trim();
    const finalProjectCode = projectCode.trim() || generateProjectCode();

    // Collect every problem at once instead of bailing on the first one
    // so the admin can see and fix all missing details in one pass.
    // `nextErrors` drives the red highlights below; `problems` is the
    // ordered list of human-readable issues shown in the toast.
    const nextErrors = new Set<string>();
    const problems: string[] = [];

    if (!title) {
      nextErrors.add("projectName");
      problems.push("Project name");
    }
    if (!scheduledStartDatetime) {
      nextErrors.add("scheduledStart");
      problems.push("Scheduled start date");
    }
    if (!selectedClientId) {
      nextErrors.add("client");
      problems.push("Client selection");
    } else {
      // A client is picked but their record is missing required fields —
      // flag the client picker so the admin knows to switch / update.
      if (!siteAddress) {
        nextErrors.add("client");
        problems.push("Client address");
      }
      if (!cName) {
        nextErrors.add("client");
        problems.push("Client name");
      }
      if (!cEmail || !/^\S+@\S+\.\S+$/.test(cEmail)) {
        nextErrors.add("client");
        problems.push("Valid client email");
      }
      if (!cPhone) {
        nextErrors.add("client");
        problems.push("Client phone");
      }
    }
    // Manual mode skips the description, generated tasks and measurement
    // checks — the admin will populate tasks/materials on the next page.
    if (!manualMode && !description.trim()) {
      nextErrors.add("description");
      problems.push("Project description");
    }
    if (!manualMode && !previewTasks.length) {
      nextErrors.add("previewTasks");
      problems.push("Generated tasks");
    }
    if (!manualMode && !measurementRows.length) {
      nextErrors.add("measurements");
      problems.push("At least one measurement");
    } else if (!manualMode) {
      // Auto-recommended rows from "Generate Tasks" land with
      // `isMeasurementPending: true` and `estimatedValue: 0` until the
      // admin opens the measurements modal and fills them in. Without
      // real values, dimensions are empty, durations can't be estimated,
      // and downstream wizard steps end up half-populated.
      const pendingRows = measurementRows.filter(
        (row) => row.isMeasurementPending,
      );
      if (pendingRows.length > 0) {
        nextErrors.add("measurements");
        problems.push(
          `${pendingRows.length} surface measurement${pendingRows.length === 1 ? "" : "s"} pending`,
        );
      }

      // Defensive: even if rows aren't flagged pending, reject ones with
      // a zero/non-positive value. Prevents projects from being saved
      // with `dimensions.scaled[*].estimatedValue: 0` that bricks the
      // duration formula at compute time.
      const zeroRows = measurementRows.filter(
        (row) =>
          !Number.isFinite(row.estimatedValue) || row.estimatedValue <= 0,
      );
      if (zeroRows.length > 0) {
        nextErrors.add("measurements");
        problems.push(
          `${zeroRows.length} measurement${zeroRows.length === 1 ? "" : "s"} with zero / empty value`,
        );
      }
    }

    if (problems.length > 0) {
      setFormErrors(nextErrors);
      toast.error("Please fill in the missing details before generating.", {
        description: problems.join(" • "),
      });
      return;
    }

    // All clear — wipe the previous error state so any stale red
    // outlines disappear before we kick off the generate flow.
    setFormErrors(new Set());

    try {
      setSaving(true);
      setProjectCode(finalProjectCode);

      // Manual mode ships an empty task list — the heavy AI generation step
      // (durations, employee assignments, schedule layout) only runs for
      // the AI flow.
      const nextTasks: GeneratedMainTask[] = manualMode
        ? []
        : await generateProjectDraft(previewTasks);

      // The scheduler skips unavailable days (holidays + manual blocks) when
      // laying out subtasks, so trust its first-subtask start over the user's
      // raw pick — otherwise projects.scheduled_start_datetime would point at
      // a blocked day while subtasks actually begin later.
      let earliestSubtaskStartMs: number | null = null;
      for (const task of nextTasks) {
        for (const subTask of task.sub_tasks ?? []) {
          const iso = (subTask as { scheduledStartDatetime?: string | null })
            .scheduledStartDatetime;
          if (!iso) continue;
          const ms = new Date(iso).getTime();
          if (!Number.isFinite(ms)) continue;
          if (earliestSubtaskStartMs === null || ms < earliestSubtaskStartMs) {
            earliestSubtaskStartMs = ms;
          }
        }
      }
      const effectiveStartDatetime =
        earliestSubtaskStartMs !== null
          ? new Date(earliestSubtaskStartMs).toISOString()
          : scheduledStartDatetime;

      setLoading(true);
      setGenerationStage("Saving project draft");

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const creatorId = authData?.user?.id;
      if (!creatorId) {
        throw new Error("You must be signed in to create a project.");
      }

      const createProjectResponse = await fetch("/api/planning/createProject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client: {
            client_id: selectedClientId || null,
            full_name: cName,
            email: cEmail,
            phone: cPhone,
            address: siteAddress,
            notes: null,
          },
          project: {
            project_code: finalProjectCode,
            title,
            description: description.trim() || null,
            site_address: siteAddress,
            scheduled_start_datetime: effectiveStartDatetime,
            scheduled_end_datetime: scheduledEnd || null,
            end_date: null,
            status: "main_task_pending",
            priority: "normal",
            estimated_budget: 0,
            estimated_cost: 0,
            notes: null,
            dimensions: normalizedDimensions,
            // If we inserted a project row earlier (re-entry via
            // ?projectId=...), upgrade it in place instead of inserting a
            // duplicate. createProject's UPDATE branch preserves any
            // already-attached conversations.
            existing_project_id: createdProjectId || null,
            // If basic-details created a draft for the wizard, hand its id
            // off so createProject can migrate any conversations attached
            // to it onto the freshly-inserted project, then delete the
            // draft row.
            draft_id: createdDraftId || null,
          },
          createdBy: {
            userId: creatorId,
          },
          generatedTasks: nextTasks,
        }),
      });

      const createProjectResult = await createProjectResponse.json();

      if (!createProjectResponse.ok) {
        const message = [
          createProjectResult?.error || "Failed to create project.",
          createProjectResult?.details || "",
        ]
          .filter(Boolean)
          .join("\n\n");

        throw new Error(message);
      }

      const projectRow = {
        project_id: createProjectResult?.project?.projectId,
        project_code: createProjectResult?.project?.projectCode,
      };

      const savedClientId =
        createProjectResult?.client?.client_id ?? selectedClientId ?? null;

      if (!projectRow.project_id || !projectRow.project_code) {
        throw new Error("Project was created but the response was incomplete.");
      }

      if (!savedClientId) {
        throw new Error("Client was resolved but no client ID was returned.");
      }

      setCreatedProjectId(projectRow.project_id);
      // Draft was just promoted to a project (or never existed). Clear
      // the draft handle so subsequent surface re-runs route through the
      // project branch.
      setCreatedDraftId(null);

      router.replace(
        `/admin/job-creation/basic-details?projectId=${projectRow.project_id}`,
      );

      // Wipe every trace of the in-progress draft. The DB row was already
      // deleted by createProject (via the draft_id handoff). Local storage
      // held the resume-the-wizard payload; sessionStorage previously held
      // a downstream-handoff blob under the same key that nothing reads
      // anymore (the wizard handoff is now `initWizardCache`). Removing
      // both keeps dev-tools clean and prevents a stale draft from being
      // restored if the admin navigates back to basic-details before the
      // router push completes.
      localStorage.removeItem(SESSION_DRAFT_KEY);
      sessionStorage.removeItem(SESSION_DRAFT_KEY);

      // Seed the wizard cache so subsequent pages can read from it instantly.
      initWizardCache(projectRow.project_id, {
        projectId: projectRow.project_id,
        projectCode: projectRow.project_code,
        projectTitle: title,
        siteAddress,
        description: description.trim() || null,
        clientId: savedClientId,
        scheduledStartDatetime: scheduledStart
          ? new Date(`${scheduledStart}T08:00:00`).toISOString()
          : null,
        currentStep: "main_task_pending",
        mainTasks: nextTasks.map((task) => ({
          id: "", // populated when main-task-assignment first loads from API
          name: task.name,
        })),
        subTasks: [], // populated on first visit to each page
        materials: [],
        markupRate: 30,
        downpayment: 0,
        refData: {},
        manualMode,
      });

      setCachedStep(projectRow.project_id, "main_task_pending");
      setOptimisticProjectStatus(projectRow.project_id, "main_task_pending");
      router.push(
        `/admin/job-creation/main-task-assignment?projectId=${projectRow.project_id}`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to create project.");
    } finally {
      setSaving(false);
      setLoading(false);
      setGenerationStage("");
      setGenerationProgress(null);
    }
  }

  async function loadClients() {
    try {
      setClientsLoading(true);

      const response = await fetch("/api/client/getClients", {
        method: "GET",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load clients.");
      }

      setClients(Array.isArray(data.clients) ? data.clients : []);
    } catch (error) {
      console.error("Failed to load clients:", error);
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;

    const selectedClient = clients.find(
      (client) => client.client_id === selectedClientId,
    );

    if (!selectedClient) return;
    applyClientToForm(selectedClient);
  }, [clients, selectedClientId]);

  // Hoisted from the prior inline useEffect so the schedule calendar
  // modal can re-invoke it on demand from its refresh button. Returns
  // the computed background-event list; callers decide what to do with
  // it (initial effect applies it, refresh handler applies it too).
  const loadUnavailableScheduleDates = useCallback(async () => {
    const response = await fetch("/api/schedule/getUnavailableDates", {
      method: "GET",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error || "Failed to load unavailable schedule dates.",
      );
    }

    const unavailableDates: string[] = Array.isArray(data?.unavailableDates)
      ? data.unavailableDates
      : [];

    let holidayDates: Set<string> = new Set();

    if (holidaySettings.enabled && holidaySettings.countryCode) {
      const today = projectNow;
      const years = Array.from(
        new Set([today.getFullYear(), today.getFullYear() + 1]),
      );

      const holidayResults = await Promise.all(
        years.map(async (year) => {
          try {
            const res = await fetch(
              `/api/holidays?country=${encodeURIComponent(
                holidaySettings.countryCode,
              )}&year=${year}`,
            );
            if (!res.ok) return [] as string[];
            const json = await res.json();
            return Array.isArray(json?.holidays)
              ? (json.holidays as Array<{ date: string }>).map((h) => h.date)
              : [];
          } catch {
            return [] as string[];
          }
        }),
      );

      holidayDates = new Set(holidayResults.flat());
    }

    const today = projectNow;
    const events: Array<{
      title: string;
      date: string;
      display: "background";
      className: string;
    }> = [];

    for (let i = 0; i < 60; i += 1) {
      const current = new Date(today);
      current.setDate(today.getDate() + i);

      const dateKey = current.toISOString().slice(0, 10);
      const isUnavailable = unavailableDates.includes(dateKey);
      const isHoliday = holidayDates.has(dateKey);

      let className: string;
      let title: string;

      if (isUnavailable) {
        className = "fc-unavailable-day";
        title = "Unavailable";
      } else if (isHoliday) {
        className = "fc-holiday-day";
        title = "Holiday";
      } else {
        className = "fc-available-day";
        title = "Available";
      }

      events.push({
        title,
        date: dateKey,
        display: "background",
        className,
      });
    }

    return events;
  }, [holidaySettings.enabled, holidaySettings.countryCode, projectNow]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const events = await loadUnavailableScheduleDates();
        if (cancelled) return;
        setAvailableDateEvents(events);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load unavailable schedule dates:", error);
        setAvailableDateEvents([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadUnavailableScheduleDates]);

  // Awaitable refresh exposed to ScheduleCalendarModal — the modal
  // toggles its own spinner around this Promise so admins can re-pull
  // the schedule without closing/reopening the modal.
  const refreshScheduleAvailability = useCallback(async () => {
    try {
      const events = await loadUnavailableScheduleDates();
      setAvailableDateEvents(events);
    } catch (error) {
      console.error("Failed to refresh unavailable schedule dates:", error);
      throw error;
    }
  }, [loadUnavailableScheduleDates]);

  const isBusy = saving || loading;

  const hasChanges = Boolean(
    projectName ||
    scheduledStart ||
    address ||
    clientName ||
    clientEmail ||
    description ||
    selectedClientId ||
    clientPhone !== "+63" ||
    measurementRows.length > 0 ||
    previewTasks.length > 0,
  );

  function handleRemoveDraft() {
    localStorage.removeItem(SESSION_DRAFT_KEY);
    setProjectCode(generateProjectCode());
    setProjectName("");
    setScheduledStart("");
    setScheduledEnd("");
    clearSelectedClientForm();
    setDescription("");
    setAssignmentDay("monday");
    setMeasurementRows([]);
    setPreviewTasks([]);
    setManualMode(false);
    toast.success("Draft cleared");
  }

  function formatSurfaceMessage(): string {
    const surfaces = Array.from(
      new Set(
        measurementRows
          .map((row) => {
            const preset = surfacePresets[row.presetKey];
            return preset?.label?.trim() || null;
          })
          .filter(Boolean) as string[],
      ),
    );

    const lines = surfaces.map((surface) => `- ${surface}`);
    const code = projectCode.trim();

    return [
      "Hi,",
      "",
      code
        ? `Please measure the following surfaces for project ${code}:`
        : "Please measure the following surfaces for the upcoming project:",
      "",
      ...lines,
      "",
      "Please let me know once these surfaces have been measured or if anything needs to be adjusted.",
      "",
      "Thank you.",
    ].join("\n");
  }

  async function loadSurfaceMsgRecipients(force = true) {
    if (
      !force &&
      (surfaceMsgEmployeesLoadedRef.current || surfaceMsgLoadingEmployees)
    ) {
      return;
    }

    setSurfaceMsgLoadingEmployees(true);
    setSurfaceMsgLoadError(null);
    try {
      const res = await fetch("/api/planning/getStaffUsers");
      if (!res.ok) throw new Error("Failed to load active employees.");
      const json = (await res.json()) as StaffUsersResponse;

      setSurfaceMsgEmployees(
        (json.staffUsers ?? []).map((u) => ({
          id: String(u.id),
          name: String(u.username || u.email || "Unknown"),
          email: String(u.email || ""),
          specialties: Array.isArray(u.specialties)
            ? u.specialties
                .map((item: unknown) => String(item || "").trim())
                .filter(Boolean)
            : [],
        })),
      );
      surfaceMsgEmployeesLoadedRef.current = true;
    } catch (error) {
      setSurfaceMsgEmployees([]);
      setSurfaceMsgLoadError(
        error instanceof Error ? error.message : "Failed to load employees.",
      );
      surfaceMsgEmployeesLoadedRef.current = false;
    } finally {
      setSurfaceMsgLoadingEmployees(false);
    }
  }

  async function handleSendSurfaceMessage(recipientId: string) {
    if (!recipientId || surfaceMsgSending) return;

    const messageText = formatSurfaceMessage().trim();
    if (!messageText) {
      toast.error("Add at least one surface before messaging staff.");
      return;
    }

    setSurfaceMsgSending(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const senderId = authData?.user?.id;
      if (!senderId) throw new Error("Not authenticated.");

      const convRes = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: recipientId,
          ...(createdProjectId
            ? { projectId: createdProjectId }
            : createdDraftId
              ? { draftId: createdDraftId }
              : {}),
        }),
      });
      if (!convRes.ok) throw new Error("Failed to create conversation.");
      const convData = await convRes.json();
      const conversationId =
        convData?.conversationId ?? convData?.id ?? convData?.conversation?.id;
      if (!conversationId) throw new Error("No conversation ID returned.");

      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: messageText,
      });
      if (msgError) throw msgError;

      toast.success("Message sent to staff.");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message.",
      );
    } finally {
      setSurfaceMsgSending(false);
    }
  }

  return (
    <>
      <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 w-full flex-col px-4 py-3 dark:bg-slate-950">
        <div className="mb-3 flex items-center gap-2 shrink-0">
          <div className="text-xl font-semibold text-gray-900 dark:text-slate-100">Project</div>
          <ChevronRight className="h-5 w-5 text-gray-300 dark:text-slate-600" aria-hidden />
          <div className="text-xl font-semibold text-gray-900 dark:text-slate-100">
            Project Creation
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-gray-200 px-5 py-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      Basic Details
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {manualMode
                      ? "Manual mode: provide a name, client and start date, then add tasks on the next step."
                      : "Complete the setup before generating the next step."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={manualMode}
                    onClick={() => {
                      setManualMode((prev) => {
                        const next = !prev;
                        // Clear any field errors that no longer apply when
                        // entering manual mode — they'd otherwise leave red
                        // outlines on hidden fields.
                        if (next) {
                          setFormErrors((errs) => {
                            const cleaned = new Set(errs);
                            cleaned.delete("description");
                            cleaned.delete("measurements");
                            cleaned.delete("previewTasks");
                            return cleaned;
                          });
                        }
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                      manualMode
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                    title="Skip AI generation. Only requires name, client and start date."
                  >
                    <span
                      className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                        manualMode ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600"
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${
                          manualMode ? "translate-x-3" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                    Manual mode
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 dark:bg-slate-950/30">
              <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-3">
                <div className="col-span-12 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      Project Overview
                    </p>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3 min-w-0">
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Project Code
                      </label>
                      <input
                        value={projectCode}
                        readOnly
                        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 shadow-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="col-span-6 min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                          Project Name
                        </label>

                        {/* Project-name AI generation is part of the
                            automated flow. Manual mode hides it so the
                            admin types the name themselves without an
                            AI nudge. */}
                        {!manualMode ? (
                          <button
                            type="button"
                            onClick={handleGenerateProjectName}
                            disabled={isGeneratingProjectName}
                            className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ backgroundColor: ACCENT }}
                            onMouseEnter={(e) => {
                              if (!isGeneratingProjectName) {
                                e.currentTarget.style.backgroundColor =
                                  ACCENT_HOVER;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isGeneratingProjectName) {
                                e.currentTarget.style.backgroundColor = ACCENT;
                              }
                            }}
                          >
                            {isGeneratingProjectName ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            {isGeneratingProjectName
                              ? "Generating..."
                              : "Generate"}
                          </button>
                        ) : null}
                      </div>

                      <input
                        value={projectName}
                        onChange={(e) => {
                          setProjectName(e.target.value);
                          clearFormError("projectName");
                        }}
                        placeholder="Enter project name"
                        className={`h-9 w-full rounded-lg border ${BORDER} ${errorRing("projectName")} bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500`}
                        style={{
                          ["--tw-ring-color" as any]: hasFormError(
                            "projectName",
                          )
                            ? "#f87171"
                            : ACCENT,
                        }}
                      />
                    </div>

                    <div className="col-span-3 min-w-0">
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Scheduled Start Date
                      </label>

                      <button
                        type="button"
                        onClick={() => setIsScheduleCalendarOpen(true)}
                        className={`h-9 w-full rounded-lg border ${BORDER} ${errorRing("scheduledStart")} bg-white px-3 text-left text-sm text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700`}
                      >
                        {scheduledStart || "Select start date"}
                      </button>

                      {scheduledEnd ? (
                        <p className="mt-1.5 text-[11px] text-gray-500">
                          Ends: {new Date(scheduledEnd).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  className={`${
                    manualMode ? "col-span-12" : "col-span-5"
                  } min-h-0 h-full rounded-2xl border bg-white p-3 shadow-sm dark:bg-slate-900 dark:shadow-black/20 ${
                    hasFormError("client")
                      ? "border-red-400 dark:border-red-500"
                      : "border-gray-200 dark:border-slate-800"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ACCENT }}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        Client Details
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadClients()}
                      disabled={clientsLoading}
                      aria-label="Refresh client list"
                      title="Refresh client list"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${clientsLoading ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Site Address
                      </label>
                      <textarea
                        value={address}
                        readOnly
                        disabled
                        placeholder="Enter site address"
                        rows={2}
                        className={`mt-1.5 min-h-[72px] w-full resize-none rounded-lg border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none disabled:cursor-default disabled:opacity-100 disabled:text-gray-900 dark:bg-slate-800 dark:text-slate-100 dark:disabled:text-slate-100 dark:placeholder:text-slate-500`}
                      />
                    </div>

                    <div className="col-span-8 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Client Name
                      </label>
                      <select
                        value={selectedClientId}
                        onChange={(e) => handleClientSelect(e.target.value)}
                        className={`mt-1.5 h-9 w-full rounded-lg border ${BORDER} bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                        disabled={clientsLoading}
                      >
                        <option value="">
                          {clientsLoading
                            ? "Loading clients..."
                            : "Choose a client"}
                        </option>
                        {clients.map((client) => (
                          <option
                            key={client.client_id}
                            value={client.client_id}
                          >
                            {client.full_name || "Unnamed Client"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-4 min-w-0">
                      <label className="text-[11px] font-medium text-transparent">
                        Action
                      </label>
                      <button
                        type="button"
                        onClick={openCreateClientModal}
                        className="mt-1.5 inline-flex h-9 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                        style={{ backgroundColor: ACCENT }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = ACCENT;
                        }}
                      >
                        Create New Client
                      </button>
                    </div>

                    <div className="col-span-12 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Client Phone
                      </label>

                      <div className="mt-1.5 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
                        <div className="min-w-0">
                          <div className="flex h-[42px] w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            <span className="truncate">
                              {selectedPhoneCountry}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                          </div>
                        </div>

                        <div
                          className={`flex h-9 min-w-0 w-full items-center overflow-hidden rounded-lg border ${BORDER} bg-white shadow-sm dark:bg-slate-800`}
                        >
                          <span className="shrink-0 px-3 text-sm text-gray-500 dark:text-slate-400">
                            {selectedPhoneCountry}
                          </span>

                          <span className="h-5 w-px shrink-0 bg-gray-200 dark:bg-slate-700" />

                          <input
                            value={
                              clientPhone.startsWith(selectedPhoneCountry)
                                ? clientPhone.slice(selectedPhoneCountry.length)
                                : clientPhone
                            }
                            readOnly
                            disabled
                            placeholder="000-000-0000"
                            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-default disabled:opacity-100 disabled:text-gray-900 dark:text-slate-100 dark:disabled:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${manualMode ? "hidden" : "col-span-7"} min-h-0 h-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      Description
                    </p>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    {/* Description + Recommend Surfaces */}
                    <div className="flex flex-1 min-h-0 flex-col gap-1.5">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Project Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          clearFormError("description");
                        }}
                        placeholder="Write a summary of the project scope (e.g. interior repaint of 3-bedroom house)"
                        className={`flex-1 min-h-0 w-full resize-none rounded-lg border ${BORDER} ${errorRing("description")} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500`}
                        style={{
                          ["--tw-ring-color" as any]: hasFormError(
                            "description",
                          )
                            ? "#f87171"
                            : ACCENT,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleGenerateTasks}
                        disabled={
                          !description.trim() || isGeneratingTasks || isBusy
                        }
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: ACCENT }}
                        onMouseEnter={(e) => {
                          if (
                            description.trim() &&
                            !isGeneratingTasks &&
                            !isBusy
                          )
                            e.currentTarget.style.backgroundColor =
                              ACCENT_HOVER;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = ACCENT;
                        }}
                      >
                        {isGeneratingTasks ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {isGeneratingTasks
                          ? "Recommending surfaces..."
                          : "Recommend Surfaces"}
                      </button>
                    </div>

                    {/* Configured surfaces */}
                    <div
                      className={`rounded-xl border bg-gray-50 p-2 dark:bg-slate-800/60 ${
                        hasFormError("measurements")
                          ? "border-red-400 dark:border-red-500"
                          : `${BORDER}`
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                          Configured Surfaces
                        </div>
                        <div className="flex items-center gap-1.5">
                          {measurementRows.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMeasurementModalOpen(true);
                                clearFormError("measurements");
                              }}
                              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-200"
                              style={{ backgroundColor: ACCENT }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  ACCENT_HOVER;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = ACCENT;
                              }}
                            >
                              <Settings2 className="h-3 w-3" />
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summaryChips.length === 0 ? (
                          <span className="text-[11px] text-gray-400 dark:text-slate-500">
                            Enter a description and click Recommend Surfaces, or
                            edit manually.
                          </span>
                        ) : (
                          <>
                            {summaryChips.slice(0, 6).map((chip) => (
                              <span
                                key={chip.id}
                                className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                              >
                                {chip.label}
                              </span>
                            ))}
                            {measurementRows.length > 6 ? (
                              <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                +{measurementRows.length - 6} more
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDraftsModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    See Drafts
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15"
                    onClick={handleRemoveDraft}
                    disabled={isBusy || !hasChanges}
                  >
                    Remove Changes
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="w-[140px] rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => router.back()}
                    disabled={isBusy}
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={draftSaving || isBusy}
                    className="inline-flex w-[140px] items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    {draftSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {draftSaving ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    className="w-[140px] rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: ACCENT }}
                    onClick={handleSaveAndContinue}
                    // Only disabled while the actual generation request
                    // is in flight. Missing fields no longer block the
                    // click — handleSaveAndContinue surfaces a toast +
                    // red highlights so the admin sees what's wrong
                    // instead of staring at a silently-disabled button.
                    disabled={isBusy}
                    onMouseEnter={(e) => {
                      if (!isBusy) {
                        e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isBusy) {
                        e.currentTarget.style.backgroundColor = ACCENT;
                      }
                    }}
                  >
                    {isBusy
                      ? "Processing..."
                      : manualMode
                        ? "Continue"
                        : "Generate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CreateClientModal
          open={isCreateClientModalOpen}
          creatingClient={creatingClient}
          fullName={newClientFullName}
          email={newClientEmail}
          phone={newClientPhone}
          phoneCountry={newClientPhoneCountry}
          address={newClientAddress}
          notes={newClientNotes}
          phoneCountryOptions={phoneCountryOptions}
          onClose={closeCreateClientModal}
          onSubmit={handleCreateClient}
          onFullNameChange={setNewClientFullName}
          onEmailChange={setNewClientEmail}
          onPhoneChange={setNewClientPhone}
          onPhoneCountryChange={handleNewClientPhoneCountryChange}
          onAddressChange={setNewClientAddress}
          onNotesChange={setNewClientNotes}
        />

        <MeasurementModal
          open={measurementModalOpen}
          rows={measurementRows}
          surfacePresets={surfacePresets}
          loadingPresets={surfacePresetsLoading}
          onClose={() => setMeasurementModalOpen(false)}
          onAdd={addMeasurement}
          onRemove={removeMeasurement}
          onPresetChange={handlePresetChange}
          onBandChange={handleBandChange}
          onManualValueChange={handleManualValueChange}
          messageRecipients={surfaceMsgEmployees}
          loadingMessageRecipients={surfaceMsgLoadingEmployees}
          messageRecipientsError={surfaceMsgLoadError}
          onLoadMessageRecipients={() => {
            void loadSurfaceMsgRecipients(true);
          }}
          onSendSurfaceMessage={handleSendSurfaceMessage}
          sendingSurfaceMessage={surfaceMsgSending}
          onRefreshMeasurements={refreshMeasurementsFromDb}
          refreshingMeasurements={refreshingMeasurements}
        />

        <DraftsModal
          open={draftsModalOpen}
          onClose={() => setDraftsModalOpen(false)}
          onPickDraft={handlePickDraft}
        />
      </div>

      {loading ? (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              </div>

              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                Generating Project Setup
              </h2>

              <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                PaintPro is generating the project setup and preparing it for
                saving.
              </p>

              {generationStage ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{generationStage}</span>
                  {generationProgress ? (
                    <span className="ml-auto rounded-md bg-emerald-100/60 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                      {generationProgress.done}/{generationProgress.total}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ScheduleCalendarModal
        open={isScheduleCalendarOpen}
        selectedDate={scheduledStart}
        initialDate={projectNow}
        availableDateEvents={availableDateEvents}
        onRefresh={refreshScheduleAvailability}
        onClose={() => setIsScheduleCalendarOpen(false)}
        onSelectDate={(date) => {
          setScheduledStart(date);
          clearFormError("scheduledStart");
          setIsScheduleCalendarOpen(false);
          toast.success("Scheduled start date selected.");
        }}
      />
    </>
  );
}
