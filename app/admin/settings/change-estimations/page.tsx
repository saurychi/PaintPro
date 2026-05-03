"use client";

import { Parser, type Values } from "expr-eval";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import FormulaRuleRelationsModal from "@/components/settings/change-estimations/FormulaRuleRelationsModal";
import {
  type EstimationDeleteResponse,
  type EstimationMainTaskOption,
  type EstimationFormulaScope,
  type EstimationSubTaskOption,
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
type EstimationSection = "templates" | "variables" | "rules";
type VariableFilter = "all" | EstimationFormulaScope | EstimationFormulaVariable["data_type"];

type PreviewVariableField = {
  key: string;
  label: string;
  description: string;
  unit: string;
  dataType: EstimationFormulaVariable["data_type"];
  defaultValue: string;
  source: "formula" | "measurement";
};

type VariableListItem = {
  id: string;
  label: string;
  variableKey: string;
  description: string;
  dataType: EstimationFormulaVariable["data_type"];
  defaultValue: string;
  unit: string;
  isRequired: boolean;
  formulaId: string;
  formulaName: string;
  formulaKey: string;
  formulaScope: EstimationFormulaScope;
};

type RuleListItem = {
  id: string;
  formulaId: string;
  formulaName: string;
  formulaKey: string;
  ruleScope: EstimationFormulaScope;
  mainTaskName: string;
  ruleName: string;
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
    return lowered === "true" || lowered === "1" || lowered === "yes" ? 1 : 0;
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
      title: "Estimated Result",
      label: "Select a formula",
      unit: "",
      detail: "Choose a formula template first.",
      error: null as string | null,
    };
  }

  const { title, unit } = getPreviewResultMeta(formula);

  try {
    const scope: Values = {};

    for (const variable of previewFields) {
      scope[variable.key] = parsePreviewValue(
        variable,
        values[variable.key] ?? variable.defaultValue,
      );
    }

    const raw = parser.evaluate(
      expression || formula.formula_expression,
      scope,
    );

    if (typeof raw === "number" && Number.isFinite(raw)) {
      return {
        title,
        label: previewNumberFormatter.format(raw),
        unit,
        detail: "Auto-calculated from the preview values.",
        error: null as string | null,
      };
    }

    return {
      title,
      label: String(raw),
      unit: "",
      detail: "Auto-calculated from the preview values.",
      error: null as string | null,
    };
  } catch (error: unknown) {
    return {
      title,
      label: "Preview unavailable",
      unit: "",
      detail: "Expression or variable value is invalid.",
      error: getErrorMessage(error, "Failed to evaluate formula."),
    };
  }
}

type PreviewResult = ReturnType<typeof buildPreviewResult>;

function getPreviewResultMeta(formula: EstimationFormulaTemplate | null) {
  if (!formula) {
    return {
      title: "Estimated Result",
      unit: "",
    };
  }

  return {
    title:
      formula.formula_scope === "duration"
        ? "Estimated Duration"
        : "Estimated Quantity",
    unit: formula.formula_scope === "duration" ? "hours" : "estimated units",
  };
}

