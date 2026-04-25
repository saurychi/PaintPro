"use client";

import React, { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Transition } from "@headlessui/react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

export type StepVisualStatus = "done" | "active" | "pending";

export type ProcessDetail = {
  employees: string[];
  estimatedHours: string;
};

export type ProcessItem = {
  id: string;
  title: string;
  status: StepVisualStatus;
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

function readProjectStatus(project: unknown): string {
  if (!project || typeof project !== "object") return "";

  const record = project as Record<string, unknown>;
  const status = record.status;

  return typeof status === "string" ? status : "";
}

function statusLabel(status: StepVisualStatus) {
  if (status === "done") return "Completed";
  if (status === "active") return "Working on it...";
  return "Not started";
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

export default function JobProgressCard({
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
  className = "",
}: Props) {
  const router = useRouter();

  const [startingProject, setStartingProject] = useState(false);
  const [startOfWorkDone, setStartOfWorkDone] = useState(false);

  const selectedProjectStatus = readProjectStatus(selectedProject);

  useEffect(() => {
    if (selectedProjectStatus === "in_progress") {
      setStartOfWorkDone(true);
    }
  }, [selectedProjectStatus]);

  async function handleStartProjectWork() {
    if (!projectId || startingProject) return;

    try {
      setStartingProject(true);

      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
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

      setStartOfWorkDone(true);

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

  const jobCreationDone = processItems.some(
    (item) =>
      (item.id === "job-creation" ||
        item.title.toLowerCase().trim() === "job creation") &&
      item.status === "done",
  );

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

          {navigating ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400" />
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
                  const hasChildren = Boolean(group.children?.length);
                  const open = openProcessIds.has(group.id);

                  const isStartOfWorkGroup =
                    group.id === "start-of-work" ||
                    group.title.toLowerCase().trim() === "start of work";

                  const effectiveGroupStatus: StepVisualStatus =
                    isStartOfWorkGroup && startOfWorkDone
                      ? "done"
                      : group.status;

                  const doneCount = (group.children ?? []).filter(
                    (child) => child.status === "done",
                  ).length;

                  const totalCount = group.children?.length ?? 0;
                  const isJobCreationGroup =
                    group.id === "job-creation" ||
                    group.title.toLowerCase().trim() === "job creation";
                  const isLastGroup = groupIndex === processItems.length - 1;

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

                                  <span className="shrink-0 text-xs text-gray-400">
                                    {statusLabel(effectiveGroupStatus)}
                                  </span>
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
                            {group.children?.map((child) => {
                              const isProjectKickoff =
                                child.id === "project-kickoff";

                              const effectiveChildStatus: StepVisualStatus =
                                isProjectKickoff && startOfWorkDone
                                  ? "done"
                                  : child.status;

                              const dim = effectiveChildStatus === "done";
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
                                            <span
                                              className={[
                                                "shrink-0 text-xs",
                                                dim
                                                  ? "text-gray-200"
                                                  : "text-gray-400",
                                              ].join(" ")}>
                                              {statusLabel(
                                                effectiveChildStatus,
                                              )}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Empty middle column */}
                                        <div className="col-span-3" />

                                        {/* Navigation button — right-aligned, greyed when done */}
                                        <div className="col-span-3 flex justify-end">
                                          {childRoute ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push(
                                                  projectId
                                                    ? `${childRoute}?projectId=${projectId}`
                                                    : childRoute,
                                                )
                                              }
                                              disabled={dim}
                                              className={[
                                                "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                                dim
                                                  ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100",
                                              ].join(" ")}>
                                              Open
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  ) : child.id === "project-kickoff" ? (
                                    /* ── Project Kickoff: div wrapper with Start Project button ── */
                                    <div className="w-full rounded-lg px-3 py-3 pl-9 pr-3 hover:bg-gray-50">
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        {/* Status icon */}
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon status={child.status} />
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
                                            <span
                                              className={[
                                                "shrink-0 text-xs",
                                                dim
                                                  ? "text-gray-200"
                                                  : "text-gray-400",
                                              ].join(" ")}>
                                              {statusLabel(
                                                effectiveChildStatus,
                                              )}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Empty middle column */}
                                        <div className="col-span-3" />

                                        {/* Start Project button */}
                                        <div className="col-span-3 flex justify-end">
                                          <button
                                            type="button"
                                            onClick={handleStartProjectWork}
                                            disabled={
                                              !jobCreationDone ||
                                              dim ||
                                              startingProject ||
                                              !projectId
                                            }
                                            className={[
                                              "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                                              !jobCreationDone ||
                                              dim ||
                                              startingProject ||
                                              !projectId
                                                ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100",
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
                                  ) : (
                                    /* ── Regular child: button wrapper for detail expansion ── */
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (hasDetail) {
                                          toggleSubtaskRow(child.id);
                                        }
                                      }}
                                      className={[
                                        "w-full rounded-lg px-3 py-3 pl-9 pr-3 text-left hover:bg-gray-50",
                                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                                      ].join(" ")}
                                      style={
                                        {
                                          "--tw-ring-color": GREEN,
                                        } as React.CSSProperties
                                      }>
                                      <div className="grid grid-cols-12 items-center gap-3">
                                        {/* Status icon */}
                                        <div className="col-span-1">
                                          <div className="relative flex h-full w-10 items-center justify-center">
                                            <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                              <StepIcon status={child.status} />
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
                                            <span
                                              className={[
                                                "shrink-0 text-xs",
                                                dim
                                                  ? "text-gray-200"
                                                  : "text-gray-400",
                                              ].join(" ")}>
                                              {statusLabel(
                                                effectiveChildStatus,
                                              )}
                                            </span>
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
                                    </button>
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
    </section>
  );
}
