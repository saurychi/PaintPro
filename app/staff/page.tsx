"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

import CurrentJobCard, {
  CurrentJobOption,
} from "../../components/dashboard/currentJobCard";
import DashboardClock from "../../components/dashboard/dashboardClock";
import EmployeesCard from "../../components/dashboard/employeesCard";
import JobProgressCard from "../../components/dashboard/jobProgressCard";
import DashboardInsightCard from "../../components/dashboard/dashboardInsightCard";
import NotificationsCard from "@/components/dashboard/notificationsCard";
import { buildEmployeeReviewItems } from "@/lib/planning/employeePerformance";
import { buildProjectReviewSummary } from "@/lib/planning/projectReviewSummary";
import {
  CANCELLATION_STEPS,
  getCancellationGroupVisualStatus,
  getCancellationStepVisualStatus,
  normalizeCancellationPhase,
  type CancellationPhase,
} from "@/lib/planning/cancellationPhase";
import {
  useProjectSubtaskRealtime,
  type ProjectSubtaskRow,
} from "@/lib/realtime/useProjectSubtaskRealtime";
import { useProjectTimeReference } from "@/lib/time/useProjectTimeReference";

type StepVisualStatus = "done" | "active" | "pending";

type ProcessDetail = {
  employees: string[];
  employeeIds: string[];
  estimatedHours: string;
  completedAt?: string | null;
};

type ProcessItem = {
  id: string;
  title: string;
  status: StepVisualStatus;
  statusLabelOverride?: string;
  startLabel: string;
  endLabel: string;
  children?: ProcessItem[];
  detail?: ProcessDetail;
};

type RawProject = {
  id: string;
  title: string;
  projectCode?: string | null;
  project_code?: string | null;
  status?: string | null;
  rawStatus?: string | null;
  cancellationPhase?: string | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
  clientName?: string | null;
  siteAddress?: string | null;
};

// Cancelled projects with an unfinished wrap-up phase still need admin
// attention, so they don't count as terminal here. Only "completed"
// projects and cancelled-then-fully-closed ones drop to the back of
// the workday picker.
function isProjectTerminal(project: RawProject): boolean {
  const status = String(project.rawStatus ?? project.status ?? "")
    .trim()
    .toLowerCase();
  if (status === "completed") return true;
  if (status === "cancelled") {
    const phase = String(project.cancellationPhase ?? "")
      .trim()
      .toLowerCase();
    return phase === "done";
  }
  return false;
}

type ProjectsResponse = {
  projects?: RawProject[];
  currentProject?: RawProject | null;
  error?: string;
};

