"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Settings2,
  Check,
  Loader2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CreateClientModal from "@/components/project-creation/CreateClientModal";
import {
  SURFACE_SCALE_PRESETS,
  type ScaleBandKey,
  type WeekdayKey,
} from "@/lib/planning/aiContext";
import {
  type ProjectDimensions,
  type ProjectScaledField,
} from "@/lib/planning/materialEstimator";
import countryCallingCodes from "@/lib/data/country-by-calling-code.json";
import { PhoneCountryPicker } from "@/components/PhoneCountryPicker";
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
  name: string;
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

type ScalePresetKey = keyof typeof SURFACE_SCALE_PRESETS;

type MeasurementRow = {
  id: string;
  presetKey: ScalePresetKey;
  sizeBand: ScaleBandKey;
  estimatedValue: number;
  isManualOverride: boolean;
};

type ClientOption = {
  client_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
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
      taskName: string;
      subTaskTitle: string;
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

type CountryCallingCodeOption = {
  country: string;
  calling_code: string;
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

function getBandIndex(band: ScaleBandKey) {
  return ["small", "medium", "large"].indexOf(band);
}

function getBandFromIndex(index: number): ScaleBandKey {
  return (["small", "medium", "large"][Math.max(0, Math.min(2, index))] ??
    "medium") as ScaleBandKey;
}

function makeRowFromPreset(
  presetKey: ScalePresetKey,
  band: ScaleBandKey = "medium",
  overrides?: Partial<MeasurementRow>,
): MeasurementRow {
  const preset = SURFACE_SCALE_PRESETS[presetKey];

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

function buildInitialRows(): MeasurementRow[] {
  return [
    makeRowFromPreset("interior_wall_area_m2", "medium"),
    makeRowFromPreset("ceiling_area_m2", "medium"),
    makeRowFromPreset("trim_length_m", "medium"),
    makeRowFromPreset("doors_count", "medium"),
  ];
}

function rowsToProjectDimensions(rows: MeasurementRow[]): ProjectDimensions {
  const scaled: Partial<Record<ScalePresetKey, ProjectScaledField>> = {};

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
      presetKey: row.presetKey,
      sizeBand: row.sizeBand,
      estimatedValue: existingValue + currentValue,
      isManualOverride:
        Boolean(existing?.isManualOverride) || row.isManualOverride,
    };
  }

  return {
    scaled,
    notes: "",
  };
}

function MeasurementModal(props: {
  open: boolean;
  rows: MeasurementRow[];
  onClose: () => void;
  onAdd: (presetKey: ScalePresetKey) => void;
  onRemove: (id: string) => void;
  onPresetChange: (id: string, presetKey: ScalePresetKey) => void;
  onBandChange: (id: string, band: ScaleBandKey) => void;
  onManualValueChange: (id: string, value: string) => void;
}) {
    const {
      open,
      rows,
      onClose,
      onAdd,
      onRemove,
      onPresetChange,
      onBandChange,
      onManualValueChange,
    } = props;

    const allPresetKeys = Object.keys(
      SURFACE_SCALE_PRESETS,
    ) as ScalePresetKey[];

    const [isAddSurfaceModalOpen, setIsAddSurfaceModalOpen] = useState(false);
    const [newSurfacePresetKey, setNewSurfacePresetKey] = useState<ScalePresetKey>(
      allPresetKeys[0] ?? "interior_wall_area_m2",
    );

    function openAddSurfaceModal() {
      setNewSurfacePresetKey(allPresetKeys[0] ?? "interior_wall_area_m2");
      setIsAddSurfaceModalOpen(true);
    }

    function closeAddSurfaceModal() {
      setIsAddSurfaceModalOpen(false);
    }

    function confirmAddSurface() {
      onAdd(newSurfacePresetKey);
      setIsAddSurfaceModalOpen(false);
    }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Measurements
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Use the slider for a quick scale, then refine the exact value if
              needed.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-140px)] overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={openAddSurfaceModal}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
              style={{ backgroundColor: ACCENT }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT;
              }}>
              <Plus className="h-4 w-4" />
              Add Measurement
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row) => {
              const preset = SURFACE_SCALE_PRESETS[row.presetKey];
              const bandMeta = preset.bands[row.sizeBand];

              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_auto]">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Surface Type
                      </label>
                      <select
                        value={row.presetKey}
                        onChange={(e) =>
                          onPresetChange(
                            row.id,
                            e.target.value as ScalePresetKey,
                          )
                        }
                        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                        style={{ ["--tw-ring-color" as any]: ACCENT }}>
                        {(
                          Object.keys(SURFACE_SCALE_PRESETS) as ScalePresetKey[]
                        ).map((key) => (
                          <option key={key} value={key}>
                            {SURFACE_SCALE_PRESETS[key].label}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Size Scale
                          </label>
                          <span className="text-[11px] font-semibold text-gray-700">
                            {bandMeta.label}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={1}
                          value={getBandIndex(row.sizeBand)}
                          onChange={(e) =>
                            onBandChange(
                              row.id,
                              getBandFromIndex(Number(e.target.value)),
                            )
                          }
                          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                          style={{ accentColor: ACCENT }}
                        />

                        <div className="mt-2 grid grid-cols-3 text-[11px] font-medium text-gray-500">
                          <span>Small</span>
                          <span className="text-center">Medium</span>
                          <span className="text-right">Large</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Exact Measurement
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={row.estimatedValue}
                        onChange={(e) =>
                          onManualValueChange(row.id, e.target.value)
                        }
                        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      />
                      <div className="mt-2 text-xs text-gray-500">
                        Unit: {unitLabel(preset.unit)}
                      </div>

                      {row.isManualOverride ? (
                        <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          Manual override
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-start justify-end">
                      <button
                        type="button"
                        onClick={() => onRemove(row.id)}
                        className="inline-flex h-9 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-red-50 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center gap-2 rounded-lg ${BORDER} bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50`}>
            Close
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
            style={{ backgroundColor: ACCENT }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT;
            }}>
            <Check className="h-4 w-4" />
            Done
          </button>
        </div>

        {isAddSurfaceModalOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Add Measurement
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose the surface type. The new row will start at medium scale.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Surface Type
                </label>

                <select
                  value={newSurfacePresetKey}
                  onChange={(e) =>
                    setNewSurfacePresetKey(e.target.value as ScalePresetKey)
                  }
                  className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: ACCENT }}>
                  {allPresetKeys.map((key) => (
                    <option key={key} value={key}>
                      {SURFACE_SCALE_PRESETS[key].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  className={`inline-flex items-center gap-2 rounded-lg ${BORDER} bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50`}>
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={confirmAddSurface}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT;
                  }}>
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
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

  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
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
  const [address, setAddress] = useState(
    "42 Wellington Street East Perth WA 6004 Australia",
  );

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
    projectIdFromUrl || null
  );

  const [assignmentDay, setAssignmentDay] = useState<WeekdayKey>("monday");
  const [loading, setLoading] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedMainTask[]>([]);
  const [isGeneratingProjectName, setIsGeneratingProjectName] = useState(false);

  const [measurementRows, setMeasurementRows] =
    useState<MeasurementRow[]>(buildInitialRows());
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);

  const normalizedDimensions = useMemo(
    () => rowsToProjectDimensions(measurementRows),
    [measurementRows],
  );

  const summaryChips = useMemo(() => {
    return measurementRows.slice(0, 4).map((row) => {
      const preset = SURFACE_SCALE_PRESETS[row.presetKey];
      return {
        id: row.id,
        label: preset.label,
        value: `${row.estimatedValue} ${unitLabel(preset.unit)}`,
      };
    });
  }, [measurementRows]);

  const phoneCountryOptions = useMemo(() => {
    return (countryCallingCodes as { country: string; calling_code: number }[]).map(
      (item) => ({
        country: item.country,
        calling_code: `+${item.calling_code}`,
      }),
    );
  }, []);

  const hasProjectNameInputs = Boolean(
    description.trim() && clientName.trim() && address.trim(),
  );

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
    if (!clientName.trim()) missingFields.push("client name");
    if (!address.trim()) missingFields.push("site address");

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

      toast.error("AI project name generation failed. Used fallback format instead.");
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
      const preset = SURFACE_SCALE_PRESETS[row.presetKey];
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
    const preset = SURFACE_SCALE_PRESETS[nextPresetKey];
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
    setMeasurementRows((prev) => [
      makeRowFromPreset(presetKey, "medium"),
      ...prev,
    ]);
  }

  function removeMeasurement(id: string) {
    setMeasurementRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((row) => row.id !== id),
    );
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
        throw new Error("error" in data ? data.error : "Failed to create client.");
      }

      const createdClient = data.client;

      setClients((prev) =>
        [...prev, createdClient].sort((a, b) =>
          String(a.full_name || "").localeCompare(String(b.full_name || ""))
        )
      );

      setSelectedClientId(createdClient.client_id);
      setClientName(createdClient.full_name ?? "");
      setClientEmail(createdClient.email ?? "");
      setClientPhone(createdClient.phone ?? "");
      setAddress(createdClient.address ?? "");

      setIsCreateClientModalOpen(false);
      toast.success("Client created successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to create client.");
    } finally {
      setCreatingClient(false);
    }
  }

  async function generateProjectDraft() {
    setGenerationError("");
    setGeneratedTasks([]);

    setLoading(true);

    try {
      setGenerationStage("Generating main tasks and sub tasks");

      const tasksData = await postJson<GetTasksApiResponse>(
        "/api/planning/getTasks",
        {
          description: description.trim(),
          dimensions: normalizedDimensions,
        },
      );

      if ("error" in tasksData) {
        throw new Error(tasksData.error);
      }

      let nextTasks: GeneratedMainTask[] = (tasksData.main_tasks ?? []).map(
        (task) => ({
          name: String(task.name || "").trim(),
          priority: Number.isFinite(Number(task.priority))
            ? Number(task.priority)
            : 0,
          confidence: clamp01(Number(task.confidence || 0)),
          reasons: Array.isArray(task.reasons) ? task.reasons.map(String) : [],
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
                    requiredEmployeeCount: subTask.duration.requiredEmployeeCount,
                    adjustedDurationHours: subTask.duration.adjustedDurationHours,
                    roundedHours: subTask.duration.roundedHours,
                    formula: subTask.duration.formula,
                    driver: subTask.duration.driver,
                    driverUnit: subTask.duration.driverUnit,
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
    if (!siteAddress) {
      toast.error("Please enter the site address.");
      return;
    }
    if (!cName) {
      toast.error("Please enter the client name.");
      return;
    }
    if (!cEmail || !/^\S+@\S+\.\S+$/.test(cEmail)) {
      toast.error("Please enter a valid client email.");
      return;
    }
    if (!cPhone) {
      toast.error("Please enter the client phone.");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a project description.");
      return;
    }
    if (!measurementRows.length) {
      toast.error("Please add at least one measurement.");
      return;
    }

    try {
      setSaving(true);
      setProjectCode(finalProjectCode);

      const nextTasks = await generateProjectDraft();

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
        nextTasks?.[0]?.sub_tasks?.[0]
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
          2
        )
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
    async function loadUnavailableScheduleDates() {
      try {
        const response = await fetch("/api/schedule/getUnavailableDates", {
          method: "GET",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Failed to load unavailable schedule dates."
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
            <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

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
                              e.currentTarget.style.backgroundColor = ACCENT_HOVER;
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
                          {isGeneratingProjectName ? "Generating..." : "Generate"}
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
                        className={`h-9 w-full rounded-lg border ${BORDER} bg-white px-3 text-left text-sm text-gray-900 shadow-sm outline-none transition hover:bg-gray-50`}
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
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Enter site address"
                        rows={2}
                        className={`mt-1.5 min-h-[72px] w-full resize-none rounded-lg border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
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
                        disabled={clientsLoading}
                      >
                        <option value="">
                          {clientsLoading ? "Loading clients..." : "Choose a client"}
                        </option>
                        {clients.map((client) => (
                          <option key={client.client_id} value={client.client_id}>
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
                      <label className="text-[11px] font-medium text-gray-600">
                        Client Phone
                      </label>

                      <div className="mt-1.5 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
                        <div className="min-w-0">
                          <PhoneCountryPicker
                            value={selectedPhoneCountry}
                            options={phoneCountryOptions}
                            onChange={handlePhoneCountryChange}
                          />
                        </div>

                        <div
                          className={`flex h-9 min-w-0 w-full items-center overflow-hidden rounded-lg border ${BORDER} bg-white shadow-sm focus-within:ring-2`}
                          style={{ ["--tw-ring-color" as any]: ACCENT }}
                        >
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
                            onChange={(e) =>
                              setClientPhone(
                                `${selectedPhoneCountry}${e.target.value.replace(/^\+/, "")}`,
                              )
                            }
                            placeholder="000-000-0000"
                            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-7 min-h-0 h-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-gray-900">
                          Measurements & Description
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMeasurementModalOpen(true)}
                      className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200"
                      style={{ backgroundColor: ACCENT }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = ACCENT;
                      }}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5">
                    <div className={`rounded-2xl border ${BORDER} bg-gray-50 p-2`}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Configured Surfaces
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summaryChips.slice(0, 6).map((chip) => (
                          <span
                            key={chip.id}
                            className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700"
                          >
                            {chip.label}: {chip.value}
                          </span>
                        ))}

                        {measurementRows.length > 6 ? (
                          <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700">
                            +{measurementRows.length - 6} more
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="min-h-0 flex flex-col">
                      <label className="text-[11px] font-medium text-gray-600">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Write a summary of the dimensions or project scope"
                        className={`mt-1 flex-1 min-h-[96px] w-full resize-none rounded-lg border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: ACCENT }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2.5">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="w-[140px] rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-300"
                  onClick={() => router.back()}
                  disabled={isBusy}
                >
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
                  }}
                >
                  {isBusy ? "Processing..." : "Next"}
                </button>
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
          onClose={() => setMeasurementModalOpen(false)}
          onAdd={(presetKey) =>
            setMeasurementRows((prev) => [
              makeRowFromPreset(presetKey, "medium"),
              ...prev,
            ])
          }
          onRemove={(id) =>
            setMeasurementRows((prev) => prev.filter((row) => row.id !== id))
          }
          onPresetChange={(id, presetKey) => {
            const preset = SURFACE_SCALE_PRESETS[presetKey];
            setMeasurementRows((prev) =>
              prev.map((row) =>
                row.id === id
                  ? {
                      ...row,
                      presetKey,
                      sizeBand: "medium",
                      estimatedValue: preset.bands.medium.suggested,
                      isManualOverride: false,
                    }
                  : row,
              ),
            );
          }}
          onBandChange={(id, band) => {
            setMeasurementRows((prev) =>
              prev.map((row) => {
                if (row.id !== id) return row;
                const preset = SURFACE_SCALE_PRESETS[row.presetKey];
                return {
                  ...row,
                  sizeBand: band,
                  estimatedValue: row.isManualOverride
                    ? row.estimatedValue
                    : preset.bands[band].suggested,
                };
              }),
            );
          }}
          onManualValueChange={(id, rawValue) => {
            const nextValue = Number(rawValue);
            setMeasurementRows((prev) =>
              prev.map((row) =>
                row.id === id
                  ? {
                      ...row,
                      estimatedValue: Number.isFinite(nextValue) ? nextValue : 0,
                      isManualOverride: true,
                    }
                  : row,
              ),
            );
          }}
        />
      </div>

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
                PaintPro is generating the project setup and preparing it for saving.
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
  )
}
