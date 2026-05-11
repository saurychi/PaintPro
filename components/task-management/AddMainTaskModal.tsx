"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus, Ruler, Variable as VariableIcon, X } from "lucide-react";
import { toast } from "sonner";

import {
  type EstimationFormulaTemplate,
  type EstimationFormulaTemplateMutationResponse,
  type EstimationFormulaTemplatePayload,
  type EstimationFormulaVariableMutationResponse,
  type EstimationFormulaVariablePayload,
  type EstimationMainTaskOption,
  type EstimationSettingsResponse,
  type EstimationSubTaskOption,
} from "@/lib/estimationSettings";
import AddFormulaModal from "@/components/settings/change-estimations/AddFormulaModal";
import AddVariableModal from "@/components/settings/change-estimations/AddVariableModal";

import AddSurfaceModal from "./AddSurfaceModal";

type SurfaceRow = {
  surface_key: string;
  label: string;
  unit: string;
};

type Props = {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    defaultSortOrder: number;
    isActive: boolean;
    // Required: the formula attached to this main task.
    formulaTemplateId: string;
    // Required: the surface preset chosen at the top of the formula
    // section. The parent decides whether to persist this link
    // somewhere; the modal only captures the choice.
    surfaceKey: string;
  }) => void | Promise<void>;
};

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function AddMainTaskModal({
  open,
  saving = false,
  onClose,
  onSubmit,
}: Props) {
  // Main-task fields.
  const [name, setName] = useState("");
  const [defaultSortOrder, setDefaultSortOrder] = useState("0");
  const [status, setStatus] = useState("true");

  // Surface + formula choices.
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string>("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");

  // Data the modal fetches itself so the parent page doesn't need to
  // know about estimation-settings or surface_scale_presets.
  const [formulas, setFormulas] = useState<EstimationFormulaTemplate[]>([]);
  const [mainTasks, setMainTasks] = useState<EstimationMainTaskOption[]>([]);
  const [subTasks, setSubTasks] = useState<EstimationSubTaskOption[]>([]);
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Sub-modal state. Each one stacks above this modal via its own
  // higher z-index.
  const [addFormulaOpen, setAddFormulaOpen] = useState(false);
  const [savingFormula, setSavingFormula] = useState(false);
  const [addVariableOpen, setAddVariableOpen] = useState(false);
  const [savingVariable, setSavingVariable] = useState(false);
  const [addSurfaceOpen, setAddSurfaceOpen] = useState(false);

  // Reset on open. Avoids stale state carrying over between sessions.
  useEffect(() => {
    if (!open) return;
    setName("");
    setDefaultSortOrder("0");
    setStatus("true");
    setSelectedSurfaceKey("");
    setSelectedFormulaId("");
  }, [open]);

  const fetchEstimationSettings = useCallback(async () => {
    const response = await fetch("/api/planning/estimation-settings", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Failed to load estimation settings.");
    }
    const data = (await response.json()) as EstimationSettingsResponse;
    setFormulas(data.formulas ?? []);
    setMainTasks(data.mainTasks ?? []);
    setSubTasks(data.subTasks ?? []);
  }, []);

  const fetchSurfaces = useCallback(async () => {
    // Goes through the service-role API instead of the browser client
    // so RLS on surface_scale_presets cannot silently return zero
    // rows. The endpoint returns a keyed object; flatten it to an
    // array of the fields the dropdown needs.
    const response = await fetch("/api/planning/getSurfaceScalePresets", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Failed to load surface presets.");
    }
    const body = (await response.json()) as {
      surfaceScalePresets?: Record<
        string,
        { key: string; label: string; unit: string }
      >;
    };
    const rows = Object.values(body.surfaceScalePresets ?? {})
      .map((row) => ({
        surface_key: row.key,
        label: row.label,
        unit: row.unit,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    setSurfaces(rows);
  }, []);

  // Load formulas + surfaces every time the modal opens. Fresh data
  // each session so newly-created records from elsewhere (eg the
  // edit-estimations page in another tab) show up.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingData(true);
    void Promise.all([fetchEstimationSettings(), fetchSurfaces()])
      .catch((error) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load formulas or surfaces.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchEstimationSettings, fetchSurfaces]);

  const selectedFormula = useMemo(
    () =>
      formulas.find(
        (formula) => formula.formula_template_id === selectedFormulaId,
      ) ?? null,
    [formulas, selectedFormulaId],
  );

  const formulaOptions = useMemo(
    () =>
      formulas
        .filter((formula) => formula.is_active)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [formulas],
  );

  // Sub-modal submit handlers. Each one persists via the existing
  // estimation-settings endpoints, refetches, and pre-selects the
  // freshly-created record so the admin can keep moving without
  // hunting for it in the dropdown.
  const handleCreateFormula = useCallback(
    async (input: {
      formula: EstimationFormulaTemplatePayload;
      variables: Array<
        Omit<EstimationFormulaVariablePayload, "formulaTemplateId">
      >;
    }) => {
      try {
        setSavingFormula(true);
        const response = await fetch(
          "/api/planning/estimation-settings/formula-template",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input.formula),
          },
        );
        const data =
          await parseJson<EstimationFormulaTemplateMutationResponse>(response);
        if (!response.ok) {
          throw new Error(data?.error || "Failed to create formula.");
        }
        const newFormulaId = data?.formula?.formula_template_id;

        // Persist queued variables (if any) one by one. The parent
        // pattern matches edit-estimations: continue past per-row
        // errors so a single bad variable doesn't lose the formula.
        if (newFormulaId && input.variables.length > 0) {
          const variableErrors: string[] = [];
          for (const variable of input.variables) {
            try {
              const variableResponse = await fetch(
                "/api/planning/estimation-settings/formula-variable",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...variable,
                    formulaTemplateId: newFormulaId,
                  }),
                },
              );
              const variableBody =
                await parseJson<EstimationFormulaVariableMutationResponse>(
                  variableResponse,
                );
              if (!variableResponse.ok) {
                throw new Error(
                  variableBody?.error || "Failed to save variable.",
                );
              }
            } catch (variableError) {
              variableErrors.push(
                `${variable.variableKey}: ${variableError instanceof Error ? variableError.message : "save failed"}`,
              );
            }
          }
          if (variableErrors.length > 0) {
            toast.error("Some variables failed to save.", {
              description: variableErrors.join("; "),
            });
          }
        }

        await fetchEstimationSettings();
        if (newFormulaId) {
          setSelectedFormulaId(newFormulaId);
        }
        setAddFormulaOpen(false);
        toast.success(
          input.variables.length > 0
            ? `Formula created with ${input.variables.length} variable${input.variables.length === 1 ? "" : "s"}.`
            : "Formula created.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to create formula.",
        );
      } finally {
        setSavingFormula(false);
      }
    },
    [fetchEstimationSettings],
  );

  const handleCreateVariable = useCallback(
    async (payload: EstimationFormulaVariablePayload) => {
      try {
        setSavingVariable(true);
        const response = await fetch(
          "/api/planning/estimation-settings/formula-variable",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data =
          await parseJson<EstimationFormulaVariableMutationResponse>(response);
        if (!response.ok) {
          throw new Error(data?.error || "Failed to create variable.");
        }
        await fetchEstimationSettings();
        setAddVariableOpen(false);
        toast.success("Variable created.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to create variable.",
        );
      } finally {
        setSavingVariable(false);
      }
    },
    [fetchEstimationSettings],
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
        <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
          <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 bg-linear-to-r from-emerald-50/80 via-white to-white px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Add Main Task
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Create a reusable main task for planning and job creation.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:rotate-90 hover:bg-gray-50 hover:text-gray-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Main Task Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: Interior Painting"
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Default Sort Order
                </label>
                <input
                  type="number"
                  value={defaultSortOrder}
                  onChange={(event) => setDefaultSortOrder(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            {/* Surface picker. Sits at the top of the formula section
                so the admin picks the measured surface this formula
                will read from. Pulled live from surface_scale_presets. */}
            <div className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <MapPin className="h-3 w-3" />
                    Surface <span className="text-red-500">*</span>
                  </label>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Pick the surface this main task measures against.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAddSurfaceOpen(true)}
                  disabled={saving}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  Add surface
                </button>
              </div>

              <select
                value={selectedSurfaceKey}
                onChange={(event) => setSelectedSurfaceKey(event.target.value)}
                disabled={saving || loadingData}
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {loadingData ? "Loading surfaces..." : "Select a surface"}
                </option>
                {surfaces.map((surface) => (
                  <option key={surface.surface_key} value={surface.surface_key}>
                    {surface.label} ({surface.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Formula picker. Required. Sub-modal AddFormulaModal
                handles persistence and refetches on success. */}
            <div className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <Ruler className="h-3 w-3" />
                    Formula <span className="text-red-500">*</span>
                  </label>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Attach an estimation formula to this main task.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAddFormulaOpen(true)}
                  disabled={saving}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  Add formula
                </button>
              </div>

              <select
                value={selectedFormulaId}
                onChange={(event) => setSelectedFormulaId(event.target.value)}
                disabled={saving || loadingData}
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {loadingData ? "Loading formulas..." : "Select a formula"}
                </option>
                {formulaOptions.map((formula) => (
                  <option
                    key={formula.formula_template_id}
                    value={formula.formula_template_id}
                  >
                    {formula.name} ({formula.formula_scope})
                  </option>
                ))}
              </select>

              {selectedFormula ? (
                <div className="mt-3 rounded-md border border-gray-100 bg-white p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <VariableIcon className="h-3 w-3 text-blue-600" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Variables
                      </span>
                      <span className="rounded-full bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700">
                        {selectedFormula.variables.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAddVariableOpen(true)}
                      disabled={saving}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus className="h-3 w-3" />
                      Create new variable
                    </button>
                  </div>

                  {selectedFormula.variables.length > 0 ? (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {selectedFormula.variables.map((variable) => (
                        <div
                          key={variable.formula_variable_id}
                          className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/70 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-gray-900">
                              {variable.label}
                            </p>
                            <p className="truncate text-[10px] text-gray-500">
                              {variable.variable_key}
                              {variable.unit ? ` (${variable.unit})` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] font-medium text-gray-500">
                            {variable.default_value || "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 rounded-md border border-dashed border-gray-200 bg-gray-50/40 px-2 py-2 text-center text-[11px] text-gray-500">
                      This formula has no variables yet.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={
                saving ||
                !name.trim() ||
                !selectedFormulaId ||
                !selectedSurfaceKey
              }
              title={
                !selectedSurfaceKey
                  ? "Select a surface before creating this main task."
                  : !selectedFormulaId
                    ? "Select a formula before creating this main task."
                    : undefined
              }
              onClick={() => {
                if (!selectedFormulaId || !selectedSurfaceKey) return;
                void onSubmit({
                  name: name.trim(),
                  defaultSortOrder: Number(defaultSortOrder || 0),
                  isActive: status === "true",
                  formulaTemplateId: selectedFormulaId,
                  surfaceKey: selectedSurfaceKey,
                });
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {saving ? "Creating..." : "Add Main Task"}
            </button>
          </div>
        </div>
      </div>

      <AddSurfaceModal
        open={addSurfaceOpen}
        onClose={() => setAddSurfaceOpen(false)}
        onCreated={(surfaceKey) => {
          void fetchSurfaces().then(() => setSelectedSurfaceKey(surfaceKey));
        }}
      />

      <AddFormulaModal
        open={addFormulaOpen}
        saving={savingFormula}
        mainTasks={mainTasks}
        subTasks={subTasks}
        onClose={() => setAddFormulaOpen(false)}
        onSubmit={(payload) => void handleCreateFormula(payload)}
      />

      <AddVariableModal
        open={addVariableOpen}
        mode="add"
        variable={null}
        formulas={formulas}
        defaultFormulaTemplateId={selectedFormulaId || null}
        saving={savingVariable}
        onClose={() => setAddVariableOpen(false)}
        onSubmit={(payload) => void handleCreateVariable(payload)}
      />
    </>
  );
}
