import { NextResponse } from "next/server";

import {
  type EstimationFormulaScope,
  type EstimationFormulaTemplate,
  type EstimationFormulaVariable,
  isEstimationFormulaScope,
} from "@/lib/estimationSettings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FormulaTemplateRow = {
  formula_template_id: string;
  formula_key: string | null;
  name: string | null;
  description: string | null;
  formula_scope: string | null;
  formula_expression: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormulaVariableRow = {
  formula_variable_id: string;
  formula_template_id: string | null;
  variable_key: string | null;
  label: string | null;
  description: string | null;
  data_type: string | null;
  default_value: string | number | boolean | null;
  unit: string | null;
  is_required: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type RuleUsageRow = {
  formula_template_id: string | null;
  main_task_id: string | null;
  sub_task_id: string | null;
};

type MainTaskRow = {
  main_task_id: string;
  name: string | null;
};

type SubTaskRow = {
  sub_task_id: string;
  description: string | null;
};

function normalizeScope(value: string | null): EstimationFormulaScope {
  return isEstimationFormulaScope(value ?? "") ? value : "duration";
}

function mapFormulaVariableRow(row: FormulaVariableRow): EstimationFormulaVariable {
  return {
    formula_variable_id: row.formula_variable_id,
    formula_template_id: String(row.formula_template_id ?? "").trim(),
    variable_key: String(row.variable_key ?? "").trim(),
    label: String(row.label ?? "").trim(),
    description: String(row.description ?? "").trim(),
    data_type:
      row.data_type === "text" || row.data_type === "boolean"
        ? row.data_type
        : "number",
    default_value:
      row.default_value === null || row.default_value === undefined
        ? ""
        : String(row.default_value),
    unit: String(row.unit ?? "").trim(),
    is_required: row.is_required !== false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function buildUsageMaps(args: {
  materialRules: RuleUsageRow[];
  durationRules: RuleUsageRow[];
  mainTaskNameById: Map<string, string>;
  subTaskNameById: Map<string, string>;
}) {
  const {
    materialRules,
    durationRules,
    mainTaskNameById,
    subTaskNameById,
  } = args;

  const materialCounts = new Map<string, number>();
  const durationCounts = new Map<string, number>();
  const sampleUsageByFormulaId = new Map<string, string>();

  const recordRule = (
    rows: RuleUsageRow[],
    counter: Map<string, number>,
  ) => {
    for (const row of rows) {
      const formulaTemplateId = String(row.formula_template_id ?? "").trim();
      if (!formulaTemplateId) continue;

      counter.set(formulaTemplateId, (counter.get(formulaTemplateId) ?? 0) + 1);

      if (!sampleUsageByFormulaId.has(formulaTemplateId)) {
        const subTaskName = subTaskNameById.get(String(row.sub_task_id ?? "").trim());
        const mainTaskName = mainTaskNameById.get(
          String(row.main_task_id ?? "").trim(),
        );

        const sampleUsage =
          [mainTaskName, subTaskName].filter(Boolean).join(" / ") ||
          mainTaskName ||
          subTaskName;

        if (sampleUsage) {
          sampleUsageByFormulaId.set(formulaTemplateId, sampleUsage);
        }
      }
    }
  };

  recordRule(materialRules, materialCounts);
  recordRule(durationRules, durationCounts);

  return { materialCounts, durationCounts, sampleUsageByFormulaId };
}

export async function GET() {
  try {
    const [
      formulaTemplatesResult,
      formulaVariablesResult,
      materialRulesResult,
      durationRulesResult,
      mainTasksResult,
      subTasksResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("formula_templates")
        .select(
          "formula_template_id, formula_key, name, description, formula_scope, formula_expression, is_active, created_at, updated_at",
        )
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("formula_variables")
        .select(
          "formula_variable_id, formula_template_id, variable_key, label, description, data_type, default_value, unit, is_required, created_at, updated_at",
        )
        .order("label", { ascending: true }),
      supabaseAdmin
        .from("material_estimation_rules")
        .select("formula_template_id, main_task_id, sub_task_id")
        .eq("is_active", true),
      supabaseAdmin
        .from("task_duration_rules")
        .select("formula_template_id, main_task_id, sub_task_id")
        .eq("is_active", true),
      supabaseAdmin.from("main_task").select("main_task_id, name"),
      supabaseAdmin.from("sub_task").select("sub_task_id, description"),
    ]);

    if (formulaTemplatesResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch formula templates.",
          details: formulaTemplatesResult.error.message,
        },
        { status: 500 },
      );
    }

    if (formulaVariablesResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch formula variables.",
          details: formulaVariablesResult.error.message,
        },
        { status: 500 },
      );
    }

    if (materialRulesResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch material estimation rules.",
          details: materialRulesResult.error.message,
        },
        { status: 500 },
      );
    }

    if (durationRulesResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch duration estimation rules.",
          details: durationRulesResult.error.message,
        },
        { status: 500 },
      );
    }

    if (mainTasksResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch main task names.",
          details: mainTasksResult.error.message,
        },
        { status: 500 },
      );
    }

    if (subTasksResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch subtask names.",
          details: subTasksResult.error.message,
        },
        { status: 500 },
      );
    }

    const variables = ((formulaVariablesResult.data ?? []) as FormulaVariableRow[])
      .map(mapFormulaVariableRow)
      .filter(
        (variable) =>
          variable.formula_variable_id &&
          variable.formula_template_id &&
          variable.variable_key,
      );

    const variableMap = new Map<string, EstimationFormulaVariable[]>();
    for (const variable of variables) {
      const existing = variableMap.get(variable.formula_template_id) ?? [];
      existing.push(variable);
      variableMap.set(variable.formula_template_id, existing);
    }

    for (const item of variableMap.values()) {
      item.sort((left, right) =>
        left.label.localeCompare(right.label) ||
        left.variable_key.localeCompare(right.variable_key),
      );
    }

    const mainTaskNameById = new Map(
      ((mainTasksResult.data ?? []) as MainTaskRow[])
        .filter((row) => row.main_task_id)
        .map((row) => [
          row.main_task_id,
          String(row.name ?? "").trim() || "Untitled main task",
        ]),
    );

    const subTaskNameById = new Map(
      ((subTasksResult.data ?? []) as SubTaskRow[])
        .filter((row) => row.sub_task_id)
        .map((row) => [
          row.sub_task_id,
          String(row.description ?? "").trim() || "Untitled subtask",
        ]),
    );

    const materialRules = (materialRulesResult.data ?? []) as RuleUsageRow[];
    const durationRules = (durationRulesResult.data ?? []) as RuleUsageRow[];

    const { materialCounts, durationCounts, sampleUsageByFormulaId } =
      buildUsageMaps({
        materialRules,
        durationRules,
        mainTaskNameById,
        subTaskNameById,
      });

    const formulas: EstimationFormulaTemplate[] = (
      (formulaTemplatesResult.data ?? []) as FormulaTemplateRow[]
    )
      .map((row) => {
        const formulaTemplateId = row.formula_template_id;
        const materialRuleCount = materialCounts.get(formulaTemplateId) ?? 0;
        const durationRuleCount = durationCounts.get(formulaTemplateId) ?? 0;

        return {
          formula_template_id: formulaTemplateId,
          formula_key: String(row.formula_key ?? "").trim(),
          name: String(row.name ?? "").trim(),
          description: String(row.description ?? "").trim(),
          formula_scope: normalizeScope(row.formula_scope),
          formula_expression: String(row.formula_expression ?? "").trim(),
          is_active: row.is_active !== false,
          created_at: row.created_at ?? "",
          updated_at: row.updated_at ?? "",
          variables: variableMap.get(formulaTemplateId) ?? [],
          material_rule_count: materialRuleCount,
          duration_rule_count: durationRuleCount,
          total_rule_count: materialRuleCount + durationRuleCount,
          sample_usage: sampleUsageByFormulaId.get(formulaTemplateId) ?? null,
        };
      })
      .filter(
        (formula) =>
          formula.formula_template_id &&
          formula.formula_key &&
          formula.name &&
          formula.formula_expression,
      )
      .sort((left, right) => {
        if (left.is_active !== right.is_active) {
          return left.is_active ? -1 : 1;
        }

        const nameGap = left.name.localeCompare(right.name);
        if (nameGap !== 0) return nameGap;

        return left.formula_key.localeCompare(right.formula_key);
      });

    return NextResponse.json({
      formulas,
      summary: {
        formulaTemplateCount: formulas.length,
        formulaVariableCount: variables.length,
        activeRuleCount: materialRules.length + durationRules.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while loading estimation settings.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
