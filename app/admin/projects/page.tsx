"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const [projects, setProjects] = useState<RawProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const projectsByStatus = useMemo(() => {
    const map = new Map<StatusKey, RawProject[]>();
    for (const status of STATUS_ORDER) {
      map.set(status, []);
    }

    for (const project of projects) {
      const key = normalizeStatus(project.rawStatus || project.status);
      if (key === "unknown") continue;
      map.get(key)?.push(project);
    }

    return map;
  }, [projects]);

  const totalCount = projects.length;
  const visibleSections = STATUS_ORDER.filter(
    (status) => (projectsByStatus.get(status)?.length ?? 0) > 0,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading projects…"
                : `${totalCount} project${totalCount === 1 ? "" : "s"} grouped by status.`}
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

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20 shadow-sm">
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading projects…</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : visibleSections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
            No projects yet.
          </div>
        ) : (
          <div className="space-y-6">
            {visibleSections.map((status) => {
              const meta = STATUS_META[status];
              const list = projectsByStatus.get(status) ?? [];

              return (
                <section
                  key={status}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  <div
                    className="h-1 w-full"
                    style={{ backgroundColor: ACCENT }}
                  />

                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: meta.badgeBg,
                          borderColor: meta.badgeBorder,
                          color: meta.badgeColor,
                        }}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[12px] font-medium text-gray-500">
                        {list.length} project{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="divide-y divide-gray-100">
                    {list.map((project) => {
                      const projectCode =
                        project.projectCode || project.project_code || "No Code";

                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(getProjectRoute(project.id, status))
                            }
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 text-left transition hover:bg-gray-50"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[14px] font-semibold text-gray-900">
                                  {project.title || "Untitled Project"}
                                </span>
                                <span className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                                  {projectCode}
                                </span>
                              </div>
                              <div className="mt-1 text-[12px] text-gray-500">
                                {formatDate(project.scheduledStartDatetime)} →{" "}
                                {formatDate(project.scheduledEndDatetime)}
                              </div>
                            </div>

                            <span className="shrink-0 text-[12px] font-medium text-emerald-700">
                              Open →
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
