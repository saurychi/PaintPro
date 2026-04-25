"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useClientProject } from "./ClientShellClient";
import JobProgressCard, {
  type ProcessItem,
} from "@/components/dashboard/jobProgressCard";
import DashboardInsightCard from "@/components/dashboard/dashboardInsightCard";

// ─── types ────────────────────────────────────────────────────────────────────

type StepVisualStatus = "done" | "active" | "pending";

type OverviewResponse = {
  project?: Record<string, unknown>;
  mainTasks?: Record<string, unknown>[];
  error?: string;
  details?: string;
};

// ─── helpers (same pattern as admin/page.tsx) ─────────────────────────────────

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readNumber(...values: unknown[]) {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v)))
      return Number(v);
  }
  return 0;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHours(hours: number) {
  if (!hours) return "0 hrs";
  return `${Math.round(hours * 10) / 10} hrs`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toTimestamp(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function firstDateLabel(values: Array<string | null | undefined>) {
  const valid = values
    .map((v) => ({ raw: v || "", ts: toTimestamp(v || null) }))
    .filter((x) => x.ts !== null) as { raw: string; ts: number }[];
  if (!valid.length) return "-";
  valid.sort((a, b) => a.ts - b.ts);
  return formatDateTime(valid[0].raw);
}

function lastDateLabel(values: Array<string | null | undefined>) {
  const valid = values
    .map((v) => ({ raw: v || "", ts: toTimestamp(v || null) }))
    .filter((x) => x.ts !== null) as { raw: string; ts: number }[];
  if (!valid.length) return "-";
  valid.sort((a, b) => b.ts - a.ts);
  return formatDateTime(valid[0].raw);
}

function getTaskStatus(rawStatus: string): StepVisualStatus {
  const n = normalizeStatus(rawStatus);
  if (n === "completed" || n === "done" || n === "finished") return "done";
  if (n === "in_progress" || n === "active" || n === "ongoing" || n === "ready_to_start")
    return "active";
  return "pending";
}

function collectEmployeeLabels(subTask: Record<string, unknown>) {
  const labels: string[] = [];
  const direct = readString(
    subTask.assignedUserName,
    subTask.assigned_user_name,
    subTask.assignedUsername,
    subTask.assigned_username,
  );
  if (direct) labels.push(direct);

  const collections = [
    ...asArray<Record<string, unknown>>(subTask.assignedStaff),
    ...asArray<Record<string, unknown>>(subTask.assigned_staff),
    ...asArray<Record<string, unknown>>(subTask.employees),
    ...asArray<Record<string, unknown>>(subTask.staff),
  ];

  for (const entry of collections) {
    const nested =
      asRecord(entry.user) || asRecord(entry.employee) || asRecord(entry.profile);
    const label = readString(
      entry.username,
      entry.full_name,
      entry.fullName,
      entry.name,
      entry.email,
      nested?.username,
      nested?.full_name,
      nested?.fullName,
      nested?.name,
      nested?.email,
    );
    if (label) labels.push(label);
  }
  return unique(labels);
}

function buildProcessItems(
  mainTasks: Record<string, unknown>[],
  projectStart: string | null,
  projectEnd: string | null,
  projectStatus: string,
): ProcessItem[] {
  const normalized = normalizeStatus(projectStatus);
  const items: ProcessItem[] = [];

  const startOfWorkStatus: StepVisualStatus =
    normalized === "ready_to_start"
      ? "active"
      : normalized === "in_progress" || normalized === "completed"
        ? "done"
        : "pending";

  items.push({
    id: "start-of-work",
    title: "Start of Work",
    status: startOfWorkStatus,
    startLabel: formatDateTime(projectStart),
    endLabel:
      startOfWorkStatus === "done"
        ? formatDateTime(projectStart)
        : startOfWorkStatus === "active"
          ? "Working on it..."
          : "-",
    children: [
      {
        id: "project-kickoff",
        title: "Project Kickoff",
        status: startOfWorkStatus,
        startLabel: formatDateTime(projectStart),
        endLabel:
          startOfWorkStatus === "done"
            ? formatDateTime(projectStart)
            : startOfWorkStatus === "active"
              ? "Working on it..."
              : "-",
      },
    ],
  });

  for (let i = 0; i < mainTasks.length; i++) {
    const mt = mainTasks[i];
    const subTasks = [
      ...asArray<Record<string, unknown>>(mt.subTasks),
      ...asArray<Record<string, unknown>>(mt.subtasks),
      ...asArray<Record<string, unknown>>(mt.projectSubTasks),
      ...asArray<Record<string, unknown>>(mt.project_sub_tasks),
    ];

    const childItems: ProcessItem[] = subTasks.map((st, si) => {
      const status = getTaskStatus(
        readString(st.status, st.rawStatus, st.project_status),
      );
      const employees = collectEmployeeLabels(st);
      const estimatedHours = readNumber(
        st.estimatedHours,
        st.estimated_hours,
        st.durationHours,
        st.duration_hours,
      );
      return {
        id: readString(st.project_sub_task_id, st.id) || `sub-${i}-${si}`,
        title:
          readString(st.description, st.title, st.name, st.sub_task_name) ||
          `Sub Task ${si + 1}`,
        status,
        startLabel: formatDateTime(
          readString(
            st.scheduled_start_datetime,
            st.scheduledStartDatetime,
            st.start_datetime,
          ) || null,
        ),
        endLabel:
          status === "done"
            ? formatDateTime(
                readString(
                  st.scheduled_end_datetime,
                  st.scheduledEndDatetime,
                  st.end_datetime,
                ) || null,
              )
            : "-",
        detail: { employees, estimatedHours: formatHours(estimatedHours) },
      };
    });

    const childStatuses = childItems.map((c) => c.status);
    const taskStatus: StepVisualStatus =
      childStatuses.length > 0 && childStatuses.every((s) => s === "done")
        ? "done"
        : childStatuses.some((s) => s === "active")
          ? "active"
          : "pending";

    items.push({
      id: `task-${readString(mt.project_task_id, mt.id) || i}`,
      title:
        readString(mt.title, mt.name, mt.main_task_name, mt.mainTaskName) ||
        `Task ${i + 1}`,
      status: taskStatus,
      startLabel: firstDateLabel(
        subTasks.map((st) =>
          readString(
            st.scheduled_start_datetime,
            st.scheduledStartDatetime,
            st.start_datetime,
          ),
        ),
      ),
      endLabel:
        taskStatus === "done"
          ? lastDateLabel(
              subTasks.map((st) =>
                readString(
                  st.scheduled_end_datetime,
                  st.scheduledEndDatetime,
                  st.end_datetime,
                ),
              ),
            )
          : taskStatus === "active"
            ? "Working on it..."
            : "-",
      children:
        childItems.length > 0
          ? childItems
          : [
              {
                id: `empty-${i}`,
                title: "No sub tasks yet",
                status: "pending",
                startLabel: "-",
                endLabel: "-",
              },
            ],
    });
  }

  const manageEndStatus: StepVisualStatus =
    normalized === "completed"
      ? "done"
      : normalized === "in_progress"
        ? "active"
        : "pending";

  items.push({
    id: "manage-end-of-work",
    title: "Manage End of Work",
    status: manageEndStatus,
    startLabel: formatDateTime(projectEnd),
    endLabel:
      manageEndStatus === "done"
        ? formatDateTime(projectEnd)
        : manageEndStatus === "active"
          ? "Working on it..."
          : "-",
    children: [
      {
        id: "review-and-final-checks",
        title: "Review and Final Checks",
        status: manageEndStatus,
        startLabel: formatDateTime(projectEnd),
        endLabel:
          manageEndStatus === "done"
            ? formatDateTime(projectEnd)
            : manageEndStatus === "active"
              ? "Working on it..."
              : "-",
      },
    ],
  });

  return items;
}

// ─── page component ───────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const { projectId } = useClientProject();

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [mainTasks, setMainTasks] = useState<Record<string, unknown>[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;

    async function load() {
      try {
        setLoadingDetails(true);
        setFetchError(null);

        const res = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(projectId!)}`,
        );
        const data = (await res.json()) as OverviewResponse;

        if (!res.ok) {
          setFetchError(data?.error || "Failed to load project.");
          return;
        }

        const nextMainTasks = asArray<Record<string, unknown>>(data.mainTasks);
        setProject(asRecord(data.project));
        setMainTasks(nextMainTasks);

        const defaultOpen = new Set<string>();
        if (nextMainTasks.length > 0) {
          const firstId =
            readString(nextMainTasks[0].project_task_id, nextMainTasks[0].id) ||
            "0";
          defaultOpen.add(`task-${firstId}`);
        }
        setOpenProcessIds(defaultOpen);
        setOpenSubtaskIds(new Set());
      } catch {
        setFetchError("Failed to load project.");
      } finally {
        setLoadingDetails(false);
      }
    }

    load();
  }, [projectId]);

  const projectStatus = readString(project?.status, project?.rawStatus);

  const projectStart =
    readString(
      project?.scheduledStartDatetime,
      project?.scheduled_start_datetime,
      project?.startDatetime,
      project?.start_datetime,
    ) || null;

  const projectEnd =
    readString(
      project?.scheduledEndDatetime,
      project?.scheduled_end_datetime,
      project?.endDatetime,
      project?.end_datetime,
    ) || null;

  const processItems = useMemo(
    () => buildProcessItems(mainTasks, projectStart, projectEnd, projectStatus),
    [mainTasks, projectStart, projectEnd, projectStatus],
  );

  function toggleProcessRow(id: string) {
    setOpenProcessIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSubtaskRow(id: string) {
    setOpenSubtaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
            No project linked to your session.
          </p>
          <a
            href="/auth/signin"
            className="mt-3 inline-block text-sm font-medium hover:underline"
            style={{ color: "var(--cp-brand)" }}
          >
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  const projectTitle = readString(project?.title) || "Your Project";
  const projectCode = readString(project?.project_code, project?.projectCode) || "—";
  const siteAddress = readString(project?.site_address, project?.siteAddress);

  return (
    <div className="h-screen overflow-hidden">
      <div className="flex h-full flex-col p-6">
        {/* Header */}
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--cp-text)" }}>
            {projectTitle}
          </h1>
          <div
            className="mt-1 flex flex-wrap items-center gap-3 text-sm"
            style={{ color: "var(--cp-text-muted)" }}
          >
            <span className="font-mono font-medium" style={{ color: "var(--cp-text-2)" }}>
              {projectCode}
            </span>
            {siteAddress ? <span>{siteAddress}</span> : null}
            {fetchError ? (
              <span style={{ color: "var(--cp-danger)" }}>{fetchError}</span>
            ) : null}
            {loadingDetails ? (
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--cp-text-faint)" }} />
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div
          className="mt-6 grid min-h-0 flex-1 gap-4 overflow-hidden"
          style={{ gridTemplateColumns: "minmax(0,7fr) minmax(0,3fr)" }}
        >
          <div className="min-h-0 overflow-hidden">
            <JobProgressCard
              title="Project Progress"
              selectedProject={project}
              loadingDetails={loadingDetails}
              navigating={loadingDetails}
              processItems={processItems as ProcessItem[]}
              openProcessIds={openProcessIds}
              openSubtaskIds={openSubtaskIds}
              toggleProcessRow={toggleProcessRow}
              toggleSubtaskRow={toggleSubtaskRow}
              handleStartMainTasks={() => {}}
            />
          </div>

          <div className="min-h-0 overflow-hidden">
            <DashboardInsightCard
              processItems={processItems as ProcessItem[]}
              loadingDetails={loadingDetails}
              projectId={projectId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
