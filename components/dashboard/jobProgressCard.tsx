"use client";

import React, { memo, useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
// --- SIMULATED TIME (testing only) ---------------------------------------
// Uses the simulated reference clock when one is set in settings, otherwise
// falls back to the real wall clock. Drives the kickoff countdown + the
// "early/late" calculation in the Start Project modal so test runs aren't
// pinned to whatever the real time happens to be.
import { useProjectNow } from "@/lib/time/useProjectNow";
// -------------------------------------------------------------------------
import { useAutoStartProjects } from "@/lib/settings/autoStartProjects";
import { toast } from "sonner";
import { Transition } from "@headlessui/react";
import { BarChart3, Check, ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw, Send, X } from "lucide-react";
import DownpaymentModal from "@/components/project-creation/DownpaymentModal";
import ProjectReviewModal from "@/components/dashboard/ProjectReviewModal";
import GeneratedTaskEditModal, {
  type GeneratedTaskEditTarget,
  type GeneratedTaskEquipment,
  type GeneratedTaskMaterial,
  type GeneratedTaskStaff,
} from "@/components/dashboard/GeneratedTaskEditModal";
import FinalPaymentModal from "@/components/progressCard/FinalPaymentModal";
import EmployeeManagementModal from "@/components/progressCard/EmployeeManagementModal";
import { supabase } from "@/lib/supabaseClient";
import type {
  EmployeeManagementFinishPayload,
  EmployeeReviewItem,
} from "@/lib/planning/employeePerformance";
import { filterEmployeeReviewItemsToFinishedOnly } from "@/lib/planning/employeePerformance";
import type { ProjectReviewSummary } from "@/lib/planning/projectReviewSummary";
import { filterReviewSummaryToCompletedOnly } from "@/lib/planning/projectReviewSummary";
import {
  CANCELLATION_STEP_BY_ID,
  CANCELLATION_STEP_IDS,
  getCancellationGroupVisualStatus,
  getCancellationStepVisualStatus,
  getNextCancellationPhase,
  normalizeCancellationPhase,
  type CancellationPhase,
  type CancellationStepId,
} from "@/lib/planning/cancellationPhase";

export type StepVisualStatus = "done" | "active" | "pending";

export type ProcessDetail = {
  employees: string[];
  employeeIds: string[];
  estimatedHours: string;
  estimatedHoursValue?: number | null;
  projectTaskId?: string | null;
  projectSubTaskId?: string | null;
  materials?: GeneratedTaskMaterial[];
  equipment?: GeneratedTaskEquipment[];
  assignedStaff?: GeneratedTaskStaff[];
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
  completedAt?: string | null;
};

export type ProcessItem = {
  id: string;
  title: string;
  status: StepVisualStatus;
  statusLabelOverride?: string;
  startLabel: string;
  endLabel: string;
  children?: ProcessItem[];
  detail?: ProcessDetail;
};

type Props = {
  title?: string;
  selectedProject: unknown | null;
  projectId?: string | null;
  loadingDetails: boolean;
  navigating?: boolean;
  processItems: ProcessItem[];
  openProcessIds: Set<string>;
  openSubtaskIds: Set<string>;
  toggleProcessRow: (id: string) => void;
  toggleSubtaskRow: (id: string) => void;
  onFinishSubtask?: (subtaskId: string) => Promise<void>;
  onRefresh?: () => void;
  canEditGeneratedTasks?: boolean;
  currentUserId?: string | null;
  employeeReviewItems?: EmployeeReviewItem[];
  reviewSummary?: ProjectReviewSummary | null;
  emptyProjectState?:
    | "select-project"
    | "no-projects-today"
    | "no-work-left-today";
  // True when there's at least one OTHER project scheduled for the same day
  // as the currently-selected one. Drives the post-conclude "project done"
  // takeover: once this project hits `completed` we only swap the progress
  // panel for the celebration view if the day has nothing else queued.
  hasOtherProjectsToday?: boolean;
  className?: string;
  // Substep within the post-cancel wrap-up. Only meaningful when the
  // project's status is "cancelled". Drives which Project Cancellation
  // child shows the action button and what status pills the rest of
  // them render.
  cancellationPhase?: CancellationPhase | null;
  // Displayed inside the Document Management modal so the admin and
  // client both see the same settlement amount on the agreement.
  cancellationBalance?: number | null;
  cancellationEarnedRevenue?: number | null;
  cancellationEarnedCost?: number | null;
  cancellationSettled?: number | null;
  cancelledFromStatus?: string | null;
  // Admin/manager dashboards drive the post-cancel wrap-up; staff
  // dashboards only get a read-only view because they can't advance
  // phases or send the agreement. When false, cancellation child
  // action buttons stay disabled.
  canManageCancellation?: boolean;
  // Optional connection state from useProjectSubtaskRealtime — when
  // provided, the header shows a small dot/pill so the user knows
  // whether subtask updates from other dashboards will land live or
  // need a manual refresh.
  realtimeStatus?: "idle" | "connecting" | "live" | "error" | "closed";
  // When true and the project is still in a pre-kickoff status (job
  // creation through ready_to_start), the card hides the workflow
  // breakdown and shows a "Project creation ongoing" message instead.
  // Used by the client dashboard so the client doesn't see internal
  // wizard steps before any real work has started.
  showPreExecutionTakeover?: boolean;
};

const GREEN = "#00c065";
const SCROLL_TRACK = "#E6F8EF";
const SCROLL_TRACK_DARK = "#1f2937";

// Currency input helpers — used by the cancellation Payment Management
// modal's instalment input so anything typed gets a thousand separator
// automatically and pasted commas are accepted as-is. Mirrors the
// helpers in DownpaymentModal / FinalPaymentModal so all three feel
// identical.
function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const firstDot = cleaned.indexOf(".");
  const intPart = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const decPartRaw =
    firstDot === -1 ? "" : cleaned.slice(firstDot + 1).replace(/\./g, "");
  const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return firstDot === -1 ? intWithCommas : `${intWithCommas}.${decPartRaw}`;
}

const JOB_CREATION_CHILD_ROUTES: Record<string, string> = {
  "workflow-main-task": "/admin/job-creation/main-task-assignment",
  "workflow-sub-task": "/admin/job-creation/sub-task-assignment",
  "workflow-materials": "/admin/job-creation/materials-assignment",
  "workflow-equipment": "/admin/job-creation/equipment-assignment",
  "workflow-schedule": "/admin/job-creation/project-schedule",
  "workflow-employee-assignment": "/admin/job-creation/employee-assignment",
  "workflow-cost-estimation": "/admin/job-creation/cost-estimation",
  "workflow-overview": "/admin/job-creation/overview",
  "workflow-quotation": "/admin/job-creation/quotation-generation",
};

type EndOfWorkPendingStatus =
  | "review_pending"
  | "invoice_pending"
  | "payment_pending"
  | "employee_management_pending"
  | "conclude_job_pending";

type EndOfWorkStepConfig = {
  id: string;
  pendingStatus: EndOfWorkPendingStatus;
  entryStatuses?: string[];
  entryLabel?: string;
  entrySuccessTitle?: string;
  entrySuccessDescription?: string;
  activeLabel: string;
  nextStatus: EndOfWorkPendingStatus | "completed";
  successTitle: string;
  successDescription: string;
};

const END_OF_WORK_STEPS: EndOfWorkStepConfig[] = [
  {
    id: "review-and-final-checks",
    pendingStatus: "review_pending",
    entryStatuses: ["in_progress"],
    entryLabel: "Review",
    entrySuccessTitle: "Review started",
    entrySuccessDescription: "Project moved to review and final checks.",
    activeLabel: "Review",
    nextStatus: "invoice_pending",
    successTitle: "Review completed",
    successDescription: "Project moved to invoice generation.",
  },
  {
    id: "invoice-generation",
    pendingStatus: "invoice_pending",
    activeLabel: "See More",
    nextStatus: "payment_pending",
    successTitle: "Invoice completed",
    successDescription: "Project moved to receive payment.",
  },
  {
    id: "receive-payment",
    pendingStatus: "payment_pending",
    activeLabel: "Manage",
    nextStatus: "employee_management_pending",
    successTitle: "Payment recorded",
    successDescription: "Project moved to employee management.",
  },
  {
    id: "employee-management",
    pendingStatus: "employee_management_pending",
    activeLabel: "Manage",
    nextStatus: "conclude_job_pending",
    successTitle: "Employee management completed",
    successDescription: "Project is ready to conclude.",
  },
  {
    id: "conclude-job",
    pendingStatus: "conclude_job_pending",
    activeLabel: "Conclude",
    nextStatus: "completed",
    successTitle: "Project completed",
    successDescription: "Project status is now completed.",
  },
];

const END_OF_WORK_STEP_BY_ID = Object.fromEntries(
  END_OF_WORK_STEPS.map((step) => [step.id, step]),
) as Record<string, EndOfWorkStepConfig>;

const END_OF_WORK_STATUS_ORDER = END_OF_WORK_STEPS.map(
  (step) => step.pendingStatus,
);

// Statuses where the "See More" button on the invoice-generation step
// is clickable. Once the project has reached invoice_pending the
// invoice exists in the system, so the page should remain visitable
// for the rest of the project's lifecycle (so admins can review the
// signed invoice / payment record after the fact). Earlier statuses
// stay disabled because there's no invoice to look at yet.
const INVOICE_GENERATION_OPEN_STATUSES = new Set([
  "invoice_pending",
  "invoice_agreement_pending",
  "invoice_signed",
  "payment_pending",
  "employee_management_pending",
  "conclude_job_pending",
  "completed",
  "cancelled",
]);

function readProjectStatus(project: unknown): string {
  if (!project || typeof project !== "object") return "";

  const record = project as Record<string, unknown>;
  const rawStatus = record.rawStatus;
  const status = record.status;

  if (typeof rawStatus === "string" && rawStatus) return rawStatus;
  return typeof status === "string" ? status : "";
}

function readProjectId(project: unknown): string {
  if (!project || typeof project !== "object") return "";

  const record = project as Record<string, unknown>;
  const projectId = record.project_id;
  const id = record.id;

  if (typeof projectId === "string" && projectId) return projectId;
  return typeof id === "string" ? id : "";
}

function readProjectScheduledStart(project: unknown): string | null {
  if (!project || typeof project !== "object") return null;
  const record = project as Record<string, unknown>;
  const candidates = [
    record.scheduled_start_datetime,
    record.scheduledStartDatetime,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value) return value;
  }
  return null;
}


// Formats a positive millisecond span as "Xd Yh Zm" (omits zero leading
// units, always shows minutes when nothing else is present).
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function statusLabel(status: StepVisualStatus) {
  if (status === "done") return "Completed";
  if (status === "active") return "Working on it...";
  return "Not started";
}

function getDisplayStatusLabel(item: ProcessItem, status: StepVisualStatus) {
  return item.statusLabelOverride || statusLabel(status);
}

function getTimingStatusTone(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "early") return "early";
  if (normalized === "on time") return "on-time";
  if (normalized === "late") return "late";

  return null;
}

function StatusLabelTag({
  item,
  status,
  dim = false,
}: {
  item: ProcessItem;
  status: StepVisualStatus;
  dim?: boolean;
}) {
  const label = getDisplayStatusLabel(item, status);
  const timingTone = getTimingStatusTone(label);

  if (!timingTone) {
    return (
      <span
        className={[
          "shrink-0 text-xs",
          dim ? "text-gray-200" : "text-gray-400 dark:text-slate-500",
        ].join(" ")}>
        {label}
      </span>
    );
  }

  // Light + dark variants for each timing tone. The previous classes had
  // only light-mode colors, which made the tinted backgrounds invisible
  // and the dark text unreadable on a dark page.
  const toneClasses: Record<string, string> = {
    early:
      "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    "on-time":
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-300",
    late:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-300",
  };

  return (
    <span
      className={[
        "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        toneClasses[timingTone],
      ].join(" ")}>
      {label}
    </span>
  );
}

function StepIcon({ status }: { status: StepVisualStatus }) {
  if (status === "done") {
    return (
      <span
        className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: GREEN }}>
        ✓
      </span>
    );
  }

  if (status === "active") {
    return (
      <span
        className="h-5 w-5 rounded-full border-2 bg-white dark:bg-slate-900"
        style={{ borderColor: GREEN }}
      />
    );
  }

  return (
    <span className="h-5 w-5 rounded-full border-2 border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900" />
  );
}

