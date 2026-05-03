"use client";

import { useState } from "react";
import { Edit3, Loader2, Network, Plus, Save, Trash2, X } from "lucide-react";

import {
  type EstimationFormulaTemplate,
  type EstimationFormulaTemplatePayload,
  ESTIMATION_FORMULA_SCOPES,
} from "@/lib/estimationSettings";

type EditFormulaModalProps = {
  open: boolean;
  formula: EstimationFormulaTemplate | null;
  saving: boolean;
  deletingVariableId?: string | null;
  onClose: () => void;
  onSubmit: (payload: EstimationFormulaTemplatePayload) => void;
  onViewRelationships?: () => void;
  onAddVariable?: () => void;
  onEditVariable?: (variableId: string) => void;
  onDeleteVariable?: (variableId: string) => void;
};

function buildPayload(
  formula: EstimationFormulaTemplate | null,
): EstimationFormulaTemplatePayload {
  return {
    formulaKey: formula?.formula_key ?? "",
    name: formula?.name ?? "",
    description: formula?.description ?? "",
    formulaScope: formula?.formula_scope ?? "duration",
    formulaExpression: formula?.formula_expression ?? "",
    isActive: formula?.is_active ?? true,
  };
}

export default function EditFormulaModal({
  open,
  formula,
  saving,
  deletingVariableId = null,
  onClose,
  onSubmit,
  onViewRelationships,
  onAddVariable,
  onEditVariable,
  onDeleteVariable,
}: EditFormulaModalProps) {
  const [formState, setFormState] = useState<EstimationFormulaTemplatePayload>(
    buildPayload(formula),
  );

  if (!open || !formula) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Edit Formula
            </h2>
            <p className="text-xs text-gray-500">
              Update the expression and formula details.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(formState);
          }}
        >
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">
            <Field
              label="Formula Key"
              value={formState.formulaKey}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  formulaKey: value,
                }))
              }
            />
            <Field
              label="Formula Name"
              value={formState.name}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  name: value,
                }))
              }
            />

            <SelectField
              label="Scope"
              value={formState.formulaScope}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  formulaScope: value as EstimationFormulaTemplatePayload["formulaScope"],
                }))
              }
              options={ESTIMATION_FORMULA_SCOPES.map((scope) => ({
                value: scope,
                label: scope,
              }))}
            />

            <SelectField
              label="Status"
              value={formState.isActive ? "true" : "false"}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  isActive: value === "true",
                }))
              }
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />

            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-gray-600">
                Formula Expression
              </label>
              <textarea
                value={formState.formulaExpression}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    formulaExpression: event.target.value,
                  }))
                }
                className="mt-1 h-24 w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-gray-600">
                Description
              </label>
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="mt-1 h-16 w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Rule Relationships
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Main tasks and rules currently using this formula.
                  </p>
                </div>

                {onViewRelationships ? (
                  <button
                    type="button"
                    onClick={onViewRelationships}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Network className="h-3.5 w-3.5" />
                    View All
                  </button>
                ) : null}
              </div>

              <div className="mt-2 space-y-2">
                {formula.rule_relations.length > 0 ? (
                  formula.rule_relations.slice(0, 3).map((relation) => (
                    <div
                      key={relation.relation_id}
                      className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]"
                    >
                      <div className="flex items-start">
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                            relation.rule_scope === "duration"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-blue-200 bg-blue-50 text-blue-700",
                          ].join(" ")}
                        >
                          {relation.rule_scope}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Main Task
                        </p>
                        <p className="truncate text-xs font-semibold text-gray-900">
                          {relation.main_task_name}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Rule
                        </p>
                        <p className="truncate text-xs font-semibold text-gray-900">
                          {relation.sub_task_name}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                    This formula has no active rule relationships yet.
                  </div>
                )}

                {formula.rule_relations.length > 3 ? (
                  <p className="text-[11px] text-gray-500">
                    Showing 3 of {formula.rule_relations.length} active relationships.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Variables
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Add, edit, or remove variables used by this formula.
                  </p>
                </div>

                {onAddVariable ? (
                  <button
                    type="button"
                    onClick={onAddVariable}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Variable
                  </button>
                ) : null}
              </div>

              <div className="mt-2 space-y-2">
                {formula.variables.length > 0 ? (
                  formula.variables.map((variable) => {
                    const deleting =
                      deletingVariableId === variable.formula_variable_id;

                    return (
                      <div
                        key={variable.formula_variable_id}
                        className="grid items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 md:grid-cols-[minmax(0,1fr)_minmax(110px,180px)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-900">
                            {variable.label}
                          </p>
                          <p className="truncate text-[11px] text-gray-500">
                            {variable.variable_key}
                          </p>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                          <p className="truncate text-xs font-semibold text-gray-900">
                            {variable.default_value || "-"}
                            {variable.unit ? (
                              <span className="ml-1 text-xs font-medium text-gray-500">
                                {variable.unit}
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-1.5">
                          {onEditVariable ? (
                            <button
                              type="button"
                              onClick={() =>
                                onEditVariable(variable.formula_variable_id)
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                              aria-label={`Edit ${variable.label}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}

                          {onDeleteVariable ? (
                            <button
                              type="button"
                              onClick={() =>
                                onDeleteVariable(variable.formula_variable_id)
                              }
                              disabled={deleting}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`Delete ${variable.label}`}
                            >
                              {deleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                    No variables are attached to this formula yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 p-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
