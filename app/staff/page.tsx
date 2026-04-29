"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import CurrentJobCard, {
  CurrentJobOption,
} from "../../components/dashboard/currentJobCard";
import EmployeesCard from "../../components/dashboard/employeesCard";
import JobProgressCard from "../../components/dashboard/jobProgressCard";
import DashboardInsightCard from "../../components/dashboard/dashboardInsightCard";
import JobNumberCard from "@/components/jobNumberCard";
import NotificationsCard from "@/components/dashboard/notificationsCard";
import { buildEmployeeReviewItems } from "@/lib/planning/employeePerformance";
import { buildProjectReviewSummary } from "@/lib/planning/projectReviewSummary";
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
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
  clientName?: string | null;
  siteAddress?: string | null;
};

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


function normalizeStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
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
}) {
  const { projectStatus, mainTasks, projectEnd } = args;

  const normalized = normalizeStatus(projectStatus);

  const items: ProcessItem[] = [];

  for (let index = 0; index < mainTasks.length; index += 1) {
    const mainTask = mainTasks[index];

    const subTasks = [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];

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
      normalized === "completed"
        ? formatDateTime(projectEnd)
        : normalized === "cancelled"
          ? "Cancelled"
          : manageEndStatus === "active"
            ? "Working on it..."
            : "-",
    children: manageEndChildren,
  });

  return items;
}

export default function DashboardPage() {
  const router = useRouter();
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

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isProjectTimeReferenceReady) return;

    setSelectedDashboardDate(
      formatDateInputValue(referenceIso ? new Date(referenceIso) : new Date()),
    );
  }, [isProjectTimeReferenceReady, referenceIso]);

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
  }, []);

  useEffect(() => {
    async function loadProjectOverview() {
      if (!selectedProjectId) return;

      try {
        setLoadingDetails(true);

        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
            selectedProjectId,
          )}`,
        );

        const data = (await response.json()) as OverviewResponse;

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
              project.id === selectedProjectId
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
        console.error(error);
        setOverviewProject(null);
        setMainTasks([]);
        setOpenProcessIds(new Set());
        setOpenSubtaskIds(new Set());
      } finally {
        setLoadingDetails(false);
      }
    }

    loadProjectOverview();
  }, [selectedProjectId, refreshKey]);

  const projectsForSelectedDate = useMemo(() => {
    const matchingProjects = projects.filter((project) =>
      isProjectOnDate(project, selectedDashboardDate),
    );

    return matchingProjects.length > 0 ? matchingProjects : projects;
  }, [projects, selectedDashboardDate]);

  useEffect(() => {
    if (projectsForSelectedDate.length === 0) {
      setSelectedProjectId(null);
      setSelectedProject(null);
      return;
    }

    const selectedStillValid = projectsForSelectedDate.some(
      (project) => project.id === selectedProjectId,
    );

    if (selectedStillValid) return;

    const nextProject = projectsForSelectedDate[0];

    setSelectedProjectId(nextProject.id);
    setSelectedProject(nextProject);
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

  const processItems = useMemo(() => {
    return buildProcessItems({
      projectStatus: selectedStatus,
      mainTasks,
      projectEnd: projectMeta.endDatetime || null,
    });
  }, [selectedStatus, mainTasks, projectMeta.endDatetime]);

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

    setRefreshKey((k) => k + 1);
  }

  function handleDashboardProjectChange(projectId: string) {
    const nextProject = projects.find((project) => project.id === projectId);

    if (!nextProject) return;

    setSelectedProjectId(nextProject.id);
    setSelectedProject(nextProject);
  }

  /**
   * Dashboard layout percentages.
   * Change only these values when adjusting the top/bottom dashboard height.
   */
  const dashboardTopHeight = "12fr";
  const dashboardBottomHeight = "88fr";

  /**
   * Bottom section layout percentages.
   * Change these if you want Progress / Right Panel to be wider or smaller.
   */
  const progressColumnWidth = "7fr";
  const sideColumnWidth = "3fr";

  return (
    <div className="grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-gray-50 px-[1.4%] py-[1.2%]">
      <h1 className="shrink-0 text-2xl font-semibold leading-8 text-gray-900">
        Dashboard
      </h1>

      <div
        className="mt-[1.2%] grid min-h-0 overflow-hidden"
        style={{
          gridTemplateRows: `${dashboardTopHeight} minmax(0, ${dashboardBottomHeight})`,
          rowGap: "2.2%",
        }}>
        {/* Top section */}
        <section className="min-h-0 overflow-hidden">
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
            onCreateJob={() => router.push("/admin/job-creation/basic-details")}
          />
        </section>

        {/* Bottom section */}
        <section
          className="grid min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-none"
          style={{
            gridTemplateColumns: `${progressColumnWidth} ${sideColumnWidth}`,
            columnGap: "1.2%",
          }}>
          <div className="min-h-0 overflow-hidden">
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
              currentUserId={currentUserId}
              employeeReviewItems={employeeReviewItems}
              reviewSummary={reviewSummary}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-[2%] overflow-hidden">
            <div className="min-h-0 overflow-hidden">
              <EmployeesCard />
            </div>

            <div className="min-h-0 overflow-hidden">
              <NotificationsCard notifications={[]} />
            </div>

            <div className="min-h-0 overflow-hidden">
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
