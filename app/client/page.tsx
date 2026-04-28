"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useClientProject } from "./ClientShellClient";
import JobProgressCard, {
  type ProcessItem,
} from "@/components/dashboard/jobProgressCard";
import DashboardInsightCard from "@/components/dashboard/dashboardInsightCard";
import PendingDocumentsCard from "@/components/dashboard/pendingDocumentsCard";
import { buildEmployeeReviewItems } from "@/lib/planning/employeePerformance";
import { buildProjectReviewSummary } from "@/lib/planning/projectReviewSummary";

// ─── types ────────────────────────────────────────────────────────────────────

type StepVisualStatus = "done" | "active" | "pending";

type OverviewResponse = {
  project?: Record<string, unknown>;
  mainTasks?: Record<string, unknown>[];
  error?: string;
  details?: string;
};

const END_OF_WORK_STATUS_ORDER = [
  "review_pending",
  "invoice_pending",
  "payment_pending",
  "employee_management_pending",
  "conclude_job_pending",
] as const;

const END_OF_WORK_STEP_CONFIG = [
  {
    id: "review-and-final-checks",
    title: "Review and Final Checks",
    pendingStatus: "review_pending",
  },
  {
    id: "invoice-generation",
    title: "Invoice Generation",
    pendingStatus: "invoice_pending",
  },
  {
    id: "receive-payment",
    title: "Receive Payment",
    pendingStatus: "payment_pending",
  },
  {
    id: "employee-management",
    title: "Employee Management",
    pendingStatus: "employee_management_pending",
  },
  {
    id: "conclude-job",
    title: "Conclude Job",
    pendingStatus: "conclude_job_pending",
  },
] as const;

// ─── helpers (same pattern as admin/page.tsx) ─────────────────────────────────

function normalizeStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isEndOfWorkStatus(status: string) {
  return END_OF_WORK_STATUS_ORDER.includes(
    status as (typeof END_OF_WORK_STATUS_ORDER)[number],
  );
}

function getEndOfWorkChildStatus(
  projectStatus: string,
  stepIndex: number,
): StepVisualStatus {
  const normalized = normalizeStatus(projectStatus);

  if (normalized === "completed" || normalized === "cancelled") return "done";
  if (normalized === "in_progress") return stepIndex === 0 ? "active" : "pending";

  const activeIndex = END_OF_WORK_STATUS_ORDER.indexOf(
    normalized as (typeof END_OF_WORK_STATUS_ORDER)[number],
  );

  if (activeIndex === -1) return "pending";
  if (stepIndex < activeIndex) return "done";
  if (stepIndex === activeIndex) return "active";
  return "pending";
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

// Ordered list of project-status values that represent the job-creation workflow.
// A project moves through these sequentially; each value means "this step is now active".
const JOB_CREATION_STATUSES = [
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "quotation_pending",
];

function getProjectPhase(
  normalized: string,
): "job_creation" | "ready" | "in_progress" | "completed" | "cancelled" {
  if (JOB_CREATION_STATUSES.includes(normalized)) return "job_creation";
  if (normalized === "ready_to_start") return "ready";
  if (normalized === "in_progress" || isEndOfWorkStatus(normalized)) {
    return "in_progress";
  }
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  return "job_creation";
}

function buildProcessItems(
  mainTasks: Record<string, unknown>[],
  projectEnd: string | null,
  projectStatus: string,
): ProcessItem[] {
  const normalized = normalizeStatus(projectStatus);
  const phase = getProjectPhase(normalized);
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

  const manageEndChildren: ProcessItem[] = END_OF_WORK_STEP_CONFIG.map(
    (step, stepIndex) => {
      const status = getEndOfWorkChildStatus(normalized, stepIndex);

      return {
        id: step.id,
        title: step.title,
        status,
        startLabel: formatDateTime(projectEnd),
        endLabel:
          status === "done"
            ? normalized === "cancelled" && step.id === "conclude-job"
              ? "Cancelled"
              : normalized === "completed" && step.id === "conclude-job"
                ? "Completed"
                : formatDateTime(projectEnd)
            : status === "active"
              ? "Working on it..."
              : "-",
      };
    },
  );

  const manageEndStatus: StepVisualStatus = manageEndChildren.every(
    (child) => child.status === "done",
  )
    ? "done"
    : manageEndChildren.some((child) => child.status !== "pending")
      ? "active"
      : "pending";

  items.push({
    id: "manage-end-of-work",
    title: "Manage End of Work",
    status: manageEndStatus,
    startLabel: formatDateTime(projectEnd),
    endLabel:
      phase === "completed"
        ? formatDateTime(projectEnd)
        : phase === "cancelled"
          ? "Cancelled"
          : manageEndStatus === "active"
            ? "Working on it..."
            : "-",
    children: manageEndChildren,
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

        const defaultOpen = new Set<string>();
        const autoOpenMainTaskId = getAutoOpenMainTaskId(nextMainTasks);

        if (autoOpenMainTaskId) {
          defaultOpen.add(`task-${autoOpenMainTaskId}`);
        }
        setOpenProcessIds(defaultOpen);
        setOpenSubtaskIds(new Set());
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load project data.";
        setFetchError(msg);
        toast.error("Could not load project", { description: msg });
      } finally {
        setLoadingDetails(false);
      }
    }

    load();
  }, [projectId]);

  const projectStatus = readString(project?.status, project?.rawStatus);

  const projectEnd =
    readString(
      project?.scheduled_end_datetime,
      project?.scheduledEndDatetime,
    ) || null;

  const processItems = useMemo(
    () => buildProcessItems(mainTasks, projectEnd, projectStatus),
    [mainTasks, projectEnd, projectStatus],
  );

  const reviewSummary = useMemo(() => {
    return buildProjectReviewSummary({
      project,
      mainTasks,
    });
  }, [project, mainTasks]);

  const employeeReviewItems = useMemo(() => {
    return buildEmployeeReviewItems(mainTasks);
  }, [mainTasks]);

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
    <div className="h-screen overflow-hidden">
      <div className="flex h-full flex-col p-6">
        {/* Header */}
        <div className="shrink-0">
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--cp-text)" }}>
            {projectTitle}
          </h1>
          <div
            className="mt-1 flex flex-wrap items-center gap-3 text-sm"
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

        {/* Body */}
        <div
          className="mt-6 grid min-h-0 flex-1 gap-4 overflow-hidden"
          style={{ gridTemplateColumns: "minmax(0,7fr) minmax(0,3fr)" }}>
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
              employeeReviewItems={employeeReviewItems}
              reviewSummary={reviewSummary}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(150px,0.38fr)_minmax(0,1fr)] gap-4 overflow-hidden">
            <div className="min-h-0 overflow-hidden">
              <PendingDocumentsCard
                selectedProject={pendingDocumentProject}
                loading={loadingDetails}
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
    </div>
  );
}
