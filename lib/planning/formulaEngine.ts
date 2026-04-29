import { Parser } from "expr-eval";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildAreaVariableMapFromSummary } from "@/lib/planning/areaVariables";
import type { AreaSummary } from "@/lib/planning/materialEstimator";

const parser = new Parser();

type FormulaTemplateRow = {
  formula_template_id: string;
  formula_expression: string;
  name: string;
};

type FormulaVariableRow = {
  variable_key: string;
  data_type: string;
  default_value: string | null;
};

export type EvaluatedFormula = {
  value: number;
  expression: string;
  scope: Record<string, number>;
};

/**
 * Maps every AreaSummary field to its snake_case variable_key used in
 * formula_variables rows. formula_expression strings must reference these
 * exact key names (e.g. "wall_area_m2 / 45 + 0.5").
 */
export function buildAreaVariableMap(areas: AreaSummary): Record<string, number> {
  return buildAreaVariableMapFromSummary(
    areas as Record<string, number | null | undefined>,
  );
}

/**
 * Fetches formula_templates + formula_variables for the given template ID,
 * builds a runtime scope from the project's AreaSummary (falling back to
 * each variable's default_value when the area field is zero or absent),
 * then evaluates the expression safely via expr-eval.
 *
 * Throws if the template is not found or the expression fails to parse/evaluate.
 */
export async function evaluateFormula(args: {
  formulaTemplateId: string;
  areas: AreaSummary;
}): Promise<EvaluatedFormula> {
  const { formulaTemplateId, areas } = args;

  const { data: templateRow, error: templateErr } = await supabaseAdmin
    .from("formula_templates")
    .select("formula_template_id, formula_expression, name")
    .eq("formula_template_id", formulaTemplateId)
    .eq("is_active", true)
    .maybeSingle<FormulaTemplateRow>();

  if (templateErr) {
    throw new Error(
      `formulaEngine: failed to fetch template ${formulaTemplateId}: ${templateErr.message}`,
    );
  }
  if (!templateRow) {
    throw new Error(
      `formulaEngine: no active formula_template found for id=${formulaTemplateId}`,
    );
  }

  const { data: variableRows, error: varErr } = await supabaseAdmin
    .from("formula_variables")
    .select("variable_key, data_type, default_value")
    .eq("formula_template_id", formulaTemplateId);

  if (varErr) {
    throw new Error(
      `formulaEngine: failed to fetch variables for template ${formulaTemplateId}: ${varErr.message}`,
    );
  }

  const areaMap = buildAreaVariableMap(areas);
  const scope: Record<string, number> = {};

  for (const v of (variableRows ?? []) as FormulaVariableRow[]) {
    const fromArea = areaMap[v.variable_key];
    if (fromArea !== undefined && fromArea !== 0) {
      scope[v.variable_key] = fromArea;
    } else {
      const fallback = Number(v.default_value ?? 0);
      scope[v.variable_key] = Number.isFinite(fallback) ? fallback : 0;
    }
  }

  // Ensure every area variable is available in scope even if it has no
  // formula_variables row — formulas may reference area keys directly.
  for (const [key, value] of Object.entries(areaMap)) {
    if (!(key in scope)) {
      scope[key] = value;
    }
  }

  const expression = templateRow.formula_expression;

  let value: number;
  try {
    const parsed = parser.parse(expression);
    const raw = parsed.evaluate(scope);
    value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  } catch (e) {
    throw new Error(
      `formulaEngine: failed to evaluate expression "${expression}" (template: ${templateRow.name}): ${e}`,
    );
  }

  return { value, expression, scope };
}
