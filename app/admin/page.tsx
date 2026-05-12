"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import CurrentJobCard, {
  CurrentJobOption,
} from "../../components/dashboard/currentJobCard";
import DashboardClock from "../../components/dashboard/dashboardClock";
import EmployeesCard from "../../components/dashboard/employeesCard";
import JobProgressCard, {
  type StepVisualStatus,
  type ProcessItem,
} from "../../components/dashboard/jobProgressCard";
import DashboardInsightCard from "../../components/dashboard/dashboardInsightCard";
import NotificationsCard from "@/components/dashboard/notificationsCard";
import CancelProjectModal from "@/components/project-cancellation/CancelProjectModal";
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
import { useUserSignature } from "@/lib/hooks/useUserSignature";

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
    title: "Conclude Project",
    pendingStatus: "conclude_job_pending",
  },
] as const;

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

// Persist the dashboard workday across refreshes. Stored in sessionStorage so
// closing the tab still gives the user a fresh "today" view next time, but a
// hard refresh keeps whatever date they were inspecting.
const DASHBOARD_WORKDAY_STORAGE_KEY = "paintpro:adminDashboard:workday";

function readPersistedDashboardDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(DASHBOARD_WORKDAY_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {
    // Storage may be disabled (Safari private mode) — fall back to default.
  }
  return null;
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

  // client_quotation_done sits *just after* the quotation step but before
  // downpayment — the client has signed, the admin still has to acknowledge.
  if (normalized === "client_quotation_done") return WORKFLOW_STEPS.length;
  if (normalized === "downpayment_pending") return WORKFLOW_STEPS.length + 1;
  if (normalized === "ready_to_start") return WORKFLOW_STEPS.length + 2;
  if (normalized === "in_progress") return WORKFLOW_STEPS.length + 3;
  if (isEndOfWorkStatus(normalized)) {
    return WORKFLOW_STEPS.length + 4 + END_OF_WORK_STATUS_ORDER.indexOf(
      normalized as (typeof END_OF_WORK_STATUS_ORDER)[number],
    );
  }
  if (normalized === "completed") {
    return WORKFLOW_STEPS.length + 3 + END_OF_WORK_STATUS_ORDER.length;
  }
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
    client_quotation_done: "Client Signed Quotation",
    downpayment_pending: "Downpayment Pending",
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
  function subTasksOf(mainTask: Record<string, unknown>) {
    return [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];
  }

  function hasSubTaskWithStatus(
    mainTask: Record<string, unknown>,
    target: StepVisualStatus,
  ) {
    return subTasksOf(mainTask).some(
      (subTask) =>
        getTaskStatus(
          readString(subTask.status, subTask.rawStatus, subTask.project_status),
        ) === target,
    );
  }

  // Prefer a main task that has at least one ACTIVE child — that's the
  // work in progress right now, which is what the admin most wants to see
  // expanded. Falling back to "first non-done" used to land on a still-
  // pending main task even when a later one was already running, leaving
  // the live row collapsed.
  const ongoing = mainTasks.find((mainTask) =>
    hasSubTaskWithStatus(mainTask, "active"),
  );
  if (ongoing) {
    return readString(ongoing.project_task_id, ongoing.id);
  }

  // No active work — expand the first main task that still has pending
  // subtasks so the admin can see what's coming next. If every subtask is
  // done, return "" so nothing auto-expands (the workflow group above
  // handles that earlier-stage case).
  const upcoming = mainTasks.find((mainTask) =>
    hasSubTaskWithStatus(mainTask, "pending"),
  );
  if (upcoming) {
    return readString(upcoming.project_task_id, upcoming.id);
  }

  return "";
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
  const employeeIds = new Set<string>();
  collectEmployeesFromSubTask(subTask, employeeIds);
  return [...employeeIds];
}

