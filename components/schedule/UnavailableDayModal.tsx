"use client";

import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";

import { MANUAL_UNAVAILABLE_BLOCK_TYPES } from "@/lib/schedule/unavailableDayTypes";
// [TIME-SIM] -----------------------------------------------------------
// The modal's defaults pull from the simulated clock when sim is on, the
// real clock otherwise, via useProjectNow(). To revert this modal to
// real-time-only behavior, delete:
//   1. The `useProjectNow` import below
//   2. The two `dateToLocal...Input` helpers
//   3. The `useProjectNow()` call inside the component and the entire
//      `seedInitialValue(...)` wrapper that pulls from `now`
//   4. Then change `useState(seedInitialValue(initialValue, now))` back
//      to `useState(initialValue)`
// Every line involved is tagged [TIME-SIM].
import { useProjectNow } from "@/lib/time/useProjectNow";

// [TIME-SIM] Format a Date as "YYYY-MM-DDTHH:mm" using the user's local
// timezone — the shape <input type="datetime-local"> expects.
function dateToLocalDatetimeInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// [TIME-SIM] Format a Date as "YYYY-MM-DD" (local) for the date picker.
function dateToLocalDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// [TIME-SIM] Seed any empty fields in `initialValue` from the simulated/
// real clock. Existing values from the parent (e.g. an edit) win over
// `now`. The whole-day date input gets `now`'s date; the specific-time
// inputs get a datetime that combines the whole-day date (so the two
// modes stay aligned when the parent passed a calendar-context-menu
// date) with `now`'s time-of-day.
function seedInitialValue(
  initialValue: UnavailableDayFormValue,
  now: Date,
): UnavailableDayFormValue {
  const localToday = dateToLocalDateInput(now);

  // The anchor date for the time-bound inputs: prefer whatever date the
  // whole-day picker is showing (override date or today), so toggling
  // modes doesn't jump days.
  const anchorDateStr = initialValue.fullDayDate || localToday;
  const [year, monthOneBased, day] = anchorDateStr.split("-").map(Number);

  const anchorStart = new Date(
    year ?? now.getFullYear(),
    (monthOneBased ?? 1) - 1,
    day ?? 1,
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  const anchorEnd = new Date(anchorStart.getTime() + 2 * 60 * 60 * 1000);

  return {
    ...initialValue,
    fullDayDate: initialValue.fullDayDate || localToday,
    startDatetime:
      initialValue.startDatetime || dateToLocalDatetimeInput(anchorStart),
    endDatetime:
      initialValue.endDatetime || dateToLocalDatetimeInput(anchorEnd),
    multiDayStartDate: initialValue.multiDayStartDate || localToday,
    multiDayEndDate: initialValue.multiDayEndDate || localToday,
  };
}
// [/TIME-SIM] ----------------------------------------------------------

export type UnavailableDayBlockMode =
  | "full-day"
  | "specific-time"
  | "multi-day";

export type UnavailableDayFormValue = {
  blockMode: UnavailableDayBlockMode;
  // full-day: YYYY-MM-DD (one calendar day)
  fullDayDate: string;
  // specific-time: datetime-local strings ("YYYY-MM-DDTHH:mm")
  startDatetime: string;
  endDatetime: string;
  // multi-day: two YYYY-MM-DD strings; the server creates one full-day
  // block per calendar day in [multiDayStartDate, multiDayEndDate].
  multiDayStartDate: string;
  multiDayEndDate: string;
  reason: string;
  blockType: string;
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
  // [TIME-SIM] `now` reflects the simulated clock when sim is on, real
  // clock otherwise. Captured at mount so user edits don't get clobbered
  // if the sim time changes mid-edit; if the modal is keyed on `open` by
  // the parent, reopening will pick up a fresh `now`.
  const { now } = useProjectNow();

  const [form, setForm] = useState<UnavailableDayFormValue>(() =>
    // [TIME-SIM] Replace this whole call with `initialValue` to revert.
    seedInitialValue(initialValue, now),
  );

  if (!open) return null;

  function updateField<Key extends keyof UnavailableDayFormValue>(
    key: Key,
    value: UnavailableDayFormValue[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Specific-time mode: when the user changes the START's *date*, the
  // END's date follows along (its time-of-day is preserved). Changing the
  // END alone leaves the START untouched, so a user can deliberately
  // stretch the block across days.
  //
  // After the date-sync step, if END now falls on/before START (most
  // commonly because the user nudged START's TIME past END's), we push
  // END forward by the original duration (or 2h fallback). This keeps
  // the form valid and prevents the silent "value must be X or later"
  // error state that's easy to miss across an AM/PM boundary.
  function handleStartDatetimeChange(nextValue: string) {
    setForm((current) => {
      const oldDate = current.startDatetime.slice(0, 10);
      const newDate = nextValue.slice(0, 10);

      let nextEnd = current.endDatetime;

      // Step 1: date-sync (start.date → end.date), preserving end's HH:mm.
      if (
        newDate &&
        newDate !== oldDate &&
        current.endDatetime &&
        current.endDatetime.length >= 16
      ) {
        const endTime = current.endDatetime.slice(11);
        nextEnd = `${newDate}T${endTime}`;
      }

      // Step 2: ensure end > start. If not, bump end by the prior
      // duration — falling back to a 2-hour block.
      if (nextValue && nextEnd && nextEnd <= nextValue) {
        const oldStartMs = new Date(current.startDatetime).getTime();
        const oldEndMs = new Date(current.endDatetime).getTime();
        const fallbackMs = 2 * 60 * 60 * 1000;
        const durationMs =
          Number.isFinite(oldStartMs) &&
          Number.isFinite(oldEndMs) &&
          oldEndMs > oldStartMs
            ? oldEndMs - oldStartMs
            : fallbackMs;

        const startMs = new Date(nextValue).getTime();
        if (Number.isFinite(startMs)) {
          const bumped = new Date(startMs + durationMs);
          const yyyy = bumped.getFullYear();
          const mm = String(bumped.getMonth() + 1).padStart(2, "0");
          const dd = String(bumped.getDate()).padStart(2, "0");
          const hh = String(bumped.getHours()).padStart(2, "0");
          const mi = String(bumped.getMinutes()).padStart(2, "0");
          nextEnd = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
        }
      }

      return {
        ...current,
        startDatetime: nextValue,
        endDatetime: nextEnd,
      };
    });
  }

  // Multi-day mode mirrors the specific-time sync: changing the START
  // date sets the END date to match (single-day default). The user only
  // adjusts the END to actually create a range — prevents the easy bug
  // where the END is still defaulted to today and submitting creates an
  // accidental month-long block.
  function handleMultiDayStartDateChange(nextValue: string) {
    setForm((current) => ({
      ...current,
      multiDayStartDate: nextValue,
      multiDayEndDate: nextValue,
    }));
  }

  function handleSubmit() {
    onSubmit(form);
  }

  const primaryActionLabel = mode === "edit" ? "Save changes" : "Create block";

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
                    ? "Create unavailable block"
                    : "Edit unavailable block"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Block a whole day or a specific time range from scheduling.
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
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              Block mode
            </label>
            <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { id: "full-day", label: "Whole day" },
                  { id: "specific-time", label: "Specific time" },
                  // Multi-day creates one full-day row per calendar day in
                  // the picked range. In edit mode, picking this option
                  // replaces the single row being edited with N new rows
                  // (handled in the parent's save handler via DELETE+POST).
                  { id: "multi-day", label: "Multiple days" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateField("blockMode", option.id)}
                  className={[
                    "inline-flex h-9 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition sm:px-3 sm:text-sm",
                    form.blockMode === option.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {form.blockMode === "full-day" ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                Date
              </label>
              <input
                type="date"
                value={form.fullDayDate}
                onChange={(event) =>
                  updateField("fullDayDate", event.target.value)
                }
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                required
              />
            </div>
          ) : form.blockMode === "specific-time" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Starts at
                </label>
                <input
                  type="datetime-local"
                  value={form.startDatetime}
                  onChange={(event) =>
                    handleStartDatetimeChange(event.target.value)
                  }
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Ends at
                </label>
                <input
                  type="datetime-local"
                  value={form.endDatetime}
                  min={form.startDatetime || undefined}
                  onChange={(event) =>
                    updateField("endDatetime", event.target.value)
                  }
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Start date
                </label>
                <input
                  type="date"
                  value={form.multiDayStartDate}
                  onChange={(event) =>
                    handleMultiDayStartDateChange(event.target.value)
                  }
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  End date
                </label>
                <input
                  type="date"
                  value={form.multiDayEndDate}
                  min={form.multiDayStartDate || undefined}
                  onChange={(event) =>
                    updateField("multiDayEndDate", event.target.value)
                  }
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
                  required
                />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              Type
            </label>
            <select
              value={form.blockType}
              onChange={(event) => updateField("blockType", event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/15"
            >
              {MANUAL_UNAVAILABLE_BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

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