export default function ChangeEstimationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [summary, setSummary] =
    useState<EstimationSettingsSummary>(emptySummary);

  const [activeSection, setActiveSection] =
    useState<EstimationSection>("templates");
  const [formulas, setFormulas] = useState<EstimationFormulaTemplate[]>([]);
  const [mainTasks, setMainTasks] = useState<EstimationMainTaskOption[]>([]);
  const [subTasks, setSubTasks] = useState<EstimationSubTaskOption[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [variableSearchValue, setVariableSearchValue] = useState("");
  const [variableFilter, setVariableFilter] = useState<VariableFilter>("all");
  const [ruleSearchValue, setRuleSearchValue] = useState("");
  const [ruleFilter, setRuleFilter] = useState<ScopeFilter>("all");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(
    null,
  );

  const [isAddFormulaOpen, setIsAddFormulaOpen] = useState(false);
  const [editingFormula, setEditingFormula] =
    useState<EstimationFormulaTemplate | null>(null);
  const [relationshipFormulaId, setRelationshipFormulaId] = useState<string | null>(
    null,
  );

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
  const [calculatedPreviewResult, setCalculatedPreviewResult] =
    useState<PreviewResult | null>(null);

  const selectedFormula =
    formulas.find(
      (formula) => formula.formula_template_id === selectedFormulaId,
    ) ?? null;
  const relationshipFormula =
    formulas.find(
      (formula) => formula.formula_template_id === relationshipFormulaId,
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

  const allFormulaRelationships = useMemo(
    () =>
      formulas.flatMap((formula) =>
        formula.rule_relations.map((relation) => ({
          id: `${formula.formula_template_id}-${relation.relation_id}`,
          formulaId: formula.formula_template_id,
          formulaName: formula.name,
          formulaKey: formula.formula_key,
          ruleScope: relation.rule_scope,
          mainTaskName: relation.main_task_name,
          ruleName: relation.sub_task_name,
        })),
      ),
    [formulas],
  );

  const allVariables = useMemo<VariableListItem[]>(
    () =>
      formulas.flatMap((formula) =>
        formula.variables.map((variable) => ({
          id: variable.formula_variable_id,
          label: variable.label,
          variableKey: variable.variable_key,
          description: variable.description,
          dataType: variable.data_type,
          defaultValue: variable.default_value,
          unit: variable.unit,
          isRequired: variable.is_required,
          formulaId: formula.formula_template_id,
          formulaName: formula.name,
          formulaKey: formula.formula_key,
          formulaScope: formula.formula_scope,
        })),
      ),
    [formulas],
  );

  const filteredVariables = useMemo(() => {
    return allVariables.filter((variable) => {
      const query = variableSearchValue.trim().toLowerCase();
      if (
        query &&
        !(
          variable.label.toLowerCase().includes(query) ||
          variable.variableKey.toLowerCase().includes(query) ||
          variable.formulaName.toLowerCase().includes(query) ||
          variable.formulaKey.toLowerCase().includes(query) ||
          variable.description.toLowerCase().includes(query)
        )
      ) {
        return false;
      }

      if (variableFilter === "all") return true;
      if (variableFilter === "duration" || variableFilter === "material") {
        return variable.formulaScope === variableFilter;
      }

      return variable.dataType === variableFilter;
    });
  }, [allVariables, variableFilter, variableSearchValue]);

  const filteredRules = useMemo(() => {
    return allFormulaRelationships.filter((rule) => {
      if (ruleFilter !== "all" && rule.ruleScope !== ruleFilter) {
        return false;
      }

      const query = ruleSearchValue.trim().toLowerCase();
      if (!query) return true;

      return (
        rule.formulaName.toLowerCase().includes(query) ||
        rule.formulaKey.toLowerCase().includes(query) ||
        rule.mainTaskName.toLowerCase().includes(query) ||
        rule.ruleName.toLowerCase().includes(query)
      );
    });
  }, [allFormulaRelationships, ruleFilter, ruleSearchValue]);

  const previewFields = useMemo(
    () =>
      buildPreviewFields(
        selectedFormula,
        previewExpression || selectedFormula?.formula_expression || "",
      ),
    [previewExpression, selectedFormula],
  );

  const refreshData = useCallback(async (options?: {
    preferredFormulaId?: string | null;
    showLoader?: boolean;
  }) => {
    const preferredFormulaId = options?.preferredFormulaId ?? null;

    if (options?.showLoader) setLoading(true);

    setPageError(null);

    try {
      const data = await fetchEstimationSettings();
      const nextFormulas = data.formulas ?? [];

      setFormulas(nextFormulas);
      setMainTasks(data.mainTasks ?? []);
      setSubTasks(data.subTasks ?? []);
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
  }, []);

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
        setMainTasks(data.mainTasks ?? []);
        setSubTasks(data.subTasks ?? []);
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
    setCalculatedPreviewResult(null);
  }, [selectedFormula]);

  useEffect(() => {
    if (!editingFormula) return;

    const refreshedFormula = formulas.find(
      (formula) =>
        formula.formula_template_id === editingFormula.formula_template_id,
    );

    if (refreshedFormula && refreshedFormula !== editingFormula) {
      setEditingFormula(refreshedFormula);
    }
  }, [editingFormula, formulas]);

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

  const handleDeleteVariable = useCallback(async (
    variable: EstimationFormulaVariable,
  ) => {
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
  }, [refreshData]);

  const handleSelectFormula = useCallback((formulaTemplateId: string | null) => {
    setSelectedFormulaId(formulaTemplateId);
  }, []);

  const resetPreviewToSelectedFormula = useCallback(() => {
    const nextPreview = buildPreviewSeed(selectedFormula);
    setPreviewExpression(nextPreview.expression);
    setPreviewValues(nextPreview.values);
    setCalculatedPreviewResult(null);
  }, [selectedFormula]);

  const calculatePreviewResult = useCallback(() => {
    setCalculatedPreviewResult(
      buildPreviewResult({
        formula: selectedFormula,
        previewFields,
        expression: previewExpression,
        values: previewValues,
      }),
    );
  }, [previewExpression, previewFields, previewValues, selectedFormula]);

  const openFormulaEditor = useCallback((formula: EstimationFormulaTemplate) => {
    handleSelectFormula(formula.formula_template_id);
    setEditingFormula(formula);
  }, [handleSelectFormula]);

  const openRelationshipModal = useCallback((formula: EstimationFormulaTemplate) => {
    handleSelectFormula(formula.formula_template_id);
    setRelationshipFormulaId(formula.formula_template_id);
  }, [handleSelectFormula]);

  const openAddVariableModal = useCallback(() => {
    if (!selectedFormula) {
      toast.error("Select a formula first.");
      return;
    }

    setVariableModalMode("add");
    setEditingVariable(null);
    setIsVariableModalOpen(true);
  }, [selectedFormula]);

  const openAddVariableForFormula = useCallback((formula: EstimationFormulaTemplate) => {
    handleSelectFormula(formula.formula_template_id);
    setVariableModalMode("add");
    setEditingVariable(null);
    setIsVariableModalOpen(true);
  }, [handleSelectFormula]);

  const openEditVariableModal = useCallback((variable: EstimationFormulaVariable) => {
    setVariableModalMode("edit");
    setEditingVariable(variable);
    setIsVariableModalOpen(true);
  }, []);

  const openEditVariableById = useCallback((variableId: string) => {
    const variable = editingFormula?.variables.find(
      (item) => item.formula_variable_id === variableId,
    );

    if (variable) {
      openEditVariableModal(variable);
    }
  }, [editingFormula, openEditVariableModal]);

  const deleteVariableById = useCallback((variableId: string) => {
    const variable = editingFormula?.variables.find(
      (item) => item.formula_variable_id === variableId,
    );

    if (variable) {
      void handleDeleteVariable(variable);
    }
  }, [editingFormula, handleDeleteVariable]);

  const openCreateFormulaModal = useCallback(() => {
    setIsAddFormulaOpen(true);
  }, []);

  const handleOverviewEditVariable = useCallback(
    (variableId: string) => {
      const variable = allVariables.find((item) => item.id === variableId);
      if (!variable) return;

      const formula = formulas.find(
        (item) => item.formula_template_id === variable.formulaId,
      );
      const fullVariable = formula?.variables.find(
        (item) => item.formula_variable_id === variableId,
      );

      if (formula) {
        handleSelectFormula(formula.formula_template_id);
      }

      if (fullVariable) {
        openEditVariableModal(fullVariable);
      }
    },
    [allVariables, formulas, handleSelectFormula, openEditVariableModal],
  );

  const handleOverviewOpenFormula = useCallback(
    (formulaId: string) => {
      const formula = formulas.find(
        (item) => item.formula_template_id === formulaId,
      );
      if (formula) {
        openFormulaEditor(formula);
      }
    },
    [formulas, openFormulaEditor],
  );

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
              active={activeSection === "templates"}
              onClick={() => setActiveSection("templates")}
            />
            <SummaryCard
              title="Formula Variables"
              value={String(summary.formulaVariableCount)}
              color="blue"
              icon={<Variable className="h-4 w-4" />}
              active={activeSection === "variables"}
              onClick={() => setActiveSection("variables")}
            />
            <SummaryCard
              title="Active Rules"
              value={String(summary.activeRuleCount)}
              color="amber"
              icon={<CheckCircle2 className="h-4 w-4" />}
              active={activeSection === "rules"}
              onClick={() => setActiveSection("rules")}
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
                  className="h-8 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-all duration-150 hover:bg-red-700 active:scale-[0.98]">
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          <section
            className={[
              "min-h-0 flex-1",
              activeSection === "templates"
                ? "grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(400px,0.75fr)] animate-in fade-in-0 duration-150"
                : "hidden",
            ].join(" ")}
          >
            <FormulaTemplatesSection
              loading={loading}
              formulas={formulas}
              filteredFormulas={filteredFormulas}
              searchValue={searchValue}
              scopeFilter={scopeFilter}
              selectedFormula={selectedFormula}
              selectedFormulaId={selectedFormulaId}
              deletingFormulaId={deletingFormulaId}
              deletingVariableId={deletingVariableId}
              previewExpression={previewExpression}
              previewValues={previewValues}
              previewFields={previewFields}
              calculatedPreviewResult={calculatedPreviewResult}
              onSearchValueChange={setSearchValue}
              onScopeFilterChange={setScopeFilter}
              onAddFormula={openCreateFormulaModal}
              onSelectFormula={handleSelectFormula}
              onOpenRelationshipModal={openRelationshipModal}
              onOpenFormulaEditor={openFormulaEditor}
              onDeleteFormula={(formula) => void handleDeleteFormula(formula)}
              onResetPreview={resetPreviewToSelectedFormula}
              onCalculatePreview={calculatePreviewResult}
              onPreviewExpressionChange={(value) => {
                setPreviewExpression(value);
                setCalculatedPreviewResult(null);
              }}
              onPreviewValueChange={(key, nextValue) => {
                setCalculatedPreviewResult(null);
                setPreviewValues((current) => ({
                  ...current,
                  [key]: nextValue,
                }));
              }}
              onOpenAddVariable={openAddVariableModal}
              onOpenEditVariable={openEditVariableModal}
              onDeleteVariable={(variable) => void handleDeleteVariable(variable)}
            />
          </section>

          <section
            className={[
              "min-h-0 flex-1",
              activeSection === "variables"
                ? "block animate-in fade-in-0 duration-150"
                : "hidden",
            ].join(" ")}
          >
            <VariablesOverviewSection
              loading={loading}
              variables={filteredVariables}
              filter={variableFilter}
              searchValue={variableSearchValue}
              onSearchChange={setVariableSearchValue}
              onFilterChange={setVariableFilter}
              onEditVariable={handleOverviewEditVariable}
            />
          </section>

          <section
            className={[
              "min-h-0 flex-1",
              activeSection === "rules"
                ? "block animate-in fade-in-0 duration-150"
                : "hidden",
            ].join(" ")}
          >
            <ActiveRulesOverviewSection
              loading={loading}
              rules={filteredRules}
              filter={ruleFilter}
              searchValue={ruleSearchValue}
              onSearchChange={setRuleSearchValue}
              onFilterChange={setRuleFilter}
              onOpenFormula={handleOverviewOpenFormula}
            />
          </section>
        </div>
      </main>

      <AddFormulaModal
        key={`add-formula-${isAddFormulaOpen ? "open" : "closed"}`}
        open={isAddFormulaOpen}
        saving={isSavingFormula}
        mainTasks={mainTasks}
        subTasks={subTasks}
        onClose={() => setIsAddFormulaOpen(false)}
        onSubmit={(payload) => void handleCreateFormula(payload)}
      />

      <EditFormulaModal
        key={
          editingFormula
            ? `${editingFormula.formula_template_id}-${editingFormula.updated_at}`
            : "no-formula"
        }
        open={Boolean(editingFormula)}
        formula={editingFormula}
        saving={isSavingFormula}
        deletingVariableId={deletingVariableId}
        onClose={() => setEditingFormula(null)}
        onSubmit={(payload) => void handleUpdateFormula(payload)}
        onViewRelationships={
          editingFormula
            ? () => openRelationshipModal(editingFormula)
            : undefined
        }
        onAddVariable={
          editingFormula
            ? () => openAddVariableForFormula(editingFormula)
            : undefined
        }
        onEditVariable={openEditVariableById}
        onDeleteVariable={deleteVariableById}
      />

      <AddVariableModal
        key={`${variableModalMode}-${
          editingVariable?.formula_variable_id ??
          selectedFormula?.formula_template_id ??
          "no-variable"
        }-${isVariableModalOpen}`}
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

      <FormulaRuleRelationsModal
        open={Boolean(relationshipFormula)}
        formula={relationshipFormula}
        onClose={() => setRelationshipFormulaId(null)}
      />
    </>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  color,
  active = false,
  onClick,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  color: "green" | "blue" | "amber";
  active?: boolean;
  onClick?: () => void;
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
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border bg-white p-3 text-left shadow-sm transition-all duration-150 active:scale-[0.985] dark:bg-gray-900",
        active
          ? "border-[#00c065] ring-2 ring-[#00c065]/10 shadow-md dark:border-[#00c065]"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
      ].join(" ")}
    >
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
    </button>
  );
}

