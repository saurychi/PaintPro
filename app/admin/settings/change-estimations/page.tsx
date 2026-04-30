"use client";

import { Parser } from "expr-eval";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calculator,
  CheckCircle2,
  Edit3,
  Filter,
  FlaskConical,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Variable,
} from "lucide-react";
import { toast } from "sonner";

import AddFormulaModal from "@/components/settings/change-estimations/AddFormulaModal";
import AddVariableModal from "@/components/settings/change-estimations/AddVariableModal";
import EditFormulaModal from "@/components/settings/change-estimations/EditFormulaModal";
import {
  type EstimationDeleteResponse,
  type EstimationFormulaScope,
  type EstimationFormulaTemplate,
  type EstimationFormulaTemplateMutationResponse,
  type EstimationFormulaTemplatePayload,
  type EstimationFormulaVariable,
  type EstimationFormulaVariableMutationResponse,
  type EstimationFormulaVariablePayload,
  type EstimationSettingsResponse,
  type EstimationSettingsSummary,
} from "@/lib/estimationSettings";
import { getAreaVariableDefinition } from "@/lib/planning/areaVariables";

const parser = new Parser();

const previewNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

type ScopeFilter = "all" | EstimationFormulaScope;

type PreviewVariableField = {
  key: string;
  label: string;
  description: string;
  unit: string;
  dataType: EstimationFormulaVariable["data_type"];
  defaultValue: string;
  source: "formula" | "measurement";
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchEstimationSettings() {
  const response = await fetch("/api/planning/estimation-settings", {
    cache: "no-store",
  });

  const data = await parseJson<EstimationSettingsResponse>(response);

  if (!response.ok || !data?.formulas || !data.summary) {
    throw new Error(data?.error || "Failed to load estimation settings.");
  }

  return data;
}

async function saveFormulaTemplate(args: {
  formulaTemplateId?: string;
  payload: EstimationFormulaTemplatePayload;
}) {
  const response = await fetch(
    "/api/planning/estimation-settings/formula-template",
    {
      method: args.formulaTemplateId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formulaTemplateId: args.formulaTemplateId,
        ...args.payload,
      }),
    },
  );

  const data =
    await parseJson<EstimationFormulaTemplateMutationResponse>(response);

  if (!response.ok) {
    throw new Error(data?.error || "Failed to save formula.");
  }

  return data?.formula ?? null;
}

async function deleteFormulaTemplate(formulaTemplateId: string) {
  const response = await fetch(
    "/api/planning/estimation-settings/formula-template",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formulaTemplateId }),
    },
  );

  const data = await parseJson<EstimationDeleteResponse>(response);

  if (!response.ok) {
    throw new Error(data?.error || "Failed to delete formula.");
  }
}

async function saveFormulaVariable(args: {
  formulaVariableId?: string;
  payload: EstimationFormulaVariablePayload;
}) {
  const response = await fetch(
    "/api/planning/estimation-settings/formula-variable",
    {
      method: args.formulaVariableId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formulaVariableId: args.formulaVariableId,
        ...args.payload,
      }),
    },
  );

  const data =
    await parseJson<EstimationFormulaVariableMutationResponse>(response);

  if (!response.ok) {
    throw new Error(data?.error || "Failed to save variable.");
  }

  return data?.variable ?? null;
}

async function deleteFormulaVariable(formulaVariableId: string) {
  const response = await fetch(
    "/api/planning/estimation-settings/formula-variable",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formulaVariableId }),
    },
  );

  const data = await parseJson<EstimationDeleteResponse>(response);

  if (!response.ok) {
    throw new Error(data?.error || "Failed to delete variable.");
  }
}

function emptySummary(): EstimationSettingsSummary {
  return {
    formulaTemplateCount: 0,
    formulaVariableCount: 0,
    activeRuleCount: 0,
  };
}

function getUsageLabel(formula: EstimationFormulaTemplate) {
  if (formula.sample_usage) return formula.sample_usage;
  if (formula.total_rule_count === 0) return "Not used";
  return `${formula.total_rule_count} active rule${
    formula.total_rule_count === 1 ? "" : "s"
  }`;
}

