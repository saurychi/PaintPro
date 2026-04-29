import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateFormula } from "@/lib/planning/formulaEngine";
import type { AreaSummary } from "@/lib/planning/materialEstimator";
import {
  clampMinimumHours,
  getAdjustedDurationHours,
  getRequiredEmployeeCountFromLaborHours,
  roundToQuarterHour,
} from "@/lib/planning/workforceMath";

export type SubTaskDurationEstimate = {
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

type DurationRuleRow = {
  formula_template_id: string;
  minimum_hours: number | null;
};

/**
 * Looks up the active task_duration_rules row for the given mainTaskId +
 * subTaskId, retrieves the linked formula_template, builds runtime variable
 * values from the project's AreaSummary, evaluates the expression via
 * expr-eval, applies the minimum_hours floor, then returns a full duration
 * estimate.
 *
 * Throws if no active rule exists for the combination.
 */
export async function estimateDurationForSubTask(args: {
  mainTaskId: string;
  subTaskId: string;
  areas: AreaSummary;
}): Promise<SubTaskDurationEstimate> {
  const { mainTaskId, subTaskId, areas } = args;

  const { data: rule, error } = await supabaseAdmin
    .from("task_duration_rules")
    .select("formula_template_id, minimum_hours")
    .eq("main_task_id", mainTaskId)
    .eq("sub_task_id", subTaskId)
    .eq("is_active", true)
    .maybeSingle<DurationRuleRow>();

  if (error) {
    throw new Error(
      `durationEstimator: failed to fetch rule for mainTaskId=${mainTaskId}, subTaskId=${subTaskId}: ${error.message}`,
    );
  }
  if (!rule) {
    throw new Error(
      `durationEstimator: no active task_duration_rule found for mainTaskId=${mainTaskId}, subTaskId=${subTaskId}`,
    );
  }

  const { value, expression, scope } = await evaluateFormula({
    formulaTemplateId: rule.formula_template_id,
    areas,
  });

  const minimumHours = Number.isFinite(Number(rule.minimum_hours))
    ? Math.max(Number(rule.minimum_hours), 0)
    : 0.25;

  const baseLaborHours = clampMinimumHours(value, minimumHours);
  const requiredEmployeeCount =
    getRequiredEmployeeCountFromLaborHours(baseLaborHours);
  const {
    adjustedDurationHours,
    productivityHoursPerEmployee,
    teamEfficiencyFactor,
  } = getAdjustedDurationHours({
    laborHours: baseLaborHours,
    employeeCount: requiredEmployeeCount,
  });
  const estimatedHours = roundToQuarterHour(adjustedDurationHours);

  return {
    mainTaskId,
    subTaskId,
    baseLaborHours,
    requiredEmployeeCount,
    adjustedDurationHours,
    roundedHours: estimatedHours,
    estimatedHours,
    minimumHours,
    formula: expression,
    scope,
    productivityHoursPerEmployee,
    teamEfficiencyFactor,
  };
}