const FormulaTemplatesSection = memo(function FormulaTemplatesSection({
  loading,
  formulas,
  filteredFormulas,
  searchValue,
  scopeFilter,
  selectedFormula,
  selectedFormulaId,
  deletingFormulaId,
  deletingVariableId,
  previewExpression,
  previewValues,
  previewFields,
  calculatedPreviewResult,
  onSearchValueChange,
  onScopeFilterChange,
  onAddFormula,
  onSelectFormula,
  onOpenRelationshipModal,
  onOpenFormulaEditor,
  onDeleteFormula,
  onResetPreview,
  onCalculatePreview,
  onPreviewExpressionChange,
  onPreviewValueChange,
  onOpenAddVariable,
  onOpenEditVariable,
  onDeleteVariable,
}: {
  loading: boolean;
  formulas: EstimationFormulaTemplate[];
  filteredFormulas: EstimationFormulaTemplate[];
  searchValue: string;
  scopeFilter: ScopeFilter;
  selectedFormula: EstimationFormulaTemplate | null;
  selectedFormulaId: string | null;
  deletingFormulaId: string | null;
  deletingVariableId: string | null;
  previewExpression: string;
  previewValues: Record<string, string>;
  previewFields: PreviewVariableField[];
  calculatedPreviewResult: PreviewResult | null;
  onSearchValueChange: (value: string) => void;
  onScopeFilterChange: (value: ScopeFilter) => void;
  onAddFormula: () => void;
  onSelectFormula: (formulaTemplateId: string | null) => void;
  onOpenRelationshipModal: (formula: EstimationFormulaTemplate) => void;
  onOpenFormulaEditor: (formula: EstimationFormulaTemplate) => void;
  onDeleteFormula: (formula: EstimationFormulaTemplate) => void;
  onResetPreview: () => void;
  onCalculatePreview: () => void;
  onPreviewExpressionChange: (value: string) => void;
  onPreviewValueChange: (key: string, value: string) => void;
  onOpenAddVariable: () => void;
  onOpenEditVariable: (variable: EstimationFormulaVariable) => void;
  onDeleteVariable: (variable: EstimationFormulaVariable) => void;
}) {
  return (
    <>
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
                  onChange={(event) => onSearchValueChange(event.target.value)}
                  placeholder="Search formula..."
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
                />
              </div>

              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <select
                  value={scopeFilter}
                  onChange={(event) =>
                    onScopeFilterChange(event.target.value as ScopeFilter)
                  }
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-8 text-xs font-medium text-gray-700 outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <option value="all">All</option>
                  <option value="duration">Duration</option>
                  <option value="material">Material</option>
                </select>
              </div>

              <button
                type="button"
                onClick={onAddFormula}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#00a054] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Formula
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <CenteredLoading label="Loading formulas..." />
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
                    onClick={() => onSelectFormula(formula.formula_template_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectFormula(formula.formula_template_id);
                      }
                    }}
                    className={[
                      "block w-full cursor-pointer p-3 text-left transition",
                      isSelected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/60",
                    ].join(" ")}
                  >
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
                        {formula.total_rule_count > 0 ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRelationshipModal(formula);
                            }}
                            className="mt-1 text-[11px] font-medium text-emerald-700 transition-transform duration-150 hover:text-emerald-800 active:scale-[0.98] dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            View relationships
                          </button>
                        ) : null}
                      </div>

                      <div
                        className="flex items-start justify-end gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectFormula(formula.formula_template_id)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 transition-all duration-150 hover:bg-emerald-100 active:scale-[0.98] dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
                        >
                          Preview
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenFormulaEditor(formula)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.98] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteFormula(formula)}
                          disabled={deleting}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
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
            <EmptyOverviewState
              title="No formulas found"
              description="Adjust your search or create a new formula."
            />
          )}
        </div>
      </div>

      <aside className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,0.64fr)_minmax(0,0.36fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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

          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <select
                value={selectedFormulaId ?? ""}
                onChange={(event) => onSelectFormula(event.target.value || null)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="">Select a formula</option>
                {formulas.map((formula) => (
                  <option
                    key={formula.formula_template_id}
                    value={formula.formula_template_id}
                  >
                    {formula.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onResetPreview}
                disabled={!selectedFormula}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>

              <button
                type="button"
                onClick={onCalculatePreview}
                disabled={!selectedFormula}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Calculator className="h-3.5 w-3.5" />
                Calculate
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
              <div>
                <label className="text-[11px] font-semibold text-gray-900 dark:text-white">
                  Formula Expression
                </label>
                <textarea
                  value={previewExpression}
                  onChange={(event) => onPreviewExpressionChange(event.target.value)}
                  placeholder="Select a formula to preview its expression."
                  className="mt-1 h-[56px] w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs leading-5 text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
                />
              </div>

              <div className="grid min-h-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(210px,0.8fr)]">
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/50">
                  <p className="mb-2 text-[11px] font-semibold text-gray-900 dark:text-white">
                    Preview Values
                  </p>

                  {previewFields.length > 0 ? (
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
                            previewValues[variable.key] ?? variable.defaultValue
                          }
                          onChange={(nextValue) =>
                            onPreviewValueChange(variable.key, nextValue)
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white px-2 text-center text-[11px] text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      Select a formula.
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-green-200 bg-green-50 p-2.5 dark:border-green-800 dark:bg-green-950/50">
                  {calculatedPreviewResult ? (
                    <>
                      <p className="text-[11px] font-medium text-green-700 dark:text-green-400">
                        {calculatedPreviewResult.title}
                      </p>
                      <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                        <p className="truncate text-2xl font-semibold leading-none text-green-800 dark:text-green-300">
                          {calculatedPreviewResult.label}
                        </p>
                        {calculatedPreviewResult.unit ? (
                          <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">
                            {calculatedPreviewResult.unit}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 overflow-auto text-[11px] text-green-700 dark:text-green-400">
                        {calculatedPreviewResult.error ??
                          calculatedPreviewResult.detail}
                      </p>
                    </>
                  ) : selectedFormula ? (
                    <PreviewResultReady formula={selectedFormula} />
                  ) : (
                    <PreviewResultPlaceholder />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                onClick={onOpenAddVariable}
                disabled={!selectedFormula}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[11px] font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
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
                      className="grid gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
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
                            {variable.is_required ? "Required" : "Optional"}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="min-w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-right dark:border-gray-700 dark:bg-gray-800">
                          <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                            {variable.default_value || "-"}
                            {variable.unit ? (
                              <span className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                                {variable.unit}
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenEditVariable(variable)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.96] dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteVariable(variable)}
                          disabled={deleting}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
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
              <EmptyOverviewState
                title={selectedFormula ? "No variables yet" : "No formula selected"}
                description={
                  selectedFormula
                    ? "Add variables for this formula."
                    : "Pick a formula from the list."
                }
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
});

const VariablesOverviewSection = memo(function VariablesOverviewSection({
  loading,
  variables,
  filter,
  searchValue,
  onSearchChange,
  onFilterChange,
  onEditVariable,
}: {
  loading: boolean;
  variables: VariableListItem[];
  filter: VariableFilter;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: VariableFilter) => void;
  onEditVariable: (variableId: string) => void;
}) {
  const filterTabs: VariableFilter[] = [
    "all",
    "duration",
    "material",
    "number",
    "text",
    "boolean",
  ];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Formula Variables
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Browse all variables across duration and material formulas.
            </p>
          </div>

          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search variable, formula, or key..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <FilterTabButton
              key={tab}
              active={filter === tab}
              label={tab === "all" ? "All" : tab}
              onClick={() => onFilterChange(tab)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <CenteredLoading label="Loading variables..." />
        ) : variables.length > 0 ? (
          <div className="h-full divide-y divide-gray-100 overflow-auto dark:divide-gray-800">
            {variables.map((variable) => (
              <div
                key={variable.id}
                className="grid gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_auto]"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {variable.label}
                  </h3>
                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {variable.variableKey}
                  </p>
                  {variable.description ? (
                    <p className="mt-1 line-clamp-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {variable.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                      {variable.dataType}
                    </span>
                    <span className="rounded-full border border-green-100 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                      {variable.formulaScope}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      {variable.isRequired ? "Required" : "Optional"}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Formula
                  </p>
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {variable.formulaName}
                  </p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {variable.formulaKey}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <div className="min-w-[124px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-right dark:border-gray-700 dark:bg-gray-800">
                    <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                      {variable.defaultValue || "-"}
                      {variable.unit ? (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                          {variable.unit}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEditVariable(variable.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.96] dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                    aria-label={`Edit ${variable.label}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyOverviewState
            title="No variables found"
            description="Try another search or filter to see matching variables."
          />
        )}
      </div>
    </div>
  );
});

const ActiveRulesOverviewSection = memo(function ActiveRulesOverviewSection({
  loading,
  rules,
  filter,
  searchValue,
  onSearchChange,
  onFilterChange,
  onOpenFormula,
}: {
  loading: boolean;
  rules: RuleListItem[];
  filter: ScopeFilter;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: ScopeFilter) => void;
  onOpenFormula: (formulaId: string) => void;
}) {
  const filterTabs: ScopeFilter[] = ["all", "duration", "material"];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Active Rules
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              See every active relationship between formulas, main tasks, and rules.
            </p>
          </div>

          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search formula, main task, or rule..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <FilterTabButton
              key={tab}
              active={filter === tab}
              label={tab === "all" ? "All" : tab}
              onClick={() => onFilterChange(tab)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <CenteredLoading label="Loading active rules..." />
        ) : rules.length > 0 ? (
          <div className="h-full divide-y divide-gray-100 overflow-auto dark:divide-gray-800">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="grid gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 lg:grid-cols-[auto_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]"
              >
                <div className="flex items-start">
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                      rule.ruleScope === "duration"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        : "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
                    ].join(" ")}
                  >
                    {rule.ruleScope}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Formula
                  </p>
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {rule.formulaName}
                  </p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {rule.formulaKey}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Main Task
                  </p>
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {rule.mainTaskName}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Rule
                  </p>
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {rule.ruleName}
                  </p>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenFormula(rule.formulaId)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-all duration-150 hover:bg-white hover:shadow-sm active:scale-[0.98] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Open Formula
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyOverviewState
            title="No active rules found"
            description="Try another search or filter to see matching relationships."
          />
        )}
      </div>
    </div>
  );
});

function FilterTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150 active:scale-[0.98]",
        active
          ? "bg-[#00c065] text-white"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function EmptyOverviewState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
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
    <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
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

function PreviewResultPlaceholder() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-3 w-28 rounded-full border border-green-200 bg-white/40 dark:border-green-800 dark:bg-green-950" />
      <div className="flex items-end gap-2">
        <div className="h-8 w-16 rounded-lg border border-green-200 bg-white/40 dark:border-green-800 dark:bg-green-950" />
        <div className="h-3 w-20 rounded-full border border-green-200 bg-white/40 dark:border-green-800 dark:bg-green-950" />
      </div>
      <div className="h-3 w-full rounded-full border border-green-200 bg-white/40 dark:border-green-800 dark:bg-green-950" />
    </div>
  );
}

function PreviewResultReady({
  formula,
}: {
  formula: EstimationFormulaTemplate;
}) {
  const { title, unit } = getPreviewResultMeta(formula);

  return (
    <>
      <p className="text-[11px] font-medium text-green-700 dark:text-green-400">
        {title}
      </p>
      <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
        <p className="truncate text-2xl font-semibold leading-none text-green-800 dark:text-green-300">
          --
        </p>
        {unit ? (
          <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">
            {unit}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 line-clamp-2 text-[11px] text-green-700 dark:text-green-400">
        Click Calculate to evaluate the preview values.
      </p>
    </>
  );
}
