"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Settings2,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CreateClientModal from "@/components/project-creation/CreateClientModal";
import MeasurementModal, {
  type MeasurementRow,
} from "@/components/project-creation/MeasurementModal";
import StaffMessageModal from "@/components/project-creation/StaffMessageModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200";
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

type ExtractedSurfaceMeasurement = {
  presetKey: string;
  estimatedValue: number;
};

type ExtractSurfaceMeasurementsApiResponse = {
  measurements?: ExtractedSurfaceMeasurement[];
  error?: string;
  details?: string;
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
      sizeBand: row.sizeBand as ProjectScaledField["sizeBand"],
      estimatedValue: existingValue + currentValue,
      isManualOverride:
        Boolean(existing?.isManualOverride) || row.isManualOverride,
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

  const [assignmentDay, setAssignmentDay] = useState<WeekdayKey>("monday");
  const [loading, setLoading] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedMainTask[]>([]);
  const [isGeneratingProjectName, setIsGeneratingProjectName] = useState(false);

  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[]>([]);
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [previewTasks, setPreviewTasks] = useState<PreviewMainTask[]>([]);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);

  type SurfaceEmployee = {
    id: string;
    name: string;
    email: string;
    specialties: string[];
  };
  type StaffConvMessage = { id: string; senderId: string; senderType: "admin" | "employee"; text: string; createdAt: string; };
  type StaffConvData = { id: string; employeeId: string; employeeName: string; employeeEmail?: string; employeeRole?: string; employeeAvatarUrl?: string | null; lastMessage?: string; messages: StaffConvMessage[]; };

  const [surfaceMsgOpen, setSurfaceMsgOpen] = useState(false);
  const [surfaceMsgEmployees, setSurfaceMsgEmployees] = useState<
    SurfaceEmployee[]
  >([]);
  const [surfaceMsgLoadingEmployees, setSurfaceMsgLoadingEmployees] =
    useState(false);
  const [surfaceMsgLoadError, setSurfaceMsgLoadError] = useState<string | null>(
    null,
  );
  const [surfaceMsgEmployeeId, setSurfaceMsgEmployeeId] = useState("");
  const [surfaceMsgText, setSurfaceMsgText] = useState("");
  const [surfaceMsgSending, setSurfaceMsgSending] = useState(false);
  const [surfaceMsgApplyingMeasurementId, setSurfaceMsgApplyingMeasurementId] =
    useState<string | null>(null);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [surfaceMsgConversations, setSurfaceMsgConversations] = useState<StaffConvData[]>([]);
  const [surfaceMsgConversationsLoading, setSurfaceMsgConversationsLoading] = useState(false);
  const [surfaceMsgConversationError, setSurfaceMsgConversationError] = useState<string | null>(null);
  const [surfaceMsgSpecsEmployeeIds, setSurfaceMsgSpecsEmployeeIds] = useState<string[]>([]);
  const surfaceMsgEmployeesLoadedRef = useRef(false);
  const surfaceMsgConversationsLoadedRef = useRef(false);

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
  ]);

  const normalizedDimensions = useMemo(
    () => rowsToProjectDimensions(measurementRows),
    [measurementRows],
  );

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

  const surfaceMsgDisplayConversations = useMemo(() => {
    let convs = [...surfaceMsgConversations];

    // Inject a synthetic placeholder for a newly selected employee with no prior conv
    if (
      surfaceMsgEmployeeId &&
      !convs.some((c) => c.employeeId === surfaceMsgEmployeeId)
    ) {
      const emp = surfaceMsgEmployees.find((e) => e.id === surfaceMsgEmployeeId);
      if (emp) {
        convs = [
          {
            id: surfaceMsgEmployeeId,
            employeeId: surfaceMsgEmployeeId,
            employeeName: emp.name,
            employeeEmail: emp.email,
            messages: [] as StaffConvMessage[],
          },
          ...convs,
        ];
      }
    }

    // Pin specs-sent conversations to the top, preserving their send order
    if (surfaceMsgSpecsEmployeeIds.length > 0) {
      convs.sort((a, b) => {
        const ai = surfaceMsgSpecsEmployeeIds.indexOf(a.employeeId);
        const bi = surfaceMsgSpecsEmployeeIds.indexOf(b.employeeId);
        const aIsSpecs = ai !== -1;
        const bIsSpecs = bi !== -1;
        if (aIsSpecs && !bIsSpecs) return -1;
        if (!aIsSpecs && bIsSpecs) return 1;
        if (aIsSpecs && bIsSpecs) return ai - bi;
        return 0;
      });
    }

    return convs;
  }, [surfaceMsgEmployeeId, surfaceMsgConversations, surfaceMsgEmployees, surfaceMsgSpecsEmployeeIds]);

  const surfaceMsgSpecsConvIds = useMemo(
    () =>
      surfaceMsgSpecsEmployeeIds.map((empId) => {
        const real = surfaceMsgConversations.find((c) => c.employeeId === empId);
        return real?.id ?? empId;
      }),
    [surfaceMsgSpecsEmployeeIds, surfaceMsgConversations],
  );

  const surfaceMsgSelectedConvId = useMemo(() => {
    if (!surfaceMsgEmployeeId) return "";
    const real = surfaceMsgConversations.find(
      (c) => c.employeeId === surfaceMsgEmployeeId,
    );
    return real?.id ?? surfaceMsgEmployeeId;
  }, [surfaceMsgEmployeeId, surfaceMsgConversations]);

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
        estimatedValue: row.isManualOverride && !row.isMeasurementPending
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

  function applyExtractedMeasurements(
    measurements: ExtractedSurfaceMeasurement[],
  ) {
    setMeasurementRows((prev) => {
      const nextRows = [...prev];

      for (const measurement of measurements) {
        const preset = surfacePresets[measurement.presetKey];
        if (!preset) continue;

        const existingIndex = nextRows.findIndex(
          (row) => row.presetKey === measurement.presetKey,
        );

        if (existingIndex >= 0) {
          nextRows[existingIndex] = {
            ...nextRows[existingIndex],
            estimatedValue: measurement.estimatedValue,
            isManualOverride: true,
            isMeasurementPending: false,
          };
          continue;
        }

        nextRows.push(
          makeRowFromPreset(surfacePresets, measurement.presetKey, "medium", {
            estimatedValue: measurement.estimatedValue,
            isManualOverride: true,
            isMeasurementPending: false,
          }),
        );
      }

      return nextRows;
    });
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

      if (surfaceKeys.length > 0) {
        setMeasurementRows(
          surfaceKeys.map((key) => makeRecommendedSurfaceRow(surfacePresets, key)),
        );
      }

      toast.success(
        `Generated ${tasks.length} main task${tasks.length !== 1 ? "s" : ""}`,
      );
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

      setGenerationStage("Estimating materials");

      nextTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const subTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const materialData = await postJson<GetMaterialsApiResponse>(
                "/api/planning/getMaterials",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                },
              );

              if ("error" in materialData) {
                throw new Error(materialData.error);
              }

              return {
                ...subTask,
                materials: Array.isArray(materialData.materials)
                  ? materialData.materials
                  : [],
              };
            }),
          );

          const materialCatalog = uniqueByName(
            subTasks.flatMap((subTask) => subTask.materials),
          );

          return {
            ...task,
            sub_tasks: subTasks,
            materials: materialCatalog.map((item) => item.name),
            materialCatalog,
          };
        }),
      );

      setGenerationStage("Preparing equipment");

      nextTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const subTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const equipmentData = await postJson<GetEquipmentApiResponse>(
                "/api/planning/getEquipment",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                },
              );

              if ("error" in equipmentData) {
                throw new Error(equipmentData.error);
              }

              return {
                ...subTask,
                equipment: Array.isArray(equipmentData.equipment)
                  ? equipmentData.equipment
                  : [],
              };
            }),
          );

          return {
            ...task,
            sub_tasks: subTasks,
          };
        }),
      );

      setGenerationStage("Calculating durations");

      nextTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const subTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const durationData = await postJson<GetDurationApiResponse>(
                "/api/planning/getDuration",
                {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                  dimensions: normalizedDimensions,
                },
              );

              if ("error" in durationData) {
                throw new Error(durationData.error);
              }

              return {
                ...subTask,
                duration: durationData.duration ?? null,
              };
            }),
          );

          return {
            ...task,
            sub_tasks: subTasks,
          };
        }),
      );

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

    if (!title) {
      toast.error("Please enter a project name.");
      return;
    }
    if (!scheduledStartDatetime) {
      toast.error("Please select a scheduled start date.");
      return;
    }
    if (!selectedClientId) {
      toast.error("Please choose an existing client or create a new one.");
      return;
    }
    if (!siteAddress) {
      toast.error(
        "The selected client has no address. Update the client record or choose another client.",
      );
      return;
    }
    if (!cName) {
      toast.error(
        "The selected client has no name. Update the client record or choose another client.",
      );
      return;
    }
    if (!cEmail || !/^\S+@\S+\.\S+$/.test(cEmail)) {
      toast.error(
        "The selected client has an invalid email. Update the client record or choose another client.",
      );
      return;
    }
    if (!cPhone) {
      toast.error(
        "The selected client has no phone number. Update the client record or choose another client.",
      );
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a project description.");
      return;
    }
    if (!previewTasks.length) {
      toast.error("Please generate tasks first by clicking Generate Tasks.");
      return;
    }
    if (!measurementRows.length) {
      toast.error("Please add at least one measurement.");
      return;
    }

    try {
      setSaving(true);
      setProjectCode(finalProjectCode);

      const nextTasks = await generateProjectDraft(previewTasks);

      setLoading(true);
      setGenerationStage("Saving project draft");

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const creatorId = authData?.user?.id;
      if (!creatorId) {
        throw new Error("You must be signed in to create a project.");
      }

      console.log(
        "createProject payload first subtask",
        nextTasks?.[0]?.sub_tasks?.[0],
      );

      console.log(
        "createProject payload",
        JSON.stringify(
          nextTasks.map((task) => ({
            name: task.name,
            sub_tasks: task.sub_tasks.map((subTask) => ({
              title: subTask.title,
              assignedEmployees: subTask.assignedEmployees,
              requiredEmployeeCount: subTask.requiredEmployeeCount,
            })),
          })),
          null,
          2,
        ),
      );

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
            scheduled_start_datetime: scheduledStartDatetime,
            scheduled_end_datetime: scheduledEnd || null,
            end_date: null,
            status: "main_task_pending",
            priority: "normal",
            estimated_budget: 0,
            estimated_cost: 0,
            notes: null,
            dimensions: normalizedDimensions,
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

      router.replace(
        `/admin/job-creation/basic-details?projectId=${projectRow.project_id}`,
      );

      sessionStorage.setItem(
        SESSION_DRAFT_KEY,
        JSON.stringify({
          projectId: projectRow.project_id,
          projectCode: projectRow.project_code,
          clientId: savedClientId,
          assignmentDay,
          basicDetails: {
            projectName: title,
            projectCode: projectRow.project_code,
            scheduled_start_datetime: scheduledStartDatetime,
            scheduled_end_datetime: scheduledEnd || null,
            address: siteAddress,
            clientName: cName,
            clientEmail: cEmail,
            clientPhone: cPhone,
            description: description.trim(),
            measurementRows,
            normalizedDimensions,
          },
          generatedTasks: nextTasks,
          savedAt: new Date().toISOString(),
        }),
      );

      localStorage.removeItem(SESSION_DRAFT_KEY);
      router.push(
        `/admin/job-creation/main-task-assignment?projectId=${projectRow.project_id}`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to create project.");
    } finally {
      setSaving(false);
      setLoading(false);
      setGenerationStage("");
    }
  }

  useEffect(() => {
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

    loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;

    const selectedClient = clients.find(
      (client) => client.client_id === selectedClientId,
    );

    if (!selectedClient) return;
    applyClientToForm(selectedClient);
  }, [clients, selectedClientId]);

  useEffect(() => {
    async function loadUnavailableScheduleDates() {
      try {
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

        const today = new Date();
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

          events.push({
            title: isUnavailable ? "Unavailable" : "Available",
            date: dateKey,
            display: "background",
            className: isUnavailable
              ? "fc-unavailable-day"
              : "fc-available-day",
          });
        }

        setAvailableDateEvents(events);
      } catch (error) {
        console.error("Failed to load unavailable schedule dates:", error);

        setAvailableDateEvents([]);
      }
    }

    loadUnavailableScheduleDates();
  }, []);

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
    /*
        return `  • ${preset.label}: ${row.estimatedValue} ${unitLabel(preset.unit)}`;
      })
      .filter(Boolean) as string[];

    */

    return [
      "Hi,",
      "",
      "Please measure the following surfaces for the upcoming project:",
      "",
      ...lines,
      "",
      "Please let me know once these surfaces have been measured or if anything needs to be adjusted.",
      "",
      "Thank you.",
    ].join("\n");
  }

  function handleOpenSurfaceMsg() {
    setSurfaceMsgOpen(true);
    void handleSurfaceMsgProceed(false);
    void loadStaffConversations(true, false);
  }

  function handleOpenSurfaceMsgRecipientPicker() {
    setRecipientPickerOpen(true);

    if (surfaceMsgLoadError) {
      void handleSurfaceMsgProceed(true);
      return;
    }

    void handleSurfaceMsgProceed(false);
  }

  async function handleSurfaceMsgProceed(force = true) {
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

  async function loadStaffConversations(showLoading = true, force = true) {
    if (
      !force &&
      (surfaceMsgConversationsLoadedRef.current ||
        surfaceMsgConversationsLoading)
    ) {
      return;
    }

    if (showLoading) setSurfaceMsgConversationsLoading(true);
    setSurfaceMsgConversationError(null);
    try {
      const res = await fetch("/api/messages/staff-conversations");
      if (!res.ok) throw new Error("Failed to load conversations.");
      const json = await res.json();
      setSurfaceMsgConversations(json.conversations ?? []);
      surfaceMsgConversationsLoadedRef.current = true;
    } catch (error) {
      setSurfaceMsgConversationError(
        error instanceof Error ? error.message : "Failed to load conversations.",
      );
      surfaceMsgConversationsLoadedRef.current = false;
    } finally {
      if (showLoading) setSurfaceMsgConversationsLoading(false);
    }
  }

  async function handleSendSurfaceMsg() {
    if (!surfaceMsgEmployeeId || !surfaceMsgText.trim()) return;
    setSurfaceMsgSending(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const senderId = authData?.user?.id;
      if (!senderId) throw new Error("Not authenticated.");

      const convRes = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: surfaceMsgEmployeeId }),
      });
      if (!convRes.ok) throw new Error("Failed to create conversation.");
      const convData = await convRes.json();
      const conversationId =
        convData?.conversationId ?? convData?.id ?? convData?.conversation?.id;
      if (!conversationId) throw new Error("No conversation ID returned.");

      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: surfaceMsgText.trim(),
      });
      if (msgError) throw msgError;

      toast.success("Message sent.");
      setSurfaceMsgText("");
      void loadStaffConversations(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message.",
      );
    } finally {
      setSurfaceMsgSending(false);
    }
  }

  async function handleApplyMeasurementsFromMessage(message: StaffConvMessage) {
    if (!/\d/.test(message.text)) {
      toast.info("No measurements found", {
        description: "That message does not contain any numbers to extract.",
      });
      return;
    }

    const configuredSurfaces = Array.from(
      new Map(
        measurementRows
          .map((row) => {
            const preset = surfacePresets[row.presetKey];
            if (!preset) return null;

            return [
              row.presetKey,
              {
                presetKey: row.presetKey,
                label: preset.label,
                unit: preset.unit,
              },
            ] as const;
          })
          .filter(Boolean) as Array<
          readonly [
            string,
            {
              presetKey: string;
              label: string;
              unit: string;
            },
          ]
        >,
      ).values(),
    );

    if (configuredSurfaces.length === 0) {
      toast.error("No configured surfaces found", {
        description:
          "Add or recommend surfaces in Basic Details before applying measurements.",
      });
      return;
    }

    setSurfaceMsgApplyingMeasurementId(message.id);

    try {
      const response = await fetch("/api/planning/extractSurfaceMeasurements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageText: message.text,
          surfaces: configuredSurfaces,
        }),
      });

      const data =
        (await response.json().catch(() => null)) as
          | ExtractSurfaceMeasurementsApiResponse
          | null;

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to extract measurements.",
        );
      }

      const measurements = Array.isArray(data?.measurements)
        ? data.measurements.filter(
            (measurement) =>
              Boolean(measurement?.presetKey) &&
              Number.isFinite(Number(measurement?.estimatedValue)),
          )
        : [];

      if (measurements.length === 0) {
        toast.info("No usable measurements found", {
          description:
            "AI could not match any numbers in that message to your configured surfaces.",
        });
        return;
      }

      applyExtractedMeasurements(measurements);

      const appliedSurfaceLabels = measurements
        .map((measurement) => surfacePresets[measurement.presetKey]?.label)
        .filter(Boolean)
        .join(", ");

      toast.success("Basic details updated", {
        description: appliedSurfaceLabels
          ? `Applied measurements for ${appliedSurfaceLabels}.`
          : "Applied extracted surface measurements.",
      });
    } catch (error) {
      toast.error("Could not apply measurements", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to extract surface measurements from that message.",
      });
    } finally {
      setSurfaceMsgApplyingMeasurementId(null);
    }
  }

  return (
    <>
      <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 w-full flex-col px-4 py-3">
        <div className="mb-3 flex items-center gap-2 shrink-0">
          <div className="text-xl font-semibold text-gray-900">Project</div>
          <ChevronRight className="h-5 w-5 text-gray-300" aria-hidden />
          <div className="text-xl font-semibold text-gray-900">
            Project Creation
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Basic Details
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Complete the setup before generating the next step.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Draft Setup
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
              <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-3">
                <div className="col-span-12 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Project Overview
                    </p>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3 min-w-0">
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                        Project Code
                      </label>
                      <input
                        value={projectCode}
                        readOnly
                        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 shadow-sm outline-none"
                      />
                    </div>

                    <div className="col-span-6 min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-medium text-gray-600">
                          Project Name
                        </label>

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
                          }}>
                          {isGeneratingProjectName ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {isGeneratingProjectName
                            ? "Generating..."
                            : "Generate"}
                        </button>
                      </div>

                      <input
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Enter project name"
                        className={`h-9 w-full rounded-lg border ${BORDER} bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      />
                    </div>

                    <div className="col-span-3 min-w-0">
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                        Scheduled Start Date
                      </label>

                      <button
                        type="button"
                        onClick={() => setIsScheduleCalendarOpen(true)}
                        className={`h-9 w-full rounded-lg border ${BORDER} bg-white px-3 text-left text-sm text-gray-900 shadow-sm outline-none transition hover:bg-gray-50`}>
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

                <div className="col-span-5 min-h-0 h-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Client Details
                    </p>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600">
                        Site Address
                      </label>
                      <textarea
                        value={address}
                        readOnly
                        disabled
                        placeholder="Enter site address"
                        rows={2}
                        className={`mt-1.5 min-h-[72px] w-full resize-none rounded-lg border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none disabled:cursor-default disabled:opacity-100 disabled:text-gray-900`}
                      />
                    </div>

                    <div className="col-span-8 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600">
                        Client Name
                      </label>
                      <select
                        value={selectedClientId}
                        onChange={(e) => handleClientSelect(e.target.value)}
                        className={`mt-1.5 h-9 w-full rounded-lg border ${BORDER} bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                        disabled={clientsLoading}>
                        <option value="">
                          {clientsLoading
                            ? "Loading clients..."
                            : "Choose a client"}
                        </option>
                        {clients.map((client) => (
                          <option
                            key={client.client_id}
                            value={client.client_id}>
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
                        }}>
                        Create New Client
                      </button>
                    </div>

                    <div className="col-span-12 min-w-0">
                      <label className="text-[11px] font-medium text-gray-600">
                        Client Phone
                      </label>

                      <div className="mt-1.5 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
                        <div className="min-w-0">
                          <div className="flex h-[42px] w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 shadow-none">
                            <span className="truncate">
                              {selectedPhoneCountry}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                          </div>
                        </div>

                        <div
                          className={`flex h-9 min-w-0 w-full items-center overflow-hidden rounded-lg border ${BORDER} bg-white shadow-sm`}>
                          <span className="shrink-0 px-3 text-sm text-gray-500">
                            {selectedPhoneCountry}
                          </span>

                          <span className="h-5 w-px shrink-0 bg-gray-200" />

                          <input
                            value={
                              clientPhone.startsWith(selectedPhoneCountry)
                                ? clientPhone.slice(selectedPhoneCountry.length)
                                : clientPhone
                            }
                            readOnly
                            disabled
                            placeholder="000-000-0000"
                            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-default disabled:opacity-100 disabled:text-gray-900"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-7 min-h-0 h-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Description
                    </p>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    {/* Description + Recommend Surfaces */}
                    <div className="flex flex-1 min-h-0 flex-col gap-1.5">
                      <label className="text-[11px] font-medium text-gray-600">
                        Project Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Write a summary of the project scope (e.g. interior repaint of 3-bedroom house)"
                        className={`flex-1 min-h-0 w-full resize-none rounded-lg border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
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
                        }}>
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
                      className={`rounded-xl border ${BORDER} bg-gray-50 p-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Configured Surfaces
                        </div>
                        <div className="flex items-center gap-1.5">
                          {measurementRows.length > 0 ? (
                            <button
                              type="button"
                              onClick={handleOpenSurfaceMsg}
                              className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
                              <MessageSquare className="h-3 w-3" />
                              Message Employee
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setMeasurementModalOpen(true)}
                            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-200"
                            style={{ backgroundColor: ACCENT }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                ACCENT_HOVER;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = ACCENT;
                            }}>
                            <Settings2 className="h-3 w-3" />
                            Edit
                          </button>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summaryChips.length === 0 ? (
                          <span className="text-[11px] text-gray-400">
                            Enter a description and click Recommend Surfaces, or
                            edit manually.
                          </span>
                        ) : (
                          <>
                            {summaryChips.slice(0, 6).map((chip) => (
                              <span
                                key={chip.id}
                                className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700">
                                {chip.label}
                              </span>
                            ))}
                            {measurementRows.length > 6 ? (
                              <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700">
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

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleRemoveDraft}
                    disabled={isBusy || !hasChanges}>
                    Remove Changes
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="w-[140px] rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-300"
                    onClick={() => router.back()}
                    disabled={isBusy}>
                    Go Back
                  </button>
                  <button
                    type="button"
                    className="w-[140px] rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: ACCENT }}
                    onClick={handleSaveAndContinue}
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
                    }}>
                    {isBusy ? "Processing..." : "Generate"}
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
        />
      </div>

      <StaffMessageModal
        open={surfaceMsgOpen}
        onOpenChange={(open) => {
          setSurfaceMsgOpen(open);
          if (!open) {
            setSurfaceMsgSending(false);
            setSurfaceMsgApplyingMeasurementId(null);
            setRecipientPickerOpen(false);
          }
        }}
        conversations={surfaceMsgDisplayConversations}
        loadingConversations={surfaceMsgConversationsLoading}
        conversationLoadError={surfaceMsgConversationError}
        onRetryLoadConversations={loadStaffConversations}
        selectedConversationId={surfaceMsgSelectedConvId}
        specsSentConversationIds={surfaceMsgSpecsConvIds}
        onSelectedConversationIdChange={(convId) => {
          const conv = surfaceMsgDisplayConversations.find(
            (c) => c.id === convId,
          );
          if (conv) setSurfaceMsgEmployeeId(conv.employeeId);
        }}
        messageText={surfaceMsgText}
        onMessageTextChange={setSurfaceMsgText}
        sending={surfaceMsgSending}
        applyingMeasurementMessageId={surfaceMsgApplyingMeasurementId}
        onSend={handleSendSurfaceMsg}
        onCreateNew={handleOpenSurfaceMsgRecipientPicker}
        onFillSpecs={() => {
          setSurfaceMsgText(formatSurfaceMessage());
          if (surfaceMsgEmployeeId) {
            setSurfaceMsgSpecsEmployeeIds((prev) =>
              prev.includes(surfaceMsgEmployeeId)
                ? prev
                : [...prev, surfaceMsgEmployeeId],
            );
          }
        }}
        onApplyMeasurements={handleApplyMeasurementsFromMessage}
        onDeleteMessage={async (messageId) => {
          const res = await fetch(
            `/api/messages/manage?messageId=${messageId}`,
            { method: "DELETE" },
          );
          if (!res.ok) {
            const data = await res.json();
            toast.error(data?.error ?? "Failed to delete message.");
            return;
          }
          void loadStaffConversations(false);
        }}
      />

      {/* Recipient Picker Modal */}
      <Dialog open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick a recipient</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {surfaceMsgLoadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <p className="font-semibold">Could not load employees</p>
                <p className="mt-1 text-xs leading-5">{surfaceMsgLoadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void handleSurfaceMsgProceed(true);
                  }}
                  className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            ) : null}
            {surfaceMsgEmployees.length === 0 &&
              !surfaceMsgLoadingEmployees && (
                <div className="text-gray-500 text-sm">
                  No employees available.
                </div>
              )}
            {surfaceMsgLoadingEmployees && (
              <div className="text-gray-500 text-sm">Loading employees...</div>
            )}
            {surfaceMsgEmployees.map((emp) => (
              <button
                key={emp.id}
                className="w-full rounded border px-4 py-2 text-left hover:bg-gray-100"
                onClick={() => {
                  const hasExisting = surfaceMsgConversations.some(
                    (c) => c.employeeId === emp.id,
                  );
                  if (!hasExisting) {
                    setSurfaceMsgText(formatSurfaceMessage());
                    setSurfaceMsgSpecsEmployeeIds((prev) =>
                      prev.includes(emp.id) ? prev : [...prev, emp.id],
                    );
                  }
                  setSurfaceMsgEmployeeId(emp.id);
                  setRecipientPickerOpen(false);
                }}>
                {emp.name}{" "}
                <span className="text-xs text-gray-400">{emp.email}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              </div>

              <h2 className="text-lg font-semibold text-gray-900">
                Generating Project Setup
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                PaintPro is generating the project setup and preparing it for
                saving.
              </p>

              {generationStage ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{generationStage}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ScheduleCalendarModal
        open={isScheduleCalendarOpen}
        selectedDate={scheduledStart}
        availableDateEvents={availableDateEvents}
        onClose={() => setIsScheduleCalendarOpen(false)}
        onSelectDate={(date) => {
          setScheduledStart(date);
          setIsScheduleCalendarOpen(false);
          toast.success("Scheduled start date selected.");
        }}
      />
    </>
  );
}
