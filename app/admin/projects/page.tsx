"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

type StatusKey =
  | "main_task_pending"
  | "sub_task_pending"
  | "materials_pending"
  | "equipment_pending"
  | "schedule_pending"
  | "employee_assignment_pending"
  | "cost_estimation_pending"
  | "overview_pending"
  | "quotation_pending"
  | "grant_access_quotation"
  | "client_quotation_done"
  | "downpayment_pending"
  | "ready_to_start"
  | "in_progress"
  | "review_pending"
  | "invoice_pending"
  | "invoice_agreement_pending"
  | "payment_pending"
  | "employee_management_pending"
  | "conclude_job_pending"
  | "completed"
  | "cancelled";

const PROJECT_CREATION_STATUSES: StatusKey[] = [
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
];

const POST_CREATION_STATUSES: StatusKey[] = [
  "quotation_pending",
  "grant_access_quotation",
  "client_quotation_done",
  "downpayment_pending",
  "ready_to_start",
  "in_progress",
  "review_pending",
  "invoice_pending",
  "invoice_agreement_pending",
  "payment_pending",
  "employee_management_pending",
  "conclude_job_pending",
  "completed",
  "cancelled",
];

const STATUS_ORDER: StatusKey[] = [
  ...PROJECT_CREATION_STATUSES,
  ...POST_CREATION_STATUSES,
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

function normalizeStatus(value: string | null | undefined): StatusKey | "unknown" {
  const normalized = String(value || "").trim().toLowerCase();
  if ((STATUS_ORDER as readonly string[]).includes(normalized)) {
    return normalized as StatusKey;
  }
  return "unknown";
}

function getProjectRoute(projectId: string, status: StatusKey | "unknown"): string {
  switch (status) {
    case "main_task_pending":
      return `/admin/job-creation/main-task-assignment?projectId=${projectId}`;
    case "sub_task_pending":
      return `/admin/job-creation/sub-task-assignment?projectId=${projectId}`;
    case "materials_pending":
      return `/admin/job-creation/materials-assignment?projectId=${projectId}`;
    case "equipment_pending":
      return `/admin/job-creation/equipment-assignment?projectId=${projectId}`;
    case "schedule_pending":
      return `/admin/job-creation/project-schedule?projectId=${projectId}`;
    case "employee_assignment_pending":
      return `/admin/job-creation/employee-assignment?projectId=${projectId}`;
    case "cost_estimation_pending":
      return `/admin/job-creation/cost-estimation?projectId=${projectId}`;
    case "overview_pending":
      return `/admin/job-creation/overview?projectId=${projectId}`;
    case "quotation_pending":
    case "grant_access_quotation":
      return `/admin/job-creation/quotation-generation?projectId=${projectId}`;
    case "client_quotation_done":
      // The client has signed; the admin still needs to review and ack on the
      // quotation page before advancing to downpayment.
      return `/admin/job-creation/quotation-generation?projectId=${projectId}`;
    case "downpayment_pending":
    case "ready_to_start":
    case "in_progress":
    case "review_pending":
    case "invoice_pending":
    case "invoice_agreement_pending":
    case "payment_pending":
    case "employee_management_pending":
    case "conclude_job_pending":
    case "completed":
    case "cancelled":
    case "unknown":
    default:
      return `/admin/projects/${projectId}`;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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
  // Override map for sections the user has manually toggled. Default open state
  // is derived from "does the section have projects" — overrides only apply
  // when the user has explicitly clicked the chevron.
  const [sectionOverrides, setSectionOverrides] = useState<Map<StatusKey, boolean>>(
    () => new Map(),
  );
  const [projectCreationOverride, setProjectCreationOverride] = useState<
    boolean | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "week" | "month" | "year">(
    "all",
  );

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

    return projects.filter((project) => {
      if (query) {
        const code = (project.projectCode || project.project_code || "").toLowerCase();
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
    });
  }, [projects, searchQuery, dateFilter, projectNow]);

  const projectsByStatus = useMemo(() => {
    const map = new Map<StatusKey, RawProject[]>();
    for (const status of STATUS_ORDER) {
      map.set(status, []);
    }

    for (const project of filteredProjects) {
      const key = normalizeStatus(project.rawStatus || project.status);
      if (key === "unknown") continue;
      map.get(key)?.push(project);
    }

    return map;
  }, [filteredProjects]);

  const isSectionOpen = useCallback(
    (status: StatusKey): boolean => {
      const override = sectionOverrides.get(status);
      if (override !== undefined) return override;
      return (projectsByStatus.get(status)?.length ?? 0) > 0;
    },
    [sectionOverrides, projectsByStatus],
  );

  const toggleSection = useCallback(
    (status: StatusKey) => {
      const currentlyOpen = isSectionOpen(status);
      setSectionOverrides((prev) => {
        const next = new Map(prev);
        next.set(status, !currentlyOpen);
        return next;
      });
    },
    [isSectionOpen],
  );

  const totalCount = filteredProjects.length;
  const isFiltered = searchQuery.trim() !== "" || dateFilter !== "all";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading projects…"
                : `${totalCount} project${totalCount === 1 ? "" : "s"}${
                    isFiltered ? " (filtered)" : " grouped by status."
                  }`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or code…"
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
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
            Loading projects…
          </div>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          (() => {
            const isSearching = searchQuery.trim() !== "";
            const projectCreationCount = PROJECT_CREATION_STATUSES.reduce(
              (sum, s) => sum + (projectsByStatus.get(s)?.length ?? 0),
              0,
            );

            const renderStatusSection = (status: StatusKey, indent: boolean) => {
              const meta = STATUS_META[status];
              const list = projectsByStatus.get(status) ?? [];
              // While searching, hide sections that have no matching projects.
              if (isSearching && list.length === 0) return null;
              // While searching, force-open sections that have matches so the
              // user can see results without an extra click.
              const isOpen = isSearching ? list.length > 0 : isSectionOpen(status);

              return (
                <section key={status} className={indent ? "pl-6" : undefined}>
                  <button
                    type="button"
                    onClick={() => toggleSection(status)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <h2 className="text-[15px] font-semibold text-gray-900">
                      {meta.label}
                    </h2>
                    <span className="text-[12px] font-medium text-gray-500">
                      {list.length} project{list.length === 1 ? "" : "s"}
                    </span>
                  </button>

                  {isOpen &&
                    (list.length === 0 ? (
                      <p className="mt-2 pl-6 text-[12px] text-gray-400">
                        No projects in this status.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {list.map((project) => {
                          const projectCode =
                            project.projectCode ||
                            project.project_code ||
                            "No Code";

                          return (
                            <li
                              key={project.id}
                              className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
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

                              <button
                                type="button"
                                onClick={() =>
                                  router.push(getProjectRoute(project.id, status))
                                }
                                className="shrink-0 inline-flex items-center justify-center rounded-lg px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                                style={{ backgroundColor: ACCENT }}
                              >
                                Open
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ))}
                </section>
              );
            };

            const showProjectCreation = !isSearching || projectCreationCount > 0;
            const projectCreationDefaultOpen = projectCreationCount > 0;
            const projectCreationExpanded = isSearching
              ? projectCreationCount > 0
              : projectCreationOverride ?? projectCreationDefaultOpen;

            if (isSearching && filteredProjects.length === 0) {
              return (
                <p className="text-sm text-gray-500">
                  No projects match &ldquo;{searchQuery.trim()}&rdquo;.
                </p>
              );
            }

            return (
              <div className="space-y-4">
                {showProjectCreation && (
                  <section>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectCreationOverride(!projectCreationExpanded)
                      }
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                          projectCreationExpanded ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                      <h2 className="text-[16px] font-semibold text-gray-900">
                        Project Creation
                      </h2>
                      <span className="text-[12px] font-medium text-gray-500">
                        {projectCreationCount} project
                        {projectCreationCount === 1 ? "" : "s"}
                      </span>
                    </button>

                    {projectCreationExpanded && (
                      <div className="mt-3 space-y-4">
                        {PROJECT_CREATION_STATUSES.map((status) =>
                          renderStatusSection(status, true),
                        )}
                      </div>
                    )}
                  </section>
                )}

                {POST_CREATION_STATUSES.map((status) =>
                  renderStatusSection(status, false),
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
