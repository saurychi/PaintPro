"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

const ACCENT = "#00c065";
const GREEN = "#7ED957";

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
        ? ["#00c065", "#E5E7EB"]
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
}: {
  status: StepVisualStatus;
  showLine: boolean;
}) {
  return (
    <div className="relative flex h-full min-h-[32px] w-7 shrink-0 items-start justify-center">
      <StepIcon status={status} size="lg" />

      {showLine ? (
        <div
          className="absolute left-1/2 top-5 bottom-[-20px] -translate-x-1/2 border-l border-dashed border-gray-400"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function SubtaskTimelineMarker({ status }: { status: StepVisualStatus }) {
  return (
    <div className="relative flex w-4 shrink-0 items-center justify-center">
      <StepIcon status={status} size="md" />
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
            className="grid grid-cols-[40px_minmax(0,1fr)_200px_200px] items-center gap-4 py-3">
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

type ProgressMainSectionProps = {
  selectedProject: unknown | null;
  loadingDetails: boolean;
  navigating: boolean;
  processItems: ProcessItem[];
  openProcessIds: Set<string>;
  openSubtaskIds: Set<string>;
  toggleProcessRow: (id: string) => void;
  toggleSubtaskRow: (id: string) => void;
  handleStartMainTasks: () => void;
};

export default function ProgressMainSection({
  selectedProject,
  loadingDetails,
  navigating,
  processItems,
  openProcessIds,
  openSubtaskIds,
  toggleProcessRow,
  toggleSubtaskRow,
  handleStartMainTasks,
}: ProgressMainSectionProps) {
  return (
    <section className="lg:col-span-9 flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />

      <div className="border-b border-gray-200 px-6 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold leading-5 text-gray-900">
              Progress
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-gray-500">
              Track service flow, scheduled dates, and task completion.
            </p>
          </div>

          {navigating ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : null}
        </div>
      </div>

      {!selectedProject ? (
        <div className="flex h-[420px] items-center justify-center px-6 text-center text-sm text-gray-500">
          Select a project to view its process flow.
        </div>
      ) : loadingDetails ? (
        <ProcessFlowSkeleton />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="hidden grid-cols-[40px_minmax(0,1fr)_200px_200px] gap-4 border-b border-gray-200 px-2 pb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400 md:grid">
            <div>Status</div>
            <div>Service</div>
            <div>Scheduled Date &amp; Time</div>
            <div>Finished Date &amp; Time</div>
          </div>

          <div className="pt-2">
            {processItems.map((item, index) => {
              const hasChildren = Boolean(item.children?.length);
              const isOpen = openProcessIds.has(item.id);
              const isLastMain = index === processItems.length - 1;

              return (
                <div key={item.id} className="relative">
                  <div className="grid grid-cols-1 gap-2 rounded-xl px-2 py-2 transition hover:bg-gray-50 md:grid-cols-[40px_minmax(0,1fr)_200px_200px] md:gap-3">
                    <div className="flex self-stretch md:justify-center">
                      <TimelineMarker
                        status={item.status}
                        showLine={!isLastMain}
                      />
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => hasChildren && toggleProcessRow(item.id)}
                        className={`group flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${
                          hasChildren ? "hover:bg-gray-50" : ""
                        }`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className={`text-[13px] font-medium leading-5 ${statusTone(item.status)}`}>
                              {item.title}
                            </span>
                            <span className="text-[11px] font-medium text-gray-400">
                              {statusText(item.status)}
                            </span>
                          </div>
                        </div>

                        {hasChildren ? (
                          <ChevronRight
                            className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                              isOpen ? "rotate-90" : "rotate-0"
                            }`}
                          />
                        ) : null}
                      </button>

                      <div className="mt-2 space-y-1 px-3 text-xs text-gray-500 md:hidden">
                        <div>Scheduled: {item.startLabel}</div>
                        <div>Finished: {item.endLabel}</div>
                      </div>
                    </div>

                    <div className="hidden text-[12px] leading-5 text-gray-600 md:block">
                      {item.startLabel}
                    </div>
                    <div className="hidden text-[12px] leading-5 text-gray-900 md:block">
                      {item.endLabel}
                    </div>
                  </div>

                  {hasChildren ? (
                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        isOpen
                          ? "mt-3 grid-rows-[1fr] opacity-100"
                          : "mt-0 grid-rows-[0fr] opacity-0"
                      }`}>
                      <div className="overflow-hidden">
                        <div className="ml-[18px] rounded-lg border border-gray-200 bg-white">
                          <div className="divide-y divide-gray-200">
                            {item.children?.map((child) => {
                              const isSubOpen = openSubtaskIds.has(child.id);
                              const hasDetail = Boolean(child.detail);

                              return (
                                <div key={child.id} className="px-1.5 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (child.id === "project-kickoff") {
                                        handleStartMainTasks();
                                        return;
                                      }

                                      if (hasDetail) {
                                        toggleSubtaskRow(child.id);
                                      }
                                    }}
                                    className={`grid w-full grid-cols-1 gap-2 rounded-md px-1.5 py-1.5 text-left transition md:grid-cols-[20px_minmax(0,2.4fr)_160px_160px_28px] md:items-center ${
                                      hasDetail ||
                                      child.id === "project-kickoff"
                                        ? "hover:bg-gray-50"
                                        : ""
                                    }`}>
                                    <div className="hidden md:flex md:justify-center">
                                      <SubtaskTimelineMarker
                                        status={child.status}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                        <span
                                          className={`block text-[12px] leading-4.5 break-words ${
                                            child.status === "done"
                                              ? "text-gray-400"
                                              : child.status === "active"
                                                ? "font-medium text-gray-700"
                                                : "text-gray-500"
                                          }`}>
                                          {child.title}
                                        </span>

                                        {child.id === "project-kickoff" ? (
                                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            Start Main Tasks
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="text-[12px] leading-5 text-gray-600 md:flex md:min-h-[40px] md:items-center">
                                      {child.startLabel}
                                    </div>

                                    <div className="text-[12px] leading-5 text-gray-900 md:flex md:min-h-[40px] md:items-center">
                                      {child.endLabel}
                                    </div>

                                    <div className="flex justify-end">
                                      {hasDetail ? (
                                        <ChevronDown
                                          className={`h-4 w-4 text-gray-400 transition-transform ${
                                            isSubOpen ? "rotate-180" : ""
                                          }`}
                                        />
                                      ) : null}
                                    </div>
                                  </button>

                                  {hasDetail ? (
                                    <div
                                      className={`grid transition-all duration-300 ease-out ${
                                        isSubOpen
                                          ? "mt-1 grid-rows-[1fr] opacity-100"
                                          : "mt-0 grid-rows-[0fr] opacity-0"
                                      }`}>
                                      <div className="overflow-hidden rounded-md border border-gray-200 bg-[#fafafa]">
                                        <div className="grid grid-cols-1 gap-1.5 px-3 py-2 md:grid-cols-2">
                                          <div className="text-[12px] leading-5 text-gray-700">
                                            <span className="font-medium text-gray-900">
                                              Assigned:
                                            </span>{" "}
                                            {child.detail?.employees.length
                                              ? child.detail.employees.join(
                                                  ", ",
                                                )
                                              : "No assigned employees yet"}
                                          </div>

                                          <div className="text-[12px] leading-5 text-gray-700">
                                            <span className="font-medium text-gray-900">
                                              Estimated Duration:
                                            </span>{" "}
                                            {child.detail?.estimatedHours ||
                                              "0 hrs"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
