"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Braces,
  CalendarDays,
  ClipboardList,
  Clock3,
  Loader2,
  Mail,
  MapPin,
  Package,
  Play,
  RefreshCw,
  Settings2,
  UserRoundPlus,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import CreateClientModal from "@/components/project-creation/CreateClientModal";
import MeasurementModal, {
  type MeasurementRow,
} from "@/components/project-creation/MeasurementModal";
import { PhoneCountryPicker } from "@/components/PhoneCountryPicker";
import countryCallingCodes from "@/lib/data/country-by-calling-code.json";
import {
  computeAreasFromDimensions,
  type ProjectDimensions,
  type ProjectScaledField,
} from "@/lib/planning/materialEstimator";
import type {
  ScaleBandKey,
  ScalePresetKey,
  SurfaceScalePresets,
} from "@/lib/planning/surfacePresets";

const ACCENT = "#00c065";
const BORDER = "border border-gray-200";
const ACCENT_RING_STYLE: CSSProperties & Record<"--tw-ring-color", string> = {
  "--tw-ring-color": ACCENT,
};

type MaterialOut = {
  material_id?: string;
  name: string;
  unit: string;
  notes?: string;
};

type EquipmentOut = {
  equipment_id?: string;
  name: string;
  status?: string;
  condition?: string;
  location?: string;
  notes?: string;
};

type DurationOut = {
  taskName: string;
  subTaskTitle: string;
  baseLaborHours: number;
  requiredEmployeeCount: number;
  adjustedDurationHours: number;
  roundedHours: number;
  formula: string;
  driver: number;
  driverUnit: "m2" | "m" | "count" | "fixed";
  productivityHoursPerEmployee: number;
  teamEfficiencyFactor: number;
};

