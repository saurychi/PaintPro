"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import JobProgressCard, {
  type ProcessItem,
} from "@/components/dashboard/jobProgressCard";

const ACCENT = "#00c065";
const GREEN = "#7ED957";

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

type StepVisualStatus = "done" | "active" | "pending";

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

function getOverallProgress(projectStatus: string) {
  const normalized = normalizeStatus(projectStatus);

  if (normalized === "cancelled") return 0;
  if (
    normalized === "completed" ||
    normalized === "in_progress" ||
    normalized === "ready_to_start"
  ) {
    return 100;
  }

  const currentIndex = getCurrentWorkflowIndex(projectStatus);
  const total = WORKFLOW_STEPS.length;

  if (currentIndex <= 0) return 8;

  return Math.max(8, Math.min(100, Math.round((currentIndex / total) * 100)));
}

function getStatusBadge(projectStatus: string) {
  const status = normalizeStatus(projectStatus);

  const map: Record<
    string,
    { label: string; bg: string; border: string; color: string }
  > = {
    main_task_pending: {
      label: "Main Task Pending",
      bg: "#fefce8",
      border: "#fde68a",
      color: "#854d0e",
    },
    sub_task_pending: {
      label: "Sub Task Pending",
      bg: "#fefce8",
      border: "#fde68a",
      color: "#854d0e",
    },
    materials_pending: {
      label: "Materials Pending",
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
    },
    equipment_pending: {
      label: "Equipment Pending",
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
    },
    schedule_pending: {
      label: "Schedule Pending",
      bg: "#f5f3ff",
      border: "#ddd6fe",
      color: "#6d28d9",
    },
    employee_assignment_pending: {
      label: "Employee Assignment Pending",
      bg: "#fdf2f8",
      border: "#fbcfe8",
      color: "#be185d",
    },
    cost_estimation_pending: {
      label: "Cost Estimation Pending",
      bg: "#fff7ed",
      border: "#fed7aa",
      color: "#c2410c",
    },
    overview_pending: {
      label: "Overview Pending",
      bg: "#ecfeff",
      border: "#a5f3fc",
      color: "#0f766e",
    },
    quotation_pending: {
      label: "Quotation Pending",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      color: "#15803d",
    },
    ready_to_start: {
      label: "Ready to Start",
      bg: "#dcfce7",
      border: "#86efac",
      color: "#166534",
    },
    in_progress: {
      label: "In Progress",
      bg: "#dbeafe",
      border: "#93c5fd",
      color: "#1d4ed8",
    },
    completed: {
      label: "Completed",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
    },
    cancelled: {
      label: "Cancelled",
      bg: "#f3f4f6",
      border: "#d1d5db",
      color: "#4b5563",
    },
  };

  return (
    map[status] || {
      label: projectStatus || "Unknown",
      bg: "#f9fafb",
      border: "#e5e7eb",
      color: "#374151",
    }
  );
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

function processStatusLabel(status: StepVisualStatus) {
  if (status === "done") return "Completed";
  if (status === "active") return "Working on it...";
  return "Not started";
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
            : status === "active"
              ? "-"
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
          : taskStatus === "active"
            ? "-"
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

function StepIcon({
  status,
  size = "md",
}: {
  status: StepVisualStatus;
  size?: "md" | "lg";
}) {
  const isLarge = size === "lg";
  const chartSize = isLarge ? 20 : 16;

  const doneData = [
    { name: "value", value: 100 },
    { name: "rest", value: 0 },
  ];

  const pendingData = [
    { name: "value", value: 100 },
    { name: "rest", value: 0 },
  ];

  const activeData = [
    { name: "value", value: 72 },
    { name: "rest", value: 28 },
  ];

  const data =
    status === "done"
      ? doneData
      : status === "active"
        ? activeData
        : pendingData;

  const colors =
    status === "done"
      ? ["#7ED957", "#7ED957"]
      : status === "active"
        ? ["#6B7280", "#E5E7EB"]
        : ["#C4C9D4", "#C4C9D4"];

  return (
    <div
      className="relative shrink-0"
      style={{ width: chartSize, height: chartSize }}>
      <PieChart width={chartSize} height={chartSize}>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={isLarge ? 6.5 : 5}
          outerRadius={isLarge ? 9.5 : 7.5}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={`${status}-${index}`} fill={colors[index]} />
          ))}
        </Pie>
      </PieChart>
    </div>
  );
}

