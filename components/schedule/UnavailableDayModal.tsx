"use client";

import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";

import { MANUAL_UNAVAILABLE_BLOCK_TYPES } from "@/lib/schedule/unavailableDayTypes";

export type UnavailableDayFormValue = {
  blockedDate: string;
  startDate: string;
  endDate: string;
  reason: string;
  blockType: string;
  notes: string;
};

type UnavailableDayModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValue: UnavailableDayFormValue;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: UnavailableDayFormValue) => void;
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  company_blackout: "Company blackout",
  manual_block: "Manual block",
  maintenance: "Maintenance",
  other: "Other",
};

export default function UnavailableDayModal({
  open,
  mode,
  initialValue,
  saving,
  onClose,
  onSubmit,
}: UnavailableDayModalProps) {
  const [form, setForm] = useState<UnavailableDayFormValue>(initialValue);
  const [dateMode, setDateMode] = useState<"single" | "range">(
    initialValue.startDate &&
      initialValue.endDate &&
      initialValue.startDate !== initialValue.endDate
      ? "range"
      : "single",
  );

  if (!open) return null;

  function updateField<Key extends keyof UnavailableDayFormValue>(
    key: Key,
    value: UnavailableDayFormValue[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (mode === "create") {
      const blockedDate = dateMode === "single" ? form.blockedDate : form.startDate;
      const startDate =
        dateMode === "single" ? form.blockedDate : form.startDate;
      const endDate = dateMode === "single" ? form.blockedDate : form.endDate;

      onSubmit({
        ...form,
        blockedDate,
        startDate,
        endDate,
      });
      return;
    }

    onSubmit(form);
  }

  const primaryActionLabel =
    mode === "edit"
      ? "Save changes"
      : dateMode === "single"
        ? "Create day"
        : "Create days";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1 w-full bg-[#00c065]" />

        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-[#00c065]">
                <CalendarDays className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900">
                  {mode === "create"
                    ? "Create unavailable days"
                    : "Edit unavailable day"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {mode === "create"
                    ? "Block a single date or a whole date range from scheduling."
                    : "Update this blocked scheduling date."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="grid gap-4 px-5 py-4"
        >
          {mode === "create" ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                Date mode
              </label>
              <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDateMode("single");
                    setForm((current) => ({
                      ...current,
                      startDate: current.blockedDate || current.startDate,
                      endDate: current.blockedDate || current.endDate,
                    }));
                  }}
                  className={[
                    "inline-flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition sm:flex-none",
                    dateMode === "single"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900",
                  ].join(" ")}
                >
                  One date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode("range");
                    setForm((current) => ({
                      ...current,
                      startDate: current.startDate || current.blockedDate,
                      endDate:
                        current.endDate ||
                        current.startDate ||
                        current.blockedDate,
                    }));
                  }}
                  className={[
                    "inline-flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition sm:flex-none",
                    dateMode === "range"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900",
                  ].join(" ")}
                >
                  Multiple dates
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                {mode === "create"
                  ? dateMode === "single"
                    ? "Date"
                    : "Start date"
                  : "Date"}
              </label>
              <input
                type="date"
                value={
                  mode === "create"
                    ? dateMode === "single"
                      ? form.blockedDate
                      : form.startDate
                    : form.blockedDate
                }
                onChange={(event) =>
                  mode === "create"
                    ? dateMode === "single"
                      ? updateField("blockedDate", event.target.value)
                      : updateField("startDate", event.target.value)
                    : updateField("blockedDate", event.target.value)
                }
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                required
              />
            </div>

            <div className="grid gap-1.5">
              {mode === "create" && dateMode === "range" ? (
                <>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    End date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(event) =>
                      updateField("endDate", event.target.value)
                    }
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                    required
                  />
                </>
              ) : (
                <>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Type
                  </label>
                  <select
                    value={form.blockType}
                    onChange={(event) =>
                      updateField("blockType", event.target.value)
                    }
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                  >
                    {MANUAL_UNAVAILABLE_BLOCK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {BLOCK_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {mode === "create" && dateMode === "range" ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                Type
              </label>
              <select
                value={form.blockType}
                onChange={(event) =>
                  updateField("blockType", event.target.value)
                }
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
              >
                {MANUAL_UNAVAILABLE_BLOCK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {BLOCK_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              Reason
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={(event) => updateField("reason", event.target.value)}
              placeholder="Company meeting, warehouse shutdown, site access..."
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={4}
              placeholder="Optional context for why this day should stay blocked."
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 min-w-[132px] items-center justify-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryActionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
