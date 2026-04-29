"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import {
  type EstimationFormulaTemplatePayload,
  ESTIMATION_FORMULA_SCOPES,
} from "@/lib/estimationSettings";

type AddFormulaModalProps = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: EstimationFormulaTemplatePayload) => void;
};

const initialState: EstimationFormulaTemplatePayload = {
  formulaKey: "",
  name: "",
  description: "",
  formulaScope: "duration",
  formulaExpression: "",
  isActive: true,
};

export default function AddFormulaModal({
  open,
  saving,
  onClose,
  onSubmit,
}: AddFormulaModalProps) {
  const [formState, setFormState] =
    useState<EstimationFormulaTemplatePayload>(initialState);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add Formula</h2>
            <p className="text-xs text-gray-500">
              Create a new database-driven estimation formula.
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
                  formulaScope: value as EstimationFormulaTemplatePayload["formulaScope"],
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
                className="mt-1 h-24 w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
              />
            </div>

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

            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-[11px] font-medium text-green-700">Reminder</p>
              <p className="mt-0.5 text-xs text-green-800">
                Variables used in the expression should also exist in
                formula_variables.
              </p>
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
