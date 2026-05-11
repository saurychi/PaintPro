"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2, Variable as VariableIcon, X } from "lucide-react";

import {
  type EstimationMainTaskOption,
  type EstimationSubTaskOption,
  type EstimationFormulaTemplatePayload,
  type EstimationFormulaVariablePayload,
  ESTIMATION_FORMULA_SCOPES,
  ESTIMATION_VARIABLE_DATA_TYPES,
  type EstimationVariableDataType,
} from "@/lib/estimationSettings";
import { COMMON_UNITS } from "@/lib/commonUnits";

// Variables the admin queues up while creating the formula. They
// don't have a formula_template_id yet (the formula hasn't been
// persisted), so we drop that field from the payload and let the
// parent fill it in after the formula POST succeeds.
type PendingVariable = Omit<
  EstimationFormulaVariablePayload,
  "formulaTemplateId"
>;

export type AddFormulaSubmitPayload = {
  formula: EstimationFormulaTemplatePayload;
  variables: PendingVariable[];
};

type AddFormulaModalProps = {
  open: boolean;
  saving: boolean;
  mainTasks: EstimationMainTaskOption[];
  subTasks: EstimationSubTaskOption[];
  onClose: () => void;
  // Parent receives the formula payload plus any queued variables.
  // It creates the formula first, then loops through the variables
  // and POSTs each with the new formula_template_id.
  onSubmit: (payload: AddFormulaSubmitPayload) => void;
};

const initialState: EstimationFormulaTemplatePayload = {
  formulaKey: "",
  name: "",
  description: "",
  formulaScope: "duration",
  formulaExpression: "",
  isActive: true,
  relatedMainTaskId: "",
  relatedSubTaskId: "",
  relatedRuleLabel: "",
};

const emptyVariableDraft: PendingVariable = {
  variableKey: "",
  label: "",
  description: "",
  dataType: "number",
  defaultValue: "",
  unit: "",
  isRequired: true,
};