type OverviewResponse = {
  project?: Record<string, unknown>;
  mainTasks?: Record<string, unknown>[];
  error?: string;
  details?: string;
};

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
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (
      typeof value === "string" &&
      value.trim() &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return 0;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function readProjectStart(project: RawProject) {
  return readString(
    project.scheduledStartDatetime,
    (project as Record<string, unknown>).start_datetime,
    (project as Record<string, unknown>).startDatetime,
    (project as Record<string, unknown>).scheduled_start_datetime,
  );
}

function readProjectEnd(project: RawProject) {
  return readString(
    project.scheduledEndDatetime,
    (project as Record<string, unknown>).end_datetime,
    (project as Record<string, unknown>).endDatetime,
    (project as Record<string, unknown>).scheduled_end_datetime,
  );
}

function isProjectOnDate(project: RawProject, selectedDate: string) {
  const start = readProjectStart(project);
  const end = readProjectEnd(project);

  if (!start && !end) return false;

  const dayStart = new Date(`${selectedDate}T00:00:00`);
  const dayEnd = new Date(`${selectedDate}T23:59:59`);

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : startDate;

  if (!startDate || Number.isNaN(startDate.getTime())) return false;
  if (!endDate || Number.isNaN(endDate.getTime())) return false;

  return startDate <= dayEnd && endDate >= dayStart;
}

function diffHours(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  const ms = endDate.getTime() - startDate.getTime();
  if (ms <= 0) return 0;

  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

function formatHours(hours: number) {
  if (!hours) return "0 hrs";
  return `${Math.round(hours * 10) / 10} hrs`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toTimestamp(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.getTime();
}

function firstDateLabel(values: Array<string | null | undefined>) {
  const valid = values
    .map((value) => ({ raw: value || "", ts: toTimestamp(value || null) }))
    .filter((item) => item.ts !== null) as Array<{ raw: string; ts: number }>;

  if (!valid.length) return "-";

  valid.sort((a, b) => a.ts - b.ts);
  return formatDateTime(valid[0].raw);
}

function lastDateLabel(values: Array<string | null | undefined>) {
  const valid = values
    .map((value) => ({ raw: value || "", ts: toTimestamp(value || null) }))
    .filter((item) => item.ts !== null) as Array<{ raw: string; ts: number }>;

  if (!valid.length) return "-";

  valid.sort((a, b) => b.ts - a.ts);
  return formatDateTime(valid[0].raw);
}


function getStatusLabel(projectStatus: string) {
  const status = normalizeStatus(projectStatus);

  const map: Record<string, string> = {
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
    ready_to_start: "Ready to Start",
    in_progress: "In Progress",
    review_pending: "Review Pending",
    invoice_pending: "Invoice Pending",
    payment_pending: "Payment Pending",
    employee_management_pending: "Employee Management Pending",
    conclude_job_pending: "Conclude Job Pending",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return map[status] || projectStatus || "No Status";
}

function getTaskStatus(rawStatus: string): StepVisualStatus {
  const normalized = normalizeStatus(rawStatus);

  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished"
  ) {
    return "done";
  }

  if (
    normalized === "in_progress" ||
    normalized === "active" ||
    normalized === "ongoing" ||
    normalized === "ready_to_start"
  ) {
    return "active";
  }

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

function collectSubTasks(mainTasks: Record<string, unknown>[]) {
  const subTasks: Record<string, unknown>[] = [];

  for (const mainTask of mainTasks) {
    subTasks.push(...asArray<Record<string, unknown>>(mainTask.subTasks));
    subTasks.push(...asArray<Record<string, unknown>>(mainTask.subtasks));
    subTasks.push(
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
    );
    subTasks.push(
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    );
  }

  return subTasks;
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

function collectEmployeesFromSubTask(
  subTask: Record<string, unknown>,
  employees: Set<string>,
) {
  const directUserId = readString(
    subTask.assignedUserId,
    subTask.assigned_user_id,
  );

  if (directUserId) employees.add(directUserId);

  const collections = [
    ...asArray<Record<string, unknown>>(subTask.assignedStaff),
    ...asArray<Record<string, unknown>>(subTask.assignedEmployees),
    ...asArray<Record<string, unknown>>(subTask.employees),
    ...asArray<Record<string, unknown>>(subTask.staff),
    ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
    ...asArray<Record<string, unknown>>(subTask.assigned_staff),
  ];

  for (const entry of collections) {
    const id = readString(entry.user_id, entry.userId, entry.id);
    if (id) employees.add(id);
  }
}

function collectEmployeeLabelsFromSubTask(subTask: Record<string, unknown>) {
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
    ...asArray<Record<string, unknown>>(subTask.assignedEmployees),
    ...asArray<Record<string, unknown>>(subTask.employees),
    ...asArray<Record<string, unknown>>(subTask.staff),
    ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
    ...asArray<Record<string, unknown>>(subTask.assigned_staff),
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

function collectEmployeeIdsFromSubTask(subTask: Record<string, unknown>) {
  const ids: string[] = [];

  const directId = readString(subTask.assignedUserId, subTask.assigned_user_id);
  if (directId) ids.push(directId);

  const collections = [
    ...asArray<Record<string, unknown>>(subTask.assignedStaff),
    ...asArray<Record<string, unknown>>(subTask.assignedEmployees),
    ...asArray<Record<string, unknown>>(subTask.employees),
    ...asArray<Record<string, unknown>>(subTask.staff),
    ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
    ...asArray<Record<string, unknown>>(subTask.assigned_staff),
  ];

  for (const entry of collections) {
    const nested =
      asRecord(entry.user) ||
      asRecord(entry.employee) ||
      asRecord(entry.profile);
    const id = readString(entry.user_id, entry.userId, nested?.id);
    if (id) ids.push(id);
  }

  return unique(ids);
}

function deriveProjectMeta(
  projectRow: RawProject | null,
  overviewProject: Record<string, unknown> | null,
  mainTasks: Record<string, unknown>[],
) {
  const subTasks = collectSubTasks(mainTasks);

  const employeeIds = new Set<string>();

  for (const subTask of subTasks) {
    collectEmployeesFromSubTask(subTask, employeeIds);
  }

  const startDatetime = readString(
    projectRow?.scheduledStartDatetime,
    typeof overviewProject?.scheduledStartDatetime === "string"
      ? overviewProject.scheduledStartDatetime
      : "",
    typeof overviewProject?.start_datetime === "string"
      ? overviewProject.start_datetime
      : "",
    typeof overviewProject?.startDatetime === "string"
      ? overviewProject.startDatetime
      : "",
    typeof overviewProject?.startDateTime === "string"
      ? overviewProject.startDateTime
      : "",
  );

  const endDatetime = readString(
    projectRow?.scheduledEndDatetime,
    typeof overviewProject?.scheduledEndDatetime === "string"
      ? overviewProject.scheduledEndDatetime
      : "",
    typeof overviewProject?.end_datetime === "string"
      ? overviewProject.end_datetime
      : "",
    typeof overviewProject?.endDatetime === "string"
      ? overviewProject.endDatetime
      : "",
    typeof overviewProject?.endDateTime === "string"
      ? overviewProject.endDateTime
      : "",
  );

  let durationHours = diffHours(startDatetime, endDatetime);

  if (!durationHours) {
    durationHours = subTasks.reduce((sum, subTask) => {
      return (
        sum +
        readNumber(
          subTask.estimatedHours,
          subTask.estimated_hours,
          subTask.durationHours,
          subTask.duration_hours,
        )
      );
    }, 0);
  }

  return {
    mainTaskCount: mainTasks.length,
    subTaskCount: subTasks.length,
    employeeCount: employeeIds.size,
    durationHours,
    startDatetime,
    endDatetime,
  };
}

function buildProcessItems(args: {
  projectStatus: string;
  mainTasks: Record<string, unknown>[];
  projectEnd: string | null;
  cancellationPhase: CancellationPhase | null;
  cancelledAt: string | null;
}) {
  const {
    projectStatus,
    mainTasks,
    projectEnd,
    cancellationPhase,
    cancelledAt,
  } = args;

  const normalized = normalizeStatus(projectStatus);
  const isCancelled = normalized === "cancelled";

  const items: ProcessItem[] = [];

  for (let index = 0; index < mainTasks.length; index += 1) {
    const mainTask = mainTasks[index];

    const allSubTasks = [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];

    // Cancelled projects: drop subtasks that never finished and skip
    // main tasks whose subtasks are all unfinished — same rule the admin
    // dashboard applies.
    const subTasks = isCancelled
      ? allSubTasks.filter((subTask) => {
          const rawStatus = readString(
            subTask.status,
            subTask.rawStatus,
            subTask.project_status,
          );
          return getTaskStatus(rawStatus) === "done";
        })
      : allSubTasks;

    if (isCancelled && subTasks.length === 0) continue;

    const childItems: ProcessItem[] = subTasks.map((subTask, subIndex) => {
      const rawStatus = readString(
        subTask.status,
        subTask.rawStatus,
        subTask.project_status,
      );
      const status = getTaskStatus(rawStatus);

      const employeeLabels = collectEmployeeLabelsFromSubTask(subTask);
      const employeeIds = collectEmployeeIdsFromSubTask(subTask);
      const scheduledStart = readString(
        subTask.scheduled_start_datetime,
        subTask.scheduledStartDatetime,
        subTask.start_datetime,
        subTask.startDatetime,
      );
      const completedAt = readString(subTask.updated_at, subTask.updatedAt);

      const estimatedHours = readNumber(
        subTask.estimatedHours,
        subTask.estimated_hours,
        subTask.durationHours,
        subTask.duration_hours,
      );

      return {
        id:
          readString(subTask.project_sub_task_id, subTask.id) ||
          `sub-task-${index}-${subIndex}`,
        title:
          readString(
            subTask.description,
            subTask.title,
            subTask.name,
            subTask.sub_task_name,
          ) || `Sub Task ${subIndex + 1}`,
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
                    subTask.scheduled_end_datetime,
                    subTask.scheduledEndDatetime,
                    subTask.end_datetime,
                    subTask.endDatetime,
                  ) ||
                  null,
              )
            : "-",
        detail: {
          employees: employeeLabels,
          employeeIds,
          estimatedHours: formatHours(estimatedHours),
          completedAt: completedAt || null,
        },
      };
    });

    const childStatuses = childItems.map((child) => child.status);

    const taskStatus: StepVisualStatus =
      childStatuses.length > 0 &&
      childStatuses.every((status) => status === "done")
        ? "done"
        : childStatuses.some((status) => status === "active")
          ? "active"
          : "pending";

    items.push({
      id: `task-${readString(mainTask.project_task_id, mainTask.id) || index}`,
      title:
        readString(
          mainTask.title,
          mainTask.name,
          mainTask.main_task_name,
          mainTask.mainTaskName,
        ) || `Main Task ${index + 1}`,
      status: taskStatus,
      startLabel: firstDateLabel(
        subTasks.map((subTask) =>
          readString(
            subTask.scheduled_start_datetime,
            subTask.scheduledStartDatetime,
            subTask.start_datetime,
            subTask.startDatetime,
          ),
        ),
      ),
      endLabel:
        taskStatus === "done"
          ? lastDateLabel(
              subTasks.map((subTask) =>
                readString(
                  subTask.scheduled_end_datetime,
                  subTask.scheduledEndDatetime,
                  subTask.end_datetime,
                  subTask.endDatetime,
                ),
              ),
            )
          : "-",
      children:
        childItems.length > 0
          ? childItems
          : [
              {
                id: `empty-${index}`,
                title: "No sub tasks yet",
                status: "pending",
                startLabel: "-",
                endLabel: "-",
              },
            ],
    });
  }

  if (isCancelled) {
    // Mirror the admin "Project Cancellation" group so staff see the
    // same wrap-up steps. Buttons are disabled for staff via
    // canManageCancellation=false on JobProgressCard, so this is
    // purely informational on their dashboard.
    const cancellationChildren: ProcessItem[] = CANCELLATION_STEPS.map(
      (step) => {
        const status = getCancellationStepVisualStatus(
          step.id,
          cancellationPhase,
        );
        return {
          id: step.id,
          title: step.title,
          status,
          startLabel: formatDateTime(cancelledAt),
          endLabel:
            status === "done"
              ? step.id === "cancellation-conclude"
                ? "Cancelled"
                : "Completed"
              : status === "active"
                ? "Working on it..."
                : "-",
        };
      },
    );

    items.push({
      id: "project-cancellation",
      title: "Project Cancellation",
      status: getCancellationGroupVisualStatus(cancellationPhase),
      startLabel: formatDateTime(cancelledAt),
      endLabel: "Cancelled",
      children: cancellationChildren,
    });
  }

  return items;
}

export default function DashboardPage() {
  const { isLoaded: isProjectTimeReferenceReady, referenceIso } =
    useProjectTimeReference();

  const [projects, setProjects] = useState<RawProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedDashboardDate, setSelectedDashboardDate] = useState(() =>
    formatDateInputValue(),
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );

  const [selectedProject, setSelectedProject] = useState<RawProject | null>(
    null,
  );

  const [overviewProject, setOverviewProject] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [mainTasks, setMainTasks] = useState<Record<string, unknown>[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Tracks the most recent project the staff member explicitly picked
  // from the dropdown. The auto-select effect honours it so a deliberate
  // pick of a finished project isn't overridden by the prefer-active
  // logic below.
  const explicitlyPickedIdRef = useRef<string | null>(null);

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isProjectTimeReferenceReady) return;

    // Honour ?date=YYYY-MM-DD if it's a valid calendar date — that's the
    // hand-off used by the staff schedule's "Go to dashboard" button so a
    // schedule pick lands on the same workday in the dashboard. Falls back
    // to the simulated reference clock (or wall clock) if the param is
    // missing or malformed.
    const requestedDate = searchParams?.get("date")?.trim() ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setSelectedDashboardDate(requestedDate);
      return;
    }

    setSelectedDashboardDate(
      formatDateInputValue(referenceIso ? new Date(referenceIso) : new Date()),
    );
  }, [isProjectTimeReferenceReady, referenceIso, searchParams]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    async function loadProjects() {
      try {
        setLoadingProjects(true);

        const response = await fetch("/api/schedule/getProjects");
        const data = (await response.json()) as ProjectsResponse;

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load projects.");
        }

        const nextProjects = Array.isArray(data?.projects) ? data.projects : [];
        setProjects(nextProjects);

        const firstProject = data?.currentProject ?? nextProjects[0] ?? null;

        if (firstProject) {
          setSelectedProjectId(firstProject.id);
          setSelectedProject(firstProject);
        }
      } catch (error) {
        console.error(error);
        setProjects([]);
        setSelectedProjectId(null);
        setSelectedProject(null);
      } finally {
        setLoadingProjects(false);
      }
    }

    loadProjects();
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedProjectId) return;

    // Cancel-on-rerun guard: prevents an older fetch's response from
    // landing AFTER a newer one (would otherwise overwrite mainTasks
    // and produce the "card briefly shows the right project, then
    // flips to a different one" bug).
    let cancelled = false;
    const runForId = selectedProjectId;

    async function loadProjectOverview() {
      try {
        setLoadingDetails(true);

        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
            runForId,
          )}`,
        );

        const data = (await response.json()) as OverviewResponse;

        if (cancelled || runForId !== selectedProjectId) return;

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load project overview.",
          );
        }

        const nextMainTasks = asArray<Record<string, unknown>>(data.mainTasks);
        const nextProject = asRecord(data.project);

        setOverviewProject(nextProject);
        setMainTasks(nextMainTasks);

        if (nextProject?.status) {
          const freshStatus = String(nextProject.status).trim().toLowerCase();

          setSelectedProject((prev) =>
            prev
              ? {
                  ...prev,
                  status: freshStatus,
                  rawStatus: freshStatus,
                }
              : prev,
          );

          setProjects((prev) =>
            prev.map((project) =>
              project.id === runForId
                ? {
                    ...project,
                    status: freshStatus,
                    rawStatus: freshStatus,
                  }
                : project,
            ),
          );
        }

        const defaultOpen = new Set<string>();

        const autoOpenMainTaskId = getAutoOpenMainTaskId(nextMainTasks);

        if (autoOpenMainTaskId) {
          defaultOpen.add(`task-${autoOpenMainTaskId}`);
        }

        setOpenProcessIds(defaultOpen);
        setOpenSubtaskIds(new Set());
      } catch (error) {
        if (cancelled || runForId !== selectedProjectId) return;
        console.error(error);
        setOverviewProject(null);
        setMainTasks([]);
        setOpenProcessIds(new Set());
        setOpenSubtaskIds(new Set());
      } finally {
        if (!cancelled && runForId === selectedProjectId) {
          setLoadingDetails(false);
        }
      }
    }

    loadProjectOverview();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, refreshKey]);

  // Realtime subscription on project_sub_task — when an admin or
  // another employee marks a subtask done, this dashboard's
  // mainTasks state patches in place without a refetch. See
  // useProjectSubtaskRealtime for the wiring details.
  const watchedProjectTaskIds = useMemo(() => {
    return mainTasks
      .map((mainTask) => {
        const value = mainTask.project_task_id ?? mainTask.id;
        return typeof value === "string" ? value : null;
      })
      .filter((id): id is string => Boolean(id));
  }, [mainTasks]);

  const patchSubtaskInState = useCallback((newRow: ProjectSubtaskRow) => {
    setMainTasks((prevMainTasks) => {
      let touched = false;
      const next = prevMainTasks.map((mainTask) => {
        const subtaskKeys = [
          "subTasks",
          "subtasks",
          "projectSubTasks",
          "project_sub_tasks",
        ] as const;

        const updatedMainTask = { ...mainTask };
        let mainTaskTouched = false;

        for (const key of subtaskKeys) {
          const subtasks = mainTask[key];
          if (!Array.isArray(subtasks)) continue;
          const patched = subtasks.map((subTask) => {
            const record = subTask as Record<string, unknown>;
            const id = String(
              record.project_sub_task_id ?? record.id ?? "",
            );
            if (id !== newRow.project_sub_task_id) return subTask;
            mainTaskTouched = true;
            return {
              ...record,
              status: newRow.status,
              scheduled_start_datetime: newRow.scheduled_start_datetime,
              scheduled_end_datetime: newRow.scheduled_end_datetime,
              updated_at: newRow.updated_at,
            };
          });
          if (mainTaskTouched) {
            (updatedMainTask as Record<string, unknown>)[key] = patched;
          }
        }

        if (mainTaskTouched) {
          touched = true;
          return updatedMainTask;
        }
        return mainTask;
      });

      return touched ? next : prevMainTasks;
    });
  }, []);

  const realtimeStatus = useProjectSubtaskRealtime({
    projectTaskIds: watchedProjectTaskIds,
    enabled: Boolean(selectedProjectId) && !loadingDetails,
    onSubtaskEvent: useCallback(
      (event) => {
        if (event.eventType === "INSERT" || event.eventType === "DELETE") {
          // Schema-shape events are rare during execution — fall back
          // to the heavyweight refresh so joined fields stay correct.
          setRefreshKey((k) => k + 1);
          return;
        }
        patchSubtaskInState(event.newRow);
      },
      [patchSubtaskInState],
    ),
  });

  // All projects scheduled for the selected date (regardless of
  // status). We keep this around so we can tell apart "the day is
  // genuinely empty" from "the day has projects but staff has nothing
  // actionable on them" — the empty-state copy differs.
  const projectsScheduledForDay = useMemo(() => {
    return projects.filter((project) =>
      isProjectOnDate(project, selectedDashboardDate),
    );
  }, [projects, selectedDashboardDate]);

  // Staff only sees in_progress projects — anything past the work
  // phase (review_pending, invoice_*, payment_*, etc.) belongs to
  // the admin's wrap-up, not to staff. Anything before in_progress
  // (job creation) is also admin-only. This filter applies to both
  // the workday picker dropdown and the auto-select target so the
  // staff dashboard never lands on a "done" project.
  const projectsForSelectedDate = useMemo(() => {
    return projectsScheduledForDay
      .filter((project) => {
        const status = String(project.rawStatus ?? project.status ?? "")
          .trim()
          .toLowerCase();
        return status === "in_progress";
      })
      .slice()
      .sort((a, b) => {
        const aTerm = isProjectTerminal(a);
        const bTerm = isProjectTerminal(b);
        if (aTerm === bTerm) return 0;
        return aTerm ? 1 : -1;
      });
  }, [projectsScheduledForDay]);

  // True when the day has scheduled projects but every one of them
  // has moved past in_progress — drives the "No work left today"
  // empty state vs the generic "No projects today".
  const dayHasOnlyDoneProjects =
    projectsScheduledForDay.length > 0 && projectsForSelectedDate.length === 0;

  useEffect(() => {
    if (projectsForSelectedDate.length === 0) {
      setSelectedProjectId(null);
      setSelectedProject(null);
      return;
    }

    const selected = projectsForSelectedDate.find(
      (project) => project.id === selectedProjectId,
    );

    if (!selected) {
      const nextProject = projectsForSelectedDate[0];
      setSelectedProjectId(nextProject.id);
      setSelectedProject(nextProject);
      return;
    }

    // Honour explicit dropdown picks even when terminal.
    if (explicitlyPickedIdRef.current === selectedProjectId) return;

    // Auto-driven selection lands on a finished project — flip to the
    // first active project on the same workday so the dashboard shows
    // the in-flight work by default.
    if (!isProjectTerminal(selected)) return;

    const firstActive = projectsForSelectedDate.find(
      (project) => !isProjectTerminal(project),
    );
    if (!firstActive) return;

    setSelectedProjectId(firstActive.id);
    setSelectedProject(firstActive);
  }, [projectsForSelectedDate, selectedProjectId]);

  const selectedStatus = readString(
    typeof overviewProject?.rawStatus === "string"
      ? overviewProject.rawStatus
      : "",
    typeof overviewProject?.status === "string" ? overviewProject.status : "",
    selectedProject?.rawStatus,
    selectedProject?.status,
  );

  const projectMeta = useMemo(() => {
    return deriveProjectMeta(selectedProject, overviewProject, mainTasks);
  }, [selectedProject, overviewProject, mainTasks]);

  const cancellationPhase = useMemo(
    () =>
      normalizeCancellationPhase(
        typeof overviewProject?.cancellation_phase === "string"
          ? (overviewProject.cancellation_phase as string)
          : null,
      ),
    [overviewProject],
  );

  const cancelledAt = useMemo(() => {
    const value = overviewProject?.cancelled_at;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [overviewProject]);

  const processItems = useMemo(() => {
    return buildProcessItems({
      projectStatus: selectedStatus,
      mainTasks,
      projectEnd: projectMeta.endDatetime || null,
      cancellationPhase,
      cancelledAt,
    });
  }, [
    selectedStatus,
    mainTasks,
    projectMeta.endDatetime,
    cancellationPhase,
    cancelledAt,
  ]);

  const reviewSummary = useMemo(() => {
    return buildProjectReviewSummary({
      project:
        overviewProject ||
        (selectedProject as unknown as Record<string, unknown> | null),
      mainTasks,
    });
  }, [overviewProject, selectedProject, mainTasks]);

  const employeeReviewItems = useMemo(() => {
    return buildEmployeeReviewItems(mainTasks, {
      referenceNow: referenceIso,
    });
  }, [mainTasks, referenceIso]);

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

  async function handleFinishSubtask(subtaskId: string) {
    const res = await fetch("/api/planning/updateSubTaskStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSubTaskId: subtaskId, status: "completed" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        [data?.error, data?.details].filter(Boolean).join(": ") ||
          "Failed to update subtask.",
      );
    }

    // Cascade runs in the background server-side now and broadcasts
    // its updates via realtime — the dashboard auto-patches the
    // shifted subtask times. If it fails, the server logs it and
    // the user notices their schedule didn't move. We no longer
    // surface a per-call cascade warning here.

    const nextProjectStatus =
      typeof data?.projectStatus === "string" && data.projectStatus.trim()
        ? data.projectStatus.trim().toLowerCase()
        : "";

    if (nextProjectStatus) {
      setSelectedProject((prev) =>
        prev
          ? {
              ...prev,
              status: nextProjectStatus,
              rawStatus: nextProjectStatus,
            }
          : prev,
      );

      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProjectId
            ? {
                ...project,
                status: nextProjectStatus,
                rawStatus: nextProjectStatus,
              }
            : project,
        ),
      );
    }

    // No `setRefreshKey((k) => k + 1)` here on purpose — the realtime
    // subscription on project_sub_task patches the finishing subtask's
    // status change AND the cascade's later-subtask shifts as their
    // UPDATE events broadcast. Triggering a full overview refetch
    // would do the same work twice and add ~200-500ms to the
    // perceived "Finishing..." spinner. Project status flip is
    // covered by the optimistic setters above.
  }

  function handleDashboardProjectChange(projectId: string) {
    const nextProject = projects.find((project) => project.id === projectId);

    if (!nextProject) return;

    // Dropdown click is explicit — don't let the auto-select effect
    // flip back to an active sibling on the next render.
    explicitlyPickedIdRef.current = projectId;
    setSelectedProjectId(nextProject.id);
    setSelectedProject(nextProject);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 px-3 py-3 sm:px-4 sm:py-4 lg:grid lg:h-screen lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden lg:px-[1.4%] lg:py-[1.2%]">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-xl font-semibold leading-8 text-gray-900 sm:text-2xl">
          Dashboard
        </h1>
        <DashboardClock />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4 lg:mt-[1.2%] lg:grid lg:min-h-0 lg:gap-0 lg:overflow-hidden lg:grid-rows-[12fr_minmax(0,88fr)] lg:gap-y-[2.2%]">
        {/* Top section */}
        <section className="lg:min-h-0 lg:overflow-hidden">
          <CurrentJobCard
            statusLabel={getStatusLabel(selectedStatus)}
            jobNo={
              selectedProject?.projectCode ||
              selectedProject?.project_code ||
              "No project code"
            }
            siteName={selectedProject?.title || "No selected project"}
            selectedDate={selectedDashboardDate}
            projects={projectsForSelectedDate as CurrentJobOption[]}
            selectedProjectId={selectedProjectId}
            onDateChange={setSelectedDashboardDate}
            onProjectChange={handleDashboardProjectChange}
          />
        </section>

        {/* Bottom section */}
        <section className="flex flex-col gap-3 sm:gap-4 lg:grid lg:min-h-0 lg:gap-0 lg:overflow-hidden lg:grid-cols-[7fr_3fr] lg:gap-x-[1.2%]">
          <div className="h-[70vh] sm:h-[75vh] lg:h-auto lg:min-h-0 lg:overflow-hidden">
            <JobProgressCard
              selectedProject={selectedProject}
              projectId={selectedProjectId}
              loadingDetails={loadingProjects || loadingDetails}
              navigating={loadingProjects || loadingDetails}
              processItems={processItems}
              openProcessIds={openProcessIds}
              openSubtaskIds={openSubtaskIds}
              toggleProcessRow={toggleProcessRow}
              toggleSubtaskRow={toggleSubtaskRow}
              onFinishSubtask={handleFinishSubtask}
              onRefresh={() => setRefreshKey((k) => k + 1)}
              currentUserId={currentUserId}
              employeeReviewItems={employeeReviewItems}
              reviewSummary={reviewSummary}
              emptyProjectState={
                dayHasOnlyDoneProjects
                  ? "no-work-left-today"
                  : "no-projects-today"
              }
              cancellationPhase={cancellationPhase}
              canManageCancellation={false}
              realtimeStatus={realtimeStatus}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-none lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-[2%] lg:overflow-hidden">
            <div className="h-72 sm:h-80 lg:h-auto lg:min-h-0 lg:overflow-hidden">
              <EmployeesCard />
            </div>

            <div className="h-72 sm:h-80 lg:h-auto lg:min-h-0 lg:overflow-hidden">
              <NotificationsCard notifications={[]} />
            </div>

            <div className="h-80 md:col-span-2 sm:h-96 lg:h-auto lg:col-span-1 lg:min-h-0 lg:overflow-hidden">
              <DashboardInsightCard
                processItems={processItems}
                loadingDetails={loadingProjects || loadingDetails}
                projectId={selectedProjectId}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
