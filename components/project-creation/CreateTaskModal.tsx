"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  Ruler,
  Trash2,
  Variable as VariableIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";
import AddFormulaModal from "@/components/settings/change-estimations/AddFormulaModal";
import AddVariableModal from "@/components/settings/change-estimations/AddVariableModal";
import AddSurfaceModal from "@/components/task-management/AddSurfaceModal";
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

type ResourceOption = {
  id: string;
  name: string;
};

type DraftSubTask = {
  id: string;
  description: string;
  sortOrder: string;
  materialIds: string[];
  equipmentIds: string[];
};

type SurfaceRow = {
  surface_key: string;
  label: string;
  unit: string;
};

type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    sortOrder: string;
    // Required: surface this main task measures against.
    surfaceKey: string;
    // Required: formula attached to this main task; linked after
    // creation via material_estimation_rules.
    formulaTemplateId: string;
    subTasks: {
      description: string;
      sortOrder: string;
      materialIds: string[];
      equipmentIds: string[];
    }[];
  }) => Promise<void> | void;
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function ResourcePicker({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: ResourceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [itemPendingRemove, setItemPendingRemove] =
    useState<ResourceOption | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((item) => item.name.toLowerCase().includes(q));
  }, [options, query]);

  const selectedItems = options.filter((item) => selectedIds.includes(item.id));

  function addItem(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function removeItem(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-gray-700">
        {label}
      </label>

      <div className="rounded-md border border-gray-300 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
          {selectedItems.length === 0 ? (
            <span className="text-[12px] text-gray-400">
              No {label.toLowerCase()} selected
            </span>
          ) : (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
              >
                {item.name}
                <button
                  type="button"
                  onClick={() => setItemPendingRemove(item)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-emerald-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="relative">
          <div className="flex items-center">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className="h-10 w-full rounded-md bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
              placeholder={`Search ${label.toLowerCase()}`}
            />
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500" />
          </div>

          {open && (
            <div className="green-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-gray-500">
                  No {label.toLowerCase()} found.
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-800 transition hover:bg-emerald-50"
                  >
                    <Plus className="h-4 w-4 text-emerald-600" />
                    {item.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        open={Boolean(itemPendingRemove)}
        title={`Remove ${label.toLowerCase()}?`}
        description={
          itemPendingRemove
            ? `Remove "${itemPendingRemove.name}" from this draft?`
            : `Remove this ${label.toLowerCase()} from this draft?`
        }
        confirmLabel="Remove"
        onCancel={() => setItemPendingRemove(null)}
        onConfirm={() => {
          if (itemPendingRemove) removeItem(itemPendingRemove.id);
          setItemPendingRemove(null);
        }}
      />
    </div>
  );
}

export default function CreateTaskModal({
  open,
  onClose,
  onSave,
}: CreateTaskModalProps) {
  // Main-task fields.
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [creating, setCreating] = useState(false);

  // Surface + formula choices. Both required; gate the submit button.
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string>("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");

  // Catalog data fetched on open. Drives the surface/formula dropdowns
  // and the materials/equipment pickers on each subtask row.
  const [formulas, setFormulas] = useState<EstimationFormulaTemplate[]>([]);
  const [mainTasks, setMainTasks] = useState<EstimationMainTaskOption[]>([]);
  const [estimationSubTasks, setEstimationSubTasks] = useState<
    EstimationSubTaskOption[]
  >([]);
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<ResourceOption[]>(
    [],
  );
  const [materialOptions, setMaterialOptions] = useState<ResourceOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Subtask drafts. The user can add as many as they want; rows with
  // an empty description are dropped server-side.
  const [subTasks, setSubTasks] = useState<DraftSubTask[]>([]);
  const [subTaskPendingRemove, setSubTaskPendingRemove] =
    useState<DraftSubTask | null>(null);

  // Sub-modal state. Each one stacks above this modal via its own
  // higher z-index.
  const [addSurfaceOpen, setAddSurfaceOpen] = useState(false);
  const [addFormulaOpen, setAddFormulaOpen] = useState(false);
  const [savingFormula, setSavingFormula] = useState(false);
  const [addVariableOpen, setAddVariableOpen] = useState(false);
  const [savingVariable, setSavingVariable] = useState(false);

  // Reset every time the modal opens so a previously-cancelled draft
  // doesn't bleed into the next session.
  useEffect(() => {
    if (!open) return;
    setName("");
    setSortOrder("");
    setSelectedSurfaceKey("");
    setSelectedFormulaId("");
    setSubTasks([]);
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
    setEstimationSubTasks(data.subTasks ?? []);
  }, []);

  const fetchSurfaces = useCallback(async () => {
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

  const fetchResourceOptions = useCallback(async () => {
    const response = await fetch("/api/planning/getSubTaskResourceOptions");
    if (!response.ok) return;
    const data = await response.json();
    setEquipmentOptions(Array.isArray(data?.equipment) ? data.equipment : []);
    setMaterialOptions(Array.isArray(data?.materials) ? data.materials : []);
  }, []);

  // Refresh all catalog data on every open so newly-created records
  // (eg a surface added from another tab) show up immediately.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalog(true);
    void Promise.all([
      fetchEstimationSettings(),
      fetchSurfaces(),
      fetchResourceOptions(),
    ])
      .catch((error) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load options.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchEstimationSettings, fetchSurfaces, fetchResourceOptions]);

  // Surface change → auto-pick a matching formula. Same approach as
  // AddMainTaskModal: look for the surface_key as an identifier in
  // each active formula's expression.
  useEffect(() => {
    if (!selectedSurfaceKey) return;
    const matchPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    const match = formulas
      .filter((formula) => formula.is_active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .find((formula) => {
        const identifiers = formula.formula_expression.match(matchPattern);
        if (!identifiers) return false;
        return identifiers.includes(selectedSurfaceKey);
      });
    if (match) setSelectedFormulaId(match.formula_template_id);
  }, [selectedSurfaceKey, formulas]);

  const selectedFormula = useMemo(
    () =>
      formulas.find(
        (formula) => formula.formula_template_id === selectedFormulaId,
      ) ?? null,
    [formulas, selectedFormulaId],
  );

  const selectedSurface = useMemo(
    () =>
      surfaces.find((surface) => surface.surface_key === selectedSurfaceKey) ??
      null,
    [surfaces, selectedSurfaceKey],
  );

  const formulaOptions = useMemo(
    () =>
      formulas
        .filter((formula) => formula.is_active)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [formulas],
  );

  // Sub-modal: create formula. Mirrors AddMainTaskModal — persists
  // formula + queued variables, refetches the catalog, and pre-
  // selects the new formula so the admin keeps moving.
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
        if (newFormulaId) setSelectedFormulaId(newFormulaId);
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

  // Subtask helpers
  function addSubTaskRow() {
    setSubTasks((prev) => [
      ...prev,
      {
        id: makeId(),
        description: "",
        sortOrder: "",
        materialIds: [],
        equipmentIds: [],
      },
    ]);
  }

  function removeSubTaskRow(id: string) {
    setSubTasks((prev) => prev.filter((item) => item.id !== id));
  }

  function updateSubTask(id: string, patch: Partial<DraftSubTask>) {
    setSubTasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  const canSubmit =
    !creating &&
    name.trim().length > 0 &&
    sortOrder.trim().length > 0 &&
    Boolean(selectedSurfaceKey) &&
    Boolean(selectedFormulaId);

  async function handleSave() {
    if (!canSubmit) return;
    try {
      setCreating(true);
      await onSave({
        name: name.trim(),
        sortOrder: sortOrder.trim(),
        surfaceKey: selectedSurfaceKey,
        formulaTemplateId: selectedFormulaId,
        subTasks: subTasks.map((item) => ({
          description: item.description.trim(),
          sortOrder: item.sortOrder.trim(),
          materialIds: item.materialIds,
          equipmentIds: item.equipmentIds,
        })),
      });
      // Parent decides whether to close on success; if it doesn't,
      // we still want the modal to behave normally on the next open.
      onClose();
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
        <div className="flex max-h-[90vh] w-full max-w-4xl min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
          <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 bg-linear-to-r from-emerald-50/80 via-white to-white px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Create Main Task
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Add a main task with its surface, formula, and subtasks.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:rotate-90 hover:bg-gray-50 hover:text-gray-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="green-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Main Task Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Example: Interior Painting"
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Sort Order <span className="text-red-500">*</span>
              </label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {/* Surface picker */}
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
                  disabled={creating}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  Add surface
                </button>
              </div>
              <select
                value={selectedSurfaceKey}
                onChange={(e) => setSelectedSurfaceKey(e.target.value)}
                disabled={creating || loadingCatalog}
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {loadingCatalog ? "Loading surfaces..." : "Select a surface"}
                </option>
                {surfaces.map((surface) => (
                  <option
                    key={surface.surface_key}
                    value={surface.surface_key}
                  >
                    {surface.label} ({surface.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Formula picker + variables */}
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
                  disabled={creating}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  Add formula
                </button>
              </div>
              <select
                value={selectedFormulaId}
                onChange={(e) => setSelectedFormulaId(e.target.value)}
                disabled={creating || loadingCatalog}
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {loadingCatalog ? "Loading formulas..." : "Select a formula"}
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
                      disabled={creating}
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

            {/* Subtasks */}
            <div className="rounded-md border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Sub Tasks
                  </div>
                  <div className="mt-1 text-[12px] text-gray-500">
                    Build the task flow like a todo list.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addSubTaskRow}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition hover:brightness-95"
                  style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                >
                  <Plus className="h-4 w-4" />
                  Add Subtask
                </button>
              </div>

              <div className="p-4">
                {subTasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-[13px] text-gray-500">
                    No subtasks added yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {subTasks.map((subTask, index) => (
                      <div
                        key={subTask.id}
                        className="rounded-md border border-gray-200 bg-white p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">
                            Sub Task {index + 1}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSubTaskPendingRemove(subTask)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                            aria-label="Remove sub task"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div className="lg:col-span-2">
                            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                              Description
                            </label>
                            <input
                              value={subTask.description}
                              onChange={(e) =>
                                updateSubTask(subTask.id, {
                                  description: e.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                              Sort Order
                            </label>
                            <input
                              value={subTask.sortOrder}
                              onChange={(e) =>
                                updateSubTask(subTask.id, {
                                  sortOrder: e.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                            />
                          </div>
                          <div />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <ResourcePicker
                            label="Equipment"
                            options={equipmentOptions}
                            selectedIds={subTask.equipmentIds}
                            onChange={(ids) =>
                              updateSubTask(subTask.id, { equipmentIds: ids })
                            }
                          />
                          <ResourcePicker
                            label="Materials"
                            options={materialOptions}
                            selectedIds={subTask.materialIds}
                            onChange={(ids) =>
                              updateSubTask(subTask.id, { materialIds: ids })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit}
              title={
                !selectedSurfaceKey
                  ? "Select a surface before creating this main task."
                  : !selectedFormulaId
                    ? "Select a formula before creating this main task."
                    : !name.trim()
                      ? "Enter a main task name."
                      : !sortOrder.trim()
                        ? "Enter a sort order."
                        : undefined
              }
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {creating ? "Creating..." : "Create Main Task"}
            </button>
          </div>
        </div>

        <ConfirmDeleteModal
          open={Boolean(subTaskPendingRemove)}
          title="Remove subtask?"
          description={
            subTaskPendingRemove?.description
              ? `Remove "${subTaskPendingRemove.description}" from this task draft?`
              : "Remove this subtask from this task draft?"
          }
          confirmLabel="Remove"
          onCancel={() => setSubTaskPendingRemove(null)}
          onConfirm={() => {
            if (subTaskPendingRemove) removeSubTaskRow(subTaskPendingRemove.id);
            setSubTaskPendingRemove(null);
          }}
        />
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
        subTasks={estimationSubTasks}
        onClose={() => setAddFormulaOpen(false)}
        onSubmit={(payload) => void handleCreateFormula(payload)}
        initialFormulaExpression={selectedSurface?.surface_key ?? ""}
        initialVariables={
          selectedSurface
            ? [
                {
                  variableKey: selectedSurface.surface_key,
                  label: selectedSurface.label,
                  description: `Auto-attached to surface ${selectedSurface.label}.`,
                  dataType: "number",
                  defaultValue: "0",
                  unit: selectedSurface.unit,
                  isRequired: true,
                },
              ]
            : []
        }
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
        defaultVariableKey={selectedSurface?.surface_key ?? ""}
        defaultLabel={selectedSurface?.label ?? ""}
        defaultUnit={selectedSurface?.unit ?? ""}
      />
    </>
  );
}