function GroupProgressRing({
  status,
  doneCount,
  totalCount,
}: {
  status: StepVisualStatus;
  doneCount: number;
  totalCount: number;
}) {
  const size = 22;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const raw = totalCount <= 0 ? 0 : doneCount / totalCount;
  const clamped = Math.max(0, Math.min(1, raw));
  const pct = status === "done" ? 1 : status === "pending" ? 0 : clamped;

  const dash = pct * c;
  const gap = c - dash;

  return (
    <div className="relative h-[22px] w-[22px]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={stroke}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GREEN}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      {status === "done" ? (
        <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-white">
          <span
            className="grid h-[18px] w-[18px] place-items-center rounded-full"
            style={{ backgroundColor: GREEN }}>
            ✓
          </span>
        </span>
      ) : null}
    </div>
  );
}

function isStartOfWorkGroup(group: ProcessItem) {
  return (
    group.id === "start-of-work" ||
    group.title.toLowerCase().trim() === "start of work"
  );
}

function isManageEndOfWorkGroup(group: ProcessItem) {
  return (
    group.id === "manage-end-of-work" ||
    group.title.toLowerCase().trim() === "manage end of work"
  );
}

function isCancellationGroup(group: ProcessItem) {
  return (
    group.id === "project-cancellation" ||
    group.title.toLowerCase().trim() === "project cancellation"
  );
}

function isCancellationStepId(value: string): value is CancellationStepId {
  return (CANCELLATION_STEP_IDS as readonly string[]).includes(value);
}

function isEndOfWorkStatus(status: string) {
  return END_OF_WORK_STATUS_ORDER.includes(status as EndOfWorkPendingStatus);
}

// Pre-execution = the project hasn't actually kicked off yet. Covers
// the whole job-creation wizard, the post-quotation client / payment
// gates, and "ready_to_start" (which is the about-to-start state, not
// yet executing any subtask). Once status hits "in_progress" the
// project is considered live and the takeover lifts.
const PRE_EXECUTION_STATUSES = new Set<string>([
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "quotation_pending",
  "grant_access_quotation",
  "client_quotation_done",
  "downpayment_pending",
  "ready_to_start",
]);

function isPreExecutionStatus(status: string) {
  return PRE_EXECUTION_STATUSES.has(String(status || "").trim().toLowerCase());
}

function getReviewModalActionLabel(projectStatus: string) {
  // Both `in_progress` (about to enter review) and `review_pending`
  // (currently in review) collapse to a single "Complete Review"
  // action — the intermediate "Start Review" was removed because it
  // doesn't add any user value: opening the modal already shows the
  // review summary, so clicking once should be enough to finish.
  if (projectStatus === "in_progress" || projectStatus === "review_pending") {
    return "Complete Review";
  }
  return null;
}