function collectAssignedStaffFromSubTask(subTask: Record<string, unknown>) {
  const staff = [
    ...asArray<Record<string, unknown>>(subTask.assignedStaff),
    ...asArray<Record<string, unknown>>(subTask.assignedEmployees),
    ...asArray<Record<string, unknown>>(subTask.employees),
    ...asArray<Record<string, unknown>>(subTask.staff),
    ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
    ...asArray<Record<string, unknown>>(subTask.assigned_staff),
  ];

  return staff
    .map((entry) => {
      const nested =
        asRecord(entry.user) ||
        asRecord(entry.employee) ||
        asRecord(entry.profile);
      const id = readString(entry.user_id, entry.userId, entry.id, nested?.id);
      const name = readString(
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

      return id ? { id, name: name || "Staff" } : null;
    })
    .filter((item): item is { id: string; name: string } => Boolean(item));
}

function collectMaterialsFromMainTask(mainTask: Record<string, unknown>) {
  return asArray<Record<string, unknown>>(mainTask.materials)
    .map((material) => {
      const id = readString(
        material.material_id,
        material.materialId,
        material.id,
      );

      return id
        ? {
            id,
            name: readString(material.name, material.title) || "Material",
            quantity: readNumber(
              material.estimated_quantity,
              material.estimatedQuantity,
              material.quantity,
            ),
            estimatedCost: readNumber(
              material.estimated_cost,
              material.estimatedCost,
              material.cost,
            ),
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        name: string;
        quantity: number;
        estimatedCost: number;
      } => Boolean(item),
    );
}

function collectEquipmentFromSubTask(subTask: Record<string, unknown>) {
  return [
    ...asArray<Record<string, unknown>>(subTask.equipments_used),
    ...asArray<Record<string, unknown>>(subTask.equipmentsUsed),
    ...asArray<Record<string, unknown>>(subTask.equipment),
  ]
    .map((item) => {
      const id = readString(
        item.equipment_id,
        item.equipmentId,
        item.id,
      );

      return id
        ? {
            id,
            name: readString(item.name, item.title) || "Equipment",
            quantity: readNumber(item.quantity) || 1,
            notes: readString(item.notes, item.note) || null,
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        name: string;
        quantity: number;
        notes: string | null;
      } => Boolean(item),
    );
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

// When a project is cancelled, we use `cancelled_from_status` as the
// "frozen-at" status for visual purposes — the workflow groups should
// reflect what was actually done before the cancellation, not the
// terminal "cancelled" value (which would otherwise mark everything
// pending). Returns the live status for non-cancelled projects.
// "Terminal" = the project has no further actionable work. Cancelled
// projects only count as terminal once their post-cancel wrap-up has
// fully concluded (cancellation_phase === "done"); a cancelled project
// still in the review/payment/document/employee/conclude stages is
// active work for the admin and stays at the front of the workday's
// project picker.
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

function getEffectiveVisualStatus(
  projectStatus: string,
  cancelledFromStatus: string | null,
) {
  if (normalizeStatus(projectStatus) !== "cancelled") return projectStatus;
  return cancelledFromStatus || projectStatus;
}

function buildProcessItems(args: {
  projectStatus: string;
  workflowSteps: Array<WorkflowStep & { visualStatus: StepVisualStatus }>;
  mainTasks: Record<string, unknown>[];
  projectStart: string | null;
  projectEnd: string | null;
  cancelledFromStatus: string | null;
  cancellationPhase: CancellationPhase | null;
  cancelledAt: string | null;
}) {
  const {
    projectStatus,
    workflowSteps,
    mainTasks,
    projectStart,
    projectEnd,
    cancelledFromStatus,
    cancellationPhase,
    cancelledAt,
  } = args;

  const normalized = normalizeStatus(projectStatus);
  const isCancelled = normalized === "cancelled";
  // For visual computations on a cancelled project, treat the workflow
  // as if it were "frozen at" the status it had when cancelled. Drives
  // which workflow steps look done, whether Start of Work shows as
  // active, etc.
  const visualNormalized = normalizeStatus(
    getEffectiveVisualStatus(projectStatus, cancelledFromStatus),
  );

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
    visualNormalized === "ready_to_start"
      ? "active"
      : visualNormalized === "in_progress" ||
          visualNormalized === "completed" ||
          isEndOfWorkStatus(visualNormalized)
        ? "done"
        : "pending";

  // Start of Work doesn't make sense for a project that was cancelled
  // before it ever reached ready_to_start — there was no kickoff to
  // talk about. Hide it in that case so the cancellation group sits
  // directly after Job Creation.
  const showStartOfWork = !isCancelled || startOfWorkStatus !== "pending";

  if (showStartOfWork) {
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
  }

  // Main task groups only show if the project actually started executing
  // (status reached "in_progress" or beyond). For cancellations that
  // happened during Job Creation, no subtasks ran — hide them so the
  // user doesn't see a confusing list of "pending" tasks for a
  // terminated project. The cancellation group append below still
  // fires, so the admin still has the wrap-up workflow visible.
  const showMainTasks =
    !isCancelled ||
    visualNormalized === "in_progress" ||
    isEndOfWorkStatus(visualNormalized);
  const skipMainTaskLoop = !showMainTasks;

  for (let index = 0; index < (skipMainTaskLoop ? 0 : mainTasks.length); index += 1) {
    const mainTask = mainTasks[index];
    const projectTaskId = readString(mainTask.project_task_id, mainTask.id);
    const materials = collectMaterialsFromMainTask(mainTask);

    const allSubTasks = [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];

    // For cancelled projects, hide subtasks that never executed and skip
    // any main task whose subtasks are all unfinished. The admin only
    // wants to see the work that actually happened before the cancel.
    const subTasks = isCancelled
      ? allSubTasks.filter((subTask) => {
          const rawStatus = readString(
            subTask.status,
            subTask.rawStatus,
            subTask.project_status,
          );
          const status = getTaskStatus(rawStatus);
          return status === "done";
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
      const assignedStaff = collectAssignedStaffFromSubTask(subTask);
      const scheduledStart = readString(
        subTask.scheduled_start_datetime,
        subTask.scheduledStartDatetime,
        subTask.start_datetime,
        subTask.startDatetime,
      );
      const scheduledEnd = readString(
        subTask.scheduled_end_datetime,
        subTask.scheduledEndDatetime,
        subTask.end_datetime,
        subTask.endDatetime,
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
                  scheduledEnd ||
                  null,
              )
            : "-",
        detail: {
          employees: employeeLabels,
          employeeIds,
          estimatedHours: formatHours(estimatedHours),
          estimatedHoursValue: estimatedHours,
          projectTaskId,
          projectSubTaskId: readString(subTask.project_sub_task_id, subTask.id),
          materials,
          equipment: collectEquipmentFromSubTask(subTask),
          assignedStaff,
          scheduledStartDatetime: scheduledStart || null,
          scheduledEndDatetime: scheduledEnd || null,
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
      id: `task-${projectTaskId || index}`,
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
    // Cancelled projects swap the normal "Manage End of Work" group for
    // a "Project Cancellation" group with five wrap-up children driven
    // by `cancellation_phase`. The card no longer needs the standard
    // post-work flow at all — settlement + cancellation agreement
    // replace invoicing + payment.
    const cancellationChildren: ProcessItem[] = CANCELLATION_STEPS.map(
      (step) => {
        const status = getCancellationStepVisualStatus(step.id, cancellationPhase);
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

    const groupStatus = getCancellationGroupVisualStatus(cancellationPhase);

    items.push({
      id: "project-cancellation",
      title: "Project Cancellation",
      status: groupStatus,
      startLabel: formatDateTime(cancelledAt),
      endLabel:
        groupStatus === "done"
          ? "Cancelled"
          : groupStatus === "active"
            ? "Working on it..."
            : "-",
      children: cancellationChildren,
    });

    return items;
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
            ? normalized === "completed" && step.id === "conclude-job"
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
        : manageEndStatus === "active"
          ? "Working on it..."
          : "-",
    children: manageEndChildren,
  });

  return items;
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: isProjectTimeReferenceReady, referenceIso } =
    useProjectTimeReference();
  const { hasSignature, isLoading: isLoadingSignature } = useUserSignature();

  const [projects, setProjects] = useState<RawProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedDashboardDate, setSelectedDashboardDate] = useState(
    () => readPersistedDashboardDate() ?? formatDateInputValue(),
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
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0);

  const [openProcessIds, setOpenProcessIds] = useState<Set<string>>(new Set());
  const [openSubtaskIds, setOpenSubtaskIds] = useState<Set<string>>(new Set());

  // Tracks the most recent project the user explicitly picked — either
  // from the dropdown or via a `?projectId=` URL param. The auto-select
  // effect uses this to know it should leave a deliberately-chosen
  // terminal (completed/cancelled) project alone, instead of flipping to
  // an active sibling. Auto-pick paths (initial load, workday change,
  // refresh) do NOT touch this ref, so the prefer-active logic still
  // wins by default.
  const explicitlyPickedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isProjectTimeReferenceReady) return;
    // Skip the initial-today snap if the user already has a persisted
    // workday — refreshing should leave them on the date they were
    // inspecting, not jump back to "now".
    if (readPersistedDashboardDate() !== null) return;

    setSelectedDashboardDate(
      formatDateInputValue(referenceIso ? new Date(referenceIso) : new Date()),
    );
  }, [isProjectTimeReferenceReady, referenceIso]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        DASHBOARD_WORKDAY_STORAGE_KEY,
        selectedDashboardDate,
      );
    } catch {
      // Ignore storage failures — persistence is a nicety, not a contract.
    }
  }, [selectedDashboardDate]);

  useEffect(() => {
    async function loadProjects() {
      try {
        setLoadingProjects(true);

        // Pull every project (no schedule-side filter) so we can scope to the
        // statuses we care about for the progress card. The pre-work and
        // pre-sign statuses below stay on /admin/projects, not here.
        const response = await fetch("/api/projects/list", { cache: "no-store" });
        const data = (await response.json()) as ProjectsResponse;

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load projects.");
        }

        // Job-creation statuses (main_task_pending → quotation_pending,
        // and the post-sign client_quotation_done) used to be filtered
        // out of the dashboard. They're now included so a workday that
        // only has a still-being-built project doesn't render as empty —
        // JobProgressCard detects these statuses and surfaces a
        // "Creating project — Go to Project Creation" CTA pointing at
        // the right wizard step.
        const PROGRESS_HIDDEN_STATUSES = new Set<string>([]);

        const allProjects = Array.isArray(data?.projects) ? data.projects : [];
        const nextProjects = allProjects.filter((project) => {
          const raw = String(project.rawStatus ?? project.status ?? "")
            .trim()
            .toLowerCase();
          return !PROGRESS_HIDDEN_STATUSES.has(raw);
        });
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
  }, [detailsRefreshKey]);

  useEffect(() => {
    if (!selectedProjectId) return;

    // Cancel-on-rerun guard: when the user picks a different project
    // (or the URL-param effect snaps to one) the previous fetch is still
    // in flight. Without this flag, an OLDER response can land AFTER a
    // newer one and overwrite mainTasks/overviewProject with stale data
    // — that's why the JobProgressCard would briefly show the right
    // project and then flip to a different one's progress.
    //
    // We belt-and-braces it with a runForId capture: even if the abort
    // race somehow lets the response through (e.g. browser caching),
    // we double-check that the response's project_id still matches the
    // caller selection before writing state.
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

        // Project was deleted in the DB while the dashboard was open
        // (or the list is stale after a delete elsewhere). Drop the
        // stale selection and refetch the projects list so the
        // auto-select effect picks the next valid project from the
        // refreshed list instead of surfacing a console error.
        if (response.status === 404) {
          setOverviewProject(null);
          setMainTasks([]);
          setOpenProcessIds(new Set());
          setOpenSubtaskIds(new Set());
          setSelectedProjectId(null);
          setSelectedProject(null);
          explicitlyPickedIdRef.current = null;
          setDetailsRefreshKey((k) => k + 1);
          return;
        }

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load project overview.",
          );
        }

        const nextMainTasks = asArray<Record<string, unknown>>(data.mainTasks);
        const nextProject = asRecord(data.project);

        // Final check before writing state: confirm the payload is for
        // the project we still have selected. If the user clicked away
        // mid-fetch this prevents the stale tasks from ever rendering.
        const responseProjectId = readString(
          nextProject?.project_id,
          (nextProject as Record<string, unknown> | null)?.id,
        );
        if (responseProjectId && responseProjectId !== runForId) return;

        setOverviewProject(nextProject);
        setMainTasks(nextMainTasks);

        if (nextProject?.status) {
          const freshStatus = String(nextProject.status);
          setSelectedProject((prev) =>
            prev ? { ...prev, status: freshStatus, rawStatus: freshStatus } : prev,
          );
        }

        const defaultOpen = new Set<string>();
        const normalizedProjectStatus = String(nextProject?.status || "")
          .trim()
          .toLowerCase();

        const autoOpenMainTaskId = getAutoOpenMainTaskId(nextMainTasks);

        if (autoOpenMainTaskId) {
          defaultOpen.add(`task-${autoOpenMainTaskId}`);
        } else if (
          WORKFLOW_STEPS.some((step) => step.rawStatus === normalizedProjectStatus)
        ) {
          defaultOpen.add("job-creation");
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
  }, [selectedProjectId, detailsRefreshKey]);

  // Pull the project_task_ids out of the loaded mainTasks so the
  // realtime hook knows which subtasks to watch. Empty array while
  // the overview is still fetching, which keeps the subscription
  // idle until we have something meaningful to filter on.
  const watchedProjectTaskIds = useMemo(() => {
    return mainTasks
      .map((mainTask) => {
        const value = mainTask.project_task_id ?? mainTask.id;
        return typeof value === "string" ? value : null;
      })
      .filter((id): id is string => Boolean(id));
  }, [mainTasks]);

  // Patch a subtask in-place rather than re-fetching the whole
  // overview on every event — the realtime payload already carries
  // every field of the project_sub_task row that drives the
  // dashboard's visual state (status, scheduled_*, updated_at,
  // equipments_used). Joined data (assigned_staff, the catalog
  // sub_task description) doesn't change in the same event, so
  // preserving the existing values is the right call.
  const patchSubtaskInState = useCallback(
    (newRow: ProjectSubtaskRow) => {
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

        // Skip the state update entirely when the event was for a
        // subtask we don't have loaded — saves a render pass.
        return touched ? next : prevMainTasks;
      });
    },
    [],
  );

  const realtimeStatus = useProjectSubtaskRealtime({
    projectTaskIds: watchedProjectTaskIds,
    enabled: Boolean(selectedProjectId) && !loadingDetails,
    onSubtaskEvent: useCallback(
      (event) => {
        if (event.eventType === "INSERT" || event.eventType === "DELETE") {
          // Schema-shape changes (rare during execution) — fall back
          // to the heavyweight refresh so the joined data stays
          // consistent.
          setDetailsRefreshKey((k) => k + 1);
          return;
        }
        patchSubtaskInState(event.newRow);
      },
      [patchSubtaskInState],
    ),
  });

  // Honour `?projectId=` and the modal-trigger params (`?openDownpayment=`,
  // `?openKickoff=`, `?openPayment=`) when the dashboard is opened from
  // /admin/projects or the schedule. The JobProgressCard's modal-popper
  // effects only fire when its currently-selected project matches the
  // requested ID — but the dashboard defaults to today's projects, so a
  // future-dated project won't be selected and the modal never opens.
  //
  // This effect:
  //   1. Reads the requested project ID from any of the four URL params.
  //   2. Finds it in the loaded `projects` list.
  //   3. Snaps `selectedDashboardDate` to the project's scheduled start so
  //      `projectsForSelectedDate` includes it (otherwise the auto-select
  //      effect below would clobber our pick on the next render).
  //   4. Sets `selectedProjectId` / `selectedProject` to it.
  //
  // The handledRequestRef tracks which (request-key) we've already snapped
  // to so the user can manually change the date / project afterwards
  // without the URL param pulling them back. A new request key (different
  // projectId in the URL) re-arms the snap.
  const handledRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadingProjects) return;
    if (projects.length === 0) return;

    const requestedId =
      searchParams?.get("projectId") ||
      searchParams?.get("openDownpayment") ||
      searchParams?.get("openKickoff") ||
      searchParams?.get("openPayment") ||
      searchParams?.get("openCancellationPayment") ||
      "";

    if (!requestedId) return;
    if (handledRequestRef.current === requestedId) return;

    const requestedProject = projects.find((p) => p.id === requestedId);
    if (!requestedProject) return;

    handledRequestRef.current = requestedId;
    // The URL is asking for this exact project — treat it as an explicit
    // pick so the auto-select effect doesn't flip away from it even when
    // it's terminal and an active sibling exists for the same workday.
    explicitlyPickedIdRef.current = requestedId;

    // Snap the workday picker to the project's start date so it lands in
    // `projectsForSelectedDate`. Falls back to keeping the current date
    // if the project has no scheduled start (rare, but possible for
    // statuses that haven't been scheduled yet).
    const startIso = readProjectStart(requestedProject);
    if (startIso) {
      const parsed = new Date(startIso);
      if (!Number.isNaN(parsed.getTime())) {
        setSelectedDashboardDate(formatDateInputValue(parsed));
      }
    }

    setSelectedProjectId(requestedProject.id);
    setSelectedProject(requestedProject);
  }, [loadingProjects, projects, searchParams]);

  const projectsForSelectedDate = useMemo(() => {
    // No fallback to the full list: if the workday has no projects, this
    // is genuinely empty and the JobProgressCard renders its "no projects
    // today" empty state. The previous behaviour (`return projects` when
    // empty) caused the auto-select to grab projects[0] from any random
    // date, e.g. picking a completed project from 4/24 when the user had
    // navigated to 5/06.
    //
    // Sort active projects ahead of terminal ones (completed / fully
    // closed-out cancellations) so the auto-select picks an in-flight
    // project when the workday has a mix. Cancelled projects whose
    // wrap-up is still mid-flight count as ACTIVE — the admin still
    // has work to do on them. The user can pick a finished project
    // from the dropdown, but the default view is the one that needs
    // work.
    return projects
      .filter((project) => isProjectOnDate(project, selectedDashboardDate))
      .slice()
      .sort((a, b) => {
        const aTerm = isProjectTerminal(a);
        const bTerm = isProjectTerminal(b);
        if (aTerm === bTerm) return 0;
        return aTerm ? 1 : -1;
      });
  }, [projects, selectedDashboardDate]);

  useEffect(() => {
    if (projectsForSelectedDate.length === 0) {
      setSelectedProjectId(null);
      setSelectedProject(null);
      return;
    }

    const selected = projectsForSelectedDate.find(
      (project) => project.id === selectedProjectId,
    );

    // Selection isn't on the current workday (or nothing is picked yet) —
    // pick the first project (already sorted active-first by
    // `projectsForSelectedDate`).
    if (!selected) {
      const nextProject = projectsForSelectedDate[0];
      setSelectedProjectId(nextProject.id);
      setSelectedProject(nextProject);
      return;
    }

    // Honour an explicit pick — dropdown click or `?projectId=` URL —
    // even when the picked project is terminal. The user asked for it
    // specifically, so don't flip away.
    if (explicitlyPickedIdRef.current === selectedProjectId) return;

    // The selection is auto-driven (initial load, refresh, workday
    // change) and currently lands on a finished project. If the same
    // workday has an active project, prefer that — the dashboard's
    // primary purpose is the in-flight work, not the archive.
    if (!isProjectTerminal(selected)) return;

    const firstActive = projectsForSelectedDate.find(
      (project) => !isProjectTerminal(project),
    );
    if (!firstActive) return;

    setSelectedProjectId(firstActive.id);
    setSelectedProject(firstActive);
  }, [projectsForSelectedDate, selectedProjectId]);

  const selectedStatus =
    selectedProject?.rawStatus || selectedProject?.status || "";

  const projectMeta = useMemo(() => {
    return deriveProjectMeta(selectedProject, overviewProject, mainTasks);
  }, [selectedProject, overviewProject, mainTasks]);

  // Cancellation context, surfaced from the overview payload. Used to
  // freeze the workflow visuals at the cancellation point and drive the
  // Project Cancellation group's child statuses.
  const cancelledFromStatus = useMemo(() => {
    const value = overviewProject?.cancelled_from_status;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [overviewProject]);

  const cancellationPhase = useMemo(() => {
    return normalizeCancellationPhase(
      typeof overviewProject?.cancellation_phase === "string"
        ? overviewProject.cancellation_phase
        : null,
    );
  }, [overviewProject]);

  const cancelledAt = useMemo(() => {
    const value = overviewProject?.cancelled_at;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [overviewProject]);

  // For cancelled projects we compute "done" / "active" based on the
  // status the project HAD when it was cancelled, not the terminal
  // "cancelled" value (which would otherwise mark every workflow step
  // pending — wrong, since real work happened before cancel).
  const visualStatus = useMemo(
    () => getEffectiveVisualStatus(selectedStatus, cancelledFromStatus),
    [selectedStatus, cancelledFromStatus],
  );

  const workflowSteps = useMemo(() => {
    return WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      visualStatus: getStepStatus(visualStatus, index),
    }));
  }, [visualStatus]);

  const processItems = useMemo(() => {
    return buildProcessItems({
      projectStatus: selectedStatus,
      workflowSteps,
      mainTasks,
      projectStart: projectMeta.startDatetime || null,
      projectEnd: projectMeta.endDatetime || null,
      cancelledFromStatus,
      cancellationPhase,
      cancelledAt,
    });
  }, [
    selectedStatus,
    workflowSteps,
    mainTasks,
    projectMeta.startDatetime,
    projectMeta.endDatetime,
    cancelledFromStatus,
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

  const handleDashboardProjectChange = useCallback((projectId: string) => {
    const nextProject = projects.find((project) => project.id === projectId);

    if (!nextProject) return;

    // Dropdown clicks are explicit — record so the auto-select effect
    // doesn't flip away from this project on the next render.
    explicitlyPickedIdRef.current = projectId;
    setSelectedProjectId(nextProject.id);
    setSelectedProject(nextProject);
  }, [projects]);

  const handleRefresh = useCallback(() => {
    setDetailsRefreshKey((k) => k + 1);
  }, []);

  const handleCreateJob = useCallback(() => {
    // Admins/managers must have a saved signature before they can spin up a
    // new project — the quotation, invoice, and cancellation documents all
    // get signed with it server-side, so missing it would break the
    // downstream flow. The settings page sets this; the sidebar shows a "!"
    // badge on Settings when it's missing.
    if (isLoadingSignature) return;
    if (hasSignature === false) {
      toast.error(
        "Add your signature in Settings before creating a project.",
        {
          action: {
            label: "Go to Settings",
            onClick: () => router.push("/admin/settings"),
          },
        },
      );
      return;
    }
    router.push("/admin/job-creation/basic-details");
  }, [router, hasSignature, isLoadingSignature]);

  // The Cancel Project button only shows while there's still active
  // work to walk away from — between client signing the quotation and
  // the last subtask finishing. Once status hits review_pending or
  // beyond, all the work is done and the project is in administrative
  // wrap-up; cancelling at that point would just throw away completed
  // work, so we hide the button. Job-creation phases use the wizard's
  // own delete flow; completed/cancelled projects can't be cancelled.
  const CANCELLABLE_DASHBOARD_STATUSES = useMemo(
    () =>
      new Set<string>([
        "downpayment_pending",
        "ready_to_start",
        "in_progress",
      ]),
    [],
  );
  // Even within in_progress, if every generated subtask is already
  // marked "done" (or "completed"/"finished") the field work is finished
  // and only the admin's review/invoice/payment wrap-up remains —
  // cancelling at that point would throw away completed work and skip
  // payment for it. Empty main-task lists (e.g. nothing loaded yet)
  // don't trigger the lock; we only count a project as "all-done" when
  // there's at least one main task and every sub-task under every main
  // task reports done.
  const allGeneratedSubTasksDone = useMemo(() => {
    if (mainTasks.length === 0) return false;
    let sawAnySubTask = false;
    for (const mainTask of mainTasks) {
      const subTasks = collectSubTasks([mainTask]);
      if (subTasks.length === 0) {
        // A main task with no subtasks means the planner didn't fill
        // it out — treat that as "not all done" to be safe.
        return false;
      }
      for (const subTask of subTasks) {
        sawAnySubTask = true;
        const rawStatus = readString(
          subTask.status,
          subTask.rawStatus,
          subTask.project_status,
        );
        if (getTaskStatus(rawStatus) !== "done") {
          return false;
        }
      }
    }
    return sawAnySubTask;
  }, [mainTasks]);
  const canCancelSelectedProject = Boolean(
    selectedProject &&
      !allGeneratedSubTasksDone &&
      CANCELLABLE_DASHBOARD_STATUSES.has(
        String(selectedProject.rawStatus ?? selectedProject.status ?? "")
          .trim()
          .toLowerCase(),
      ),
  );
  const [cancelOpen, setCancelOpen] = useState(false);

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
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-8 text-gray-900">
          Dashboard
        </h1>
        <DashboardClock />
      </div>

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
            // Compute "today" with the same fallback chain the
            // onJumpToToday handler uses — simulated reference if one
            // is set, otherwise the real wall clock — so the card can
            // tell whether the workday is already on today (button
            // disabled) or not (button green).
            todayDate={formatDateInputValue(
              referenceIso ? new Date(referenceIso) : new Date(),
            )}
            onJumpToToday={() => {
              setSelectedDashboardDate(
                formatDateInputValue(
                  referenceIso ? new Date(referenceIso) : new Date(),
                ),
              );
            }}
            onProjectChange={handleDashboardProjectChange}
            onCreateJob={handleCreateJob}
            onCancelProject={
              canCancelSelectedProject
                ? () => setCancelOpen(true)
                : undefined
            }
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
              employeeReviewItems={employeeReviewItems}
              onRefresh={handleRefresh}
              canEditGeneratedTasks
              reviewSummary={reviewSummary}
              emptyProjectState="no-projects-today"
              hasOtherProjectsToday={projectsForSelectedDate.some(
                (p) => p.id !== selectedProjectId,
              )}
              cancellationPhase={cancellationPhase}
              cancelledFromStatus={cancelledFromStatus}
              realtimeStatus={realtimeStatus}
              cancellationBalance={
                typeof overviewProject?.cancellation_balance === "number"
                  ? (overviewProject.cancellation_balance as number)
                  : null
              }
              cancellationEarnedRevenue={
                typeof overviewProject?.cancellation_earned_revenue ===
                "number"
                  ? (overviewProject.cancellation_earned_revenue as number)
                  : null
              }
              cancellationEarnedCost={
                typeof overviewProject?.cancellation_earned_cost === "number"
                  ? (overviewProject.cancellation_earned_cost as number)
                  : null
              }
              cancellationSettled={
                typeof overviewProject?.cancellation_settled === "number"
                  ? (overviewProject.cancellation_settled as number)
                  : null
              }
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

      <CancelProjectModal
        open={cancelOpen}
        projectId={selectedProjectId ?? ""}
        projectCode={
          selectedProject?.projectCode ??
          selectedProject?.project_code ??
          null
        }
        projectStatus={
          selectedProject?.rawStatus ?? selectedProject?.status ?? null
        }
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false);
          handleRefresh();
        }}
      />
    </div>
  );
}
