"use client";

import {
  CalendarDays,
  Clock,
  Loader2,
  Pencil,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";

type UnavailableBlockDetailModalProps = {
  open: boolean;
  block: ScheduleUnavailableDay | null;
  deleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  company_blackout: "Company blackout",
  manual_block: "Manual block",
  maintenance: "Maintenance",
  holiday: "Holiday",
  other: "Other",
};

function formatDateOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// A read-only modal that surfaces a single unavailable_days row's
// details and exposes the two actions the user can take on it: open
// the edit modal (parent re-uses the create/edit flow), or delete the
// row outright. Holidays from the Nager.at sync are read-only — we
// hide both action buttons in that case.
export default function UnavailableBlockDetailModal({
  open,
  block,
  deleting,
  onClose,
  onEdit,
  onDelete,
}: UnavailableBlockDetailModalProps) {
  if (!open || !block) return null;

  const startDateKey = block.blockedStartDatetime.slice(0, 10);
  const endDateKey = block.blockedEndDatetime.slice(0, 10);
  const spansMultipleDays = startDateKey !== endDateKey;

  // Decide which "shape" line to show: full-day chip, specific-time
  // window, or a date-range chip for blocks that cross a calendar
  // boundary.
  let timingLabel: string;
  let timingDetail: string | null = null;
  if (block.isFullDay) {
    timingLabel = "Whole day";
    timingDetail = formatDateOnly(block.blockedStartDatetime);
  } else if (spansMultipleDays) {
    timingLabel = "Date range";
    timingDetail = `${formatDateTime(block.blockedStartDatetime)} → ${formatDateTime(block.blockedEndDatetime)}`;
  } else {
    timingLabel = "Specific time";
    timingDetail = `${formatDateOnly(block.blockedStartDatetime)} · ${formatTimeOnly(block.blockedStartDatetime)} – ${formatTimeOnly(block.blockedEndDatetime)}`;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1 w-full bg-[#00c065]" />

        <div className="border-b border-gray-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-[#00c065] dark:bg-emerald-500/15">
                <CalendarDays className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  Unavailable block
                </h2>
                <p className="mt-1 truncate text-sm text-gray-500 dark:text-slate-400">
                  {block.reason}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              {timingLabel}
            </div>
            {timingDetail ? (
              <p className="text-sm text-gray-800 dark:text-slate-200">
                {timingDetail}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">
              <Tag className="h-3.5 w-3.5" />
              Type
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType}
            </span>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">
              <CalendarDays className="h-3.5 w-3.5" />
              Reason
            </div>
            <p className="text-sm text-gray-800 dark:text-slate-200">
              {block.reason}
            </p>
          </div>
        </div>

        <div className="flex justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>

          {block.isEditable ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Pencil className="h-4 w-4" />
                Update
              </button>
            </div>
          ) : (
            <span className="inline-flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
              Read only
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
