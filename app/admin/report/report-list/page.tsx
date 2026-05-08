"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PhilippinePeso,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  getReportProjects,
  type ReportProjectRow,
} from "@/lib/data/reports.repo";

type ReportView = "weekly" | "monthly" | "yearly";
type SortKey =
  | "updated_desc"
  | "updated_asc"
  | "title_asc"
  | "title_desc"
  | "budget_desc"
  | "profit_desc";

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20";

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]";

const sectionHeader =
  "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70";

const inputBase =
  "h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100";

const iconButton =
  "grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-gray-500 transition-all duration-200 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100";

const hiddenReportStatuses = new Set([
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
]);

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getWeekRange(today: Date) {
  const d = startOfDay(today);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;

  const start = new Date(d);
  start.setDate(d.getDate() - diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end: endOfDay(end) };
}

function getMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return { start, end: endOfDay(end) };
}

function getYearRange(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);

  return { start, end: endOfDay(end) };
}

function getRange(view: ReportView, today: Date) {
  if (view === "weekly") return getWeekRange(today);
  if (view === "yearly") return getYearRange(today);

  return getMonthRange(today);
}

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${fmt.format(start)} to ${fmt.format(end)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function titleCaseStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(status: string) {
  const normalizedStatus = normalizeStatus(status);
  const labels: Record<string, string> = {
    main_task_pending: "Main Task Pending",
    sub_task_pending: "Sub Task Pending",
    materials_pending: "Materials Pending",
    equipment_pending: "Equipment Pending",
    schedule_pending: "Schedule Pending",
    employee_assignment_pending: "Employee Assignment Pending",
    cost_estimation_pending: "Cost Estimation Pending",
    overview_pending: "Overview Pending",
    quotation_pending: "Quotation Pending",
    client_quotation_done: "Client Signed Quotation",
    invoice_agreement_pending: "Invoice Agreement Pending",
    invoice_pending: "Invoice Pending",
    payment_pending: "Payment Pending",
    ready_to_start: "Ready to Start",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[normalizedStatus] ?? titleCaseStatus(normalizedStatus);
}

function statusBadgeClass(status: string) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300";
  }

  if (normalizedStatus === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300";
  }

  if (normalizedStatus === "ready_to_start") {
    return "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300";
  }

  if (normalizedStatus === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300";
  }

  if (
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("quotation") ||
    normalizedStatus.includes("invoice") ||
    normalizedStatus.includes("payment")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300";
  }

  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300";
}


