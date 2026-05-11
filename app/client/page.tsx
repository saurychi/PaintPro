"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useClientProject } from "./ClientShellClient";
import DashboardClock from "@/components/dashboard/dashboardClock";
import JobProgressCard, {
  type ProcessItem,
} from "@/components/dashboard/jobProgressCard";
import DashboardInsightCard from "@/components/dashboard/dashboardInsightCard";
import NotificationsCard from "@/components/dashboard/notificationsCard";
import PendingDocumentsCard from "@/components/dashboard/pendingDocumentsCard";
import { buildEmployeeReviewItems } from "@/lib/planning/employeePerformance";
import { buildProjectReviewSummary } from "@/lib/planning/projectReviewSummary";
import { useProjectTimeReference } from "@/lib/time/useProjectTimeReference";

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
  return String(value || "")
    .trim()
    .toLowerCase();
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
  if (
    n === "in_progress" ||
    n === "active" ||
    n === "ongoing" ||
    n === "ready_to_start"
  )
    return "active";
  return "pending";
}

const JUST_IN_TIME_TOLERANCE_MINUTES = 8;

function getCompletionTimingLabel(args: {
  rawStatus: string;
  scheduledStart: string;
  estimatedHours: number;
  completedAt: string;
}) {
  if (getTaskStatus(args.rawStatus) !== "done") return null;
  if (!args.scheduledStart || !args.completedAt || args.estimatedHours <= 0) {
    return "Completed";
  }

  const startDate = new Date(args.scheduledStart);
  const completedDate = new Date(args.completedAt);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(completedDate.getTime())
  ) {
    return "Completed";
  }

  const plannedEndMs =
    startDate.getTime() + args.estimatedHours * 60 * 60 * 1000;
  const diffMinutes = (completedDate.getTime() - plannedEndMs) / (1000 * 60);

  if (Math.abs(diffMinutes) <= JUST_IN_TIME_TOLERANCE_MINUTES) {
    return "on time";
  }

  return diffMinutes < 0 ? "early" : "late";
}