function getEndOfWorkStepVisualStatus(
  childId: string,
  projectStatus: string,
): StepVisualStatus {
  const normalized = projectStatus.trim().toLowerCase();
  const stepIndex = END_OF_WORK_STEPS.findIndex((step) => step.id === childId);

  if (stepIndex === -1) return "pending";
  if (normalized === "completed" || normalized === "cancelled") return "done";

  if (normalized === "in_progress") {
    return stepIndex === 0 ? "active" : "pending";
  }

  const activeIndex = END_OF_WORK_STATUS_ORDER.indexOf(
    normalized as EndOfWorkPendingStatus,
  );

  if (activeIndex === -1) return "pending";
  if (stepIndex < activeIndex) return "done";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

function getEndOfWorkGroupVisualStatus(
  projectStatus: string,
): StepVisualStatus {
  const childStatuses = END_OF_WORK_STEPS.map((step) =>
    getEndOfWorkStepVisualStatus(step.id, projectStatus),
  );

  if (childStatuses.every((status) => status === "done")) return "done";
  if (childStatuses.some((status) => status !== "pending")) return "active";
  return "pending";
}

function getEndOfWorkAction(childId: string, projectStatus: string) {
  const step = END_OF_WORK_STEP_BY_ID[childId];

  if (!step) return null;

  const buttonLabel = step.entryLabel || step.activeLabel;
  const visualStatus = getEndOfWorkStepVisualStatus(childId, projectStatus);

  if (visualStatus === "done") {
    return {
      label: buttonLabel,
      nextStatus: null as string | null,
      successTitle: null as string | null,
      successDescription: null as string | null,
    };
  }

  if (projectStatus === "completed") {
    return {
      label: buttonLabel,
      nextStatus: null as string | null,
      successTitle: null as string | null,
      successDescription: null as string | null,
    };
  }

  if (projectStatus === "cancelled") {
    return {
      label: buttonLabel,
      nextStatus: null as string | null,
      successTitle: null as string | null,
      successDescription: null as string | null,
    };
  }

  if (step.entryStatuses?.includes(projectStatus)) {
    return {
      label: step.entryLabel || "Start",
      nextStatus: step.pendingStatus,
      successTitle: step.entrySuccessTitle || step.successTitle,
      successDescription:
        step.entrySuccessDescription || step.successDescription,
    };
  }

  if (projectStatus === step.pendingStatus) {
    return {
      label: step.activeLabel,
      nextStatus: step.nextStatus,
      successTitle: step.successTitle,
      successDescription: step.successDescription,
    };
  }

  return {
    label: buttonLabel,
    nextStatus: null as string | null,
    successTitle: null as string | null,
    successDescription: null as string | null,
  };
}

function buildStartOfWorkChildren(group: ProcessItem) {
  const children = group.children ?? [];

  if (!isStartOfWorkGroup(group)) return children;

  const alreadyHasDownpayment = children.some(
    (child) => child.id === "manage-downpayment",
  );

  if (alreadyHasDownpayment) return children;

  const projectKickoffIndex = children.findIndex(
    (child) => child.id === "project-kickoff",
  );

  const projectKickoff = children.find(
    (child) => child.id === "project-kickoff",
  );

  const downpaymentStep: ProcessItem = {
    id: "manage-downpayment",
    title: "Manage Downpayment",
    status:
      group.status === "done" || projectKickoff?.status === "done"
        ? "done"
        : group.status === "active"
          ? "active"
          : "pending",
    startLabel: "",
    endLabel: "",
  };

  if (projectKickoffIndex === -1) {
    return [downpaymentStep, ...children];
  }

  return [
    ...children.slice(0, projectKickoffIndex),
    downpaymentStep,
    ...children.slice(projectKickoffIndex),
  ];
}

function computeEffectiveChildStatus(
  child: ProcessItem,
  isManageEndOfWorkGroup: boolean,
  startOfWorkDone: boolean,
  effectiveProjectStatus: string,
  cancellationPhase: CancellationPhase | null = null,
): StepVisualStatus {
  if (child.id === "project-kickoff" && startOfWorkDone) return "done";
  if (
    child.id === "manage-downpayment" &&
    [
      "ready_to_start",
      "in_progress",
      ...END_OF_WORK_STATUS_ORDER,
      "completed",
      "cancelled",
    ].includes(effectiveProjectStatus)
  )
    return "done";
  if (isManageEndOfWorkGroup && Boolean(END_OF_WORK_STEP_BY_ID[child.id]))
    return getEndOfWorkStepVisualStatus(child.id, effectiveProjectStatus);
  if (isCancellationStepId(child.id)) {
    return getCancellationStepVisualStatus(child.id, cancellationPhase);
  }
  return child.status;
}

function ProgressSkeleton() {
  return (
    <div className="space-y-2 px-3 py-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-12 items-center gap-3 rounded-lg px-2 py-3">
          <div className="col-span-1">
            <div className="h-5 w-5 animate-pulse rounded-full bg-gray-200" />
          </div>

          <div className="col-span-5">
            <div className="h-4 w-full max-w-[220px] animate-pulse rounded bg-gray-200" />
          </div>

          <div className="col-span-3">
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          </div>

          <div className="col-span-3">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoProjectEmptyState({
  mode,
  onGoToReports,
}: {
  mode: "select-project" | "no-projects-today" | "no-work-left-today";
  onGoToReports: () => void;
}) {
  if (mode === "no-work-left-today") {
    // Day has scheduled projects but staff has nothing actionable on
    // them (every project's subtasks are done — admin is wrapping up).
    // Different copy from "no projects today" so the user knows the
    // day isn't empty, just done from their side.
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#00c065]/20 bg-[#00c065]/10 text-[#00c065]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
            No work left today
          </h3>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
            All scheduled work for the day has been finished. Nothing
            is currently in progress.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "no-projects-today") {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#00c065]/20 bg-[#00c065]/10 text-[#00c065]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
            No projects today
          </h3>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
            There are no scheduled projects for the selected day.
          </p>
          <button
            type="button"
            onClick={onGoToReports}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054]">
            Go to reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-slate-400">
      Select a project to view its process flow.
    </div>
  );
}

function JobProgressCard({
  title = "Progress",
  selectedProject,
  projectId,
  loadingDetails,
  navigating = false,
  processItems,
  openProcessIds,
  openSubtaskIds,
  toggleProcessRow,
  toggleSubtaskRow,
  onFinishSubtask,
  onRefresh,
  canEditGeneratedTasks = false,
  currentUserId,
  employeeReviewItems = [],
  reviewSummary = null,
  emptyProjectState = "select-project",
  hasOtherProjectsToday = false,
  className = "",
  cancellationPhase: cancellationPhaseProp = null,
  cancellationBalance = null,
  cancellationEarnedRevenue = null,
  cancellationEarnedCost = null,
  cancellationSettled = null,
  cancelledFromStatus = null,
  canManageCancellation = true,
  realtimeStatus = "idle",
  showPreExecutionTakeover = false,
}: Props) {
  const router = useRouter();

  const [startingProject, setStartingProject] = useState(false);
  const [startOfWorkDone, setStartOfWorkDone] = useState(false);
  const [projectStatusOverride, setProjectStatusOverride] = useState<
    string | null
  >(null);
  const [updatingEndOfWorkStepId, setUpdatingEndOfWorkStepId] = useState<
    string | null
  >(null);
  const [downpaymentModalOpen, setDownpaymentModalOpen] = useState(false);
  const [kickoffModalOpen, setKickoffModalOpen] = useState(false);
  // --- SIMULATED TIME (testing only) -----------------------------------
  // The kickoff "now" anchor comes from useProjectNow so it reflects the
  // simulated clock when one is set in settings. The hook's `now` Date is
  // a stable per-render snapshot, but settings changes re-trigger the
  // hook, so a tick state below force-refreshes the countdown each minute
  // when we're actually showing it.
  const { now: projectNow } = useProjectNow();
  // ---------------------------------------------------------------------
  const [tick, setTick] = useState<number>(0);

  type ScheduleConflict = {
    staffName: string;
    otherProjectCode: string | null;
    otherProjectTitle: string | null;
    thisSubtask: string;
    otherSubtask: string;
    shiftedStart: string;
    shiftedEnd: string;
    otherStart: string;
    otherEnd: string;
  };
  const [kickoffConflicts, setKickoffConflicts] = useState<
    ScheduleConflict[] | null
  >(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [finalPaymentModalOpen, setFinalPaymentModalOpen] = useState(false);
  const [employeeManagementModalOpen, setEmployeeManagementModalOpen] =
    useState(false);
  // Shown while the invoice HTML is being warmed up before navigating
  // to /admin/projects/invoice-generation. The actual render happens
  // inside the iframe on the destination page, but pre-fetching the
  // route lets us block until the heavy work is done so the user sees
  // the loaded page on arrival instead of a flash of empty iframe.
  const [generatingInvoiceOpen, setGeneratingInvoiceOpen] = useState(false);

  // Cancellation flow state — paralleling the end-of-work modals.
  // `cancellationPhaseOverride` lets us reflect a phase advance instantly
  // in the UI before the next refresh fetches the canonical value.
  const [cancellationPhaseOverride, setCancellationPhaseOverride] = useState<
    CancellationPhase | null
  >(null);
  const [cancellationReviewModalOpen, setCancellationReviewModalOpen] =
    useState(false);
  const [cancellationPaymentModalOpen, setCancellationPaymentModalOpen] =
    useState(false);
  const [cancellationEmployeeModalOpen, setCancellationEmployeeModalOpen] =
    useState(false);
  const [cancellationConcludeConfirmOpen, setCancellationConcludeConfirmOpen] =
    useState(false);
  const [advancingCancellationStep, setAdvancingCancellationStep] = useState<
    CancellationStepId | null
  >(null);

  // Tracks the "notify client about settlement" button on the
  // Payment Management modal. Mirrors the downpayment notify pattern —
  // brief loading state, then a "Client notified" pill that auto-clears
  // after a few seconds so the admin can re-notify if needed.
  const [cancellationPaymentNotifying, setCancellationPaymentNotifying] =
    useState(false);
  const [cancellationPaymentNotified, setCancellationPaymentNotified] =
    useState(false);
  useEffect(() => {
    setCancellationPaymentNotified(false);
  }, [projectId, cancellationPaymentModalOpen]);

  // Cancellation settlement collection — mirrors the downpayment modal
  // pattern. `savedSettlement` is the cumulative amount already persisted
  // to projects.cancellation_settled; `inputSettlement` is the new
  // instalment the admin is typing in right now. Add records the
  // instalment without advancing the phase, Confirm finalises and
  // bumps the phase to 'employee' once savedSettlement covers the
  // absolute settlement balance.
  const [savedSettlement, setSavedSettlement] = useState<number>(0);
  const [inputSettlement, setInputSettlement] = useState<string>("");
  const [addingSettlement, setAddingSettlement] = useState(false);
  const [confirmingSettlement, setConfirmingSettlement] = useState(false);
  // Whenever the modal opens (or the underlying project / prop value
  // changes), refresh both the running tally from the prop and clear
  // the input field so the admin lands on a clean slate.
  useEffect(() => {
    if (!cancellationPaymentModalOpen) return;
    setSavedSettlement(Number(cancellationSettled ?? 0));
    setInputSettlement("");
  }, [cancellationPaymentModalOpen, cancellationSettled, projectId]);

  // Effective phase = override (most recent local advance) if set, else
  // the prop coming from the parent's overview fetch. Falls back to
  // "review" if the project is cancelled but we got nothing — keeps
  // the wrap-up actionable instead of stuck.
  const effectiveCancellationPhase: CancellationPhase | null = useMemo(() => {
    if (cancellationPhaseOverride) return cancellationPhaseOverride;
    return normalizeCancellationPhase(cancellationPhaseProp);
  }, [cancellationPhaseOverride, cancellationPhaseProp]);

  // Memoised so the EmployeeManagementModal sees a stable array reference
  // across renders. Passing a fresh array on every render (the previous
  // `filterEmployeeReviewItemsToFinishedOnly(employeeReviewItems)` inline
  // call) was triggering the modal's `[open, employees]` reset effect on
  // each save — wiping `submittedUserIds` and `activeIndex`, so the modal
  // jumped back to employee 1 instead of advancing.
  const cancellationEmployeeReviewItems = useMemo(
    () => filterEmployeeReviewItemsToFinishedOnly(employeeReviewItems),
    [employeeReviewItems],
  );

  // Reset the override whenever the project changes — otherwise we'd
  // carry over a stale phase from a previous selection.
  useEffect(() => {
    setCancellationPhaseOverride(null);
  }, [projectId]);
  const [employeeManagementSaving, setEmployeeManagementSaving] =
    useState(false);
  const [editingGeneratedTask, setEditingGeneratedTask] =
    useState<GeneratedTaskEditTarget | null>(null);
  const [savingGeneratedTask, setSavingGeneratedTask] = useState(false);
  const [confirmingFinishId, setConfirmingFinishId] = useState<string | null>(
    null,
  );
  const [confirmingFinishTitle, setConfirmingFinishTitle] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [concludeConfirmOpen, setConcludeConfirmOpen] = useState(false);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(
    currentUserId || null,
  );

  const seededForProjectRef = useRef<string | null>(null);
  const openProcessIdsRef = useRef(openProcessIds);
  openProcessIdsRef.current = openProcessIds;
  const groupRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const selectedProjectStatus = readProjectStatus(selectedProject);
  const effectiveProjectId = projectId || readProjectId(selectedProject);
  const effectiveProjectStatus = projectStatusOverride || selectedProjectStatus;
  const effectiveCurrentUserId = currentUserId || resolvedCurrentUserId;


  useEffect(() => {
    setProjectStatusOverride(null);
  }, [selectedProjectStatus, effectiveProjectId]);

  // Kickoff countdown — derives from the project's scheduled_start_datetime.
  // The `now` clock ticks every minute, but only while the project is in
  // ready_to_start (the only state where the kickoff label matters).
  const projectScheduledStartIso = readProjectScheduledStart(selectedProject);
  const projectScheduledStartMs = projectScheduledStartIso
    ? new Date(projectScheduledStartIso).getTime()
    : null;

  useEffect(() => {
    if (effectiveProjectStatus !== "ready_to_start") return;
    // Just bumps a counter once a minute; the actual "now" comes from
    // useProjectNow on each render. This keeps the countdown in sync
    // with both the simulated clock and the real wall clock.
    const interval = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(interval);
  }, [effectiveProjectStatus]);

  // Positive = scheduled is in the future (early to start).
  // Negative = scheduled is in the past (late to start).
  // Null = no scheduled time on the project.
  // --- SIMULATED TIME (testing only) -----------------------------------
  // `projectNow` is the simulated "right now" if a reference time is set
  // in settings, otherwise the real wall clock. To remove simulation,
  // delete the useProjectNow import + call above and substitute
  // `Date.now()` here.
  // ---------------------------------------------------------------------
  void tick; // ensure the minute-tick triggers a re-render
  const kickoffOffsetMs =
    projectScheduledStartMs !== null
      ? projectScheduledStartMs - projectNow.getTime()
      : null;

  // When the kickoff modal opens, ask the server whether shifting this
  // project's subtasks by `kickoffOffsetMs` would double-book any of the
  // assigned staff against another active project. Result drives both the
  // explanation block and whether the Confirm button is enabled.
  useEffect(() => {
    if (!kickoffModalOpen || !effectiveProjectId) return;

    let cancelled = false;
    const shift =
      kickoffOffsetMs !== null && Math.abs(kickoffOffsetMs) >= 60_000
        ? -kickoffOffsetMs
        : 0;

    setCheckingConflicts(true);
    setKickoffConflicts(null);

    (async () => {
      try {
        const res = await fetch("/api/planning/checkScheduleConflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: effectiveProjectId,
            offsetMs: shift,
          }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          // Treat fetch failures as "no conflicts known" so the user
          // isn't blocked by a network blip — but log so we know.
          console.error("Conflict check failed:", data?.error);
          setKickoffConflicts([]);
        } else {
          setKickoffConflicts(
            Array.isArray(data?.conflicts) ? data.conflicts : [],
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setKickoffConflicts([]);
        }
      } finally {
        if (!cancelled) setCheckingConflicts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kickoffModalOpen, effectiveProjectId, kickoffOffsetMs]);

  // Admin-only auto-start: when the toggle in /admin/settings is on, a
  // ready_to_start project whose scheduled start has arrived is started
  // automatically. We still run the conflict check first — if any conflict
  // is found we toast and back off so the admin can resolve it manually
  // (rather than silently starting on top of a double-booked staff).
  const autoStartEnabled = useAutoStartProjects();
  const autoStartFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStartEnabled) return;
    if (effectiveProjectStatus !== "ready_to_start") return;
    if (!effectiveProjectId) return;
    if (kickoffOffsetMs === null) return;
    if (kickoffOffsetMs > 0) return; // not yet time
    if (startingProject) return;
    if (kickoffModalOpen) return; // user is already handling it manually
    if (autoStartFiredRef.current === effectiveProjectId) return;
    autoStartFiredRef.current = effectiveProjectId;

    (async () => {
      try {
        // Conflict check first (uses the shifted times the start would
        // produce, same as the modal does).
        const shift =
          kickoffOffsetMs !== null && Math.abs(kickoffOffsetMs) >= 60_000
            ? -kickoffOffsetMs
            : 0;
        const checkRes = await fetch(
          "/api/planning/checkScheduleConflicts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: effectiveProjectId,
              offsetMs: shift,
            }),
          },
        );
        const checkData = await checkRes.json().catch(() => null);
        const conflicts = Array.isArray(checkData?.conflicts)
          ? checkData.conflicts
          : [];

        if (conflicts.length > 0) {
          toast.warning("Auto-start skipped — schedule conflict", {
            description:
              "One or more staff are double-booked with another active project. Open the project to resolve.",
          });
          return;
        }

        await confirmStartProject();
        toast.success("Project auto-started", {
          description: "Scheduled start time has arrived.",
        });
      } catch (err) {
        console.error("Auto-start failed:", err);
      }
    })();
  }, [
    autoStartEnabled,
    effectiveProjectStatus,
    effectiveProjectId,
    kickoffOffsetMs,
    startingProject,
    kickoffModalOpen,
  ]);

  function describeKickoff(): string {
    if (kickoffOffsetMs === null) return "No scheduled start";
    const abs = Math.abs(kickoffOffsetMs);
    // Within 1 minute of the scheduled time = "Starting now".
    if (abs < 60_000) return "Starting now";
    if (kickoffOffsetMs > 0) return `Starts in ${formatDuration(abs)}`;
    return `Scheduled ${formatDuration(abs)} ago`;
  }

  // Auto-open the Downpayment modal when arriving via the
  // /admin?openDownpayment=<projectId> link from /admin/projects.
  // We only fire when this card's project matches, the project is in
  // downpayment_pending, and the modal isn't already open. After firing
  // we strip the query param so a refresh doesn't re-open the modal.
  useEffect(() => {
    const requestedId = searchParams?.get("openDownpayment");
    if (!requestedId) return;
    if (!effectiveProjectId || requestedId !== effectiveProjectId) return;
    if (effectiveProjectStatus !== "downpayment_pending") return;

    setDownpaymentModalOpen(true);

    // Clean the URL so refresh / back navigation doesn't re-trigger.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openDownpayment");
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    searchParams,
    effectiveProjectId,
    effectiveProjectStatus,
    router,
    pathname,
  ]);

  // Same pattern for the kickoff modal — fired by /admin/projects when the
  // user clicks Open on a ready_to_start project. Only opens when this
  // card's project matches and the project is actually ready_to_start, so
  // the modal can never appear for the wrong project.
  useEffect(() => {
    const requestedId = searchParams?.get("openKickoff");
    if (!requestedId) return;
    if (!effectiveProjectId || requestedId !== effectiveProjectId) return;
    if (effectiveProjectStatus !== "ready_to_start") return;

    setKickoffModalOpen(true);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openKickoff");
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    searchParams,
    effectiveProjectId,
    effectiveProjectStatus,
    router,
    pathname,
  ]);

  // Same pattern for the final-payment modal — fired by the admin
  // invoice-generation page's "Go to Payment" button when the project
  // sits at payment_pending. The status guard prevents the modal from
  // popping for projects that have already moved past payment.
  useEffect(() => {
    const requestedId = searchParams?.get("openPayment");
    if (!requestedId) return;
    if (!effectiveProjectId || requestedId !== effectiveProjectId) return;
    if (effectiveProjectStatus !== "payment_pending") return;

    setFinalPaymentModalOpen(true);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openPayment");
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    searchParams,
    effectiveProjectId,
    effectiveProjectStatus,
    router,
    pathname,
  ]);

  // Same pattern for the cancellation settlement modal — fired by the
  // /admin/projects/cancellation-agreement-generation page's "Advance
  // to Payment Management" button once the client has signed the
  // agreement. Gated on the cancellation phase actually being at the
  // payment step so the modal doesn't pop for earlier/later wrap-up
  // states.
  useEffect(() => {
    const requestedId = searchParams?.get("openCancellationPayment");
    if (!requestedId) return;
    if (!effectiveProjectId || requestedId !== effectiveProjectId) return;
    if (effectiveCancellationPhase !== "payment") return;

    setCancellationPaymentModalOpen(true);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openCancellationPayment");
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    searchParams,
    effectiveProjectId,
    effectiveCancellationPhase,
    router,
    pathname,
  ]);

  useEffect(() => {
    if (currentUserId) {
      setResolvedCurrentUserId(currentUserId);
      return;
    }

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setResolvedCurrentUserId(data.user?.id || null);
      }
    });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    setStartOfWorkDone(
      effectiveProjectStatus === "in_progress" ||
        effectiveProjectStatus === "completed" ||
        effectiveProjectStatus === "cancelled" ||
        isEndOfWorkStatus(effectiveProjectStatus),
    );
  }, [effectiveProjectStatus]);

  // Compute the focus group's identity (i.e. WHICH parent task is
  // active right now) up here so the seeding effect below can re-run
  // whenever it changes — not just whenever the project switches. The
  // user wants the active parent always expanded; if a subtask flips
  // to "active" via realtime or via the cascade after a finish, the
  // effect needs to notice and re-focus.
  const focusGroupId = useMemo(() => {
    if (!processItems.length) return null;

    const childIsActive = (child: ProcessItem, isEndOfWork: boolean) =>
      computeEffectiveChildStatus(
        child,
        isEndOfWork,
        startOfWorkDone,
        effectiveProjectStatus,
      ) === "active";

    const childIsNotDone = (child: ProcessItem, isEndOfWork: boolean) =>
      computeEffectiveChildStatus(
        child,
        isEndOfWork,
        startOfWorkDone,
        effectiveProjectStatus,
      ) !== "done";

    // Pick the parent of the FIRST active subtask. If nothing's active
    // yet (e.g. project just loaded and all subtasks are "pending"),
    // fall back to the first group that still has pending work.
    const found =
      processItems.find((group) => {
        const isEndOfWork = isManageEndOfWorkGroup(group);
        const children = buildStartOfWorkChildren(group);
        return children.some((child) => childIsActive(child, isEndOfWork));
      }) ??
      processItems.find((group) => {
        const isEndOfWork = isManageEndOfWorkGroup(group);
        const children = buildStartOfWorkChildren(group);
        return children.some((child) => childIsNotDone(child, isEndOfWork));
      });

    return found?.id ?? null;
  }, [processItems, startOfWorkDone, effectiveProjectStatus]);

  useEffect(() => {
    if (!processItems.length || !effectiveProjectId) return;
    // Seed key combines projectId + the focus group id, so:
    //   - Switching projects re-seeds (different projectId)
    //   - The active subtask changing parents (e.g. last subtask of
    //     "Surface Prep" finishes, "Painting" becomes the active
    //     parent) re-seeds and the new parent expands automatically
    //   - Plain refreshes that don't change the focus do NOT re-seed,
    //     so the user's manual toggles aren't clobbered.
    const seedKey = `${effectiveProjectId}:${focusGroupId ?? ""}`;
    if (seededForProjectRef.current === seedKey) return;
    seededForProjectRef.current = seedKey;

    // Important: child.status on the raw ProcessItem is the
    // workflow-time status (filled in by buildProcessItems). The
    // user-visible status is computed at render time via
    // `computeEffectiveChildStatus`. Both are used in focusGroupId
    // above and the rendering, so they stay in sync.
    const focusGroup = processItems.find((group) => group.id === focusGroupId);

    const focusId = focusGroup?.id ?? null;

    // Snapshot the current open set BEFORE issuing toggles. Each
    // toggleProcessRow call is functional so they compose correctly
    // even if ref state hasn't refreshed yet — but our decisions below
    // have to be based on the pre-toggle set, otherwise we'd misread.
    const currentlyOpen = Array.from(openProcessIdsRef.current);
    for (const id of currentlyOpen) {
      if (id !== focusId) {
        toggleProcessRow(id);
      }
    }
    if (focusId && !openProcessIdsRef.current.has(focusId)) {
      toggleProcessRow(focusId);
    }

    if (!focusGroup) return;

    // Scroll the focus group into view after the expand has rendered.
    const handle = window.requestAnimationFrame(() => {
      groupRefs.current
        .get(focusGroup.id)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    return () => window.cancelAnimationFrame(handle);
  }, [
    processItems,
    effectiveProjectId,
    focusGroupId,
    toggleProcessRow,
  ]);

  // Clicking "Start Project" doesn't fire the status change directly any
  // more — it opens the kickoff confirmation modal first so the user can
  // see how early/late they are and confirm shifting the subtask schedule.
  function handleStartProjectWork() {
    if (!effectiveProjectId || startingProject) return;
    setKickoffModalOpen(true);
  }

  // Actual start, fired from the kickoff modal's Confirm button. If the
  // start is more than a minute off the scheduled time, every subtask's
  // scheduled start/end gets shifted by the same offset so the rest of the
  // schedule stays consistent with the new start.
  async function confirmStartProject() {
    if (!effectiveProjectId || startingProject) return;

    try {
      setStartingProject(true);

      // 1. Shift schedules first (only if the offset is non-trivial).
      if (kickoffOffsetMs !== null && Math.abs(kickoffOffsetMs) >= 60_000) {
        // Shift amount is the inverse of the offset: if scheduled is 2h
        // ahead of now (kickoffOffsetMs = +2h), we want to pull schedules
        // 2h earlier (shiftMs = -2h). Equivalently, shiftMs = -kickoffOffsetMs.
        const shiftMs = -kickoffOffsetMs;
        const shiftRes = await fetch("/api/planning/shiftProjectSchedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: effectiveProjectId,
            offsetMs: shiftMs,
          }),
        });
        const shiftData = await shiftRes.json().catch(() => null);
        if (!shiftRes.ok) {
          throw new Error(
            [shiftData?.error, shiftData?.details].filter(Boolean).join(": ") ||
              "Failed to shift project schedule.",
          );
        }
      }

      // 2. Flip the project to in_progress.
      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          status: "in_progress",
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to start project.",
        );
      }

      setProjectStatusOverride("in_progress");
      setStartOfWorkDone(true);
      setKickoffModalOpen(false);
      onRefresh?.();

      toast.success("Project started", {
        description: "Project status is now in progress.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start project.";

      console.error(error);

      toast.error("Could not start project", {
        description: message,
      });
    } finally {
      setStartingProject(false);
    }
  }

  async function handleEndOfWorkStepAction(
    childId: string,
    nextStatus: string,
    successTitle: string,
    successDescription: string,
  ) {
    if (!effectiveProjectId || updatingEndOfWorkStepId) return;

    try {
      setUpdatingEndOfWorkStepId(childId);

      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          status: nextStatus,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to update project status.",
        );
      }

      setProjectStatusOverride(nextStatus);
      onRefresh?.();

      // Conclude-job flow: tear down the project's conversation
      // threads so they stop cluttering everyone's message lists
      // once the project is closed. Done after the status update
      // so the project is already marked completed if this fails.
      if (nextStatus === "completed") {
        try {
          const cleanupResponse = await fetch(
            "/api/planning/deleteProjectConversations",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: effectiveProjectId }),
            },
          );
          if (!cleanupResponse.ok) {
            const cleanupBody = await cleanupResponse
              .json()
              .catch(() => null);
            console.error(
              "deleteProjectConversations failed:",
              cleanupBody?.error ?? cleanupResponse.statusText,
            );
          }
        } catch (cleanupError) {
          console.error("deleteProjectConversations error:", cleanupError);
        }
      }

      toast.success(successTitle, {
        description: successDescription,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update project.";

      console.error(error);

      toast.error("Could not update project", {
        description: message,
      });
    } finally {
      setUpdatingEndOfWorkStepId(null);
    }
  }

  // Advances cancellation_phase by one step. Each cancellation child's
  // action button funnels through here once its substep completes — for
  // Review, that's "Review completed"; for Payment, "Settlement
  // recorded"; for Document, the cancellation agreement was signed; for
  // Employee, all employees have been reviewed; for Conclude, the
  // project is officially closed-out.
  async function advanceCancellationPhase(
    stepId: CancellationStepId,
    fromPhase: CancellationPhase,
  ): Promise<boolean> {
    if (!effectiveProjectId || advancingCancellationStep) return false;

    const toPhase = getNextCancellationPhase(fromPhase);
    if (!toPhase) return false;

    try {
      setAdvancingCancellationStep(stepId);

      const response = await fetch(
        "/api/planning/advanceCancellationPhase",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: effectiveProjectId,
            fromPhase,
            toPhase,
          }),
        },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to advance cancellation step.",
        );
      }

      setCancellationPhaseOverride(toPhase);
      onRefresh?.();
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to advance cancellation step.";
      console.error(error);
      toast.error("Could not advance cancellation step", {
        description: message,
      });
      return false;
    } finally {
      setAdvancingCancellationStep(null);
    }
  }

  async function handleConfirmConcludeJob() {
    const action = getEndOfWorkAction("conclude-job", effectiveProjectStatus);

    if (
      !action?.nextStatus ||
      !action.successTitle ||
      !action.successDescription
    ) {
      setConcludeConfirmOpen(false);
      return;
    }

    await handleEndOfWorkStepAction(
      "conclude-job",
      action.nextStatus,
      action.successTitle,
      action.successDescription,
    );
    setConcludeConfirmOpen(false);
  }

  async function handleConfirmFinish() {
    if (!confirmingFinishId || !onFinishSubtask) return;
    setFinishing(true);
    try {
      await onFinishSubtask(confirmingFinishId);
      setConfirmingFinishId(null);
      toast.success("Subtask completed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to finish subtask.";
      toast.error("Could not finish subtask", { description: message });
    } finally {
      setFinishing(false);
    }
  }

  async function handleSaveGeneratedTask(payload: {
    projectTaskId: string;
    projectSubTaskId: string;
    materials: GeneratedTaskMaterial[];
    equipment: GeneratedTaskEquipment[];
    employeeIds: string[];
    estimatedHours: number | null;
    scheduledStartDatetime: string | null;
    scheduledEndDatetime: string | null;
  }) {
    try {
      setSavingGeneratedTask(true);

      const response = await fetch("/api/planning/updateGeneratedSubTask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectTaskId: payload.projectTaskId,
          projectSubTaskId: payload.projectSubTaskId,
          materials: payload.materials.map((material) => ({
            materialId: material.id,
            quantity: material.quantity,
            estimatedCost: material.estimatedCost,
          })),
          equipment: payload.equipment.map((item) => ({
            equipment_id: item.id,
            quantity: item.quantity,
            notes: item.notes,
          })),
          employeeIds: payload.employeeIds,
          estimatedHours: payload.estimatedHours,
          scheduledStartDatetime: payload.scheduledStartDatetime,
          scheduledEndDatetime: payload.scheduledEndDatetime,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to update generated task.",
        );
      }

      setEditingGeneratedTask(null);
      toast.success("Generated task updated");
      onRefresh?.();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update generated task.";

      toast.error("Could not update task", {
        description: message,
      });
    } finally {
      setSavingGeneratedTask(false);
    }
  }

  async function handleEmployeeManagementFinish(
    payload: EmployeeManagementFinishPayload,
  ) {
    if (!effectiveProjectId) {
      throw new Error("Missing project ID.");
    }

    const employee = employeeReviewItems.find(
      (item) => item.userId === payload.employeeId,
    );

    if (!employee) {
      throw new Error("Employee review target not found.");
    }

    try {
      setEmployeeManagementSaving(true);

      const response = await fetch("/api/planning/saveEmployeePerformance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          userId: employee.userId,
          note: payload.note,
          rating: payload.rating,
          salaryAmount: Number(employee.salaryAmount ?? 0),
          totalEstimatedHours: Number(employee.totalEstimatedHours ?? 0),
          hourlyWage: Number(employee.hourlyWage ?? 0),
          reviewedBy: effectiveCurrentUserId,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to save employee performance.",
        );
      }

      if (payload.isLastEmployee) {
        setEmployeeManagementModalOpen(false);

        const action = getEndOfWorkAction(
          "employee-management",
          effectiveProjectStatus,
        );

        if (
          action?.nextStatus &&
          action.successTitle &&
          action.successDescription
        ) {
          await handleEndOfWorkStepAction(
            "employee-management",
            action.nextStatus,
            action.successTitle,
            action.successDescription,
          );
        } else {
          onRefresh?.();
          toast.success("Employee reviews saved");
        }

        return;
      }

      toast.success("Employee review saved", {
        description: `Saved review for ${employee.username}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save employee performance.";

      toast.error("Could not save employee review", {
        description: message,
      });

      throw error;
    } finally {
      setEmployeeManagementSaving(false);
    }
  }

  const isPastJobCreation = [
    "downpayment_pending",
    "ready_to_start",
    "in_progress",
    ...END_OF_WORK_STATUS_ORDER,
    "completed",
    "cancelled",
  ].includes(effectiveProjectStatus);

  return (
    <section
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900",
        className,
      ].join(" ")}>
      <div className="h-1 w-full shrink-0 rounded-t-xl bg-[#00c065]" />

      <div className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-slate-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-5 text-gray-900 dark:text-slate-100">
              {title}
            </h2>

            <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-slate-400">
              Track service flow, scheduled dates, and task completion.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Live-updates indicator. Hidden in the "idle" state so
                we don't draw user attention to it on dashboards
                without an active subscription (e.g. before a project
                is selected). */}
            {realtimeStatus !== "idle" ? (
              <div
                title={
                  realtimeStatus === "live"
                    ? "Live — subtask updates from other dashboards land automatically"
                    : realtimeStatus === "connecting"
                      ? "Connecting to live updates…"
                      : realtimeStatus === "error"
                        ? "Live updates disconnected — try refreshing"
                        : "Live updates closed"
                }
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  realtimeStatus === "live"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : realtimeStatus === "connecting"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-red-50 text-red-700 ring-1 ring-red-200",
                ].join(" ")}>
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    realtimeStatus === "live"
                      ? "bg-emerald-500 animate-pulse"
                      : realtimeStatus === "connecting"
                        ? "bg-amber-500"
                        : "bg-red-500",
                  ].join(" ")}
                  aria-hidden
                />
                {realtimeStatus === "live"
                  ? "Live"
                  : realtimeStatus === "connecting"
                    ? "…"
                    : "Offline"}
              </div>
            ) : null}

            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loadingDetails}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 dark:text-slate-400 transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                <RefreshCw
                  className={[
                    "h-3.5 w-3.5",
                    loadingDetails || navigating ? "animate-spin" : "",
                  ].join(" ")}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="hidden shrink-0 grid-cols-12 gap-3 border-b border-gray-200 px-4 py-4 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500 md:grid dark:border-slate-700">
        <div className="col-span-2">Status</div>
        <div className="col-span-4">Service</div>
        <div className="col-span-3">Scheduled Date &amp; Time</div>
        <div className="col-span-3">Finished Date &amp; Time</div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div
            className={[
              "min-h-0 flex-1 overflow-y-auto",
              "px-3 py-3",
              "[--job-progress-scrollbar-track:#E6F8EF] dark:[--job-progress-scrollbar-track:#0f172a]",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar]:bg-[#E6F8EF]",
              "dark:[&::-webkit-scrollbar]:bg-slate-900",
              "[&::-webkit-scrollbar-track]:rounded-full",
              "[&::-webkit-scrollbar-track]:bg-[#E6F8EF]",
              "dark:[&::-webkit-scrollbar-track]:bg-slate-900",
              "[&::-webkit-scrollbar-button]:bg-[#E6F8EF]",
              "dark:[&::-webkit-scrollbar-button]:bg-slate-900",
              "[&::-webkit-scrollbar-corner]:bg-[#E6F8EF]",
              "dark:[&::-webkit-scrollbar-corner]:bg-slate-900",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-[#00c065]",
              "dark:[&::-webkit-scrollbar-thumb]:bg-[#00c065]",
            ].join(" ")}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: `#00c065 var(--job-progress-scrollbar-track)`,
            } as React.CSSProperties}>
            {!selectedProject ? (
              <NoProjectEmptyState
                mode={emptyProjectState}
                onGoToReports={() => router.push("/admin/report")}
              />
            ) : loadingDetails ? (
              <ProgressSkeleton />
            ) : showPreExecutionTakeover &&
              isPreExecutionStatus(effectiveProjectStatus) ? (
              // Pre-kickoff takeover for the client dashboard — the
              // workflow breakdown is admin/staff-internal noise until
              // there's actual work to track. Shows a friendly "we're
              // still setting things up" message instead.
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                    <RefreshCw className="h-5 w-5 animate-spin [animation-duration:3s]" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
                    Project creation ongoing
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
                    Your project is being set up. The progress timeline
                    will appear here once work kicks off on site.
                  </p>
                </div>
              </div>
            ) : effectiveProjectStatus === "completed" ||
              (effectiveProjectStatus === "cancelled" &&
                effectiveCancellationPhase === "done") ? (
              // Whenever the SELECTED project is fully closed-out,
              // swap the progress list for the "all done" view + Go to
              // reports button. Fires for both completed projects and
              // cancelled projects whose post-cancel wrap-up reached
              // the "done" phase — both are archive-state from the
              // dashboard's perspective.
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#00c065]/20 bg-[#00c065]/10 text-[#00c065]">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {effectiveProjectStatus === "cancelled"
                      ? "Project cancellation closed-out"
                      : "Project is done"}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
                    {effectiveProjectStatus === "cancelled"
                      ? "The cancellation wrap-up is complete. Head over to reports to review the close-out."
                      : "Nothing else is scheduled for this day. Head over to reports to review the wrap-up."}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/report")}
                    className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054]">
                    Go to reports
                  </button>
                </div>
              </div>
            ) : processItems.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-slate-400">
                No progress steps yet.
              </div>
            ) : (
              <div>
                {processItems.map((group, groupIndex) => {
                  const groupChildren = buildStartOfWorkChildren(group);
                  const hasChildren = groupChildren.length > 0;
                  const open = openProcessIds.has(group.id);

                  const currentIsStartOfWorkGroup = isStartOfWorkGroup(group);
                  const currentIsManageEndOfWorkGroup =
                    isManageEndOfWorkGroup(group);
                  const currentIsCancellationGroup = isCancellationGroup(group);

                  const effectiveGroupStatus: StepVisualStatus =
                    currentIsStartOfWorkGroup && startOfWorkDone
                      ? "done"
                      : currentIsManageEndOfWorkGroup
                        ? getEndOfWorkGroupVisualStatus(effectiveProjectStatus)
                        : currentIsCancellationGroup
                          ? getCancellationGroupVisualStatus(
                              effectiveCancellationPhase,
                            )
                          : group.status;

                  const totalCount = groupChildren.length;
                  const isJobCreationGroup =
                    group.id === "job-creation" ||
                    group.title.toLowerCase().trim() === "job creation";
                  const isLastGroup = groupIndex === processItems.length - 1;

                  const siblingStatuses = groupChildren.map((c) =>
                    computeEffectiveChildStatus(
                      c,
                      currentIsManageEndOfWorkGroup,
                      startOfWorkDone,
                      effectiveProjectStatus,
                      effectiveCancellationPhase,
                    ),
                  );

                  // Count done from the effective child statuses — the same
                  // values that drive the rendered "Completed/Working on it"
                  // pills below — so the ring fill always matches what the
                  // user is looking at. (Reading child.status directly used
                  // to leave the ring at 0% even when a child like Manage
                  // Downpayment was already marked Completed in its row.)
                  const doneCount = siblingStatuses.filter(
                    (status) => status === "done",
                  ).length;

                  return (
                    <div
                      key={group.id}
                      ref={(el) => {
                        if (el) groupRefs.current.set(group.id, el);
                        else groupRefs.current.delete(group.id);
                      }}
                      className={[
                        "py-2",
                        !isLastGroup
                          ? isJobCreationGroup
                            ? "border-b border-gray-100 dark:border-slate-800/60"
                            : "border-b border-gray-100 dark:border-slate-800"
                          : "",
                      ].join(" ")}>
                      <button
                        type="button"
                        disabled={!hasChildren}
                        onClick={() => {
                          if (hasChildren) {
                            toggleProcessRow(group.id);
                          }
                        }}
                        className={[
                          "w-full rounded-lg px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          hasChildren ? "cursor-pointer" : "cursor-default",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
                        ].join(" ")}
                        style={
                          hasChildren
                            ? ({
                                "--tw-ring-color": GREEN,
                              } as React.CSSProperties)
                            : undefined
                        }>
                        <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                          <div className="shrink-0 md:col-span-2">
                            <div className="relative h-6 w-[22px]">
                              <div className="absolute left-0 top-0">
                                <GroupProgressRing
                                  status={effectiveGroupStatus}
                                  doneCount={doneCount}
                                  totalCount={totalCount}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 md:col-span-4">
                            <div className="flex items-start gap-2">
                              {hasChildren ? (
                                <ChevronDown
                                  className={[
                                    "mt-0.5 h-4 w-4 text-gray-300 transition-transform dark:text-slate-600",
                                    open ? "rotate-0" : "-rotate-90",
                                  ].join(" ")}
                                  aria-hidden
                                />
                              ) : (
                                <span className="mt-0.5 h-4 w-4" aria-hidden />
                              )}

                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div
                                    className={[
                                      "truncate text-sm font-medium",
                                      effectiveGroupStatus === "pending"
                                        ? "text-gray-700 dark:text-slate-300"
                                        : "text-gray-900 dark:text-slate-100",
                                    ].join(" ")}>
                                    {group.title}
                                  </div>

                                  <StatusLabelTag
                                    item={group}
                                    status={effectiveGroupStatus}
                                  />
                                </div>

                                {/* Mobile-only date subtext */}
                                <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-500 dark:text-slate-400 md:hidden">
                                  <div>
                                    Scheduled:{" "}
                                    <span className="text-gray-700 dark:text-slate-300">
                                      {group.startLabel || "-"}
                                    </span>
                                  </div>
                                  <div>
                                    Finished:{" "}
                                    <span className="text-gray-700 dark:text-slate-300">
                                      {group.endLabel || "-"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="hidden md:col-span-3 md:block">
                            <div className="text-xs text-gray-900 dark:text-slate-100">
                              {group.startLabel || "-"}
                            </div>
                          </div>

                          <div className="hidden md:col-span-3 md:block">
                            <div className="text-xs text-gray-900 dark:text-slate-100">
                              {group.endLabel || "-"}
                            </div>
                          </div>
                        </div>
                      </button>

                      <Transition
                        as={Fragment}
                        show={open && hasChildren}
                        enter="transition duration-150 ease-out"
                        enterFrom="opacity-0 -translate-y-1"
                        enterTo="opacity-100 translate-y-0"
                        leave="transition duration-100 ease-in"
                        leaveFrom="opacity-100 translate-y-0"
                        leaveTo="opacity-0 -translate-y-1">
                        <div>
                          <div className="mt-1 space-y-0">
                            {groupChildren.map((child, childIndex) => {
                              const isProjectKickoff =
                                child.id === "project-kickoff";

                              const isDownpaymentDone =
                                child.id === "manage-downpayment" &&
                                [
                                  "ready_to_start",
                                  "in_progress",
                                  ...END_OF_WORK_STATUS_ORDER,
                                  "completed",
                                  "cancelled",
                                ].includes(effectiveProjectStatus);

                              const isEndOfWorkChild =
                                currentIsManageEndOfWorkGroup &&
                                Boolean(END_OF_WORK_STEP_BY_ID[child.id]);

                              const isCancellationChild =
                                currentIsCancellationGroup &&
                                isCancellationStepId(child.id);

                              const effectiveChildStatus: StepVisualStatus =
                                isProjectKickoff && startOfWorkDone
                                  ? "done"
                                  : isDownpaymentDone
                                    ? "done"
                                    : isEndOfWorkChild
                                      ? getEndOfWorkStepVisualStatus(
                                          child.id,
                                          effectiveProjectStatus,
                                        )
                                      : isCancellationChild
                                        ? getCancellationStepVisualStatus(
                                            child.id as CancellationStepId,
                                            effectiveCancellationPhase,
                                          )
                                        : child.status;

                              const dim = effectiveChildStatus === "done";
                              const previousSibling =
                                childIndex > 0
                                  ? groupChildren[childIndex - 1]
                                  : null;
                              const previousHasEndDatetime = Boolean(
                                previousSibling?.detail?.completedAt ||
                                  previousSibling?.detail
                                    ?.scheduledEndDatetime,
                              );
                              const isPreviousTaskDone =
                                childIndex === 0 ||
                                (siblingStatuses[childIndex - 1] === "done" &&
                                  previousHasEndDatetime);
                              const childOpen = openSubtaskIds.has(child.id);
                              const hasDetail = Boolean(child.detail);
                              const childRoute = isJobCreationGroup
                                ? JOB_CREATION_CHILD_ROUTES[child.id]
                                : undefined;

                              return (
                                <div key={child.id} className="relative">
                                  {isJobCreationGroup ? (
                                    /* ── Job-creation child: div wrapper so we can put a real button inside ── */
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50 dark:hover:bg-slate-800/70">
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        {/* Status icon */}
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        {/* Title + status label */}
                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>
                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>
                                        </div>
                                        <div className="hidden md:col-span-3 md:block" />
                                        <div className="ml-auto shrink-0 md:col-span-3 md:ml-0 md:flex md:justify-end">
                                          {childRoute ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push(
                                                  effectiveProjectId
                                                    ? `${childRoute}?projectId=${effectiveProjectId}`
                                                    : childRoute,
                                                )
                                              }
                                              disabled={
                                                dim || isPastJobCreation
                                              }
                                              className={[
                                                "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                dim || isPastJobCreation
                                                  ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                                                  : "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15",
                                              ].join(" ")}>
                                              Open
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  ) : child.id === "manage-downpayment" ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50 dark:hover:bg-slate-800/70">
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>
                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>

                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>
                                        </div>
                                        <div className="hidden md:col-span-3 md:block" />
                                        <div className="ml-auto shrink-0 md:col-span-3 md:ml-0 md:flex md:justify-end">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setDownpaymentModalOpen(true)
                                            }
                                            disabled={
                                              effectiveProjectStatus !==
                                                "downpayment_pending" ||
                                              !effectiveProjectId
                                            }
                                            className={[
                                              "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                              effectiveProjectStatus ===
                                                "downpayment_pending" &&
                                              effectiveProjectId
                                                ? "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15"
                                                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600",
                                            ].join(" ")}>
                                            Manage
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : child.id === "project-kickoff" ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50 dark:hover:bg-slate-800/70">
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>
                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>
                                        </div>
                                        <div className="hidden md:col-span-3 md:block">
                                          {effectiveProjectStatus === "ready_to_start" ? (
                                            <div className="text-[11px] text-gray-600 dark:text-slate-300">
                                              <span className="font-semibold text-gray-800 dark:text-slate-100">
                                                {describeKickoff()}
                                              </span>
                                              {projectScheduledStartIso ? (
                                                <span className="ml-2 text-gray-400 dark:text-slate-500">
                                                  ({new Date(
                                                    projectScheduledStartIso,
                                                  ).toLocaleString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  })})
                                                </span>
                                              ) : null}
                                            </div>
                                          ) : null}
                                        </div>
                                        <div className="ml-auto shrink-0 md:col-span-3 md:ml-0 md:flex md:justify-end">
                                          <button
                                            type="button"
                                            onClick={handleStartProjectWork}
                                            disabled={
                                              effectiveProjectStatus !== "ready_to_start" ||
                                              startingProject ||
                                              !effectiveProjectId
                                            }
                                            className={[
                                              "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                              effectiveProjectStatus === "ready_to_start" &&
                                              !startingProject &&
                                              effectiveProjectId
                                                ? "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15"
                                                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600",
                                            ].join(" ")}>
                                            {startingProject
                                              ? "Starting..."
                                              : dim
                                                ? "Started"
                                                : "Start Project"}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : isEndOfWorkChild ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50 dark:hover:bg-slate-800/70">
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>
                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>
                                        </div>
                                        <div className="hidden md:col-span-3 md:block" />
                                        <div className="ml-auto shrink-0 md:col-span-3 md:ml-0 md:flex md:justify-end">
                                          {(() => {
                                            const action = getEndOfWorkAction(
                                              child.id,
                                              effectiveProjectStatus,
                                            );

                                            if (!action) return null;

                                            const isInvoiceGenerationAction =
                                              child.id === "invoice-generation";
                                            const actionDisabled =
                                              !effectiveProjectId ||
                                              Boolean(
                                                updatingEndOfWorkStepId,
                                              ) ||
                                              (isInvoiceGenerationAction
                                                ? !INVOICE_GENERATION_OPEN_STATUSES.has(
                                                    effectiveProjectStatus,
                                                  )
                                                : !action.nextStatus);

                                            return (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (
                                                    child.id ===
                                                    "review-and-final-checks"
                                                  ) {
                                                    setReviewModalOpen(true);
                                                    return;
                                                  }

                                                  if (
                                                    child.id ===
                                                    "invoice-generation"
                                                  ) {
                                                    if (!effectiveProjectId) {
                                                      return;
                                                    }
                                                    const id =
                                                      encodeURIComponent(
                                                        effectiveProjectId,
                                                      );
                                                    // Only show the
                                                    // "Generating..."
                                                    // modal during the
                                                    // very first
                                                    // visit — i.e.
                                                    // status is
                                                    // exactly
                                                    // "invoice_pending"
                                                    // (no PDF saved
                                                    // yet, no client
                                                    // signature
                                                    // collected). For
                                                    // every later
                                                    // status the
                                                    // invoice has
                                                    // already been
                                                    // generated and
                                                    // the destination
                                                    // page reads the
                                                    // signed PDF
                                                    // straight from
                                                    // the bucket — no
                                                    // regeneration,
                                                    // no signature
                                                    // loss.
                                                    if (
                                                      effectiveProjectStatus !==
                                                      "invoice_pending"
                                                    ) {
                                                      router.push(
                                                        `/admin/projects/invoice-generation?projectId=${effectiveProjectId}`,
                                                      );
                                                      return;
                                                    }

                                                    setGeneratingInvoiceOpen(
                                                      true,
                                                    );
                                                    void fetch(
                                                      `/api/invoice/html?projectId=${id}`,
                                                      { method: "HEAD" },
                                                    )
                                                      .catch(() => null)
                                                      .finally(() => {
                                                        router.push(
                                                          `/admin/projects/invoice-generation?projectId=${effectiveProjectId}`,
                                                        );
                                                      });
                                                    return;
                                                  }

                                                  if (
                                                    child.id ===
                                                    "receive-payment"
                                                  ) {
                                                    setFinalPaymentModalOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }

                                                  if (
                                                    child.id ===
                                                    "employee-management"
                                                  ) {
                                                    setEmployeeManagementModalOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }

                                                  // Conclude is a terminal,
                                                  // irreversible status flip
                                                  // (project → completed) so
                                                  // we ask first instead of
                                                  // firing immediately.
                                                  if (
                                                    child.id === "conclude-job"
                                                  ) {
                                                    setConcludeConfirmOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }

                                                  if (
                                                    action.nextStatus &&
                                                    action.successTitle &&
                                                    action.successDescription
                                                  ) {
                                                    handleEndOfWorkStepAction(
                                                      child.id,
                                                      action.nextStatus,
                                                      action.successTitle,
                                                      action.successDescription,
                                                    );
                                                  }
                                                }}
                                                disabled={actionDisabled}
                                                className={[
                                                  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                  actionDisabled
                                                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                                                    : "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15",
                                                ].join(" ")}>
                                                {updatingEndOfWorkStepId ===
                                                child.id
                                                  ? "Updating..."
                                                  : action.label}
                                              </button>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  ) : isCancellationChild ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50 dark:hover:bg-slate-800/70">
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>
                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>
                                        </div>
                                        <div className="hidden md:col-span-3 md:block" />
                                        <div className="ml-auto shrink-0 md:col-span-3 md:ml-0 md:flex md:justify-end">
                                          {(() => {
                                            const stepId = child.id as CancellationStepId;
                                            const stepConfig =
                                              CANCELLATION_STEP_BY_ID[stepId];
                                            if (!stepConfig) return null;

                                            // Only the active substep gets a
                                            // clickable button — done substeps
                                            // already happened, pending substeps
                                            // wait their turn.
                                            //
                                            // Exception: the Review step stays
                                            // re-openable after it's marked
                                            // done, so the admin can still
                                            // look back at the review summary.
                                            // The modal hides its action
                                            // button automatically when the
                                            // cancellation phase has moved past
                                            // "review", so the re-opened view
                                            // is read-only.
                                            const isActiveStep =
                                              effectiveChildStatus === "active";
                                            const isDoneStep =
                                              effectiveChildStatus === "done";
                                            const isReviewStep =
                                              stepId === "cancellation-review";
                                            const isViewableDoneStep =
                                              isReviewStep && isDoneStep;

                                            const busy =
                                              advancingCancellationStep === stepId;
                                            const buttonDisabled =
                                              !effectiveProjectId ||
                                              (!isActiveStep && !isViewableDoneStep) ||
                                              !canManageCancellation ||
                                              Boolean(
                                                advancingCancellationStep,
                                              );

                                            return (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (
                                                    !isActiveStep &&
                                                    !isViewableDoneStep
                                                  )
                                                    return;
                                                  if (stepId === "cancellation-review") {
                                                    setCancellationReviewModalOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }
                                                  if (stepId === "cancellation-payment") {
                                                    setCancellationPaymentModalOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }
                                                  if (stepId === "cancellation-document") {
                                                    if (effectiveProjectId) {
                                                      router.push(
                                                        `/admin/projects/cancellation-agreement-generation?projectId=${encodeURIComponent(
                                                          effectiveProjectId,
                                                        )}`,
                                                      );
                                                    }
                                                    return;
                                                  }
                                                  if (stepId === "cancellation-employee") {
                                                    setCancellationEmployeeModalOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }
                                                  if (stepId === "cancellation-conclude") {
                                                    setCancellationConcludeConfirmOpen(
                                                      true,
                                                    );
                                                    return;
                                                  }
                                                }}
                                                disabled={buttonDisabled}
                                                className={[
                                                  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                  buttonDisabled
                                                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                                                    : "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15",
                                                ].join(" ")}>
                                                {busy
                                                  ? "Updating..."
                                                  : isViewableDoneStep
                                                    ? "See more"
                                                    : isDoneStep
                                                      ? "Done"
                                                      : stepConfig.activeLabel}
                                              </button>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => {
                                        if (hasDetail)
                                          toggleSubtaskRow(child.id);
                                      }}
                                      className={[
                                        "w-full rounded-lg px-3 py-3 pl-9 pr-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/70",
                                        hasDetail ? "cursor-pointer" : "",
                                      ].join(" ")}>
                                      <div className="flex items-start gap-3 md:grid md:grid-cols-12 md:items-center md:gap-3">
                                        {/* Status icon */}
                                        <div className="shrink-0 md:col-span-2">
                                          <div className="relative flex w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5 dark:bg-slate-900">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        {/* Title + status label */}
                                        <div className="min-w-0 flex-1 md:col-span-4">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800 dark:text-slate-200",
                                              ].join(" ")}>
                                              {child.title}
                                            </div>
                                            <StatusLabelTag
                                              item={child}
                                              status={effectiveChildStatus}
                                              dim={dim}
                                            />
                                          </div>

                                          {/* Mobile-only date subtext */}
                                          <div
                                            className={[
                                              "mt-1.5 space-y-0.5 text-[11px] md:hidden",
                                              dim
                                                ? "text-gray-300"
                                                : "text-gray-500 dark:text-slate-400",
                                            ].join(" ")}>
                                            <div>
                                              Scheduled:{" "}
                                              <span
                                                className={
                                                  dim
                                                    ? "text-gray-300"
                                                    : "text-gray-700 dark:text-slate-300"
                                                }>
                                                {child.startLabel || "-"}
                                              </span>
                                            </div>
                                            <div>
                                              Finished:{" "}
                                              <span
                                                className={
                                                  dim
                                                    ? "text-gray-300"
                                                    : "text-gray-700 dark:text-slate-300"
                                                }>
                                                {child.endLabel || "-"}
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Start date (desktop only) */}
                                        <div className="hidden md:col-span-3 md:block">
                                          <div
                                            className={[
                                              "text-xs",
                                              dim
                                                ? "text-gray-200"
                                                : "text-gray-700 dark:text-slate-300",
                                            ].join(" ")}>
                                            {child.startLabel || "-"}
                                          </div>
                                        </div>

                                        {/* End date + detail chevron (desktop only) */}
                                        <div className="hidden md:col-span-3 md:block">
                                          <div
                                            className={[
                                              "flex items-center justify-end gap-2 text-xs",
                                              dim
                                                ? "text-gray-200"
                                                : "text-gray-700 dark:text-slate-300",
                                            ].join(" ")}>
                                            <span>{child.endLabel || "-"}</span>
                                            {hasDetail ? (
                                              <ChevronRight
                                                className={[
                                                  "h-4 w-4 shrink-0 text-gray-300 transition-transform dark:text-slate-600",
                                                  childOpen ? "rotate-90" : "",
                                                ].join(" ")}
                                                aria-hidden
                                              />
                                            ) : null}
                                          </div>
                                        </div>

                                        {/* Mobile-only chevron */}
                                        {hasDetail ? (
                                          <ChevronRight
                                            className={[
                                              "mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform dark:text-slate-600 md:hidden",
                                              childOpen ? "rotate-90" : "",
                                            ].join(" ")}
                                            aria-hidden
                                          />
                                        ) : null}
                                      </div>
                                    </div>
                                  )}

                                  {/* Detail expansion panel (regular children only) */}
                                  <Transition
                                    as={Fragment}
                                    show={childOpen && hasDetail}
                                    enter="transition duration-150 ease-out"
                                    enterFrom="opacity-0 -translate-y-1"
                                    enterTo="opacity-100 translate-y-0"
                                    leave="transition duration-100 ease-in"
                                    leaveFrom="opacity-100 translate-y-0"
                                    leaveTo="opacity-0 -translate-y-1">
                                    <div className="grid grid-cols-12 gap-3 pb-2 pl-9 pr-2">
                                      <div className="relative col-span-1" />

                                      <div className="col-span-11">
                                        <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span
                                              className={[
                                                "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800",
                                                dim
                                                  ? "text-gray-400 dark:text-slate-500 opacity-70"
                                                  : "text-gray-700 dark:text-slate-300",
                                              ].join(" ")}>
                                              Assigned to:{" "}
                                              <span
                                                className={[
                                                  "font-semibold",
                                                  dim
                                                    ? "text-gray-400 dark:text-slate-500 opacity-70"
                                                    : "text-gray-900 dark:text-slate-100",
                                                ].join(" ")}>
                                                {child.detail?.employees?.length
                                                  ? child.detail.employees.join(
                                                      ", ",
                                                    )
                                                  : "No assigned employees yet"}
                                              </span>
                                            </span>

                                            <span
                                              className={[
                                                "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800",
                                                dim
                                                  ? "text-gray-400 dark:text-slate-500 opacity-70"
                                                  : "text-gray-700 dark:text-slate-300",
                                              ].join(" ")}>
                                              Estimated Duration:{" "}
                                              <span
                                                className={[
                                                  "font-semibold",
                                                  dim
                                                    ? "text-gray-400 dark:text-slate-500 opacity-70"
                                                    : "text-gray-900 dark:text-slate-100",
                                                ].join(" ")}>
                                                {child.detail?.estimatedHours ||
                                                  "0 hrs"}
                                              </span>
                                            </span>

                                            {canEditGeneratedTasks &&
                                            child.detail?.projectTaskId &&
                                            child.detail?.projectSubTaskId ? (
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setEditingGeneratedTask({
                                                    projectTaskId:
                                                      child.detail
                                                        ?.projectTaskId || "",
                                                    projectSubTaskId:
                                                      child.detail
                                                        ?.projectSubTaskId ||
                                                      child.id,
                                                    title: child.title,
                                                    materials:
                                                      child.detail
                                                        ?.materials ?? [],
                                                    equipment:
                                                      child.detail
                                                        ?.equipment ?? [],
                                                    employees:
                                                      child.detail
                                                        ?.assignedStaff ?? [],
                                                    estimatedHours:
                                                      child.detail
                                                        ?.estimatedHoursValue ??
                                                      null,
                                                    scheduledStartDatetime:
                                                      child.detail
                                                        ?.scheduledStartDatetime ??
                                                      null,
                                                    scheduledEndDatetime:
                                                      child.detail
                                                        ?.scheduledEndDatetime ??
                                                      null,
                                                  });
                                                }}
                                                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100">
                                                <Pencil className="h-3.5 w-3.5" />
                                                Edit
                                              </button>
                                            ) : null}

                                            {onFinishSubtask &&
                                            currentUserId &&
                                            child.detail?.employeeIds?.includes(
                                              currentUserId,
                                            ) &&
                                            child.status !== "done" ? (
                                              <button
                                                type="button"
                                                disabled={!isPreviousTaskDone}
                                                title={
                                                  !isPreviousTaskDone
                                                    ? "The previous subtask must be finished (have an end datetime) first"
                                                    : undefined
                                                }
                                                onClick={() => {
                                                  setConfirmingFinishId(
                                                    child.id,
                                                  );
                                                  setConfirmingFinishTitle(
                                                    child.title,
                                                  );
                                                }}
                                                className={[
                                                  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                  canEditGeneratedTasks
                                                    ? ""
                                                    : "ml-auto",
                                                  isPreviousTaskDone
                                                    ? "border-[#00c065]/25 bg-[#00c065]/10 text-[#008f4a] hover:border-[#00c065]/40 hover:bg-[#00c065]/15"
                                                    : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600",
                                                ].join(" ")}>
                                                Finish
                                              </button>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Transition>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Transition>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DownpaymentModal
        open={downpaymentModalOpen}
        projectId={effectiveProjectId}
        onClose={() => setDownpaymentModalOpen(false)}
        onConfirmed={() => {
          setDownpaymentModalOpen(false);
          toast.success("Downpayment confirmed", {
            description: "Project is now ready to start.",
          });
          onRefresh?.();
        }}
      />

      {kickoffModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={() => {
            if (!startingProject) setKickoffModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-full bg-[#00c065]" aria-hidden />

            <div className="px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                Start the project now?
              </h3>
            </div>

            <div className="space-y-3 px-5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
              {projectScheduledStartIso ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Scheduled start
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {new Date(projectScheduledStartIso).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Starting now
                    </span>
                    <span
                      className={[
                        "font-semibold",
                        kickoffOffsetMs === null
                          ? "text-slate-900 dark:text-slate-100"
                          : Math.abs(kickoffOffsetMs) < 60_000
                            ? "text-emerald-700 dark:text-emerald-400"
                            : kickoffOffsetMs > 0
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-rose-700 dark:text-rose-400",
                      ].join(" ")}
                    >
                      {kickoffOffsetMs === null
                        ? "—"
                        : Math.abs(kickoffOffsetMs) < 60_000
                          ? "On time"
                          : kickoffOffsetMs > 0
                            ? `${formatDuration(Math.abs(kickoffOffsetMs))} early`
                            : `${formatDuration(Math.abs(kickoffOffsetMs))} late`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-600 dark:text-slate-400">
                  No scheduled start time is recorded for this project, so
                  the existing subtask schedule will be kept as-is.
                </p>
              )}

              {kickoffOffsetMs !== null && Math.abs(kickoffOffsetMs) >= 60_000 ? (
                <p className="text-slate-600 dark:text-slate-400">
                  Confirming will shift every subtask&rsquo;s start and end
                  times by{" "}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatDuration(Math.abs(kickoffOffsetMs))}
                  </span>{" "}
                  {kickoffOffsetMs > 0 ? "earlier" : "later"} so the rest of
                  the schedule lines up with this start.
                </p>
              ) : null}

              {/* Conflict block: shows while checking, then either nothing
                  (no conflicts) or a red panel listing the staff and the
                  other project they're already booked on. */}
              {checkingConflicts ? (
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Checking for staff schedule conflicts…
                </p>
              ) : kickoffConflicts && kickoffConflicts.length > 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-500/35 dark:bg-rose-500/10">
                  <p className="text-[12px] font-semibold text-rose-800 dark:text-rose-300">
                    Schedule conflict — cannot start
                  </p>
                  <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300/90">
                    Starting now (with the schedule shift above) would
                    double-book these staff against another active project:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[11px] text-rose-700 dark:text-rose-300/90">
                    {kickoffConflicts.slice(0, 8).map((c, i) => (
                      <li key={i} className="leading-snug">
                        <span className="font-semibold">{c.staffName}</span>
                        {" — "}
                        <span className="italic">{c.thisSubtask}</span>
                        {" overlaps "}
                        <span className="font-mono">
                          {c.otherProjectCode || c.otherProjectTitle || "another project"}
                        </span>
                        {" / "}
                        <span className="italic">{c.otherSubtask}</span>
                        {" ("}
                        {new Date(c.otherStart).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" → "}
                        {new Date(c.otherEnd).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {")"}
                      </li>
                    ))}
                    {kickoffConflicts.length > 8 ? (
                      <li className="italic opacity-80">
                        …and {kickoffConflicts.length - 8} more
                      </li>
                    ) : null}
                  </ul>
                  <p className="mt-2 text-[11px] text-rose-700 dark:text-rose-300/90">
                    Resolve the conflicts (re-assign staff or reschedule
                    one of the projects) before starting.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={() => setKickoffModalOpen(false)}
                disabled={startingProject}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmStartProject}
                disabled={
                  startingProject ||
                  !effectiveProjectId ||
                  checkingConflicts ||
                  (kickoffConflicts !== null && kickoffConflicts.length > 0)
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#00c065] px-3 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingProject
                  ? "Starting..."
                  : checkingConflicts
                    ? "Checking…"
                    : kickoffConflicts && kickoffConflicts.length > 0
                      ? "Resolve conflicts first"
                      : "Start Project"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        // Mirror the cancellation-flow review: only show subtasks the team
        // actually finished. Pending or in-flight subtasks (and the main
        // tasks / employees attached to them only) drop out so the review
        // doesn't include work that never completed.
        summary={filterReviewSummaryToCompletedOnly(reviewSummary)}
        actionLabel={getReviewModalActionLabel(effectiveProjectStatus)}
        actionDisabled={Boolean(updatingEndOfWorkStepId) || !effectiveProjectId}
        onAction={
          getReviewModalActionLabel(effectiveProjectStatus)
            ? () => {
                // "Complete Review" always advances directly to
                // invoice_pending. When status is `in_progress` we
                // skip the intermediate `review_pending` step (which
                // used to require a separate "Start Review" click)
                // because the modal already shows the full review
                // summary — there's nothing the user does in between.
                handleEndOfWorkStepAction(
                  "review-and-final-checks",
                  "invoice_pending",
                  "Review completed",
                  "Project moved to invoice generation.",
                );
                setReviewModalOpen(false);
              }
            : null
        }
      />

      <FinalPaymentModal
        open={finalPaymentModalOpen}
        projectId={effectiveProjectId}
        onClose={() => setFinalPaymentModalOpen(false)}
        onConfirmed={() => {
          setFinalPaymentModalOpen(false);
          setProjectStatusOverride("employee_management_pending");
          toast.success("Payment recorded", {
            description: "Project moved to employee management.",
          });
          onRefresh?.();
        }}
      />

      <EmployeeManagementModal
        key={`${effectiveProjectId || "no-project"}-${String(
          employeeManagementModalOpen,
        )}`}
        open={employeeManagementModalOpen}
        employees={employeeReviewItems}
        loading={loadingDetails}
        saving={employeeManagementSaving}
        onClose={() => setEmployeeManagementModalOpen(false)}
        onFinish={handleEmployeeManagementFinish}
      />

      <GeneratedTaskEditModal
        open={Boolean(editingGeneratedTask)}
        task={editingGeneratedTask}
        saving={savingGeneratedTask}
        onClose={() => {
          if (!savingGeneratedTask) setEditingGeneratedTask(null);
        }}
        onSave={handleSaveGeneratedTask}
      />

      {/* Conclude job confirmation modal — gates the terminal status flip
          so the admin can't accidentally end a project with a single
          mis-click. handleConfirmConcludeJob handles the API call + toast
          via the shared end-of-work handler and closes this modal. */}
      {concludeConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm overflow-hidden rounded-md bg-white shadow-2xl dark:bg-slate-900">
            <div
              className="h-1.5 w-full"
              style={{ backgroundColor: GREEN }}
              aria-hidden
            />
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Conclude this project?
              </h3>
              <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-slate-400">
                Marking the project as completed wraps up the job and locks
                its workflow. This can't be undone.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConcludeConfirmOpen(false)}
                  disabled={updatingEndOfWorkStepId === "conclude-job"}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/70">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmConcludeJob}
                  disabled={updatingEndOfWorkStepId === "conclude-job"}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}>
                  {updatingEndOfWorkStepId === "conclude-job"
                    ? "Concluding..."
                    : "Yes, conclude"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* === CANCELLATION WRAP-UP MODALS ====================================
          These mirror the post-work end-of-work modals but for a cancelled
          project. Each one bumps `cancellation_phase` forward by one step
          via /api/planning/advanceCancellationPhase when the admin
          confirms. The Document Management modal is the heaviest piece —
          it embeds the Cancellation Agreement preview/sign flow.
      */}

      <ProjectReviewModal
        open={cancellationReviewModalOpen}
        onClose={() => setCancellationReviewModalOpen(false)}
        // Same modal as the end-of-work review, but the summary is
        // filtered to only the work that actually executed before
        // cancellation. Pending subtasks (and the main tasks / employees
        // attached to them only) drop out so the admin doesn't end up
        // signing off on work that never happened.
        summary={filterReviewSummaryToCompletedOnly(reviewSummary)}
        actionLabel={
          effectiveCancellationPhase === "review"
            ? advancingCancellationStep === "cancellation-review"
              ? "Saving..."
              : "Mark reviewed"
            : null
        }
        actionDisabled={
          advancingCancellationStep === "cancellation-review" ||
          effectiveCancellationPhase !== "review"
        }
        onAction={
          effectiveCancellationPhase === "review"
            ? async () => {
                const ok = await advanceCancellationPhase(
                  "cancellation-review",
                  "review",
                );
                if (ok) {
                  setCancellationReviewModalOpen(false);
                  toast.success("Review complete", {
                    description: "Moved on to the cancellation agreement.",
                  });
                }
              }
            : null
        }
      />

      {/* Blocking "Generating invoice..." overlay shown after See More
          is clicked AND no invoice exists yet for this project. The
          modal stays mounted until the router.push to the invoice
          page unmounts the dashboard. Non-dismissible. */}
      {generatingInvoiceOpen ? (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px] dark:bg-black/55"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="h-1.5 w-full" style={{ backgroundColor: GREEN }} aria-hidden />
            <div className="flex flex-col items-center gap-4 px-8 py-10 text-center">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] dark:bg-[#00c065]/15 dark:text-emerald-300">
                <Loader2 className="h-7 w-7 animate-spin" />
              </span>
              <div className="space-y-2">
                <div className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                  Generating invoice document
                </div>
                <div className="mx-auto max-w-md text-sm leading-6 text-gray-500 dark:text-slate-400">
                  Building the invoice preview from your project's tasks,
                  materials, and totals. You'll land on the invoice page
                  once it's ready — please don't close this page.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cancellationPaymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            {/* Green accent strip — matches the DownpaymentModal so both
                cancellation/regular payment modals read as part of the
                same workflow lane. */}
            <div className="h-1 w-full" style={{ backgroundColor: GREEN }} aria-hidden />
            {/* Header with faint green wash + X close — mirrors
                DownpaymentModal exactly. */}
            <div
              className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-slate-700"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,192,101,0.08) 0%, rgba(0,192,101,0) 100%)",
              }}
            >
              <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                Payment Management
              </h3>
              <button
                type="button"
                onClick={() => setCancellationPaymentModalOpen(false)}
                disabled={advancingCancellationStep === "cancellation-payment"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — instalment tracker. Total to Settle is read-only
                (|cancellation_balance|). Paid + Needed update after each
                Add so the running progress is always visible. Input
                Payment is the only editable field; Add records the new
                instalment, Confirm finalises once Paid covers Total. */}
            {(() => {
              const totalToSettle =
                typeof cancellationBalance === "number"
                  ? Math.abs(cancellationBalance)
                  : 0;
              const inputAmount = parseCurrencyInput(inputSettlement);
              const prospectiveTotal = savedSettlement + inputAmount;
              const neededAfterSaved = Math.max(
                0,
                totalToSettle - savedSettlement,
              );
              const neededAfterInput = Math.max(
                0,
                totalToSettle - prospectiveTotal,
              );
              // Project that cancelled with zero balance can finalise
              // immediately; everyone else needs the prospective total
              // to reach the absolute settlement amount.
              const meetsTotal =
                totalToSettle <= 0 || prospectiveTotal >= totalToSettle;
              const canAdd = inputAmount > 0 && !meetsTotal;
              const canConfirm = meetsTotal;
              const isBusy = addingSettlement || confirmingSettlement;
              const refundLabel =
                typeof cancellationBalance === "number" &&
                cancellationBalance > 0
                  ? "Refund to Client"
                  : typeof cancellationBalance === "number" &&
                      cancellationBalance < 0
                    ? "Bill Client"
                    : "Settlement";

              return (
                <>
                  <div className="space-y-5 px-5 py-5">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Total to Settle ({refundLabel})
                      </label>
                      <div className="flex h-10 items-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                        <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500 dark:border-slate-700 dark:text-slate-400">
                          $AUD
                        </span>
                        <span
                          className={[
                            "flex-1 px-3 text-sm font-semibold",
                            typeof cancellationBalance === "number" &&
                            cancellationBalance > 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : typeof cancellationBalance === "number" &&
                                  cancellationBalance < 0
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-gray-700 dark:text-slate-200",
                          ].join(" ")}>
                          {totalToSettle.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Paid Settlement
                      </label>
                      <div className="flex h-10 items-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                        <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500 dark:border-slate-700 dark:text-slate-400">
                          $AUD
                        </span>
                        <span className="flex-1 px-3 text-sm text-gray-700 dark:text-slate-200">
                          {savedSettlement.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Needed Settlement
                      </label>
                      <div className="flex h-10 items-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                        <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500 dark:border-slate-700 dark:text-slate-400">
                          $AUD
                        </span>
                        <span className="flex-1 px-3 text-sm text-gray-700 dark:text-slate-200">
                          {neededAfterSaved.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-slate-400">
                        Input Payment
                      </label>
                      <div
                        className="flex h-10 items-center overflow-hidden rounded-md border border-gray-200 bg-white focus-within:ring-2 dark:border-slate-700 dark:bg-slate-900"
                        style={{ ["--tw-ring-color" as any]: GREEN }}>
                        <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500 dark:border-slate-700 dark:text-slate-400">
                          $AUD
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inputSettlement}
                          onChange={(e) =>
                            setInputSettlement(
                              formatCurrencyInput(e.target.value),
                            )
                          }
                          placeholder="Enter new instalment"
                          disabled={
                            isBusy ||
                            !effectiveProjectId ||
                            totalToSettle <= 0
                          }
                          className="flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100"
                        />
                      </div>
                      {totalToSettle <= 0 ? (
                        <p className="mt-2 text-[11px] text-gray-500 dark:text-slate-400">
                          Nothing to collect — the cancellation balance is
                          already zero. Click <strong>Mark settled</strong>{" "}
                          to advance to employee management.
                        </p>
                      ) : inputAmount > 0 && !meetsTotal ? (
                        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                          Adding this brings the total to{" "}
                          {prospectiveTotal.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          — {neededAfterInput.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          still needed to reach{" "}
                          {totalToSettle.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          . Click <strong>Add</strong> to record this
                          instalment, or <strong>Notify Client</strong> to
                          remind them of the remainder.
                        </p>
                      ) : inputAmount > 0 && meetsTotal ? (
                        <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                          Adding this brings the total to{" "}
                          {prospectiveTotal.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          — covers the full settlement. Click{" "}
                          <strong>Mark settled</strong> to lock it in.
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-gray-500 dark:text-slate-400">
                          Record each instalment as it comes in.{" "}
                          <strong>Mark settled</strong> unlocks once the
                          total is met.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer — plain white background + larger buttons,
                      matching DownpaymentModal. */}
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!effectiveProjectId || cancellationPaymentNotifying)
                          return;
                        try {
                          setCancellationPaymentNotifying(true);
                          const res = await fetch(
                            "/api/planning/notifyCancellationPayment",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                projectId: effectiveProjectId,
                                balance: cancellationBalance,
                                earnedRevenue: cancellationEarnedRevenue,
                                earnedCost: cancellationEarnedCost,
                              }),
                            },
                          );
                          const data = await res.json().catch(() => null);
                          if (!res.ok) {
                            throw new Error(
                              [data?.error, data?.details]
                                .filter(Boolean)
                                .join(": ") || "Failed to notify client.",
                            );
                          }
                          setCancellationPaymentNotified(true);
                          toast.success("Client notified", {
                            description:
                              "A settlement reminder was posted in the project conversation.",
                          });
                          window.setTimeout(
                            () => setCancellationPaymentNotified(false),
                            10_000,
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Failed to notify client.",
                          );
                        } finally {
                          setCancellationPaymentNotifying(false);
                        }
                      }}
                      disabled={
                        cancellationPaymentNotifying ||
                        cancellationPaymentNotified ||
                        isBusy ||
                        Boolean(advancingCancellationStep) ||
                        !effectiveProjectId
                      }
                      className="mr-auto inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancellationPaymentNotifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : cancellationPaymentNotified ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {cancellationPaymentNotified
                        ? "Client notified"
                        : "Notify Client"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancellationPaymentModalOpen(false)}
                      disabled={isBusy || Boolean(advancingCancellationStep)}
                      className="rounded-md border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Go Back
                    </button>
                    {canConfirm ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!effectiveProjectId || isBusy) return;
                          const newTotal = Math.max(
                            savedSettlement,
                            prospectiveTotal,
                          );
                          try {
                            setConfirmingSettlement(true);
                            const res = await fetch(
                              "/api/planning/manageCancellationSettlement",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  projectId: effectiveProjectId,
                                  settled: newTotal,
                                  finalize: true,
                                }),
                              },
                            );
                            const data = await res.json().catch(() => null);
                            if (!res.ok) {
                              throw new Error(
                                [data?.error, data?.details]
                                  .filter(Boolean)
                                  .join(": ") ||
                                  "Failed to confirm settlement.",
                              );
                            }
                            setSavedSettlement(newTotal);
                            setInputSettlement("");
                            setCancellationPhaseOverride("employee");
                            setCancellationPaymentModalOpen(false);
                            toast.success("Settlement recorded", {
                              description: "Moved on to employee management.",
                            });
                            onRefresh?.();
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Failed to confirm settlement.",
                            );
                          } finally {
                            setConfirmingSettlement(false);
                          }
                        }}
                        disabled={
                          isBusy ||
                          !effectiveProjectId ||
                          effectiveCancellationPhase !== "payment"
                        }
                        className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}
                      >
                        {confirmingSettlement ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {confirmingSettlement ? "Confirming..." : "Mark settled"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!effectiveProjectId || !canAdd || isBusy)
                            return;
                          const newTotal = prospectiveTotal;
                          const addedThisRound = inputAmount;
                          try {
                            setAddingSettlement(true);
                            const res = await fetch(
                              "/api/planning/manageCancellationSettlement",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  projectId: effectiveProjectId,
                                  settled: newTotal,
                                  finalize: false,
                                }),
                              },
                            );
                            const data = await res.json().catch(() => null);
                            if (!res.ok) {
                              throw new Error(
                                [data?.error, data?.details]
                                  .filter(Boolean)
                                  .join(": ") ||
                                  "Failed to save partial settlement.",
                              );
                            }
                            setSavedSettlement(newTotal);
                            setInputSettlement("");
                            toast.success("Partial settlement recorded.", {
                              description: `$AUD ${addedThisRound.toLocaleString(
                                "en-AU",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )} added — $AUD ${newTotal.toLocaleString(
                                "en-AU",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )} of $AUD ${totalToSettle.toLocaleString(
                                "en-AU",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )} now collected.`,
                            });
                            onRefresh?.();
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Failed to save partial settlement.",
                            );
                          } finally {
                            setAddingSettlement(false);
                          }
                        }}
                        disabled={!canAdd || isBusy || !effectiveProjectId}
                        className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}
                      >
                        {addingSettlement ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {addingSettlement ? "Adding..." : "Add"}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      <EmployeeManagementModal
        key={`cancellation-${effectiveProjectId || "no-project"}-${String(
          cancellationEmployeeModalOpen,
        )}`}
        open={cancellationEmployeeModalOpen}
        // Filter to only show finished work (status "done" or "late") —
        // tasks that were pending or got marked "cancelled" by the
        // cancel flow shouldn't appear on a performance review since
        // the employee never actually did them.
        employees={cancellationEmployeeReviewItems}
        loading={loadingDetails}
        saving={Boolean(advancingCancellationStep)}
        onClose={() => setCancellationEmployeeModalOpen(false)}
        onFinish={async (payload) => {
          // Reuse the existing per-employee save handler so each
          // employee's review hits the same DB rows. When the last
          // employee is recorded, advance the cancellation phase
          // instead of flipping project status (the project is
          // already cancelled).
          await handleEmployeeManagementFinish({
            ...payload,
            // Suppress the end-of-work status transition baked into
            // the original handler — we only want the per-employee
            // performance row to land.
            isLastEmployee: false,
          });
          if (payload.isLastEmployee) {
            const ok = await advanceCancellationPhase(
              "cancellation-employee",
              "employee",
            );
            if (ok) {
              setCancellationEmployeeModalOpen(false);
              toast.success("Employee review recorded", {
                description: "Moved on to conclude job.",
              });
            }
          }
        }}
      />

      {cancellationConcludeConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm overflow-hidden rounded-md bg-white shadow-2xl dark:bg-slate-900">
            <div
              className="h-1.5 w-full"
              style={{ backgroundColor: GREEN }}
              aria-hidden
            />
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Conclude this project?
              </h3>
              <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-slate-400">
                This wraps up the post-cancel workflow. The dashboard
                will mark the project as fully closed-out. Review,
                settlement, and document records remain on file.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancellationConcludeConfirmOpen(false)}
                  disabled={advancingCancellationStep === "cancellation-conclude"}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/70">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await advanceCancellationPhase(
                      "cancellation-conclude",
                      "conclude",
                    );
                    if (ok) {
                      // Cancellation wrap-up done. Tear down the
                      // project's conversation threads same as the
                      // normal completed flow so the client and
                      // recipient don't keep seeing a stale
                      // thread for a closed project.
                      if (effectiveProjectId) {
                        try {
                          const cleanupResponse = await fetch(
                            "/api/planning/deleteProjectConversations",
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                projectId: effectiveProjectId,
                              }),
                            },
                          );
                          if (!cleanupResponse.ok) {
                            const cleanupBody = await cleanupResponse
                              .json()
                              .catch(() => null);
                            console.error(
                              "deleteProjectConversations failed:",
                              cleanupBody?.error ??
                                cleanupResponse.statusText,
                            );
                          }
                        } catch (cleanupError) {
                          console.error(
                            "deleteProjectConversations error:",
                            cleanupError,
                          );
                        }
                      }
                      setCancellationConcludeConfirmOpen(false);
                      toast.success("Project closed out", {
                        description: "The cancellation wrap-up is complete.",
                      });
                    }
                  }}
                  disabled={
                    advancingCancellationStep === "cancellation-conclude" ||
                    effectiveCancellationPhase !== "conclude"
                  }
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}>
                  {advancingCancellationStep === "cancellation-conclude"
                    ? "Closing..."
                    : "Yes, conclude"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Finish subtask confirmation modal */}
      {confirmingFinishId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Mark subtask as done?
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Are you sure you want to finish{" "}
              <span className="font-medium text-gray-900 dark:text-slate-100">
                {confirmingFinishTitle}
              </span>
              ? This will mark it as completed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingFinishId(null)}
                disabled={finishing}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/70 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFinish}
                disabled={finishing}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: GREEN }}>
                {finishing ? "Finishing..." : "Yes, finish"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default memo(JobProgressCard);