function parsePreviewValue(
  variable: PreviewVariableField,
  value: string | undefined,
) {
  const normalized = (value ?? "").trim();

  if (variable.dataType === "boolean") {
    const lowered = normalized.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }

  if (variable.dataType === "number") {
    const parsed = Number(normalized || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return normalized;
}

function getExpressionVariableKeys(expression: string) {
  try {
    return Array.from(new Set(parser.parse(expression).variables()));
  } catch {
    return [];
  }
}

function mapFormulaVariableToPreviewField(
  variable: EstimationFormulaVariable,
): PreviewVariableField {
  return {
    key: variable.variable_key,
    label: variable.label || variable.variable_key,
    description: variable.description,
    unit: variable.unit,
    dataType: variable.data_type,
    defaultValue: variable.default_value,
    source: "formula",
  };
}

function buildPreviewFields(
  formula: EstimationFormulaTemplate | null,
  expression: string,
) {
  if (!formula) return [] as PreviewVariableField[];

  const previewFields = formula.variables.map(mapFormulaVariableToPreviewField);
  const seenKeys = new Set(previewFields.map((field) => field.key));

  for (const key of getExpressionVariableKeys(expression)) {
    if (seenKeys.has(key)) continue;

    const areaVariable = getAreaVariableDefinition(key);
    if (!areaVariable) continue;

    previewFields.push({
      key: areaVariable.key,
      label: areaVariable.label,
      description: areaVariable.description,
      unit: areaVariable.unit,
      dataType: "number",
      defaultValue: "0",
      source: "measurement",
    });
    seenKeys.add(key);
  }

  return previewFields;
}

function buildPreviewSeed(formula: EstimationFormulaTemplate | null) {
  if (!formula) {
    return {
      expression: "",
      values: {} as Record<string, string>,
    };
  }

  const values: Record<string, string> = {};
  const previewFields = buildPreviewFields(formula, formula.formula_expression);

  for (const variable of previewFields) {
    values[variable.key] = variable.defaultValue;
  }

  return {
    expression: formula.formula_expression,
    values,
  };
}

function buildPreviewResult(args: {
  formula: EstimationFormulaTemplate | null;
  previewFields: PreviewVariableField[];
  expression: string;
  values: Record<string, string>;
}) {
  const { formula, previewFields, expression, values } = args;

  if (!formula) {
    return {
      label: "Select a formula",
      detail: "Choose a formula template first.",
      error: null as string | null,
    };
  }

  try {
    const scope: Record<string, string | number | boolean> = {};

    for (const variable of previewFields) {
      scope[variable.key] = parsePreviewValue(
        variable,
        values[variable.key] ?? variable.defaultValue,
      );
    }

    const raw = parser.evaluate(
      expression || formula.formula_expression,
      scope as Record<string, any>,
    );

    if (typeof raw === "number" && Number.isFinite(raw)) {
      return {
        label: `${previewNumberFormatter.format(raw)} ${
          formula.formula_scope === "duration" ? "hours" : "result"
        }`,
        detail: "Calculated from preview values.",
        error: null as string | null,
      };
    }

    return {
      label: String(raw),
      detail: "Calculated from preview values.",
      error: null as string | null,
    };
  } catch (error: unknown) {
    return {
      label: "Preview unavailable",
      detail: "Expression or variable value is invalid.",
      error: getErrorMessage(error, "Failed to evaluate formula."),
    };
  }
}

export default function ChangeEstimationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [summary, setSummary] =
    useState<EstimationSettingsSummary>(emptySummary);

  const [formulas, setFormulas] = useState<EstimationFormulaTemplate[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(
    null,
  );

  const [isAddFormulaOpen, setIsAddFormulaOpen] = useState(false);
  const [editingFormula, setEditingFormula] =
    useState<EstimationFormulaTemplate | null>(null);

  const [variableModalMode, setVariableModalMode] = useState<"add" | "edit">(
    "add",
  );
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [editingVariable, setEditingVariable] =
    useState<EstimationFormulaVariable | null>(null);

  const [isSavingFormula, setIsSavingFormula] = useState(false);
  const [isSavingVariable, setIsSavingVariable] = useState(false);
  const [deletingFormulaId, setDeletingFormulaId] = useState<string | null>(
    null,
  );
  const [deletingVariableId, setDeletingVariableId] = useState<string | null>(
    null,
  );

  const [previewExpression, setPreviewExpression] = useState("");
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    {},
  );

  const selectedFormula =
    formulas.find(
      (formula) => formula.formula_template_id === selectedFormulaId,
    ) ?? null;

  const filteredFormulas = useMemo(() => {
    return formulas.filter((formula) => {
      if (scopeFilter !== "all" && formula.formula_scope !== scopeFilter) {
        return false;
      }

      const query = searchValue.trim().toLowerCase();
      if (!query) return true;

      return (
        formula.name.toLowerCase().includes(query) ||
        formula.formula_key.toLowerCase().includes(query) ||
        formula.formula_expression.toLowerCase().includes(query)
      );
    });
  }, [formulas, scopeFilter, searchValue]);

  const previewFields = useMemo(
    () =>
      buildPreviewFields(
        selectedFormula,
        previewExpression || selectedFormula?.formula_expression || "",
      ),
    [previewExpression, selectedFormula],
  );

  const previewResult = buildPreviewResult({
    formula: selectedFormula,
    previewFields,
    expression: previewExpression,
    values: previewValues,
  });

  async function refreshData(options?: {
    preferredFormulaId?: string | null;
    showLoader?: boolean;
  }) {
    const preferredFormulaId = options?.preferredFormulaId ?? null;

    if (options?.showLoader) setLoading(true);

    setPageError(null);

    try {
      const data = await fetchEstimationSettings();
      const nextFormulas = data.formulas ?? [];

      setFormulas(nextFormulas);
      setSummary(data.summary ?? emptySummary());

      setSelectedFormulaId((current) => {
        if (
          preferredFormulaId &&
          nextFormulas.some(
            (formula) => formula.formula_template_id === preferredFormulaId,
          )
        ) {
          return preferredFormulaId;
        }

        if (
          current &&
          nextFormulas.some(
            (formula) => formula.formula_template_id === current,
          )
        ) {
          return current;
        }

        return nextFormulas[0]?.formula_template_id ?? null;
      });
    } catch (error: unknown) {
      const message = getErrorMessage(
        error,
        "Failed to load estimation settings.",
      );
      setPageError(message);
      toast.error(message);
    } finally {
      if (options?.showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoading(true);
      setPageError(null);

      try {
        const data = await fetchEstimationSettings();
        if (cancelled) return;

        const nextFormulas = data.formulas ?? [];

        setFormulas(nextFormulas);
        setSummary(data.summary ?? emptySummary());
        setSelectedFormulaId(nextFormulas[0]?.formula_template_id ?? null);
      } catch (error: unknown) {
        if (cancelled) return;

        const message = getErrorMessage(
          error,
          "Failed to load estimation settings.",
        );
        setPageError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextPreview = buildPreviewSeed(selectedFormula);
    setPreviewExpression(nextPreview.expression);
    setPreviewValues(nextPreview.values);
  }, [selectedFormula]);

  async function handleCreateFormula(
    payload: EstimationFormulaTemplatePayload,
  ) {
    setIsSavingFormula(true);

    try {
      const formula = await saveFormulaTemplate({ payload });
      await refreshData({
        preferredFormulaId: formula?.formula_template_id ?? null,
      });
      setIsAddFormulaOpen(false);
      toast.success("Formula created.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create formula."));
    } finally {
      setIsSavingFormula(false);
    }
  }

  async function handleUpdateFormula(
    payload: EstimationFormulaTemplatePayload,
  ) {
    if (!editingFormula) return;

    setIsSavingFormula(true);

    try {
      await saveFormulaTemplate({
        formulaTemplateId: editingFormula.formula_template_id,
        payload,
      });
      await refreshData({
        preferredFormulaId: editingFormula.formula_template_id,
      });
      setEditingFormula(null);
      toast.success("Formula updated.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update formula."));
    } finally {
      setIsSavingFormula(false);
    }
  }

  async function handleDeleteFormula(formula: EstimationFormulaTemplate) {
    const confirmed = window.confirm(
      `Delete "${formula.name}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingFormulaId(formula.formula_template_id);

    try {
      await deleteFormulaTemplate(formula.formula_template_id);
      await refreshData({
        preferredFormulaId:
          selectedFormulaId === formula.formula_template_id
            ? null
            : selectedFormulaId,
      });
      toast.success("Formula deleted.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete formula."));
    } finally {
      setDeletingFormulaId(null);
    }
  }

  async function handleCreateVariable(
    payload: EstimationFormulaVariablePayload,
  ) {
    setIsSavingVariable(true);

    try {
      await saveFormulaVariable({ payload });
      await refreshData({ preferredFormulaId: payload.formulaTemplateId });
      setIsVariableModalOpen(false);
      setEditingVariable(null);
      toast.success("Variable created.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create variable."));
    } finally {
      setIsSavingVariable(false);
    }
  }

  async function handleUpdateVariable(
    payload: EstimationFormulaVariablePayload,
  ) {
    if (!editingVariable) return;

    setIsSavingVariable(true);

    try {
      await saveFormulaVariable({
        formulaVariableId: editingVariable.formula_variable_id,
        payload,
      });
      await refreshData({ preferredFormulaId: payload.formulaTemplateId });
      setIsVariableModalOpen(false);
      setEditingVariable(null);
      toast.success("Variable updated.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update variable."));
    } finally {
      setIsSavingVariable(false);
    }
  }

  async function handleDeleteVariable(variable: EstimationFormulaVariable) {
    const confirmed = window.confirm(`Delete "${variable.label}"?`);
    if (!confirmed) return;

    setDeletingVariableId(variable.formula_variable_id);

    try {
      await deleteFormulaVariable(variable.formula_variable_id);
      await refreshData({ preferredFormulaId: variable.formula_template_id });
      toast.success("Variable deleted.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete variable."));
    } finally {
      setDeletingVariableId(null);
    }
  }

  function handleSelectFormula(formulaTemplateId: string | null) {
    setSelectedFormulaId(formulaTemplateId);
  }

  function resetPreviewToSelectedFormula() {
    const nextPreview = buildPreviewSeed(selectedFormula);
    setPreviewExpression(nextPreview.expression);
    setPreviewValues(nextPreview.values);
  }

  function openFormulaEditor(formula: EstimationFormulaTemplate) {
    handleSelectFormula(formula.formula_template_id);
    setEditingFormula(formula);
  }

  function openAddVariableModal() {
    if (!selectedFormula) {
      toast.error("Select a formula first.");
      return;
    }

    setVariableModalMode("add");
    setEditingVariable(null);
    setIsVariableModalOpen(true);
  }

  function openEditVariableModal(variable: EstimationFormulaVariable) {
    setVariableModalMode("edit");
    setEditingVariable(variable);
    setIsVariableModalOpen(true);
  }

  return (
    <>
      <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="shrink-0 px-4 py-3 sm:px-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Change Estimations
          </h1>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 sm:px-6">
          <section className="grid shrink-0 gap-3 lg:grid-cols-3">
            <SummaryCard
              title="Formula Templates"
              value={String(summary.formulaTemplateCount)}
              color="green"
              icon={<Calculator className="h-4 w-4" />}
            />
            <SummaryCard
              title="Formula Variables"
              value={String(summary.formulaVariableCount)}
              color="blue"
              icon={<Variable className="h-4 w-4" />}
            />
            <SummaryCard
              title="Active Rules"
              value={String(summary.activeRuleCount)}
              color="amber"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
          </section>

          {pageError ? (
            <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                    Failed to load estimation settings
                  </p>
                  <p className="text-[11px] text-red-700 dark:text-red-400">{pageError}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void refreshData({ showLoader: true })}
                  className="h-8 rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700">
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            {/* ── Formula Templates list ── */}
            <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Formula Templates
                    </h2>
                    <p className="mt-0.5 max-w-md text-xs text-gray-500 dark:text-gray-400">
                      Manage database formulas used by duration and material
                      estimation rules.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_145px_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        placeholder="Search formula..."
                        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
                      />
                    </div>

                    <div className="relative">
                      <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <select
                        value={scopeFilter}
                        onChange={(event) =>
                          setScopeFilter(event.target.value as ScopeFilter)
                        }
                        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-8 text-xs font-medium text-gray-700 outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <option value="all">All</option>
                        <option value="duration">Duration</option>
                        <option value="material">Material</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddFormulaOpen(true)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white shadow-sm hover:bg-[#00a054]">
                      <Plus className="h-3.5 w-3.5" />
                      Add Formula
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading formulas...
                    </div>
                  </div>
                ) : filteredFormulas.length > 0 ? (
                  <div className="h-full divide-y divide-gray-100 overflow-auto dark:divide-gray-800">
                    {filteredFormulas.map((formula) => {
                      const isSelected =
                        formula.formula_template_id === selectedFormulaId;
                      const deleting =
                        deletingFormulaId === formula.formula_template_id;

                      return (
                        <div
                          key={formula.formula_template_id}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            handleSelectFormula(formula.formula_template_id)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectFormula(formula.formula_template_id);
                            }
                          }}
                          className={[
                            "block w-full cursor-pointer p-3 text-left transition",
                            isSelected
                              ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/60",
                          ].join(" ")}>
                          <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,1fr)_auto]">
                            <div className="flex min-w-0 items-start gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-[#00c065] dark:bg-green-950">
                                <FlaskConical className="h-4 w-4" />
                              </div>

                              <div className="min-w-0">
                                <h3 className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                                  {formula.name}
                                </h3>
                                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                  {formula.formula_key}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                                    {formula.formula_scope}
                                  </span>
                                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                                    {formula.variables.length} vars
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                Expression
                              </p>
                              <code className="mt-1 block truncate rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                {formula.formula_expression}
                              </code>
                              <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                                Used by: {getUsageLabel(formula)}
                              </p>
                            </div>

                            <div
                              className="flex items-start justify-end gap-1.5"
                              onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectFormula(
                                    formula.formula_template_id,
                                  )
                                }
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900">
                                Preview
                              </button>

                              <button
                                type="button"
                                onClick={() => openFormulaEditor(formula)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-white hover:shadow-sm dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeleteFormula(formula)
                                }
                                disabled={deleting}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                                {deleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        No formulas found
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Adjust your search or create a new formula.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,0.7fr)_minmax(0,0.3fr)]">
              {/* ── Formula Preview ── */}
              <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Formula Preview
                      </h2>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        Test selected formula with sample values.
                      </p>
                    </div>
                    <Settings2 className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_210px]">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <select
                        value={selectedFormulaId ?? ""}
                        onChange={(event) =>
                          handleSelectFormula(event.target.value || null)
                        }
                        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <option value="">Select a formula</option>
                        {formulas.map((formula) => (
                          <option
                            key={formula.formula_template_id}
                            value={formula.formula_template_id}>
                            {formula.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={resetPreviewToSelectedFormula}
                        disabled={!selectedFormula}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </button>
                    </div>

                    <textarea
                      value={previewExpression}
                      onChange={(event) =>
                        setPreviewExpression(event.target.value)
                      }
                      placeholder="Select a formula to preview its expression."
                      className="min-h-0 flex-1 resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
                    />
                  </div>

                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 dark:border-green-800 dark:bg-green-950/50">
                      <p className="text-[11px] font-medium text-green-700 dark:text-green-400">
                        Estimated Result
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-green-800 dark:text-green-300">
                        {previewResult.label}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-green-700 dark:text-green-400">
                        {previewResult.error ?? previewResult.detail}
                      </p>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/50">
                      <p className="mb-1 text-[11px] font-semibold text-gray-900 dark:text-white">
                        Preview Values
                      </p>

                      {previewFields.length > 0 ? (
                        <div className="h-full space-y-1.5 overflow-auto pr-1">
                          {previewFields.map((variable) => (
                            <PreviewInput
                              key={variable.key}
                              label={variable.key}
                              meta={
                                variable.source === "measurement"
                                  ? `${variable.label} • built-in measurement`
                                  : variable.label
                              }
                              value={
                                previewValues[variable.key] ??
                                variable.defaultValue
                              }
                              onChange={(nextValue) =>
                                setPreviewValues((current) => ({
                                  ...current,
                                  [variable.key]: nextValue,
                                }))
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white px-2 text-center text-[11px] text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          Select a formula.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Variables ── */}
              <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Variables
                      </h2>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {selectedFormula
                          ? `Default values for ${selectedFormula.name}.`
                          : "Select a formula to manage its variables."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={openAddVariableModal}
                      disabled={!selectedFormula}
                      className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {selectedFormula?.variables.length ? (
                    <div className="h-full divide-y divide-gray-100 overflow-auto dark:divide-gray-800">
                      {selectedFormula.variables.map((variable) => {
                        const deleting =
                          deletingVariableId === variable.formula_variable_id;

                        return (
                          <div
                            key={variable.formula_variable_id}
                            className="grid gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 md:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0">
                              <h3 className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                                {variable.label}
                              </h3>
                              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {variable.variable_key}
                              </p>

                              {variable.description ? (
                                <p className="mt-1 line-clamp-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  {variable.description}
                                </p>
                              ) : null}

                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                                  {variable.data_type}
                                </span>
                                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                  {variable.is_required
                                    ? "Required"
                                    : "Optional"}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-right dark:border-gray-700 dark:bg-gray-800">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                  {variable.default_value || "-"}
                                </p>
                                <p className="text-[9px] text-gray-500 dark:text-gray-400">
                                  {variable.unit || "No unit"}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => openEditVariableModal(variable)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white hover:shadow-sm dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeleteVariable(variable)
                                }
                                disabled={deleting}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                                {deleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedFormula
                            ? "No variables yet"
                            : "No formula selected"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {selectedFormula
                            ? "Add variables for this formula."
                            : "Pick a formula from the list."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>

      <AddFormulaModal
        open={isAddFormulaOpen}
        saving={isSavingFormula}
        onClose={() => setIsAddFormulaOpen(false)}
        onSubmit={(payload) => void handleCreateFormula(payload)}
      />

      <EditFormulaModal
        open={Boolean(editingFormula)}
        formula={editingFormula}
        saving={isSavingFormula}
        onClose={() => setEditingFormula(null)}
        onSubmit={(payload) => void handleUpdateFormula(payload)}
      />

      <AddVariableModal
        open={isVariableModalOpen}
        mode={variableModalMode}
        variable={editingVariable}
        formulas={formulas}
        defaultFormulaTemplateId={selectedFormula?.formula_template_id ?? null}
        saving={isSavingVariable}
        onClose={() => {
          setIsVariableModalOpen(false);
          setEditingVariable(null);
        }}
        onSubmit={(payload) =>
          void (variableModalMode === "edit"
            ? handleUpdateVariable(payload)
            : handleCreateVariable(payload))
        }
      />
    </>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  color: "green" | "blue" | "amber";
}) {
  const styles = {
    green: {
      bar: "bg-[#00c065]",
      icon: "bg-green-50 text-[#00c065] dark:bg-green-950",
    },
    blue: {
      bar: "bg-blue-500",
      icon: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    },
    amber: {
      bar: "bg-amber-500",
      icon: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    },
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={`mb-2 h-1 w-10 rounded-full ${styles[color].bar}`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles[color].icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function PreviewInput({
  label,
  meta,
  value,
  onChange,
}: {
  label: string;
  meta: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2">
      <div className="min-w-0">
        <label className="truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">
          {label}
        </label>
        <p className="truncate text-[9px] text-gray-500 dark:text-gray-400">{meta}</p>
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      />
    </div>
  );
}