function getAutoOpenMainTaskId(mainTasks: Record<string, unknown>[]) {
  const activeMainTask =
    mainTasks.find((mainTask) => {
      const subTasks = [
        ...asArray<Record<string, unknown>>(mainTask.subTasks),
        ...asArray<Record<string, unknown>>(mainTask.subtasks),
        ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
        ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
      ];

      return subTasks.some(
        (subTask) =>
          getTaskStatus(
            readString(subTask.status, subTask.rawStatus, subTask.project_status),
          ) !== "done",
      );
    }) ?? mainTasks[0];

  if (!activeMainTask) return "";

  return readString(activeMainTask.project_task_id, activeMainTask.id);
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
      asRecord(entry.user) ||
      asRecord(entry.employee) ||
      asRecord(entry.profile);
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
): ProcessItem[] {
  const items: ProcessItem[] = [];

  // "Start of Work" is active once job creation is done (ready_to_start),
  // done once the project is actually in progress or completed.
  for (let i = 0; i < mainTasks.length; i++) {
    const mt = mainTasks[i];
    const subTasks = [
      ...asArray<Record<string, unknown>>(mt.subTasks),
      ...asArray<Record<string, unknown>>(mt.subtasks),
      ...asArray<Record<string, unknown>>(mt.projectSubTasks),
      ...asArray<Record<string, unknown>>(mt.project_sub_tasks),
    ];

    const childItems: ProcessItem[] = subTasks.map((st, si) => {
      const rawStatus = readString(st.status, st.rawStatus, st.project_status);
      const status = getTaskStatus(rawStatus);
      const employees = collectEmployeeLabels(st);
      const scheduledStart = readString(
        st.scheduled_start_datetime,
        st.scheduledStartDatetime,
        st.start_datetime,
      );
      const completedAt = readString(st.updated_at, st.updatedAt);
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
        statusLabelOverride:
          status === "done"
            ? getCompletionTimingLabel({
                rawStatus,
                scheduledStart,
                estimatedHours,
                completedAt,
              }) || undefined
            : undefined,
        startLabel: formatDateTime(
          scheduledStart || null,
        ),
        endLabel:
          status === "done"
            ? formatDateTime(
                completedAt ||
                  readString(
                    st.scheduled_end_datetime,
                    st.scheduledEndDatetime,
                    st.end_datetime,
                  ) ||
                  null,
              )
            : "-",
        detail: {
          employees,
          employeeIds: [],
          estimatedHours: formatHours(estimatedHours),
          completedAt: completedAt || null,
        },
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

  return items;
}

// ─── page component ───────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const { projectId } = useClientProject();
  const { referenceIso } = useProjectTimeReference();

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [mainTasks, setMainTasks] = useState<Record<string, unknown>[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    // Cancel-on-rerun guard: if projectId changes mid-fetch, ignore the
    // older response so it can't overwrite the freshly-loaded data.
    let cancelled = false;
    const runForId = projectId;

    async function load() {
      try {
        setLoadingDetails(true);
        setFetchError(null);

        const res = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(runForId)}`,
        );
        const data = (await res.json()) as OverviewResponse;

        if (cancelled || runForId !== projectId) return;

        if (!res.ok) {
          const msg =
            [data?.error, data?.details].filter(Boolean).join(" — ") ||
            "Failed to load project data.";
          setFetchError(msg);
          toast.error("Could not load project", { description: msg });
          return;
        }

        const nextMainTasks = asArray<Record<string, unknown>>(data.mainTasks);
        setProject(asRecord(data.project));
        setMainTasks(nextMainTasks);

        // Seeding lives in JobProgressCard now — see admin page's
        // matching note. Resetting openProcessIds here would fight
        // its seededForProjectRef effect on every refreshKey bump.
        setOpenSubtaskIds(new Set());
      } catch (err: unknown) {
        if (cancelled || runForId !== projectId) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load project data.";
        setFetchError(msg);
        toast.error("Could not load project", { description: msg });
      } finally {
        if (!cancelled && runForId === projectId) {
          setLoadingDetails(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const projectStatus = readString(project?.status, project?.rawStatus);

  const processItems = useMemo(
    () => buildProcessItems(mainTasks),
    [mainTasks],
  );

  const reviewSummary = useMemo(() => {
    return buildProjectReviewSummary({
      project,
      mainTasks,
    });
  }, [project, mainTasks]);

  const employeeReviewItems = useMemo(() => {
    return buildEmployeeReviewItems(mainTasks, {
      referenceNow: referenceIso,
    });
  }, [mainTasks, referenceIso]);

  const pendingDocumentProject = useMemo(() => {
    if (!project) return null;

    const safeProjectId = readString(project.project_id, project.id, projectId);

    if (!safeProjectId) return null;

    return {
      project_id: safeProjectId,
      project_code: readString(project.project_code, project.projectCode),
      title: readString(project.title),
      status: projectStatus,
      updated_at: readString(project.updated_at, project.updatedAt),
      created_at: readString(project.created_at, project.createdAt),
    };
  }, [project, projectId, projectStatus]);

  const toggleProcessRow = useCallback((id: string) => {
    setOpenProcessIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSubtaskRow = useCallback((id: string) => {
    setOpenSubtaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
            style={{ color: "var(--cp-brand)" }}>
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  const projectTitle = readString(project?.title) || "Your Project";
  const projectCode =
    readString(project?.project_code, project?.projectCode) || "—";
  const siteAddress = readString(project?.site_address, project?.siteAddress);

  return (
    // Below md: natural document flow with scroll. md+: locked-screen layout
    // identical to before so desktop still feels app-like.
    <div className="md:h-screen md:overflow-hidden">
      <div className="flex flex-col gap-4 p-3 sm:p-4 md:h-full md:p-6">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl sm:text-2xl font-semibold"
              style={{ color: "var(--cp-text)" }}>
              {projectTitle}
            </h1>
            <div
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm"
              style={{ color: "var(--cp-text-muted)" }}>
              <span
                className="font-mono font-medium"
                style={{ color: "var(--cp-text-2)" }}>
                {projectCode}
              </span>
              {siteAddress ? <span>{siteAddress}</span> : null}
              {fetchError ? (
                <span style={{ color: "var(--cp-danger)" }}>{fetchError}</span>
              ) : null}
              {loadingDetails ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "var(--cp-text-faint)" }}
                />
              ) : null}
            </div>
          </div>
          <DashboardClock />
        </div>

        {/* Body — stacks on mobile, switches to the 7/3 split on lg+. */}
        <div className="grid flex-1 min-h-0 gap-4 lg:overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] md:mt-2">
          <div className="min-h-0 lg:overflow-hidden">
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
              onRefresh={() => setRefreshKey((k) => k + 1)}
              employeeReviewItems={employeeReviewItems}
              reviewSummary={reviewSummary}
              // Hide the workflow breakdown until the project actually
              // kicks off — clients shouldn't see internal job-creation
              // wizard steps. Lifts automatically once status hits
              // in_progress or beyond.
              showPreExecutionTakeover
            />
          </div>

          {/* Right column: PendingDocumentsCard sizes to its own
              content (`auto`) instead of stealing 1/3 of the height
              from the other cards. With usually 0-1 pending document,
              an equal-share row leaves a big empty pad below. The
              freed vertical space goes to Notifications + Insights. */}
          <div className="grid min-h-0 gap-4 lg:overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-h-0 lg:overflow-hidden">
              <PendingDocumentsCard
                selectedProject={pendingDocumentProject}
                loading={loadingDetails}
                onRefresh={() => {
                  // Re-run the dashboard's project overview fetch (drives
                  // this card's data) AND broadcast to the sidebar badge
                  // so its "pending-documents" pill updates in lock-step.
                  setRefreshKey((k) => k + 1);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new Event("paintpro:refresh-pending-docs"),
                    );
                  }
                }}
              />
            </div>

            <div className="min-h-0 lg:overflow-hidden">
              <NotificationsCard
                limit={4}
                dataSource="project-chat"
                messagesPath="/client/messages"
              />
            </div>

            <div className="min-h-0 lg:overflow-hidden">
              <DashboardInsightCard
                processItems={processItems as ProcessItem[]}
                loadingDetails={loadingDetails}
                projectId={projectId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
