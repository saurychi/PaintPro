"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getProjectRoute as resolveProjectRoute,
  normalizeProjectStatus,
  type ProjectStatusKey,
} from "@/lib/planning/projectRoute";
// --- SIMULATED TIME (testing only) ---------------------------------------
// The `useProjectNow` hook returns the simulated reference time when one is
// configured, otherwise the real `new Date()`. To remove the simulation
// integration, delete this import and replace `projectNow.getTime()` below
// with `Date.now()`.
import { useProjectNow } from "@/lib/time/useProjectNow";
// -------------------------------------------------------------------------

const ACCENT = "#00c065";

type RawProject = {
  id: string;
  title: string;
  projectCode?: string | null;
  project_code?: string | null;
  status?: string | null;
  rawStatus?: string | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
};

type ProjectsResponse = {
  projects?: RawProject[];
  error?: string;
};

type StatusKey = ProjectStatusKey;

// Drives both the filter popover ordering and the row sort order below
// so a project flagged "main_task_pending" lands above "in_progress",
// which lands above "completed". Mirrors the wizard's forward flow.
const STATUS_ORDER: StatusKey[] = [
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "quotation_pending",
  "grant_access_quotation",
  "client_quotation_done",
  "downpayment_pending",
  "ready_to_start",
  "in_progress",
  "review_pending",
  "invoice_pending",
  "invoice_agreement_pending",
  "invoice_signed",
  "payment_pending",
  "employee_management_pending",
  "conclude_job_pending",
  "completed",
  "cancelled",
];

type StatusMeta = {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
};

const STATUS_META: Record<StatusKey, StatusMeta> = {
  main_task_pending: {
    label: "Main Task Pending",
    badgeBg: "#fefce8",
    badgeBorder: "#fde68a",
    badgeColor: "#854d0e",
  },
  sub_task_pending: {
    label: "Sub Task Pending",
    badgeBg: "#fefce8",
    badgeBorder: "#fde68a",
    badgeColor: "#854d0e",
  },
  materials_pending: {
    label: "Materials Pending",
    badgeBg: "#eff6ff",
    badgeBorder: "#bfdbfe",
    badgeColor: "#1d4ed8",
  },
  equipment_pending: {
    label: "Equipment Pending",
    badgeBg: "#eff6ff",
    badgeBorder: "#bfdbfe",
    badgeColor: "#1d4ed8",
  },
  schedule_pending: {
    label: "Schedule Pending",
    badgeBg: "#f5f3ff",
    badgeBorder: "#ddd6fe",
    badgeColor: "#6d28d9",
  },
  employee_assignment_pending: {
    label: "Employee Assignment Pending",
    badgeBg: "#fdf2f8",
    badgeBorder: "#fbcfe8",
    badgeColor: "#be185d",
  },
  cost_estimation_pending: {
    label: "Cost Estimation Pending",
    badgeBg: "#fff7ed",
    badgeBorder: "#fed7aa",
    badgeColor: "#c2410c",
  },
  overview_pending: {
    label: "Overview Pending",
    badgeBg: "#ecfeff",
    badgeBorder: "#a5f3fc",
    badgeColor: "#0f766e",
  },
  quotation_pending: {
    label: "Quotation Pending",
    badgeBg: "#f0fdf4",
    badgeBorder: "#bbf7d0",
    badgeColor: "#15803d",
  },
  grant_access_quotation: {
    label: "Awaiting Client Signature",
    badgeBg: "#fffbeb",
    badgeBorder: "#fde68a",
    badgeColor: "#92400e",
  },
  client_quotation_done: {
    label: "Client Signed Quotation",
    badgeBg: "#ecfdf5",
    badgeBorder: "#a7f3d0",
    badgeColor: "#047857",
  },
  downpayment_pending: {
    label: "Downpayment Pending",
    badgeBg: "#fff7ed",
    badgeBorder: "#fed7aa",
    badgeColor: "#c2410c",
  },
  ready_to_start: {
    label: "Ready to Start",
    badgeBg: "#dcfce7",
    badgeBorder: "#86efac",
    badgeColor: "#166534",
  },
  in_progress: {
    label: "In Progress",
    badgeBg: "#dbeafe",
    badgeBorder: "#93c5fd",
    badgeColor: "#1d4ed8",
  },
  review_pending: {
    label: "Review Pending",
    badgeBg: "#ecfeff",
    badgeBorder: "#a5f3fc",
    badgeColor: "#0f766e",
  },
  invoice_pending: {
    label: "Invoice Pending",
    badgeBg: "#eef2ff",
    badgeBorder: "#c7d2fe",
    badgeColor: "#4338ca",
  },
  invoice_agreement_pending: {
    label: "Invoice Agreement Pending",
    badgeBg: "#eef2ff",
    badgeBorder: "#c7d2fe",
    badgeColor: "#4338ca",
  },
  invoice_signed: {
    label: "Invoice Signed",
    badgeBg: "#ecfeff",
    badgeBorder: "#a5f3fc",
    badgeColor: "#0e7490",
  },
  payment_pending: {
    label: "Payment Pending",
    badgeBg: "#fff7ed",
    badgeBorder: "#fed7aa",
    badgeColor: "#c2410c",
  },
  employee_management_pending: {
    label: "Employee Management Pending",
    badgeBg: "#fdf2f8",
    badgeBorder: "#fbcfe8",
    badgeColor: "#be185d",
  },
  conclude_job_pending: {
    label: "Conclude Job Pending",
    badgeBg: "#fef3c7",
    badgeBorder: "#fcd34d",
    badgeColor: "#92400e",
  },
  completed: {
    label: "Completed",
    badgeBg: "#ecfdf5",
    badgeBorder: "#a7f3d0",
    badgeColor: "#047857",
  },
  cancelled: {
    label: "Cancelled",
    badgeBg: "#f3f4f6",
    badgeBorder: "#d1d5db",
    badgeColor: "#4b5563",
  },
};

