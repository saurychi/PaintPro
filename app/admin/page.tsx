"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import CurrentJobCard, {
  CurrentJobOption,
} from "../../components/dashboard/currentJobCard";
import EmployeesCard from "../../components/dashboard/employeesCard";
import JobProgressCard from "../../components/dashboard/jobProgressCard";
import DashboardInsightCard from "../../components/dashboard/dashboardInsightCard";
import JobNumberCard from "@/components/jobNumberCard";
import NotificationsCard from "@/components/dashboard/notificationsCard";

type StepVisualStatus = "done" | "active" | "pending";

type ProcessDetail = {
  employees: string[];
  estimatedHours: string;
};

type ProcessItem = {
  id: string;
  title: string;
  status: StepVisualStatus;
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

type WorkflowStep = {
  key: string;
  title: string;
  rawStatus: string;
  route: (projectId: string) => string;
};

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    key: "main-task",
    title: "Main Task Assignment",
    rawStatus: "main_task_pending",
    route: (projectId) =>
      `/admin/job-creation/main-task-assignment?projectId=${projectId}`,
  },
  {
    key: "sub-task",
    title: "Sub Task Assignment",
    rawStatus: "sub_task_pending",
    route: (projectId) =>
      `/admin/job-creation/sub-task-assignment?projectId=${projectId}`,
  },
  {
    key: "materials",
    title: "Materials Assignment",
    rawStatus: "materials_pending",
    route: (projectId) =>
      `/admin/job-creation/materials-assignment?projectId=${projectId}`,
  },
  {
    key: "equipment",
    title: "Equipment Assignment",
    rawStatus: "equipment_pending",
    route: (projectId) =>
      `/admin/job-creation/equipment-assignment?projectId=${projectId}`,
  },
  {
    key: "schedule",
    title: "Project Schedule",
    rawStatus: "schedule_pending",
    route: (projectId) =>
      `/admin/job-creation/project-schedule?projectId=${projectId}`,
  },
  {
    key: "employee-assignment",
    title: "Employee Assignment",
    rawStatus: "employee_assignment_pending",
    route: (projectId) =>
      `/admin/job-creation/employee-assignment?projectId=${projectId}`,
  },
  {
    key: "cost-estimation",
    title: "Cost Estimation",
    rawStatus: "cost_estimation_pending",
    route: (projectId) =>
      `/admin/job-creation/cost-estimation?projectId=${projectId}`,
  },
  {
    key: "overview",
    title: "Overview",
    rawStatus: "overview_pending",
    route: (projectId) => `/admin/job-creation/overview?projectId=${projectId}`,
  },
  {
    key: "quotation",
    title: "Quotation Generation",
    rawStatus: "quotation_pending",
    route: (projectId) =>
      `/admin/job-creation/quotation-generation?projectId=${projectId}`,
  },
];

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

function getCurrentWorkflowIndex(status: string) {
  const normalized = normalizeStatus(status);

  const index = WORKFLOW_STEPS.findIndex(
    (step) => step.rawStatus === normalized,
  );

  if (index >= 0) return index;

  if (normalized === "ready_to_start") return WORKFLOW_STEPS.length;
  if (normalized === "in_progress") return WORKFLOW_STEPS.length + 1;
  if (normalized === "completed") return WORKFLOW_STEPS.length + 2;
  if (normalized === "cancelled") return -2;

  return 0;
}