export default function AddFormulaModal({
  open,
  saving,
  mainTasks,
  subTasks,
  onClose,
  onSubmit,
}: AddFormulaModalProps) {
  const [formState, setFormState] =
    useState<EstimationFormulaTemplatePayload>(initialState);
  const [variables, setVariables] = useState<PendingVariable[]>([]);
  const [variableDraft, setVariableDraft] =
    useState<PendingVariable>(emptyVariableDraft);
  const [variableFormOpen, setVariableFormOpen] = useState(false);

  const filteredSubTasks = subTasks.filter(
    (item) => item.main_task_id === formState.relatedMainTaskId,
  );

  if (!open) return null;

  function resetVariableDraft() {
    setVariableDraft(emptyVariableDraft);
    setVariableFormOpen(false);
  }

  function handleAddVariable() {
    const key = variableDraft.variableKey.trim();
    const label = variableDraft.label.trim();
    if (!key || !label) {
      return;
    }
    if (variables.some((v) => v.variableKey === key)) {
      // Silently skip duplicates instead of stacking the same key
      // twice in the queue. The dedupe protects the parent's POST
      // loop from a unique-constraint error.
      resetVariableDraft();
      return;
    }
    setVariables((current) => [
      ...current,
      { ...variableDraft, variableKey: key, label },
    ]);
    resetVariableDraft();
  }

  function handleRemoveVariable(key: string) {
    setVariables((current) => current.filter((v) => v.variableKey !== key));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add Formula</h2>
            <p className="text-xs text-gray-500">
              Create a new database-driven estimation formula.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-all duration-200 hover:rotate-90 hover:bg-gray-50 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ formula: formState, variables });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field
                label="Formula Key"
                placeholder="duration_surface_area"
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
                placeholder="Surface Area Duration"
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
                    formulaScope:
                      value as EstimationFormulaTemplatePayload["formulaScope"],
                    relatedSubTaskId: "",
                  }))
                }
                options={ESTIMATION_FORMULA_SCOPES.map((scope) => ({
                  value: scope,
                  label: scope,
                }))}
              />

              <Field
                label="Description"
                placeholder="Formula purpose"
                value={formState.description}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    description: value,
                  }))
                }
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
                  placeholder="base_hours + (surface_area / rate_per_hour) * multiplier"
                  className="mt-1 h-24 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                />
              </div>

              <SelectField
                label="Related Main Task"
                value={formState.relatedMainTaskId ?? ""}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    relatedMainTaskId: value,
                    relatedSubTaskId: "",
                  }))
                }
                options={mainTasks.map((task) => ({
                  value: task.main_task_id,
                  label: task.name,
                }))}
                placeholder="Select a main task"
              />

              {formState.formulaScope === "duration" ? (
                <SelectField
                  label="Related Rule"
                  value={formState.relatedSubTaskId ?? ""}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      relatedSubTaskId: value,
                    }))
                  }
                  options={filteredSubTasks.map((task) => ({
                    value: task.sub_task_id,
                    label: task.description,
                  }))}
                  placeholder={
                    formState.relatedMainTaskId
                      ? "Select a subtask"
                      : "Select a main task first"
                  }
                />
              ) : (
                <Field
                  label="Material Rule Label"
                  placeholder="Interior paint quantity"
                  value={formState.relatedRuleLabel ?? ""}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      relatedRuleLabel: value,
                    }))
                  }
                />
              )}

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
            </div>

            {/* Variables section. Admin queues variables here; they
                get POSTed by the parent after the formula creation
                returns with a formula_template_id. */}
            <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <VariableIcon className="h-3 w-3 text-blue-600" />
                    Variables
                    <span className="rounded-full bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700">
                      {variables.length}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Add variables that will be tied to this formula on save.
                  </p>
                </div>

                {!variableFormOpen ? (
                  <button
                    type="button"
                    onClick={() => setVariableFormOpen(true)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97]"
                  >
                    <Plus className="h-3 w-3" />
                    Add variable
                  </button>
                ) : null}
              </div>

              {variableFormOpen ? (
                <div className="mt-2 rounded-md border border-gray-200 bg-white p-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Variable Key"
                      placeholder="surface_area"
                      value={variableDraft.variableKey}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          variableKey: value,
                        }))
                      }
                    />
                    <Field
                      label="Label"
                      placeholder="Surface Area"
                      value={variableDraft.label}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          label: value,
                        }))
                      }
                    />

                    <SelectField
                      label="Data Type"
                      value={variableDraft.dataType}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          dataType: value as EstimationVariableDataType,
                        }))
                      }
                      options={ESTIMATION_VARIABLE_DATA_TYPES.map((type) => ({
                        value: type,
                        label: type,
                      }))}
                    />
                    <Field
                      label="Default Value"
                      placeholder="0"
                      value={variableDraft.defaultValue}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          defaultValue: value,
                        }))
                      }
                    />

                    <SelectField
                      label="Unit"
                      value={variableDraft.unit}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          unit: value,
                        }))
                      }
                      options={COMMON_UNITS.map((unit) => ({
                        value: unit,
                        label: unit,
                      }))}
                      placeholder="Select unit"
                    />
                    <SelectField
                      label="Required"
                      value={variableDraft.isRequired ? "true" : "false"}
                      onChange={(value) =>
                        setVariableDraft((current) => ({
                          ...current,
                          isRequired: value === "true",
                        }))
                      }
                      options={[
                        { value: "true", label: "Required" },
                        { value: "false", label: "Optional" },
                      ]}
                    />

                    <div className="sm:col-span-2">
                      <Field
                        label="Description"
                        placeholder="What this variable represents"
                        value={variableDraft.description}
                        onChange={(value) =>
                          setVariableDraft((current) => ({
                            ...current,
                            description: value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetVariableDraft}
                      className="h-8 rounded-md border border-gray-200 px-3 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddVariable}
                      disabled={
                        !variableDraft.variableKey.trim() ||
                        !variableDraft.label.trim()
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check className="h-3 w-3" />
                      Add to list
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 space-y-1.5">
                {variables.length > 0 ? (
                  variables.map((variable) => (
                    <div
                      key={variable.variableKey}
                      className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-gray-900">
                          {variable.label}
                        </p>
                        <p className="truncate text-[10px] text-gray-500">
                          {variable.variableKey} ({variable.dataType})
                          {variable.unit ? ` (${variable.unit})` : ""}
                          {variable.isRequired ? " (required)" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-medium text-gray-500">
                        {variable.defaultValue || "-"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveVariable(variable.variableKey)
                        }
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:-rotate-6 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                        aria-label={`Remove ${variable.label}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                ) : !variableFormOpen ? (
                  <p className="rounded-md border border-dashed border-gray-200 bg-white px-2 py-2 text-center text-[11px] text-gray-500">
                    No variables queued. Click "Add variable" to define one.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="border-t border-gray-100 px-4 py-3">
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-[11px] font-medium text-green-700">
                  Reminder
                </p>
                <p className="mt-0.5 text-xs text-green-800">
                  Variables used in the expression should also exist in
                  formula_variables. Queue them above so they save with the
                  formula in one go.
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 p-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-medium text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving..." : "Save Formula"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
