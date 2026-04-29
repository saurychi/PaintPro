"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";

import StaffPageShell from "@/components/staff/StaffPageShell";
import {
  getAttendancePrimaryDate,
  getAttendanceStatusLabel,
  type StaffAttendanceRecord,
  type StaffAttendanceStatus,
} from "@/lib/staff/attendance";
import { cn } from "@/lib/utils";

type AttendanceResponse = {
  records?: StaffAttendanceRecord[];
  error?: string;
  details?: string;
};

type StatusFilter = "ALL" | StaffAttendanceStatus;

const STATUS_META: Record<
  StaffAttendanceStatus,
  { label: string; pill: string; card: string }
> = {
  ASSIGNED: {
    label: "Assigned",
    pill: "border border-slate-400/25 bg-slate-500/[0.08] text-slate-900 dark:text-slate-300",
    card: "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/60",
  },
  UPCOMING: {
    label: "Upcoming",
    pill: "border border-sky-500/20 bg-sky-500/15 text-sky-950 dark:text-sky-300",
    card: "border-sky-500/25 bg-sky-500/[0.06] dark:bg-sky-500/[0.15] dark:border-sky-500/40",
  },
  IN_PROGRESS: {
    label: "In Progress",
    pill: "border border-amber-500/20 bg-amber-500/15 text-orange-950 dark:text-amber-300",
    card: "border-amber-500/25 bg-amber-500/[0.08] dark:bg-amber-500/[0.15] dark:border-amber-500/40",
  },
  COMPLETED: {
    label: "Completed",
    pill: "border border-green-500/20 bg-green-500/15 text-green-950 dark:text-green-300",
    card: "border-green-500/25 bg-green-500/[0.06] dark:bg-green-500/[0.15] dark:border-green-500/40",
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHours(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 10) / 10}h`;
}

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateIso(record: StaffAttendanceRecord) {
  const raw = getAttendancePrimaryDate(record);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

export default function StaffAttendanceReportPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [fromISO, setFromISO] = useState(() => toDateInputValue(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)));
  const [toISO, setToISO] = useState(() => toDateInputValue());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);

  const pageSize = 8;

  useEffect(() => {
    let alive = true;

    async function loadAttendance() {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch("/api/staff/attendance", {
          cache: "no-store",
        });
        const data = (await response.json()) as AttendanceResponse;

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load attendance records.",
          );
        }

        if (!alive) return;
        setRecords(Array.isArray(data.records) ? data.records : []);
      } catch (error) {
        if (!alive) return;
        console.error(error);
        setRecords([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load attendance records.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadAttendance();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const inRange = records.filter((record) => {
      const dateIso = getDateIso(record);
      if (fromISO && dateIso && dateIso < fromISO) return false;
      if (toISO && dateIso && dateIso > toISO) return false;
      return true;
    });

    const byStatus =
      status === "ALL" ? inRange : inRange.filter((record) => record.status === status);

    const bySearch = !normalizedQuery
      ? byStatus
      : byStatus.filter((record) => {
          const haystack = [
            record.projectCode,
            record.projectTitle,
            record.mainTaskName,
            record.subTaskName,
            record.siteAddress || "",
            getAttendanceStatusLabel(record.status),
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(normalizedQuery);
        });

    return bySearch;
  }, [fromISO, query, records, status, toISO]);

  const totals = useMemo(() => {
    const count = (targetStatus: StaffAttendanceStatus) =>
      filtered.filter((record) => record.status === targetStatus).length;

    return {
      assigned: count("ASSIGNED"),
      upcoming: count("UPCOMING"),
      inProgress: count("IN_PROGRESS"),
      completed: count("COMPLETED"),
    };
  }, [filtered]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length],
  );

  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  function goPrev() {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  function goNext() {
    setPage((currentPage) => Math.min(pageCount, currentPage + 1));
  }

  return (
    <StaffPageShell
      title="Attendance"
      subtitle="Track your task assignments, project schedule windows, and completion state."
      bodyClassName="overflow-y-auto pr-1"
    >
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col items-center gap-3">
        <div className="relative h-[42px] w-full max-w-md rounded-full border border-gray-200 bg-white">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="h-full w-full border-none bg-transparent px-3.5 pl-[34px] text-sm font-normal text-gray-900 outline-none"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search project or task..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Date range
            </div>
            <div className="flex items-center gap-2.5">
              <input
                className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
                type="date"
                value={fromISO}
                onChange={(event) => {
                  setFromISO(event.target.value);
                  setPage(1);
                }}
              />
              <span className="text-xs font-normal text-gray-400">to</span>
              <input
                className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
                type="date"
                value={toISO}
                onChange={(event) => {
                  setToISO(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
              <Filter className="h-3.5 w-3.5" />
              Status
            </div>
            <select
              className="h-9 min-w-[180px] rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="ALL">All</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>
      </div>
      <section className="grid grid-cols-1 gap-3 pb-1 min-[561px]:grid-cols-2 min-[1221px]:grid-cols-4">
        <div
          className={cn(
            "min-h-[88px] rounded-[14px] border bg-white p-3.5",
            STATUS_META.ASSIGNED.card,
          )}
        >
          <div className="text-xs font-medium text-gray-900/70 dark:text-gray-400">Assigned</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {totals.assigned}
          </div>
        </div>

        <div
          className={cn(
            "min-h-[88px] rounded-[14px] border bg-white p-3.5",
            STATUS_META.UPCOMING.card,
          )}
        >
          <div className="text-xs font-medium text-gray-900/70 dark:text-gray-400">Upcoming</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {totals.upcoming}
          </div>
        </div>

        <div
          className={cn(
            "min-h-[88px] rounded-[14px] border bg-white p-3.5",
            STATUS_META.IN_PROGRESS.card,
          )}
        >
          <div className="text-xs font-medium text-gray-900/70 dark:text-gray-400">In Progress</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {totals.inProgress}
          </div>
        </div>

        <div
          className={cn(
            "min-h-[88px] rounded-[14px] border bg-white p-3.5",
            STATUS_META.COMPLETED.card,
          )}
        >
          <div className="text-xs font-medium text-gray-900/70 dark:text-gray-400">Completed</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {totals.completed}
          </div>
        </div>
      </section>

      <section className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div className="text-sm font-semibold text-gray-900">
            Attendance Records
          </div>
          <div className="text-xs font-normal text-gray-500">
            Showing <b>{pageRows.length}</b> of <b>{filtered.length}</b>
          </div>
        </div>

        <div className="mt-2.5 overflow-hidden rounded-[14px] border border-gray-200 bg-white">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Loading attendance records...
            </div>
          ) : loadError ? (
            <div className="px-4 py-8 text-center">
              <div className="text-[15px] font-semibold text-red-700">
                Failed to load records
              </div>
              <div className="mt-1.5 text-[13px] font-normal text-gray-500">
                {loadError}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[1040px]">
                  <div className="grid grid-cols-[1.25fr_1.35fr_0.85fr_1.1fr_0.9fr_0.65fr] items-center border-b border-gray-200 px-3 py-3 text-xs font-medium tracking-[0.02em] text-gray-500">
                    <div className="min-w-0">PROJECT</div>
                    <div className="min-w-0">TASK</div>
                    <div>STATUS</div>
                    <div>SCHEDULE</div>
                    <div>PROJECT</div>
                    <div className="text-right">HOURS</div>
                  </div>

                  {pageRows.map((record) => {
                    const meta = STATUS_META[record.status];

                    return (
                      <div
                        key={record.id}
                        className="grid grid-cols-[1.25fr_1.35fr_0.85fr_1.1fr_0.9fr_0.65fr] items-center border-b border-slate-100 dark:border-gray-700 px-3 py-3.5 text-sm font-normal last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">
                            {record.projectTitle}
                          </div>
                          <div className="mt-1 truncate text-xs font-normal text-gray-500">
                            {record.projectCode}
                            {record.siteAddress ? ` / ${record.siteAddress}` : ""}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">
                            {record.mainTaskName}
                          </div>
                          <div className="mt-1 truncate text-xs font-normal text-gray-500">
                            {record.subTaskName}
                          </div>
                        </div>

                        <div>
                          <span
                            className={cn(
                              "inline-flex h-6 items-center justify-center rounded-full px-3 text-xs font-semibold tracking-[0.02em]",
                              meta.pill,
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="text-[13px] font-normal text-gray-700">
                          <div>{formatDateTime(record.scheduledStartDatetime)}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            to {formatDateTime(record.scheduledEndDatetime)}
                          </div>
                        </div>

                        <div className="text-[13px] font-normal text-gray-700">
                          <div className="truncate font-medium text-gray-900">
                            {record.projectStatus
                              ? record.projectStatus.replace(/_/g, " ")
                              : "--"}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            schedule {record.scheduleStatus
                              ? record.scheduleStatus.replace(/_/g, " ")
                              : "--"}
                          </div>
                        </div>

                        <div className="truncate text-right text-[13px] font-normal text-gray-700">
                          {formatHours(record.estimatedHours)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <div className="text-[15px] font-semibold text-gray-900">
                    No attendance records yet
                  </div>
                  <div className="mt-1.5 text-[13px] font-normal text-gray-500">
                    Your assignment and project schedule records will appear here once work is planned.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-3">
          <button
            className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={goPrev}
            disabled={safePage <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <div className="text-[13px] font-normal text-gray-700">
            Page <b>{safePage}</b> of <b>{pageCount}</b>
          </div>

          <button
            className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={goNext}
            disabled={safePage >= pageCount || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </StaffPageShell>
  );
}