function getStepStatus(
  projectStatus: string,
  stepIndex: number,
): StepVisualStatus {
  const currentIndex = getCurrentWorkflowIndex(projectStatus);

  if (currentIndex === -2) return "pending";
  if (currentIndex > stepIndex) return "done";
  if (currentIndex === stepIndex) return "active";

  return "pending";
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
  workflowSteps: Array<WorkflowStep & { visualStatus: StepVisualStatus }>;
  mainTasks: Record<string, unknown>[];
  projectStart: string | null;
  projectEnd: string | null;
}) {
  const { projectStatus, workflowSteps, mainTasks, projectStart, projectEnd } =
    args;

  const normalized = normalizeStatus(projectStatus);

  const jobCreationStatus: StepVisualStatus = workflowSteps.every(
    (step) => step.visualStatus === "done",
  )
    ? "done"
    : workflowSteps.some((step) => step.visualStatus === "active")
      ? "active"
      : "pending";

  const items: ProcessItem[] = [
    {
      id: "job-creation",
      title: "Job Creation",
      status: jobCreationStatus,
      startLabel: formatDateTime(projectStart),
      endLabel:
        jobCreationStatus === "done"
          ? "Completed"
          : jobCreationStatus === "active"
            ? "Working on it..."
            : "-",
      children: workflowSteps.map((step) => ({
        id: `workflow-${step.key}`,
        title: step.title,
        status: step.visualStatus,
        startLabel: "-",
        endLabel:
          step.visualStatus === "done"
            ? "Completed"
            : step.visualStatus === "active"
              ? "Working on it..."
              : "-",
      })),
    },
  ];

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

  for (let index = 0; index < mainTasks.length; index += 1) {
    const mainTask = mainTasks[index];

    const subTasks = [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];

    const childItems: ProcessItem[] = subTasks.map((subTask, subIndex) => {
      const status = getTaskStatus(
        readString(subTask.status, subTask.rawStatus, subTask.project_status),
      );

      const employeeLabels = collectEmployeeLabelsFromSubTask(subTask);

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
        startLabel: formatDateTime(
          readString(
            subTask.scheduled_start_datetime,
            subTask.scheduledStartDatetime,
            subTask.start_datetime,
            subTask.startDatetime,
          ) || null,
        ),
        endLabel:
          status === "done"
            ? formatDateTime(
                readString(
                  subTask.scheduled_end_datetime,
                  subTask.scheduledEndDatetime,
                  subTask.end_datetime,
                  subTask.endDatetime,
                ) || null,
              )
            : "-",
        detail: {
          employees: employeeLabels,
          estimatedHours: formatHours(estimatedHours),
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

  const concludeStatus: StepVisualStatus =
    normalized === "completed" || normalized === "cancelled"
      ? "done"
      : "pending";

  items.push({
    id: "conclude-job",
    title: "Conclude Job",
    status: concludeStatus,
    startLabel: formatDateTime(projectEnd),
    endLabel:
      normalized === "completed"
        ? "Completed"
        : normalized === "cancelled"
          ? "Cancelled"
          : "Working on it...",
    children: [
      {
        id: "project-closure",
        title:
          normalized === "cancelled" ? "Project Cancelled" : "Project Closure",
        status: concludeStatus,
        startLabel: formatDateTime(projectEnd),
        endLabel:
          normalized === "completed"
            ? "Completed"
            : normalized === "cancelled"
              ? "Cancelled"
              : "Working on it...",
      },
    ],
  });

  return items;
}

export default function DashboardPage() {
  const router = useRouter();

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

        setOverviewProject(asRecord(data.project));
        setMainTasks(nextMainTasks);

        const defaultOpen = new Set<string>(["job-creation"]);

        if (nextMainTasks.length > 0) {
          const firstMainTaskId =
            readString(nextMainTasks[0].project_task_id, nextMainTasks[0].id) ||
            "0";

          defaultOpen.add(`task-${firstMainTaskId}`);
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
  }, [selectedProjectId]);

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

  const selectedStatus =
    selectedProject?.rawStatus || selectedProject?.status || "";

  const projectMeta = useMemo(() => {
    return deriveProjectMeta(selectedProject, overviewProject, mainTasks);
  }, [selectedProject, overviewProject, mainTasks]);

  const workflowSteps = useMemo(() => {
    return WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      visualStatus: getStepStatus(selectedStatus, index),
    }));
  }, [selectedStatus]);

  const processItems = useMemo(() => {
    return buildProcessItems({
      projectStatus: selectedStatus,
      workflowSteps,
      mainTasks,
      projectStart: projectMeta.startDatetime || null,
      projectEnd: projectMeta.endDatetime || null,
    });
  }, [
    selectedStatus,
    workflowSteps,
    mainTasks,
    projectMeta.startDatetime,
    projectMeta.endDatetime,
  ]);

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

  function handleStartMainTasks() {
    if (!selectedProjectId) return;

    router.push(
      `/admin/job-creation/main-task-assignment?projectId=${selectedProjectId}`,
    );
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
              handleStartMainTasks={handleStartMainTasks}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-[2%] overflow-hidden">
            <div className="min-h-0 overflow-hidden">
              <EmployeesCard />
            </div>

            <div className="min-h-0 overflow-hidden">
              <NotificationsCard limit={4} />
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