export default function ReportListPage() {
  const router = useRouter();
  const [view, setView] = useState<ReportView>("monthly");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [projects, setProjects] = useState<ReportProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function openProjectDetail(project: ReportProjectRow) {
    router.push(
      `/admin/report/report-list/${encodeURIComponent(project.projectId)}`,
    );
  }

  const today = useMemo(() => new Date(), []);
  const range = useMemo(() => getRange(view, today), [view, today]);
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end],
  );

  useEffect(() => {
    if (hiddenReportStatuses.has(normalizeStatus(statusFilter))) {
      setStatusFilter("all");
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoading(true);
      setLoadError(null);

      try {
        const rows = await getReportProjects({
          rangeStartISO: range.start.toISOString(),
          rangeEndISO: range.end.toISOString(),
          status: statusFilter,
          sort: sortKey,
        });

        if (!cancelled) {
          setProjects(rows);
        }
      } catch (error: any) {
        if (!cancelled) {
          setProjects([]);
          setLoadError(error?.message ?? "Failed to load project reports");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, statusFilter, sortKey]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();

    return projects.filter((project) => {
      const status = normalizeStatus(project.status);

      if (hiddenReportStatuses.has(status)) {
        return false;
      }

      if (!q) {
        return true;
      }

      return `${project.projectCode} ${project.title} ${project.clientName} ${project.siteAddress} ${statusLabel(project.status)}`
        .toLowerCase()
        .includes(q);
    });
  }, [projects, query]);

  const totals = useMemo(() => {
    return filteredProjects.reduce(
      (sum, project) => {
        sum.budget += project.estimatedBudget;
        sum.cost += project.estimatedCost;
        sum.profit += project.estimatedProfit;

        return sum;
      },
      {
        budget: 0,
        cost: 0,
        profit: 0,
      },
    );
  }, [filteredProjects]);

  return (
    <div className="min-h-full bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <Link
              href="/admin/report"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
            >
              <ChevronLeft className="h-4 w-4" />
              Report
            </Link>
            <span className="text-gray-400 dark:text-slate-500">/</span>
            <span className="text-gray-900 dark:text-slate-100">
              Project List
            </span>
          </div>

          <h1 className="text-[20px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Project Report List
          </h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Review project records, financial estimates, schedules, and progress
            status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ReportView)}
            className={inputBase}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <Link
            href="/admin/report"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"
          >
            Overview
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Projects
            </div>
            <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-slate-100">
              {loading ? "—" : filteredProjects.length}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Matching projects in selected range
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <PhilippinePeso className="h-4 w-4" />
              Total Budget
            </div>
            <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-slate-100">
              {loading ? "—" : currency(totals.budget)}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Combined estimated project budget
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <PhilippinePeso className="h-4 w-4" />
              Estimated Profit
            </div>
            <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-slate-100">
              {loading ? "—" : currency(totals.profit)}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Revenue estimate less estimated cost
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20">
        <div className="-mx-px -mt-px h-1 rounded-t-xl bg-[#00c065]" />
        <div className={sectionHeader}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                Projects
              </div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                Range: <span className="font-semibold">{rangeText}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects, clients, locations"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400 sm:w-[330px]"
                />
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={[
                    "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]",
                    filtersOpen || statusFilter !== "all" || sortKey !== "updated_desc"
                      ? "border-[#00c065]/40 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/40 dark:bg-[#00c065]/15 dark:text-emerald-300"
                      : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700",
                  ].join(" ")}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {(statusFilter !== "all" || sortKey !== "updated_desc") && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#00c065] px-1 text-[10px] font-bold text-white">
                      {(statusFilter !== "all" ? 1 : 0) +
                        (sortKey !== "updated_desc" ? 1 : 0)}
                    </span>
                  )}
                  <ChevronDown
                    className={[
                      "h-4 w-4 transition-transform",
                      filtersOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {filtersOpen && (
                  <div className="absolute right-0 top-11 z-[80] w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-slate-700/70">
                      <div>
                        <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                          Filter Projects
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          Refine the report list results.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className={iconButton}
                        aria-label="Close filters"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">
                          Status
                        </span>
                        <div className="relative">
                          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-xs font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            <option value="all">All statuses</option>
                            <option value="quotation_pending">Quotation Pending</option>
                            <option value="client_quotation_done">
                              Client Signed Quotation
                            </option>
                            <option value="invoice_agreement_pending">
                              Invoice Agreement Pending
                            </option>
                            <option value="invoice_pending">Invoice Pending</option>
                            <option value="payment_pending">Payment Pending</option>
                            <option value="ready_to_start">Ready to Start</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                        </div>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">
                          Sort by
                        </span>
                        <div className="relative">
                          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                          <select
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                            className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-xs font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            <option value="updated_desc">Latest Updated</option>
                            <option value="updated_asc">Oldest Updated</option>
                            <option value="title_asc">Title A-Z</option>
                            <option value="title_desc">Title Z-A</option>
                            <option value="budget_desc">Highest Budget</option>
                            <option value="profit_desc">Highest Profit</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-slate-700/70">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("all");
                          setSortKey("updated_desc");
                        }}
                        className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className="inline-flex h-8 items-center rounded-lg bg-[#00c065] px-3 text-xs font-semibold text-white transition hover:bg-[#00a054]"
                      >
                        Apply filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-b-xl">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>

            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:border-slate-700/70 dark:bg-slate-900/35 dark:text-slate-400">
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">
                  Project Code
                </th>
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Project</th>
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Client</th>
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Start</th>
                <th className="px-4 py-3 text-left align-middle whitespace-nowrap">End</th>
                <th className="py-3 pl-4 pr-6 text-right align-middle whitespace-nowrap">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {filteredProjects.map((project) => (
                <tr
                  key={project.projectId}
                  role="button"
                  tabIndex={0}
                  onClick={() => openProjectDetail(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProjectDetail(project);
                    }
                  }}
                  className="cursor-pointer text-xs transition hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-slate-700/60 dark:focus-visible:bg-slate-700/60"
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="whitespace-nowrap font-semibold text-gray-950 dark:text-slate-100">
                      {project.projectCode}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div
                      className="truncate font-semibold text-gray-950 dark:text-slate-100"
                      title={project.title}
                    >
                      {project.title}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div
                      className="truncate text-gray-700 dark:text-slate-300"
                      title={project.clientName}
                    >
                      {project.clientName}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <span
                      className={[
                        "inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                        statusBadgeClass(project.status),
                      ].join(" ")}
                    >
                      <span className="truncate">
                        {statusLabel(project.status)}
                      </span>
                    </span>
                  </td>

                  <td className="px-4 py-3 align-middle whitespace-nowrap text-xs leading-5 text-gray-700 dark:text-slate-300">
                    {formatDateTime(project.startDatetime)}
                  </td>

                  <td className="px-4 py-3 align-middle whitespace-nowrap text-xs leading-5 text-gray-700 dark:text-slate-300">
                    {formatDateTime(project.endDatetime)}
                  </td>

                  <td className="py-3 pl-4 pr-6 text-right align-middle">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openProjectDetail(project);
                      }}
                      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-[#00c065]/25 bg-[#00c065]/10 px-2.5 text-xs font-semibold text-[#047857] transition-colors hover:border-[#00c065]/40 hover:bg-[#00c065]/15 dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/20">
                      See more
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading project reports...
            </div>
          )}

          {!loading && loadError && (
            <div className="px-4 py-12 text-center">
              <div className="text-xs font-semibold text-red-600 dark:text-red-300">
                Failed to load project reports
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                {loadError}
              </div>
            </div>
          )}

          {!loading && !loadError && filteredProjects.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gray-50 dark:bg-slate-700">
                <CalendarDays className="h-5 w-5 text-gray-400 dark:text-slate-400" />
              </div>
              <div className="mt-3 text-xs font-semibold text-gray-950 dark:text-slate-100">
                No matching projects
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Try changing the search, status filter, sort option, or report
                range.
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