type AssignedEmployeeOut = {
  id: string;
  name: string;
  role: string;
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

type GeneratedMainTask = {
  name: string;
  priority: number;
  confidence: number;
  reasons: string[];
  sub_tasks: GeneratedSubTask[];
  materials: string[];
  materialCatalog: MaterialOut[];
};

type ClientOption = {
  client_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
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
  | { error: string; details?: string; raw?: string };

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
      taskName: string;
      subTaskTitle: string;
      duration: DurationOut;
    }
  | { error: string; details?: string };

type GetEmployeesApiResponse =
  | {
      day: string | null;
      scheduledDate?: string | null;
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

type CreateClientApiResponse =
  | {
      client: ClientOption;
    }
  | { error: string; details?: string };

type GetClientsApiResponse =
  | {
      clients: ClientOption[];
    }
  | { error: string; details?: string };

type GetSurfaceScalePresetsApiResponse =
  | {
      surfaceScalePresets: SurfaceScalePresets;
    }
  | { error: string; details?: string };

type ResultMeasurement = {
  id: string;
  presetKey: string;
  label: string;
  unit: string;
  sizeBand: ScaleBandKey;
  estimatedValue: number;
  isManualOverride: boolean;
};

type DryRunPayload = {
  project: {
    projectCode: string;
    projectTitle: string;
    description: string;
    siteAddress: string;
    scheduledStartDate: string;
    scheduledStartDatetime: string;
    scheduledEndDatetime: string | null;
    clientId: string | null;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    dimensions: ProjectDimensions | null;
    source: "admin-test";
    persistsToDatabase: false;
  };
  client: {
    clientId: string | null;
    fullName: string;
    email: string;
    phone: string;
    address: string;
  };
  measurements: ResultMeasurement[];
};

type DryRunResult = {
  projectCode: string;
  projectTitle: string;
  description: string;
  siteAddress: string;
  scheduledStartDate: string;
  scheduledStartDatetime: string;
  projectScheduledEndDatetime: string | null;
  generatedAt: string;
  client: {
    clientId: string | null;
    fullName: string;
    email: string;
    phone: string;
    address: string;
  };
  dimensions: ProjectDimensions | null;
  measurements: ResultMeasurement[];
  projectDraft: DryRunPayload;
  rawAiText: string;
  mainTasks: GeneratedMainTask[];
};

const SAMPLE_DESCRIPTION = [
  "Interior repaint for a 3-bedroom home including walls, ceilings, doors,",
  "trim, patch repairs, surface prep, masking, and final clean-up.",
].join(" ");

const SAMPLE_DIMENSIONS: ProjectDimensions = {
  scaled: {
    interior_wall_area_m2: {
      presetKey: "interior_wall_area_m2",
      estimatedValue: 145,
      isManualOverride: true,
    },
    ceiling_area_m2: {
      presetKey: "ceiling_area_m2",
      estimatedValue: 92,
      isManualOverride: true,
    },
    trim_length_m: {
      presetKey: "trim_length_m",
      estimatedValue: 28,
      isManualOverride: true,
    },
    skirting_length_m: {
      presetKey: "skirting_length_m",
      estimatedValue: 42,
      isManualOverride: true,
    },
    architrave_length_m: {
      presetKey: "architrave_length_m",
      estimatedValue: 24,
      isManualOverride: true,
    },
    doors_count: {
      presetKey: "doors_count",
      estimatedValue: 7,
      isManualOverride: true,
    },
    windows_count: {
      presetKey: "windows_count",
      estimatedValue: 10,
      isManualOverride: true,
    },
  },
  notes: "Sample dry-run measurements",
};

const AREA_LABELS: Record<string, string> = {
  wallAreaM2: "Interior Wall Area",
  ceilingAreaM2: "Ceiling Area",
  featureWallAreaM2: "Feature Wall Area",
  exteriorWallAreaM2: "Exterior Wall Area",
  roofAreaM2: "Roof Area",
  wallpaperAreaM2: "Wallpaper Area",
  pressureWashAreaM2: "Pressure Wash Area",
  deckAreaM2: "Deck Area",
  patioAreaM2: "Patio Area",
  drivewayAreaM2: "Driveway Area",
  garageFloorAreaM2: "Garage Floor Area",
  epoxyFloorAreaM2: "Epoxy Floor Area",
  trimLengthM: "Trim Length",
  skirtingLengthM: "Skirting Length",
  architraveLengthM: "Architrave Length",
  guttersLengthM: "Gutters Length",
  fasciaLengthM: "Fascia Length",
  eavesLengthM: "Eaves Length",
  downpipesLengthM: "Downpipes Length",
  handrailLengthM: "Handrail Length",
  balustradeLengthM: "Balustrade Length",
  doorsCount: "Doors",
  windowsCount: "Windows",
  fenceLengthM: "Fence Length",
  gateCount: "Gates",
};

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

function buildDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function generateProjectCode() {
  const partA = Math.random().toString(36).slice(2, 6).toUpperCase();
  const partB = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PP-${partA}-${partB}`;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHours(value: number | null | undefined) {
  const safe = Number(value ?? 0);
  if (!Number.isFinite(safe) || safe <= 0) return "0h";

  const formatted = new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);

  return `${formatted}h`;
}

function formatConfidence(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatUnit(value: string) {
  if (value === "m2") return "m2";
  if (value === "m") return "m";
  if (value === "count") return "count";
  return "fixed";
}

function unitLabel(unit: string) {
  if (unit === "m2") return "m2";
  if (unit === "m") return "m";
  return "count";
}

function readError(
  data: { error?: string; details?: string } | null,
  fallback: string,
) {
  return [data?.error, data?.details].filter(Boolean).join(": ") || fallback;
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    throw new Error(
      readError(
        data as { error?: string; details?: string } | null,
        "Request failed.",
      ),
    );
  }

  return data as T;
}

function uniqueMaterialsByName(items: MaterialOut[]) {
  const byName = new Map<string, MaterialOut>();

  for (const item of items) {
    const key = String(item.name || "").trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, item);
  }

  return Array.from(byName.values());
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

function rowsToProjectDimensions(rows: MeasurementRow[]): ProjectDimensions {
  const scaled: Record<string, ProjectScaledField> = {};

  for (const row of rows) {
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

function buildRowsFromDimensions(
  presets: SurfaceScalePresets,
  dimensions: ProjectDimensions,
): MeasurementRow[] {
  const rows: MeasurementRow[] = [];

  for (const presetKey of Object.keys(dimensions.scaled ?? {})) {
    const field = dimensions.scaled?.[presetKey];
    if (!field) continue;

    const preset = presets[presetKey];
    if (!preset) continue;

    const sizeBand: ScaleBandKey =
      field.sizeBand === "small" ||
      field.sizeBand === "medium" ||
      field.sizeBand === "large"
        ? field.sizeBand
        : "medium";

    rows.push(
      makeRowFromPreset(presets, presetKey, sizeBand, {
        estimatedValue: Number(field.estimatedValue ?? 0),
        isManualOverride: Boolean(field.isManualOverride),
      }),
    );
  }

  return rows;
}

export default function AdminTestPage() {
  const [projectCode, setProjectCode] = useState(() => generateProjectCode());
  const [projectTitle, setProjectTitle] = useState("Dry Run Project");
  const [description, setDescription] = useState(SAMPLE_DESCRIPTION);
  const [scheduledStart, setScheduledStart] = useState(buildDefaultStartDate);
  const [address, setAddress] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("+63");
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState("+63");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientFullName, setNewClientFullName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("+63");
  const [newClientPhoneCountry, setNewClientPhoneCountry] = useState("+63");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[]>([]);
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [surfacePresets, setSurfacePresets] = useState<SurfaceScalePresets>({});
  const [surfacePresetsLoading, setSurfacePresetsLoading] = useState(false);
  const [loadSampleMeasurementsWhenReady, setLoadSampleMeasurementsWhenReady] =
    useState(false);
  const [sampleSeedInitialized, setSampleSeedInitialized] = useState(false);
  const [autoGeneratePending, setAutoGeneratePending] = useState(false);
  const [isRecommendingSurfaces, setIsRecommendingSurfaces] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [result, setResult] = useState<DryRunResult | null>(null);
  const generateDryRunRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      try {
        setClientsLoading(true);

        const response = await fetch("/api/client/getClients", {
          cache: "no-store",
        });

        const data = (await response.json()) as GetClientsApiResponse;

        if (!response.ok || "error" in data) {
          throw new Error(
            "error" in data ? data.details || data.error : "Failed to load clients.",
          );
        }

        if (!cancelled) {
          setClients(Array.isArray(data.clients) ? data.clients : []);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load clients.";

        console.error(error);

        toast.error("Could not load clients", {
          description: message,
        });
      } finally {
        if (!cancelled) {
          setClientsLoading(false);
        }
      }
    }

    loadClients();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !loadSampleMeasurementsWhenReady ||
      Object.keys(surfacePresets).length === 0
    ) {
      return;
    }

    setMeasurementRows(buildRowsFromDimensions(surfacePresets, SAMPLE_DIMENSIONS));
    setLoadSampleMeasurementsWhenReady(false);
  }, [loadSampleMeasurementsWhenReady, surfacePresets]);

  useEffect(() => {
    if (
      sampleSeedInitialized ||
      surfacePresetsLoading ||
      Object.keys(surfacePresets).length === 0
    ) {
      return;
    }

    const nextProjectCode = projectCode.trim() || generateProjectCode();

    setProjectCode(nextProjectCode);
    setProjectTitle("Dry Run Interior Repaint");
    setDescription(SAMPLE_DESCRIPTION);
    setScheduledStart(buildDefaultStartDate());
    setAddress("18 Sample Street, Quezon City");
    setSelectedClientId("");
    setClientName("Sample Client");
    setClientEmail("sample.client@example.com");
    setSelectedPhoneCountry("+63");
    setClientPhone("+639171234567");
    setResult(null);
    setLoadSampleMeasurementsWhenReady(false);
    setMeasurementRows(buildRowsFromDimensions(surfacePresets, SAMPLE_DIMENSIONS));
    setAutoGeneratePending(true);
    setSampleSeedInitialized(true);
  }, [projectCode, sampleSeedInitialized, surfacePresets, surfacePresetsLoading]);

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

        if (!cancelled) {
          setSurfacePresets(data.surfaceScalePresets ?? {});
        }
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

  const phoneCountryOptions = useMemo(() => {
    return (
      countryCallingCodes as { country: string; calling_code: number }[]
    ).map((item) => ({
      country: item.country,
      calling_code: `+${item.calling_code}`,
    }));
  }, []);

  const normalizedDimensions = useMemo(
    () => rowsToProjectDimensions(measurementRows),
    [measurementRows],
  );

  const summary = useMemo(() => {
    if (!result) return null;

    const subTasks = result.mainTasks.flatMap((task) => task.sub_tasks);
    const totalAdjustedHours = subTasks.reduce(
      (sum, subTask) =>
        sum +
        Number(
          subTask.duration?.adjustedDurationHours ??
            subTask.duration?.roundedHours ??
            subTask.duration?.baseLaborHours ??
            0,
        ),
      0,
    );

    return {
      mainTaskCount: result.mainTasks.length,
      subTaskCount: subTasks.length,
      scheduledTaskCount: subTasks.filter(
        (subTask) =>
          subTask.scheduledStartDatetime || subTask.scheduledEndDatetime,
      ).length,
      totalAdjustedHours,
    };
  }, [result]);

  const summaryChips = useMemo(() => {
    return measurementRows
      .slice(0, 6)
      .map((row) => {
        const preset = surfacePresets[row.presetKey];
        if (!preset) return null;

        return {
          id: row.id,
          label: preset.label,
          value: `${row.estimatedValue} ${unitLabel(preset.unit)}`,
        };
      })
      .filter(
        (
          chip,
        ): chip is {
          id: string;
          label: string;
          value: string;
        } => Boolean(chip),
      );
  }, [measurementRows, surfacePresets]);

  const areaRows = useMemo(() => {
    const source =
      result?.dimensions ??
      (measurementRows.length > 0 ? normalizedDimensions : null);

    if (!source) return [];

    const areas = computeAreasFromDimensions(source);

    return Object.entries(areas)
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => ({
        key,
        label: AREA_LABELS[key] ?? key,
        value: Number(value),
      }));
  }, [measurementRows, normalizedDimensions, result]);

  useEffect(() => {
    if (
      !autoGeneratePending ||
      isGenerating ||
      measurementRows.length === 0 ||
      !projectTitle.trim() ||
      !scheduledStart.trim() ||
      !address.trim() ||
      !clientName.trim() ||
      !clientEmail.trim() ||
      !clientPhone.trim() ||
      !description.trim()
    ) {
      return;
    }

    setAutoGeneratePending(false);
    void generateDryRunRef.current();
  }, [
    autoGeneratePending,
    address,
    clientEmail,
    clientName,
    clientPhone,
    description,
    isGenerating,
    measurementRows,
    projectTitle,
    scheduledStart,
  ]);

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
        estimatedValue: row.isManualOverride
          ? row.estimatedValue
          : preset.bands[nextBand].suggested,
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
    }));
  }

  function handleManualValueChange(id: string, rawValue: string) {
    const nextValue = Number(rawValue);

    updateRow(id, (row) => ({
      ...row,
      estimatedValue: Number.isFinite(nextValue) ? nextValue : 0,
      isManualOverride: true,
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

  function handlePhoneCountryChange(callingCode: string) {
    setSelectedPhoneCountry(callingCode);

    const trimmedPhone = clientPhone.trim();

    if (!trimmedPhone) {
      setClientPhone(callingCode);
      return;
    }

    const matchedExistingCode = phoneCountryOptions.find((item) =>
      trimmedPhone.startsWith(item.calling_code),
    );

    if (matchedExistingCode) {
      setClientPhone(
        `${callingCode}${trimmedPhone.slice(matchedExistingCode.calling_code.length)}`,
      );
      return;
    }

    const normalizedPhone = trimmedPhone.replace(/^\+/, "");
    setClientPhone(`${callingCode}${normalizedPhone}`);
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

  function handleClientSelect(clientId: string) {
    setSelectedClientId(clientId);

    const client = clients.find((item) => item.client_id === clientId);
    if (!client) return;

    setClientName(client.full_name ?? "");
    setClientEmail(client.email ?? "");
    setClientPhone(client.phone ?? "");
    setAddress(client.address ?? "");

    const matchedCountry = phoneCountryOptions.find((item) =>
      (client.phone ?? "").startsWith(item.calling_code),
    );

    if (matchedCountry) {
      setSelectedPhoneCountry(matchedCountry.calling_code);
    }
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

      setSelectedClientId(createdClient.client_id);
      setClientName(createdClient.full_name ?? "");
      setClientEmail(createdClient.email ?? "");
      setClientPhone(createdClient.phone ?? "");
      setAddress(createdClient.address ?? "");

      const matchedCountry = phoneCountryOptions.find((item) =>
        (createdClient.phone ?? "").startsWith(item.calling_code),
      );

      if (matchedCountry) {
        setSelectedPhoneCountry(matchedCountry.calling_code);
      }

      setIsCreateClientModalOpen(false);
      toast.success("Client created successfully.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create client.",
      );
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleRecommendSurfaces() {
    if (isRecommendingSurfaces) return;

    if (!description.trim()) {
      toast.error("Please enter a project description first.");
      return;
    }

    if (surfacePresetsLoading) {
      toast.error("Surface presets are still loading.");
      return;
    }

    try {
      setIsRecommendingSurfaces(true);

      const tasksData = await postJson<GetTasksApiResponse>(
        "/api/planning/getTasks",
        {
          description: description.trim(),
        },
      );

      if ("error" in tasksData) {
        throw new Error(readError(tasksData, "Failed to generate tasks."));
      }

      const recommendedKeys: string[] = [];
      const seen = new Set<string>();

      for (const task of tasksData.main_tasks ?? []) {
        for (const key of TASK_TO_SURFACES[String(task.name || "").trim()] ?? []) {
          if (!seen.has(key) && surfacePresets[key]) {
            seen.add(key);
            recommendedKeys.push(key);
          }
        }
      }

      if (!recommendedKeys.length) {
        toast.info("No surface recommendations were produced for this scope.");
        return;
      }

      setMeasurementRows((prev) => {
        const existingKeys = new Set(prev.map((row) => row.presetKey));
        const nextRows = [...prev];

        for (const key of recommendedKeys) {
          if (existingKeys.has(key)) continue;
          nextRows.push(makeRowFromPreset(surfacePresets, key, "medium"));
        }

        return nextRows;
      });

      toast.success("Recommended surfaces added to the measurement picker.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to recommend surfaces.",
      );
    } finally {
      setIsRecommendingSurfaces(false);
    }
  }

  async function handleGenerateDryRun() {
    if (isGenerating) return;

    if (!projectTitle.trim()) {
      toast.error("Please enter a project title.");
      return;
    }

    if (!scheduledStart.trim()) {
      toast.error("Please choose a scheduled start date.");
      return;
    }

    if (!address.trim()) {
      toast.error("Please enter the site address.");
      return;
    }

    if (!clientName.trim()) {
      toast.error("Please choose or enter a client.");
      return;
    }

    if (!clientEmail.trim() || !/^\S+@\S+\.\S+$/.test(clientEmail.trim())) {
      toast.error("Please enter a valid client email.");
      return;
    }

    if (!clientPhone.trim()) {
      toast.error("Please enter the client phone.");
      return;
    }

    if (!description.trim()) {
      toast.error("Please enter a project description.");
      return;
    }

    if (measurementRows.length === 0) {
      toast.error("Please add at least one measurement.");
      return;
    }

    const finalProjectCode = projectCode.trim() || generateProjectCode();
    const dimensions = normalizedDimensions;

    try {
      setIsGenerating(true);
      setGenerationStage("Generating main tasks");

      const tasksData = await postJson<GetTasksApiResponse>(
        "/api/planning/getTasks",
        {
          description: description.trim(),
          dimensions,
        },
      );

      if ("error" in tasksData) {
        throw new Error(readError(tasksData, "Failed to generate tasks."));
      }

      let nextTasks: GeneratedMainTask[] = (tasksData.main_tasks ?? []).map(
        (task) => ({
          name: String(task.name || "").trim(),
          priority: Number.isFinite(Number(task.priority))
            ? Number(task.priority)
            : 0,
          confidence: clamp01(Number(task.confidence || 0)),
          reasons: Array.isArray(task.reasons)
            ? task.reasons.map(String)
            : [],
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
        }),
      );

      if (!nextTasks.length) {
        throw new Error("No main tasks were generated for this description.");
      }

      setGenerationStage("Resolving materials, equipment, and durations");

      nextTasks = await Promise.all(
        nextTasks.map(async (task) => {
          const subTasks = await Promise.all(
            task.sub_tasks.map(async (subTask) => {
              const [materialData, equipmentData, durationData] = await Promise.all([
                postJson<GetMaterialsApiResponse>("/api/planning/getMaterials", {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                }),
                postJson<GetEquipmentApiResponse>("/api/planning/getEquipment", {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                }),
                postJson<GetDurationApiResponse>("/api/planning/getDuration", {
                  taskName: task.name,
                  subTaskTitle: subTask.title,
                  dimensions,
                }),
              ]);

              if ("error" in materialData) {
                throw new Error(
                  readError(materialData, "Failed to load materials."),
                );
              }

              if ("error" in equipmentData) {
                throw new Error(
                  readError(equipmentData, "Failed to load equipment."),
                );
              }

              if ("error" in durationData) {
                throw new Error(
                  readError(durationData, "Failed to calculate duration."),
                );
              }

              return {
                ...subTask,
                materials: Array.isArray(materialData.materials)
                  ? materialData.materials
                  : [],
                equipment: Array.isArray(equipmentData.equipment)
                  ? equipmentData.equipment
                  : [],
                duration: durationData.duration ?? null,
              };
            }),
          );

          const materialCatalog = uniqueMaterialsByName(
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
              estimatedHours:
                subTask.duration?.baseLaborHours ??
                subTask.duration?.adjustedDurationHours ??
                0,
            })),
          })),
        },
      );

      if ("error" in employeeData) {
        throw new Error(
          readError(employeeData, "Failed to assign employees."),
        );
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
          assignmentMap.set(`${taskGroup.taskName}__${assignment.subTaskTitle}`, {
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
          const matched = assignmentMap.get(`${task.name}__${subTask.title}`);

          return {
            ...subTask,
            assignedEmployees: matched?.employees ?? [],
            requiredEmployeeCount: matched?.requiredEmployeeCount ?? 1,
            assignmentScore: matched?.score ?? null,
            assignmentReasons: matched?.reasons ?? [],
          };
        }),
      }));

      setGenerationStage("Scheduling subtasks");

      const scheduledStartDatetime = new Date(
        `${scheduledStart}T08:00:00`,
      ).toISOString();

      const scheduleData = await postJson<GetProjectScheduleApiResponse>(
        "/api/planning/getProjectSchedule",
        {
          project: {
            scheduled_start_datetime: scheduledStartDatetime,
            scheduled_end_datetime: null,
            dimensions,
          },
          generatedTasks: nextTasks.map((task) => ({
            name: task.name,
            priority: task.priority,
            sub_tasks: task.sub_tasks.map((subTask) => ({
              title: subTask.title,
              priority: subTask.priority,
              duration: subTask.duration
                ? {
                    estimatedHours:
                      subTask.duration.adjustedDurationHours ??
                      subTask.duration.roundedHours ??
                      subTask.duration.baseLaborHours,
                    adjustedDurationHours:
                      subTask.duration.adjustedDurationHours,
                    roundedHours: subTask.duration.roundedHours,
                    baseLaborHours: subTask.duration.baseLaborHours,
                  }
                : null,
              assignedEmployee: subTask.assignedEmployees[0]
                ? { id: subTask.assignedEmployees[0].id }
                : null,
              employees: subTask.assignedEmployees.map((employee) => ({
                id: employee.id,
              })),
            })),
          })),
        },
      );

      if ("error" in scheduleData) {
        throw new Error(
          readError(scheduleData, "Failed to generate project schedule."),
        );
      }

      const scheduleMap = new Map<
        string,
        {
          scheduledStartDatetime: string | null;
          scheduledEndDatetime: string | null;
        }
      >();

      for (const item of scheduleData.scheduledItems ?? []) {
        scheduleMap.set(`${item.taskName}__${item.subTaskTitle}`, {
          scheduledStartDatetime: item.scheduledStartDatetime ?? null,
          scheduledEndDatetime: item.scheduledEndDatetime ?? null,
        });
      }

      nextTasks = nextTasks.map((task) => ({
        ...task,
        sub_tasks: task.sub_tasks.map((subTask) => {
          const matched = scheduleMap.get(`${task.name}__${subTask.title}`);

          return {
            ...subTask,
            scheduledStartDatetime: matched?.scheduledStartDatetime ?? null,
            scheduledEndDatetime: matched?.scheduledEndDatetime ?? null,
          };
        }),
      }));

      const measurements: ResultMeasurement[] = measurementRows
        .map((row) => {
          const preset = surfacePresets[row.presetKey];
          if (!preset) return null;

          return {
            id: row.id,
            presetKey: row.presetKey,
            label: preset.label,
            unit: unitLabel(preset.unit),
            sizeBand: row.sizeBand,
            estimatedValue: row.estimatedValue,
            isManualOverride: row.isManualOverride,
          };
        })
        .filter((measurement): measurement is ResultMeasurement =>
          Boolean(measurement),
        );

      const clientSnapshot = {
        clientId: selectedClientId || null,
        fullName: clientName.trim(),
        email: clientEmail.trim(),
        phone: clientPhone.trim(),
        address: address.trim(),
      };

      const projectDraft: DryRunPayload = {
        project: {
          projectCode: finalProjectCode,
          projectTitle: projectTitle.trim(),
          description: description.trim(),
          siteAddress: address.trim(),
          scheduledStartDate: scheduledStart,
          scheduledStartDatetime,
          scheduledEndDatetime:
            scheduleData.projectScheduledEndDatetime ?? null,
          clientId: selectedClientId || null,
          clientName: clientSnapshot.fullName,
          clientEmail: clientSnapshot.email,
          clientPhone: clientSnapshot.phone,
          dimensions,
          source: "admin-test",
          persistsToDatabase: false,
        },
        client: clientSnapshot,
        measurements,
      };

      setProjectCode(finalProjectCode);
      setResult({
        projectCode: finalProjectCode,
        projectTitle: projectTitle.trim(),
        description: description.trim(),
        siteAddress: address.trim(),
        scheduledStartDate: scheduledStart,
        scheduledStartDatetime,
        projectScheduledEndDatetime:
          scheduleData.projectScheduledEndDatetime ?? null,
        generatedAt: new Date().toISOString(),
        client: clientSnapshot,
        dimensions,
        measurements,
        projectDraft,
        rawAiText: tasksData.raw ?? "",
        mainTasks: nextTasks,
      });

      toast.success("Dry-run project generated.", {
        description: "Nothing was saved to the database.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate dry-run project.",
      );
    } finally {
      setIsGenerating(false);
      setGenerationStage("");
    }
  }

  generateDryRunRef.current = handleGenerateDryRun;

  function seedSampleProject(options?: {
    regenerateCode?: boolean;
    autoGenerate?: boolean;
  }) {
    const regenerateCode = options?.regenerateCode ?? true;
    const autoGenerate = options?.autoGenerate ?? true;
    const nextProjectCode = regenerateCode
      ? generateProjectCode()
      : projectCode.trim() || generateProjectCode();

    setProjectCode(nextProjectCode);
    setProjectTitle("Dry Run Interior Repaint");
    setDescription(SAMPLE_DESCRIPTION);
    setScheduledStart(buildDefaultStartDate());
    setAddress("18 Sample Street, Quezon City");
    setSelectedClientId("");
    setClientName("Sample Client");
    setClientEmail("sample.client@example.com");
    setSelectedPhoneCountry("+63");
    setClientPhone("+639171234567");
    setResult(null);

    if (Object.keys(surfacePresets).length > 0) {
      setLoadSampleMeasurementsWhenReady(false);
      setMeasurementRows(buildRowsFromDimensions(surfacePresets, SAMPLE_DIMENSIONS));
    } else {
      setLoadSampleMeasurementsWhenReady(true);
      setMeasurementRows([]);
      toast.info("Surface presets are still loading. Add measurements in a moment.");
    }

    setAutoGeneratePending(autoGenerate);
  }

  function handleLoadSample() {
    seedSampleProject({
      regenerateCode: true,
      autoGenerate: true,
    });
  }

  return (
    <div className="h-[calc(100vh-2rem)] overflow-hidden bg-gray-50 p-4">
      <div className="mx-auto flex h-full max-w-[1700px] flex-col gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="h-1 w-full rounded-t-2xl bg-[#00c065]" />
          <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Project Generation Sandbox
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Dummy client, description, and measurements are seeded for you.
                This page generates the project draft only and never saves a
                project record.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={isGenerating}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw className="h-4 w-4" />
                Regenerate Sample
              </button>

              <button
                type="button"
                onClick={handleGenerateDryRun}
                disabled={isGenerating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60">
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isGenerating ? "Generating..." : "Generate Project"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">
                Seeded Project
              </h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Everything below is prefilled with dummy data so you can jump
                straight to the generated project.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Project
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {projectTitle}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{projectCode}</div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Client
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {clientName || "Sample Client"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{clientEmail}</div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Start Date
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {scheduledStart || "Not set"}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Measurements
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {measurementRows.length}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Ready for planning
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Site
                </div>
                <div className="mt-1 text-sm text-gray-700">{address}</div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Scope
                </div>
                <div className="mt-1 text-sm leading-6 text-gray-700">
                  {description}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {summaryChips.slice(0, 4).map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                    {chip.label}: {chip.value}
                  </span>
                ))}
                {measurementRows.length > 4 ? (
                  <span className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                    +{measurementRows.length - 4} more
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isGenerating}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw className="h-4 w-4" />
                  New Sample
                </button>

                <button
                  type="button"
                  onClick={handleGenerateDryRun}
                  disabled={isGenerating}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60">
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {result ? "Regenerate Project" : "Generate Project"}
                </button>

                <button
                  type="button"
                  onClick={() => setMeasurementModalOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                  <Settings2 className="h-4 w-4" />
                  Edit Measurements
                </button>
              </div>

              <details className="mt-4 rounded-xl border border-gray-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-gray-700">
                  Optional Sample Edits
                </summary>
                <div className="space-y-3 border-t border-gray-100 px-4 py-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-700">
                      Project Title
                    </label>
                    <input
                      value={projectTitle}
                      onChange={(event) => setProjectTitle(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700">
                      Site Address
                    </label>
                    <textarea
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-700">
                        Saved Client
                      </label>
                      <select
                        value={selectedClientId}
                        onChange={(event) => handleClientSelect(event.target.value)}
                        disabled={clientsLoading}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100">
                        <option value="">
                          {clientsLoading ? "Loading clients..." : "Choose a saved client"}
                        </option>
                        {clients.map((client) => (
                          <option key={client.client_id} value={client.client_id}>
                            {client.full_name || "Unnamed Client"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-700">
                        Client Name
                      </label>
                      <input
                        value={clientName}
                        onChange={(event) => setClientName(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-700">
                        Client Email
                      </label>
                      <input
                        value={clientEmail}
                        onChange={(event) => setClientEmail(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700">
                      Client Phone
                    </label>
                    <div className="mt-1 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
                      <div className="min-w-0">
                        <PhoneCountryPicker
                          value={selectedPhoneCountry}
                          options={phoneCountryOptions}
                          onChange={handlePhoneCountryChange}
                        />
                      </div>

                      <div
                        className={`flex h-10 min-w-0 items-center overflow-hidden rounded-lg border ${BORDER} bg-white shadow-sm focus-within:ring-2`}
                        style={ACCENT_RING_STYLE}>
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
                          onChange={(event) =>
                            setClientPhone(
                              `${selectedPhoneCountry}${event.target.value.replace(/^\+/, "")}`,
                            )
                          }
                          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRecommendSurfaces}
                      disabled={
                        !description.trim() ||
                        isRecommendingSurfaces ||
                        surfacePresetsLoading
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                      {isRecommendingSurfaces ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Recommend Surfaces
                    </button>

                    <button
                      type="button"
                      onClick={openCreateClientModal}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                      <UserRoundPlus className="h-4 w-4" />
                      Create Saved Client
                    </button>
                  </div>

                  <details className="rounded-xl border border-gray-200 bg-gray-50">
                    <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-gray-700">
                      Derived Measurement Payload
                    </summary>
                    <div className="border-t border-gray-100 px-4 py-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px] leading-5 text-gray-700">
                        {JSON.stringify(normalizedDimensions, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              </details>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">
                Run Snapshot
              </h2>

              {isGenerating ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {generationStage || "Working..."}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-emerald-700">
                    The seeded sample is being run through the planner without
                    saving anything to the database.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600">
                  The sample is ready. Regenerate anytime if you want a fresh
                  project code or refreshed output.
                </div>
              )}

              {result && summary ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="text-[11px] font-medium text-gray-500">
                        Main Tasks
                      </div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {summary.mainTaskCount}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="text-[11px] font-medium text-gray-500">
                        Subtasks
                      </div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {summary.subTaskCount}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="text-[11px] font-medium text-gray-500">
                        Total Duration
                      </div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {formatHours(summary.totalAdjustedHours)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="text-[11px] font-medium text-gray-500">
                        Scheduled Items
                      </div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {summary.scheduledTaskCount}
                      </div>
                    </div>
                  </div>

                  {areaRows.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {areaRows.slice(0, 4).map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                          <span className="text-gray-600">{row.label}</span>
                          <span className="font-semibold text-gray-900">
                            {row.value}
                          </span>
                        </div>
                      ))}

                      {areaRows.length > 4 ? (
                        <div className="text-xs text-gray-500">
                          +{areaRows.length - 4} more derived area values
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>

          <main className="min-h-0 min-w-0 overflow-hidden">
            <div className="h-full space-y-4 overflow-y-auto pr-1">
            {!result ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
                <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
                <h2 className="mt-4 text-lg font-semibold text-gray-900">
                  No Dry Run Yet
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Generate a project draft to inspect the tasks, staffing,
                  materials, equipment, durations, schedule, client snapshot,
                  and measurement payload without saving anything to the
                  database.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {result.projectCode}
                      </div>
                      <h2 className="mt-3 text-lg font-semibold text-gray-900">
                        {result.projectTitle}
                      </h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
                        {result.description}
                      </p>
                    </div>

                    <div className="grid gap-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-emerald-600" />
                        <span>{formatDateTime(result.scheduledStartDatetime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-emerald-600" />
                        <span>{formatDateTime(result.projectScheduledEndDatetime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-emerald-600" />
                        <span>{result.client.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        <span>{result.siteAddress}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        Client
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {result.client.fullName}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {result.client.phone}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        Measurements
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {result.measurements.length}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Included in the dry-run payload
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        Generated At
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {formatDateTime(result.generatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900">
                    AI Task Output
                  </summary>
                  <div className="border-t border-gray-100 px-5 py-4">
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-xs leading-5 text-gray-700">
                      {result.rawAiText || "No raw AI output available."}
                    </pre>
                  </div>
                </details>

                {result.mainTasks.map((task) => (
                  <section
                    key={task.name}
                    className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">
                            {task.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                              Confidence {formatConfidence(task.confidence)}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                              {task.sub_tasks.length} subtasks
                            </span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                              Priority {task.priority}
                            </span>
                          </div>
                        </div>

                        {task.materialCatalog.length > 0 ? (
                          <div className="max-w-xl">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                              Material Catalog
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {task.materialCatalog.map((material) => (
                                <span
                                  key={`${task.name}-${material.name}`}
                                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                                  {material.name}
                                  {material.unit ? ` (${material.unit})` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 px-5 py-4">
                      {task.sub_tasks.map((subTask) => (
                        <div
                          key={`${task.name}-${subTask.title}`}
                          className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">
                                {subTask.title}
                              </h4>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-700">
                                  Priority {subTask.priority}
                                </span>
                                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-700">
                                  Team {subTask.requiredEmployeeCount}
                                </span>
                                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-700">
                                  Score{" "}
                                  {subTask.assignmentScore !== null
                                    ? subTask.assignmentScore.toFixed(2)
                                    : "N/A"}
                                </span>
                              </div>
                            </div>

                            <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                <div className="font-semibold text-gray-500">
                                  Start
                                </div>
                                <div className="mt-1 font-medium text-gray-900">
                                  {formatDateTime(subTask.scheduledStartDatetime)}
                                </div>
                              </div>
                              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                <div className="font-semibold text-gray-500">
                                  End
                                </div>
                                <div className="mt-1 font-medium text-gray-900">
                                  {formatDateTime(subTask.scheduledEndDatetime)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 xl:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Clock3 className="h-3.5 w-3.5" />
                                Duration
                              </div>

                              {subTask.duration ? (
                                <div className="mt-3 space-y-2 text-sm text-gray-700">
                                  <div className="flex items-center justify-between">
                                    <span>Labor Hours</span>
                                    <span className="font-semibold text-gray-900">
                                      {formatHours(subTask.duration.baseLaborHours)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Elapsed Duration</span>
                                    <span className="font-semibold text-gray-900">
                                      {formatHours(
                                        subTask.duration.adjustedDurationHours,
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Rounded</span>
                                    <span className="font-semibold text-gray-900">
                                      {formatHours(subTask.duration.roundedHours)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Driver</span>
                                    <span className="font-semibold text-gray-900">
                                      {subTask.duration.driver}{" "}
                                      {formatUnit(subTask.duration.driverUnit)}
                                    </span>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
                                    {subTask.duration.formula}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 text-sm text-gray-500">
                                  No duration data generated.
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Users className="h-3.5 w-3.5" />
                                Assigned Staff
                              </div>

                              {subTask.assignedEmployees.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {subTask.assignedEmployees.map((employee) => (
                                    <span
                                      key={employee.id}
                                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                      {employee.name}{" "}
                                      <span className="font-medium uppercase text-emerald-600">
                                        {employee.role}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 text-sm text-gray-500">
                                  No employee assignment returned.
                                </div>
                              )}

                              {subTask.assignmentReasons.length > 0 ? (
                                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
                                  {subTask.assignmentReasons.join(" ")}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Package className="h-3.5 w-3.5" />
                                Materials
                              </div>

                              {subTask.materials.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {subTask.materials.map((material) => (
                                    <div
                                      key={`${task.name}-${subTask.title}-${material.name}`}
                                      className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                      <div className="font-semibold text-gray-900">
                                        {material.name}
                                      </div>
                                      <div className="mt-1 text-xs text-gray-500">
                                        {material.unit}
                                        {material.notes ? ` - ${material.notes}` : ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 text-sm text-gray-500">
                                  No materials assigned.
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Wrench className="h-3.5 w-3.5" />
                                Equipment
                              </div>

                              {subTask.equipment.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {subTask.equipment.map((equipment) => (
                                    <div
                                      key={`${task.name}-${subTask.title}-${equipment.name}`}
                                      className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                      <div className="font-semibold text-gray-900">
                                        {equipment.name}
                                      </div>
                                      <div className="mt-1 text-xs text-gray-500">
                                        {[
                                          equipment.status,
                                          equipment.condition,
                                          equipment.location,
                                          equipment.notes,
                                        ]
                                          .filter(Boolean)
                                          .join(" - ") || "No extra details"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 text-sm text-gray-500">
                                  No equipment assigned.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900">
                    Dry Run JSON
                  </summary>
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <Braces className="h-3.5 w-3.5" />
                      Full generated payload
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-xs leading-5 text-gray-700">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </details>
              </>
            )}
            </div>
          </main>
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
  );
}
