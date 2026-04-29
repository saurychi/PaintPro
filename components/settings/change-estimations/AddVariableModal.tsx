"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";

import {
  type EstimationFormulaTemplate,
  type EstimationFormulaVariable,
  type EstimationFormulaVariablePayload,
  ESTIMATION_VARIABLE_DATA_TYPES,
} from "@/lib/estimationSettings";

type AddVariableModalProps = {
  open: boolean;
  mode: "add" | "edit";
  variable: EstimationFormulaVariable | null;
  formulas: EstimationFormulaTemplate[];
  defaultFormulaTemplateId: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: EstimationFormulaVariablePayload) => void;
};

function buildInitialState(
  mode: "add" | "edit",
  variable: EstimationFormulaVariable | null,
  defaultFormulaTemplateId: string | null,
): EstimationFormulaVariablePayload {
  if (mode === "edit" && variable) {
    return {
      formulaTemplateId: variable.formula_template_id,
      variableKey: variable.variable_key,
      label: variable.label,
      description: variable.description,
      dataType: variable.data_type,
      defaultValue: variable.default_value,
      unit: variable.unit,
      isRequired: variable.is_required,
    };
  }

  return {
    formulaTemplateId: defaultFormulaTemplateId ?? "",
    variableKey: "",
    label: "",
    description: "",
    dataType: "number",
    defaultValue: "",
    unit: "",
    isRequired: true,
  };
}

export default function AddVariableModal({
  open,
  mode,
  variable,
  formulas,
  defaultFormulaTemplateId,
  saving,
  onClose,
  onSubmit,
}: AddVariableModalProps) {
  const [formState, setFormState] = useState<EstimationFormulaVariablePayload>(
    buildInitialState(mode, variable, defaultFormulaTemplateId),
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {mode === "edit" ? "Edit Variable" : "Add Variable"}
            </h2>
            <p className="text-xs text-gray-500">
              Add or update the default values used in formula expressions.
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
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-gray-600">
                Formula Template
              </label>
              <select
                value={formState.formulaTemplateId}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    formulaTemplateId: event.target.value,
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
              >
                <option value="">Select a formula</option>
                {formulas.map((formula) => (
                  <option
                    key={formula.formula_template_id}
                    value={formula.formula_template_id}
                  >
                    {formula.name} ({formula.formula_key})
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Variable Key"
              placeholder="rate_per_hour"
              value={formState.variableKey}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  variableKey: value,
                }))
              }
            />
            <Field
              label="Label"
              placeholder="Rate Per Hour"
              value={formState.label}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  label: value,
                }))
              }
            />
            <Field
              label="Default Value"
              placeholder="80"
              value={formState.defaultValue}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  defaultValue: value,
                }))
              }
            />
            <Field
              label="Unit"
              placeholder="m2/hour"
              value={formState.unit}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  unit: value,
                }))
              }
            />

            <SelectField
              label="Data Type"
              value={formState.dataType}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  dataType: value as EstimationFormulaVariablePayload["dataType"],
                }))
              }
              options={ESTIMATION_VARIABLE_DATA_TYPES.map((dataType) => ({
                value: dataType,
                label: dataType,
              }))}
            />

            <SelectField
              label="Required"
              value={formState.isRequired ? "true" : "false"}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  isRequired: value === "true",
                }))
              }
              options={[
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]}
            />

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
                placeholder="Explain how this variable affects the formula."
                className="mt-1 h-20 w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
              />
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
              ) : mode === "edit" ? (
                <Pencil className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {saving
                ? "Saving..."
                : mode === "edit"
                  ? "Save Changes"
                  : "Save Variable"}
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
