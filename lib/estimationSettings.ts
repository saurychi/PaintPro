export const ESTIMATION_FORMULA_SCOPES = ["duration", "material"] as const;

export type EstimationFormulaScope =
  (typeof ESTIMATION_FORMULA_SCOPES)[number];

export const ESTIMATION_VARIABLE_DATA_TYPES = [
  "number",
  "text",
  "boolean",
] as const;

export type EstimationVariableDataType =
  (typeof ESTIMATION_VARIABLE_DATA_TYPES)[number];

export type EstimationFormulaVariable = {
  formula_variable_id: string;
  formula_template_id: string;
  variable_key: string;
  label: string;
  description: string;
  data_type: EstimationVariableDataType;
  default_value: string;
  unit: string;
  is_required: boolean;
  created_at: string;
  updated_at: string;
};

export type EstimationMainTaskOption = {
  main_task_id: string;
  name: string;
};

export type EstimationSubTaskOption = {
  sub_task_id: string;
  main_task_id: string;
  description: string;
};

export type EstimationFormulaRuleRelation = {
  relation_id: string;
  rule_scope: EstimationFormulaScope;
  main_task_id: string;
  main_task_name: string;
  sub_task_id: string;
  sub_task_name: string;
};

export type EstimationFormulaTemplate = {
  formula_template_id: string;
  formula_key: string;
  name: string;
  description: string;
  formula_scope: EstimationFormulaScope;
  formula_expression: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variables: EstimationFormulaVariable[];
  material_rule_count: number;
  duration_rule_count: number;
  total_rule_count: number;
  sample_usage: string | null;
  rule_relations: EstimationFormulaRuleRelation[];
};

export type EstimationSettingsSummary = {
  formulaTemplateCount: number;
  formulaVariableCount: number;
  activeRuleCount: number;
};

export type EstimationSettingsResponse = {
  formulas?: EstimationFormulaTemplate[];
  summary?: EstimationSettingsSummary;
  mainTasks?: EstimationMainTaskOption[];
  subTasks?: EstimationSubTaskOption[];
  error?: string;
};

export type EstimationFormulaTemplatePayload = {
  formulaKey: string;
  name: string;
  description: string;
  formulaScope: EstimationFormulaScope;
  formulaExpression: string;
  isActive: boolean;
  relatedMainTaskId?: string;
  relatedSubTaskId?: string;
  relatedRuleLabel?: string;
};

export type EstimationFormulaVariablePayload = {
  formulaTemplateId: string;
  variableKey: string;
  label: string;
  description: string;
  dataType: EstimationVariableDataType;
  defaultValue: string;
  unit: string;
  isRequired: boolean;
};

export type EstimationFormulaTemplateMutationResponse = {
  success?: boolean;
  formula?: EstimationFormulaTemplate;
  error?: string;
};

export type EstimationFormulaVariableMutationResponse = {
  success?: boolean;
  variable?: EstimationFormulaVariable;
  error?: string;
};

export type EstimationDeleteResponse = {
  success?: boolean;
  error?: string;
};

export function isEstimationFormulaScope(
  value: string,
): value is EstimationFormulaScope {
  return ESTIMATION_FORMULA_SCOPES.includes(value as EstimationFormulaScope);
}

export function isEstimationVariableDataType(
  value: string,
): value is EstimationVariableDataType {
  return ESTIMATION_VARIABLE_DATA_TYPES.includes(
    value as EstimationVariableDataType,
  );
}
