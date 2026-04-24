"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

const ACCENT = "#00c065";

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

type LayoutMode = "mini" | "compact" | "standard" | "roomy";

function getLayoutMode(width: number, height: number): LayoutMode {
  if (width < 520 || height < 300) return "mini";
  if (width < 760 || height < 420) return "compact";
  if (width < 980) return "standard";
  return "roomy";
}

function StepIcon({
  status,
  size = "md",
}: {
  status: StepVisualStatus;
  size?: "sm" | "md" | "lg";
}) {
  const chartSize = size === "lg" ? 20 : size === "md" ? 16 : 13;
  const innerRadius = size === "lg" ? 6.5 : size === "md" ? 5 : 4;
  const outerRadius = size === "lg" ? 9.5 : size === "md" ? 7.5 : 6;

  const data =
    status === "active"
      ? [
          { name: "value", value: 72 },
          { name: "rest", value: 28 },
        ]
      : [
          { name: "value", value: 100 },
          { name: "rest", value: 0 },
        ];

  const colors =
    status === "done"
      ? ["#7ED957", "#7ED957"]
      : status === "active"
        ? ["#00c065", "#E5E7EB"]
        : ["#C4C9D4", "#C4C9D4"];

  return (
    <div
      className="relative shrink-0"
      style={{ width: chartSize, height: chartSize }}
    >
      <PieChart width={chartSize} height={chartSize}>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((_, index) => (
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
  mode,
}: {
  status: StepVisualStatus;
  showLine: boolean;
  mode: LayoutMode;
}) {
  const isMini = mode === "mini";

  return (
    <div
      className={`relative flex h-full shrink-0 items-start justify-center ${
        isMini ? "min-h-[24px] w-5" : "min-h-[32px] w-7"
      }`}
    >
      <StepIcon status={status} size={isMini ? "md" : "lg"} />

      {showLine && !isMini ? (
        <div
          className="absolute bottom-[-18px] left-1/2 top-5 -translate-x-1/2 border-l border-dashed border-gray-400"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function SubtaskTimelineMarker({
  status,
  mode,
}: {
  status: StepVisualStatus;
  mode: LayoutMode;
}) {
  return (
    <div className="relative flex w-4 shrink-0 items-center justify-center">
      <StepIcon status={status} size={mode === "mini" ? "sm" : "md"} />
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

function ProcessFlowSkeleton({ mode }: { mode: LayoutMode }) {
  const isSmall = mode === "mini" || mode === "compact";

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-white">
      <div className={`${isSmall ? "px-3 py-3" : "px-5 py-4"}`}>
        {Array.from({ length: isSmall ? 4 : 6 }).map((_, index) => (
          <div
            key={index}
            className={`grid items-center gap-3 py-2 ${
              isSmall
                ? "grid-cols-[24px_minmax(0,1fr)]"
                : "grid-cols-[40px_minmax(0,1fr)_140px_140px]"
            }`}
          >
            <div className="h-5 w-5 animate-pulse rounded-full bg-gray-200" />
            <div className="h-4 w-full max-w-[220px] animate-pulse rounded bg-gray-200" />
            {!isSmall ? (
              <>
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              </>
            ) : null}
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
  className?: string;
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
  className = "",
}: ProgressMainSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({
        width: rect.width,
        height: rect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const mode = useMemo(
    () => getLayoutMode(size.width, size.height),
    [size.width, size.height],
  );

  const isMini = mode === "mini";
  const isCompact = mode === "mini" || mode === "compact";
  const showTableHeader = mode === "standard" || mode === "roomy";
  const mainGridColumns =
    mode === "roomy"
      ? "40px minmax(0,1fr) 200px 200px"
      : "36px minmax(0,1fr) 150px 150px";

  const subtaskGridColumns =
    mode === "roomy"
      ? "20px minmax(0,2.4fr) 160px 160px 28px"
      : "18px minmax(0,2fr) 125px 125px 24px";

  return (
    <section
      ref={sectionRef}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

      <div
        className={`shrink-0 border-b border-gray-200 ${
          isMini ? "px-3 py-2" : "px-5 py-3"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className={`font-semibold leading-5 text-gray-900 ${
                isMini ? "text-[14px]" : "text-[17px]"
              }`}
            >
              Progress
            </h2>

            {!isMini ? (
              <p className="mt-1 line-clamp-1 text-[12px] leading-5 text-gray-500">
                Track service flow, scheduled dates, and task completion.
              </p>
            ) : null}
          </div>

          {navigating ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400" />
          ) : null}
        </div>
      </div>

      {!selectedProject ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-gray-500">
          Select a project to view its process flow.
        </div>
      ) : loadingDetails ? (
        <ProcessFlowSkeleton mode={mode} />
      ) : (
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            isMini ? "px-2 py-2" : "px-4 py-3"
          }`}
        >
          {showTableHeader ? (
            <div
              className="grid gap-3 border-b border-gray-200 px-2 pb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400"
              style={{ gridTemplateColumns: mainGridColumns }}
            >
              <div>Status</div>
              <div>Service</div>
              <div>Scheduled Date &amp; Time</div>
              <div>Finished Date &amp; Time</div>
            </div>
          ) : null}

          <div className={showTableHeader ? "pt-2" : "pt-0"}>
            {processItems.map((item, index) => {
              const hasChildren = Boolean(item.children?.length);
              const isOpen = openProcessIds.has(item.id);
              const isLastMain = index === processItems.length - 1;

              return (
                <div key={item.id} className="relative">
                  <div
                    className={`grid rounded-lg transition hover:bg-gray-50 ${
                      isCompact
                        ? "grid-cols-[26px_minmax(0,1fr)] gap-2 px-1.5 py-1.5"
                        : "gap-3 px-2 py-2"
                    }`}
                    style={
                      isCompact
                        ? undefined
                        : { gridTemplateColumns: mainGridColumns }
                    }
                  >
                    <div className="flex self-stretch justify-center">
                      <TimelineMarker
                        status={item.status}
                        showLine={!isLastMain}
                        mode={mode}
                      />
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => hasChildren && toggleProcessRow(item.id)}
                        className={`group flex w-full items-start justify-between gap-2 rounded-lg text-left transition ${
                          isMini ? "px-1.5 py-1" : "px-2.5 py-1.5"
                        } ${hasChildren ? "hover:bg-gray-50" : ""}`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className={`font-medium leading-5 ${statusTone(
                                item.status,
                              )} ${isMini ? "text-[12px]" : "text-[13px]"}`}
                            >
                              {item.title}
                            </span>

                            {!isMini ? (
                              <span className="text-[11px] font-medium text-gray-400">
                                {statusText(item.status)}
                              </span>
                            ) : null}
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

                      {isCompact ? (
                        <div
                          className={`space-y-0.5 px-2 text-gray-500 ${
                            isMini ? "text-[10px]" : "text-[11px]"
                          }`}
                        >
                          <div className="line-clamp-1">
                            Scheduled: {item.startLabel}
                          </div>
                          <div className="line-clamp-1">
                            Finished: {item.endLabel}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {!isCompact ? (
                      <>
                        <div className="text-[12px] leading-5 text-gray-600">
                          {item.startLabel}
                        </div>
                        <div className="text-[12px] leading-5 text-gray-900">
                          {item.endLabel}
                        </div>
                      </>
                    ) : null}
                  </div>

                  {hasChildren ? (
                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        isOpen
                          ? "mt-2 grid-rows-[1fr] opacity-100"
                          : "mt-0 grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div
                          className={`rounded-lg border border-gray-200 bg-white ${
                            isCompact ? "ml-6" : "ml-[18px]"
                          }`}
                        >
                          <div className="divide-y divide-gray-200">
                            {item.children?.map((child) => {
                              const isSubOpen = openSubtaskIds.has(child.id);
                              const hasDetail = Boolean(child.detail);

                              return (
                                <div
                                  key={child.id}
                                  className={isMini ? "px-1 py-1" : "px-1.5 py-1.5"}
                                >
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
                                    className={`grid w-full rounded-md text-left transition ${
                                      isCompact
                                        ? "grid-cols-[18px_minmax(0,1fr)_20px] gap-2 px-1.5 py-1.5"
                                        : "gap-2 px-1.5 py-1.5"
                                    } ${
                                      hasDetail || child.id === "project-kickoff"
                                        ? "hover:bg-gray-50"
                                        : ""
                                    }`}
                                    style={
                                      isCompact
                                        ? undefined
                                        : {
                                            gridTemplateColumns:
                                              subtaskGridColumns,
                                          }
                                    }
                                  >
                                    <div className="flex justify-center">
                                      <SubtaskTimelineMarker
                                        status={child.status}
                                        mode={mode}
                                      />
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                        <span
                                          className={`block break-words ${
                                            isMini
                                              ? "text-[11px] leading-4"
                                              : "text-[12px] leading-5"
                                          } ${
                                            child.status === "done"
                                              ? "text-gray-400"
                                              : child.status === "active"
                                                ? "font-medium text-gray-700"
                                                : "text-gray-500"
                                          }`}
                                        >
                                          {child.title}
                                        </span>

                                        {child.id === "project-kickoff" && !isMini ? (
                                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            Start Main Tasks
                                          </span>
                                        ) : null}
                                      </div>

                                      {isCompact ? (
                                        <div
                                          className={`mt-1 space-y-0.5 text-gray-500 ${
                                            isMini ? "text-[10px]" : "text-[11px]"
                                          }`}
                                        >
                                          <div className="line-clamp-1">
                                            Scheduled: {child.startLabel}
                                          </div>
                                          <div className="line-clamp-1">
                                            Finished: {child.endLabel}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>

                                    {!isCompact ? (
                                      <>
                                        <div className="flex min-h-[36px] items-center text-[12px] leading-5 text-gray-600">
                                          {child.startLabel}
                                        </div>

                                        <div className="flex min-h-[36px] items-center text-[12px] leading-5 text-gray-900">
                                          {child.endLabel}
                                        </div>
                                      </>
                                    ) : null}

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
                                      }`}
                                    >
                                      <div className="overflow-hidden rounded-md border border-gray-200 bg-[#fafafa]">
                                        <div
                                          className={`grid gap-1.5 px-3 py-2 ${
                                            isCompact
                                              ? "grid-cols-1"
                                              : "grid-cols-2"
                                          }`}
                                        >
                                          <div className="text-[12px] leading-5 text-gray-700">
                                            <span className="font-medium text-gray-900">
                                              Assigned:
                                            </span>{" "}
                                            {child.detail?.employees.length
                                              ? child.detail.employees.join(", ")
                                              : "No assigned employees yet"}
                                          </div>

                                          <div className="text-[12px] leading-5 text-gray-700">
                                            <span className="font-medium text-gray-900">
                                              Estimated Duration:
                                            </span>{" "}
                                            {child.detail?.estimatedHours || "0 hrs"}
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