function TimelineMarker({
  status,
  showLine,
  isChild = false,
}: {
  status: StepVisualStatus;
  showLine: boolean;
  isChild?: boolean;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-start justify-center ${
        isChild ? "w-5" : "w-7"
      }`}>
      <StepIcon status={status} size={isChild ? "md" : "lg"} />

      {showLine ? (
        <div
          className={`absolute left-1/2 -translate-x-1/2 border-l border-dashed border-gray-400 ${
            isChild ? "top-4 bottom-[-10px]" : "top-5 bottom-[-14px]"
          }`}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function statusText(status: StepVisualStatus) {
  if (status === "done") return "Completed";
  if (status === "active") return "Working on it...";
  return "Not started";
}

function statusTone(status: StepVisualStatus) {
  if (status === "done") return "text-gray-900";
  if (status === "active") return "text-gray-900";
  return "text-gray-400";
}

function ProcessFlowSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      </div>

      <div className="px-6 py-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[40px_minmax(0,2fr)_135px_135px] items-center gap-4 py-3">
            <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
            <div className="h-4 w-52 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

export default function AdminProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<RawProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

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
  const [navigating, setNavigating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [overlapSlideIndex, setOverlapSlideIndex] = useState(0);

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());

  const projectMeta = useMemo(() => {
    return deriveProjectMeta(selectedProject, overviewProject, mainTasks);
  }, [selectedProject, overviewProject, mainTasks]);

  const overlapAnchorDate = useMemo(() => {
    const selectedDate =
      selectedProject?.scheduledStartDatetime ||
      projectMeta.startDatetime ||
      null;

    if (!selectedDate) return null;

    const parsed = new Date(selectedDate);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString().slice(0, 10);
  }, [selectedProject?.scheduledStartDatetime, projectMeta.startDatetime]);

  const overlappingProjects = useMemo(() => {
    if (!overlapAnchorDate) {
      return selectedProject ? [selectedProject] : projects.slice(0, 1);
    }

    const sameDayProjects = projects.filter((project) => {
      const value = project.scheduledStartDatetime || null;
      if (!value) return false;

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;

      return parsed.toISOString().slice(0, 10) === overlapAnchorDate;
    });

    if (sameDayProjects.length > 0) return sameDayProjects;

    return selectedProject ? [selectedProject] : projects.slice(0, 1);
  }, [projects, selectedProject, overlapAnchorDate]);

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

  useEffect(() => {
    setOverlapSlideIndex((prev) =>
      Math.min(prev, Math.max(overlappingProjects.length - 1, 0)),
    );
  }, [overlappingProjects.length]);

  const selectedStatus =
    selectedProject?.rawStatus || selectedProject?.status || "";
  const selectedBadge = getStatusBadge(selectedStatus);

  const clampedOverlapSlideIndex = Math.min(
    overlapSlideIndex,
    Math.max(overlappingProjects.length - 1, 0),
  );

  const activeOverlapProject =
    overlappingProjects[clampedOverlapSlideIndex] ?? null;

  const canGoPrevOverlap =
    overlappingProjects.length > 1 && clampedOverlapSlideIndex > 0;

  const canGoNextOverlap =
    overlappingProjects.length > 1 &&
    clampedOverlapSlideIndex < overlappingProjects.length - 1;
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

  const projectCodeValue =
    selectedProject?.projectCode || selectedProject?.project_code || "No Code";

  const currentOrNewestSubTask = useMemo(() => {
    const allSubTasks = mainTasks.flatMap((mainTask) => [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ]);

    if (allSubTasks.length === 0) return null;

    const normalizedSubTasks = allSubTasks
      .map((subTask) => {
        const start =
          readString(
            subTask.scheduled_start_datetime,
            subTask.scheduledStartDatetime,
            subTask.start_datetime,
            subTask.startDatetime,
          ) || null;

        const end =
          readString(
            subTask.scheduled_end_datetime,
            subTask.scheduledEndDatetime,
            subTask.end_datetime,
            subTask.endDatetime,
          ) || null;

        const rawStatus = readString(
          subTask.status,
          subTask.rawStatus,
          subTask.project_status,
        );

        return {
          raw: subTask,
          start,
          end,
          status: getTaskStatus(rawStatus),
          sortTime: new Date(start || end || 0).getTime(),
        };
      })
      .filter((item) => item.start || item.end);

    if (normalizedSubTasks.length === 0) return null;

    const activeSubTask =
      normalizedSubTasks.find((item) => item.status === "active") || null;

    if (activeSubTask) return activeSubTask;

    return [...normalizedSubTasks].sort((a, b) => b.sortTime - a.sortTime)[0];
  }, [mainTasks]);

  const schedulePace = useMemo(() => {
    if (!currentOrNewestSubTask) {
      return {
        label: "No schedule",
        bg: "#F9FAFB",
        border: "#E5E7EB",
        color: "#6B7280",
      };
    }

    const now = Date.now();
    const startTime = currentOrNewestSubTask.start
      ? new Date(currentOrNewestSubTask.start).getTime()
      : NaN;
    const endTime = currentOrNewestSubTask.end
      ? new Date(currentOrNewestSubTask.end).getTime()
      : NaN;

    if (!Number.isNaN(startTime) && now < startTime) {
      return {
        label: "Early",
        bg: "#EFF6FF",
        border: "#BFDBFE",
        color: "#1D4ED8",
      };
    }

    if (!Number.isNaN(endTime) && now > endTime) {
      return {
        label: "Late",
        bg: "#FEF2F2",
        border: "#FECACA",
        color: "#B91C1C",
      };
    }

    return {
      label: "Normal",
      bg: "#F0FDF4",
      border: "#BBF7D0",
      color: "#15803D",
    };
  }, [currentOrNewestSubTask]);

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

  async function handleCopyProjectCode() {
    if (!projectCodeValue || projectCodeValue === "No Code") return;

    try {
      await navigator.clipboard.writeText(projectCodeValue);
      setCopiedCode(true);

      window.setTimeout(() => {
        setCopiedCode(false);
      }, 1800);
    } catch (error) {
      console.error(error);
      setCopiedCode(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc]">
      <div className="flex h-full flex-col p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>

        <div className="mt-6 grid h-[calc(100vh-112px)] grid-cols-1 gap-4 overflow-hidden lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-9 h-full min-h-0 overflow-hidden">
            <JobProgressCard
              selectedProject={selectedProject}
              loadingDetails={loadingDetails}
              navigating={loadingDetails}
              processItems={processItems as ProcessItem[]}
              openProcessIds={openProcessIds}
              openSubtaskIds={openSubtaskIds}
              toggleProcessRow={toggleProcessRow}
              toggleSubtaskRow={toggleSubtaskRow}
              handleStartMainTasks={handleStartMainTasks}
            />
          </div>

          <aside className="lg:col-span-3 grid min-h-0 grid-cols-1 grid-rows-[minmax(0,2.75fr)_minmax(0,2.25fr)] gap-4">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />

              {!selectedProject ? (
                <div className="flex flex-1 items-center justify-center px-4 py-5 text-center text-sm text-gray-500">
                  Select a project to view its details.
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col px-5 py-2">
                  <div className="space-y-5">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold leading-6 text-gray-900">
                        {selectedProject.title || "Untitled Project"}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: selectedBadge.bg,
                            borderColor: selectedBadge.border,
                            color: selectedBadge.color,
                          }}>
                          {selectedBadge.label}
                        </span>

                        <span
                          className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: schedulePace.bg,
                            borderColor: schedulePace.border,
                            color: schedulePace.color,
                          }}>
                          {schedulePace.label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        Project Code
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                        <div className="min-w-0 truncate font-mono text-[12px] text-slate-700">
                          {projectCodeValue}
                        </div>

                        <button
                          type="button"
                          onClick={handleCopyProjectCode}
                          className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Copy project code">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {copiedCode ? (
                        <div className="mt-1 text-[10px] font-medium text-emerald-600">
                          Copied
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
                          Scheduled Start Datetime
                        </div>
                        <div className="mt-1 text-[12px] font-medium leading-5 text-gray-900">
                          {formatDateTime(
                            currentOrNewestSubTask?.start ||
                              projectMeta.startDatetime,
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
                          Scheduled End Datetime
                        </div>
                        <div className="mt-1 text-[12px] font-medium leading-5 text-gray-900">
                          {formatDateTime(
                            currentOrNewestSubTask?.end ||
                              projectMeta.endDatetime,
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />

              <div className="border-b border-gray-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-5 text-gray-900">
                    Projects on the Same Day
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-gray-500">
                    {overlapAnchorDate
                      ? `Showing projects scheduled on ${overlapAnchorDate}.`
                      : "Choose which project to display in the process flow."}
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] px-4 py-4">
                <div className="flex min-h-0 items-start overflow-hidden">
                  {loadingProjects ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                        <p className="mt-2 text-sm text-gray-500">
                          Loading projects...
                        </p>
                      </div>
                    </div>
                  ) : overlappingProjects.length === 0 ||
                    !activeOverlapProject ? (
                    <div className="flex h-full w-full items-center justify-center text-center text-sm text-gray-500">
                      No projects found.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(activeOverlapProject.id);
                        setSelectedProject(activeOverlapProject);
                      }}
                      className={`flex w-full flex-col overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition ${
                        activeOverlapProject.id === selectedProjectId
                          ? "border-emerald-300 bg-emerald-50 shadow-sm"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}>
                      <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-gray-500">
                        {activeOverlapProject.projectCode ||
                          activeOverlapProject.project_code ||
                          "No Code"}
                      </div>

                      <div className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-[1.15rem] text-gray-900">
                        {activeOverlapProject.title || "Untitled Project"}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span
                          className="inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{
                            backgroundColor: getStatusBadge(
                              activeOverlapProject.rawStatus ||
                                activeOverlapProject.status ||
                                "",
                            ).bg,
                            borderColor: getStatusBadge(
                              activeOverlapProject.rawStatus ||
                                activeOverlapProject.status ||
                                "",
                            ).border,
                            color: getStatusBadge(
                              activeOverlapProject.rawStatus ||
                                activeOverlapProject.status ||
                                "",
                            ).color,
                          }}>
                          {
                            getStatusBadge(
                              activeOverlapProject.rawStatus ||
                                activeOverlapProject.status ||
                                "",
                            ).label
                          }
                        </span>

                        <span className="text-[9px] font-medium text-gray-400">
                          {clampedOverlapSlideIndex + 1}/
                          {overlappingProjects.length}
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOverlapSlideIndex((prev) => Math.max(prev - 1, 0))
                    }
                    disabled={!canGoPrevOverlap}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                      canGoPrevOverlap
                        ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        : "border-gray-200 bg-gray-100 text-gray-300"
                    }`}
                    aria-label="Previous overlapping project">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setOverlapSlideIndex((prev) =>
                        Math.min(prev + 1, overlappingProjects.length - 1),
                      )
                    }
                    disabled={!canGoNextOverlap}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      canGoNextOverlap
                        ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        : "border-gray-200 bg-gray-100 text-gray-300"
                    }`}
                    aria-label="Next overlapping project">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