const normalizeStatus = normalizeProjectStatus;
const getProjectRoute = resolveProjectRoute;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminProjectsPage() {
  const router = useRouter();
  // --- SIMULATED TIME (testing only) -----------------------------------
  // Drives the date filter from the simulated clock when one is set in
  // settings. To remove: delete this line and the import above, and use
  // `Date.now()` in place of `projectNow.getTime()` in the filter memo.
  const { now: projectNow } = useProjectNow();
  // ---------------------------------------------------------------------
  const [projects, setProjects] = useState<RawProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "week" | "month" | "year">(
    "all",
  );
  // Multi-select status filter. Empty set = no status restriction so
  // every project passes the gate. The popover renders the same order
  // as STATUS_ORDER for predictability.
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(
    () => new Set(),
  );
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);

  // Close the status popover when the user clicks outside of it. Without
  // this the popover sticks open after picking statuses and tapping the
  // page background, which feels broken.
  useEffect(() => {
    if (!statusFilterOpen) return;
    const onDown = (event: MouseEvent) => {
      const node = statusFilterRef.current;
      if (!node) return;
      if (!node.contains(event.target as Node)) {
        setStatusFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [statusFilterOpen]);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/projects/list", {
        cache: "no-store",
      });
      const data = (await response.json()) as ProjectsResponse;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load projects.");
      }

      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(err instanceof Error ? err.message : "Failed to load projects.");
      setProjects([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadProjects();
      toast.success("Projects refreshed.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to refresh projects.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function toggleStatusFilter(status: StatusKey) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let cutoff: number | null = null;
    if (dateFilter !== "all") {
      // --- SIMULATED TIME (testing only) --------------------------------
      // Anchor the rolling window to the simulated clock when one is set,
      // otherwise to the real wall clock. To remove simulation, swap
      // `projectNow.getTime()` for `Date.now()`.
      const now = new Date(projectNow.getTime());
      // ------------------------------------------------------------------
      const start = new Date(now);
      if (dateFilter === "week") start.setDate(now.getDate() - 7);
      else if (dateFilter === "month") start.setMonth(now.getMonth() - 1);
      else if (dateFilter === "year") start.setFullYear(now.getFullYear() - 1);
      cutoff = start.getTime();
    }

    const hasStatusFilter = statusFilter.size > 0;

    return projects
      .filter((project) => {
        const key = normalizeStatus(project.rawStatus || project.status);

        // Projects whose status doesn't map to a known wizard step are
        // skipped entirely. There's no row template for them and no
        // sensible Open route either.
        if (key === "unknown") return false;

        if (hasStatusFilter && !statusFilter.has(key as StatusKey)) {
          return false;
        }

        if (query) {
          const code = (
            project.projectCode ||
            project.project_code ||
            ""
          ).toLowerCase();
          const title = (project.title || "").toLowerCase();
          if (!title.includes(query) && !code.includes(query)) return false;
        }

        if (cutoff !== null) {
          const ts = project.scheduledStartDatetime
            ? new Date(project.scheduledStartDatetime).getTime()
            : NaN;
          if (Number.isNaN(ts) || ts < cutoff) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aKey = normalizeStatus(a.rawStatus || a.status);
        const bKey = normalizeStatus(b.rawStatus || b.status);
        const aIdx =
          aKey === "unknown"
            ? Number.POSITIVE_INFINITY
            : STATUS_ORDER.indexOf(aKey as StatusKey);
        const bIdx =
          bKey === "unknown"
            ? Number.POSITIVE_INFINITY
            : STATUS_ORDER.indexOf(bKey as StatusKey);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (a.title || "").localeCompare(b.title || "");
      });
  }, [projects, searchQuery, dateFilter, projectNow, statusFilter]);

  const totalCount = filteredProjects.length;
  const isFiltered =
    searchQuery.trim() !== "" || dateFilter !== "all" || statusFilter.size > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading projects..."
                : `${totalCount} project${totalCount === 1 ? "" : "s"}${
                    isFiltered ? " (filtered)" : ""
                  }`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or code..."
              className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Status filter — button toggles a popover with one
              checkbox per status. Empty selection = show every status. */}
          <div className="relative" ref={statusFilterRef}>
            <button
              type="button"
              onClick={() => setStatusFilterOpen((open) => !open)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold shadow-sm transition ${
                statusFilter.size > 0
                  ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Status
              {statusFilter.size > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">
                  {statusFilter.size}
                </span>
              ) : null}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>

            {statusFilterOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Filter by status
                  </span>
                  {statusFilter.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setStatusFilter(new Set())}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="max-h-72 overflow-y-auto pr-0.5">
                  {STATUS_ORDER.map((status) => {
                    const meta = STATUS_META[status];
                    const checked = statusFilter.has(status);
                    return (
                      <label
                        key={status}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStatusFilter(status)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span
                          className="inline-flex flex-1 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: meta.badgeBg,
                            borderColor: meta.badgeBorder,
                            color: meta.badgeColor,
                          }}
                        >
                          {meta.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white p-0.5 shadow-sm">
            {(["all", "week", "month", "year"] as const).map((option) => {
              const active = dateFilter === option;
              const label =
                option === "all"
                  ? "All"
                  : option.charAt(0).toUpperCase() + option.slice(1);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDateFilter(option)}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold transition ${
                    active
                      ? "text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  style={active ? { backgroundColor: ACCENT } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects...
          </div>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : filteredProjects.length === 0 ? (
          <p className="text-sm text-gray-500">
            {isFiltered
              ? "No projects match the current filters."
              : "No projects yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredProjects.map((project) => {
              const key = normalizeStatus(
                project.rawStatus || project.status,
              ) as StatusKey;
              const meta = STATUS_META[key];
              const projectCode =
                project.projectCode || project.project_code || "No Code";

              return (
                <li
                  key={project.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-gray-900">
                        {project.title || "Untitled Project"}
                      </span>
                      <span className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                        {projectCode}
                      </span>
                      <span
                        className="shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: meta.badgeBg,
                          borderColor: meta.badgeBorder,
                          color: meta.badgeColor,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-gray-500">
                      {formatDate(project.scheduledStartDatetime)} →{" "}
                      {formatDate(project.scheduledEndDatetime)}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(getProjectRoute(project.id, key))
                      }
                      className="inline-flex items-center justify-center rounded-md px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Open
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
