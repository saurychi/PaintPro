"use client";

import React, { memo, useState, useEffect, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Transition } from "@headlessui/react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import DownpaymentModal from "@/components/project-creation/DownpaymentModal";
import ProjectReviewModal from "@/components/dashboard/ProjectReviewModal";
import FinalPaymentModal from "@/components/progressCard/FinalPaymentModal";
import EmployeeManagementModal from "@/components/progressCard/EmployeeManagementModal";
import { supabase } from "@/lib/supabaseClient";
import type {
  EmployeeManagementFinishPayload,
  EmployeeReviewItem,
} from "@/lib/planning/employeePerformance";
import type { ProjectReviewSummary } from "@/lib/planning/projectReviewSummary";

export type StepVisualStatus = "done" | "active" | "pending";

export type ProcessDetail = {
  employees: string[];
  employeeIds: string[];
  estimatedHours: string;
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
  currentUserId?: string | null;
  employeeReviewItems?: EmployeeReviewItem[];
  reviewSummary?: ProjectReviewSummary | null;
  className?: string;
};

const GREEN = "#7ED957";
const SCROLL_TRACK = "#EAF7E4";

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

const INVOICE_GENERATION_OPEN_STATUSES = new Set([
  "invoice_pending",
  "invoice_agreement_pending",
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
          dim ? "text-gray-200" : "text-gray-400",
        ].join(" ")}>
        {label}
      </span>
    );
  }

  const toneClasses: Record<string, string> = {
    early: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "on-time": "border-sky-200 bg-sky-50 text-sky-700",
    late: "border-rose-200 bg-rose-50 text-rose-700",
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
        className="h-5 w-5 rounded-full border-2 bg-white"
        style={{ borderColor: GREEN }}
      />
    );
  }

  return (
    <span className="h-5 w-5 rounded-full border-2 border-gray-300 bg-white" />
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

function isEndOfWorkStatus(status: string) {
  return END_OF_WORK_STATUS_ORDER.includes(status as EndOfWorkPendingStatus);
}

function getReviewModalActionLabel(projectStatus: string) {
  if (projectStatus === "in_progress") return "Start Review";
  if (projectStatus === "review_pending") return "Complete Review";
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
  currentUserId,
  employeeReviewItems = [],
  reviewSummary = null,
  className = "",
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
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [finalPaymentModalOpen, setFinalPaymentModalOpen] = useState(false);
  const [employeeManagementModalOpen, setEmployeeManagementModalOpen] =
    useState(false);
  const [employeeManagementSaving, setEmployeeManagementSaving] =
    useState(false);
  const [confirmingFinishId, setConfirmingFinishId] = useState<string | null>(
    null,
  );
  const [confirmingFinishTitle, setConfirmingFinishTitle] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(
    currentUserId || null,
  );

  const seededForProjectRef = useRef<string | null>(null);
  const openProcessIdsRef = useRef(openProcessIds);
  openProcessIdsRef.current = openProcessIds;

  const selectedProjectStatus = readProjectStatus(selectedProject);
  const effectiveProjectId = projectId || readProjectId(selectedProject);
  const effectiveProjectStatus = projectStatusOverride || selectedProjectStatus;
  const effectiveCurrentUserId = currentUserId || resolvedCurrentUserId;

  useEffect(() => {
    setProjectStatusOverride(null);
  }, [selectedProjectStatus, effectiveProjectId]);

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

  useEffect(() => {
    if (!processItems.length || !effectiveProjectId) return;
    if (seededForProjectRef.current === effectiveProjectId) return;
    seededForProjectRef.current = effectiveProjectId;

    for (const group of processItems) {
      const children = buildStartOfWorkChildren(group);
      const hasPendingChild = children.some((child) => child.status !== "done");
      if (hasPendingChild && !openProcessIdsRef.current.has(group.id)) {
        toggleProcessRow(group.id);
      }
    }
  }, [processItems, effectiveProjectId, toggleProcessRow]);

  async function handleStartProjectWork() {
    if (!effectiveProjectId || startingProject) return;

    try {
      setStartingProject(true);

      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  const jobCreationDone =
    processItems.some(
      (item) =>
        (item.id === "job-creation" ||
          item.title.toLowerCase().trim() === "job creation") &&
        item.status === "done",
    ) ||
    [
      "ready_to_start",
      "in_progress",
      ...END_OF_WORK_STATUS_ORDER,
      "completed",
      "cancelled",
    ].includes(effectiveProjectStatus);

  return (
    <section
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
        className,
      ].join(" ")}>
      <div className="h-1 w-full shrink-0 rounded-t-xl bg-[#00c065]" />

      <div className="shrink-0 border-b border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-5 text-gray-900">
              {title}
            </h2>

            <p className="mt-1 text-[12px] leading-5 text-gray-500">
              Track service flow, scheduled dates, and task completion.
            </p>
          </div>

          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loadingDetails}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-50">
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

      <div className="hidden shrink-0 grid-cols-12 gap-3 border-b border-gray-200 px-4 py-4 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 md:grid">
        <div className="col-span-1">Status</div>
        <div className="col-span-5">Service</div>
        <div className="col-span-3">Scheduled Date &amp; Time</div>
        <div className="col-span-3">Finished Date &amp; Time</div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
          <div
            className={[
              "min-h-0 flex-1 overflow-y-auto",
              "px-3 py-3",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar-track]:rounded-full",
              "[&::-webkit-scrollbar-track]:bg-[#EAF7E4]",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-[#7ED957]",
            ].join(" ")}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: `${GREEN} ${SCROLL_TRACK}`,
            }}>
            {!selectedProject ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-gray-500">
                Select a project to view its process flow.
              </div>
            ) : loadingDetails ? (
              <ProgressSkeleton />
            ) : processItems.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-gray-500">
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

                  const effectiveGroupStatus: StepVisualStatus =
                    currentIsStartOfWorkGroup && startOfWorkDone
                      ? "done"
                      : currentIsManageEndOfWorkGroup
                        ? getEndOfWorkGroupVisualStatus(effectiveProjectStatus)
                        : group.status;

                  const doneCount = groupChildren.filter((child) => {
                    if (child.id === "project-kickoff" && startOfWorkDone)
                      return true;
                    if (
                      currentIsManageEndOfWorkGroup &&
                      END_OF_WORK_STEP_BY_ID[child.id]
                    ) {
                      return (
                        getEndOfWorkStepVisualStatus(
                          child.id,
                          effectiveProjectStatus,
                        ) === "done"
                      );
                    }
                    return child.status === "done";
                  }).length;

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
                    ),
                  );

                  return (
                    <div
                      key={group.id}
                      className={[
                        "py-2",
                        !isLastGroup
                          ? isJobCreationGroup
                            ? "border-b border-gray-100/40"
                            : "border-b border-gray-100"
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
                          "w-full rounded-lg px-3 py-3 text-left hover:bg-gray-50",
                          hasChildren ? "cursor-pointer" : "cursor-default",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                        ].join(" ")}
                        style={
                          hasChildren
                            ? ({
                                "--tw-ring-color": GREEN,
                              } as React.CSSProperties)
                            : undefined
                        }>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
                          <div className="md:col-span-1">
                            <div className="relative h-6">
                              <div className="absolute left-0 top-0">
                                <GroupProgressRing
                                  status={effectiveGroupStatus}
                                  doneCount={doneCount}
                                  totalCount={totalCount}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 md:col-span-5">
                            <div className="flex items-start gap-2">
                              {hasChildren ? (
                                <ChevronDown
                                  className={[
                                    "mt-0.5 h-4 w-4 text-gray-300 transition-transform",
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
                                        ? "text-gray-700"
                                        : "text-gray-900",
                                    ].join(" ")}>
                                    {group.title}
                                  </div>

                                  <StatusLabelTag
                                    item={group}
                                    status={effectiveGroupStatus}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <div className="text-xs text-gray-900">
                              {group.startLabel || "-"}
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <div className="text-xs text-gray-900">
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
                                      : child.status;

                              const dim = effectiveChildStatus === "done";
                              const isPreviousTaskDone =
                                childIndex === 0 ||
                                siblingStatuses[childIndex - 1] === "done";
                              const childOpen = openSubtaskIds.has(child.id);
                              const hasDetail = Boolean(child.detail);
                              const childRoute = isJobCreationGroup
                                ? JOB_CREATION_CHILD_ROUTES[child.id]
                                : undefined;

                              return (
                                <div key={child.id} className="relative">
                                  {isJobCreationGroup ? (
                                    /* ── Job-creation child: div wrapper so we can put a real button inside ── */
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50">
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        {/* Status icon */}
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        {/* Title + status label */}
                                        <div className="col-span-5 min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800",
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
                                        <div className="col-span-3" />
                                        <div className="col-span-3 flex justify-end">
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
                                                  ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100",
                                              ].join(" ")}>
                                              Open
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  ) : child.id === "manage-downpayment" ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50">
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>
                                        <div className="col-span-5 min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800",
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
                                        <div className="col-span-3" />
                                        <div className="col-span-3 flex justify-end">
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
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                                                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300",
                                            ].join(" ")}>
                                            Manage
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : child.id === "project-kickoff" ? (
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50">
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        <div className="col-span-5 min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800",
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
                                        <div className="col-span-3" />
                                        <div className="col-span-3 flex justify-end">
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
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                                                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300",
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
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50">
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        <div className="col-span-5 min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800",
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
                                        <div className="col-span-3" />
                                        <div className="col-span-3 flex justify-end">
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
                                                    router.push(
                                                      `/admin/projects/invoice-generation?projectId=${effectiveProjectId}`,
                                                    );
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
                                                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100",
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
                                  ) : (
                                    <div
                                      onClick={() => {
                                        if (hasDetail)
                                          toggleSubtaskRow(child.id);
                                      }}
                                      className={[
                                        "w-full rounded-lg px-3 py-3 pl-9 pr-3 text-left hover:bg-gray-50",
                                        hasDetail ? "cursor-pointer" : "",
                                      ].join(" ")}>
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        {/* Status icon */}
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon
                                                status={effectiveChildStatus}
                                              />
                                            </span>
                                          </div>
                                        </div>

                                        {/* Title + status label */}
                                        <div className="col-span-5 min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div
                                              className={[
                                                "truncate text-sm font-medium",
                                                dim
                                                  ? "text-gray-300"
                                                  : "text-gray-800",
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

                                        {/* Start date */}
                                        <div className="col-span-3">
                                          <div
                                            className={[
                                              "text-xs",
                                              dim
                                                ? "text-gray-200"
                                                : "text-gray-700",
                                            ].join(" ")}>
                                            {child.startLabel || "-"}
                                          </div>
                                        </div>

                                        {/* End date + detail chevron */}
                                        <div className="col-span-3">
                                          <div
                                            className={[
                                              "flex items-center justify-end gap-2 text-xs",
                                              dim
                                                ? "text-gray-200"
                                                : "text-gray-700",
                                            ].join(" ")}>
                                            <span>{child.endLabel || "-"}</span>
                                            {hasDetail ? (
                                              <ChevronRight
                                                className={[
                                                  "h-4 w-4 shrink-0 text-gray-300 transition-transform",
                                                  childOpen ? "rotate-90" : "",
                                                ].join(" ")}
                                                aria-hidden
                                              />
                                            ) : null}
                                          </div>
                                        </div>
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
                                        <div className="rounded-lg border border-gray-200 bg-white p-2">
                                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span
                                              className={[
                                                "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs",
                                                dim
                                                  ? "text-gray-400 opacity-70"
                                                  : "text-gray-700",
                                              ].join(" ")}>
                                              Assigned to:{" "}
                                              <span
                                                className={[
                                                  "font-semibold",
                                                  dim
                                                    ? "text-gray-400 opacity-70"
                                                    : "text-gray-900",
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
                                                "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs",
                                                dim
                                                  ? "text-gray-400 opacity-70"
                                                  : "text-gray-700",
                                              ].join(" ")}>
                                              Estimated Duration:{" "}
                                              <span
                                                className={[
                                                  "font-semibold",
                                                  dim
                                                    ? "text-gray-400 opacity-70"
                                                    : "text-gray-900",
                                                ].join(" ")}>
                                                {child.detail?.estimatedHours ||
                                                  "0 hrs"}
                                              </span>
                                            </span>

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
                                                    ? "Complete the previous task first"
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
                                                  "ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                  isPreviousTaskDone
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                                                    : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300",
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

      <ProjectReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        summary={reviewSummary}
        actionLabel={getReviewModalActionLabel(effectiveProjectStatus)}
        actionDisabled={Boolean(updatingEndOfWorkStepId) || !effectiveProjectId}
        onAction={
          getReviewModalActionLabel(effectiveProjectStatus)
            ? () => {
                const action = getEndOfWorkAction(
                  "review-and-final-checks",
                  effectiveProjectStatus,
                );

                if (
                  action?.nextStatus &&
                  action.successTitle &&
                  action.successDescription
                ) {
                  handleEndOfWorkStepAction(
                    "review-and-final-checks",
                    action.nextStatus,
                    action.successTitle,
                    action.successDescription,
                  );

                  if (action.nextStatus !== "review_pending") {
                    setReviewModalOpen(false);
                  }
                }
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

      {/* Finish subtask confirmation modal */}
      {confirmingFinishId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">
              Mark subtask as done?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to finish{" "}
              <span className="font-medium text-gray-900">
                {confirmingFinishTitle}
              </span>
              ? This will mark it as completed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingFinishId(null)}
                disabled={finishing}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
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
