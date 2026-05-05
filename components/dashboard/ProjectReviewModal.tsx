"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  ProjectReviewSummary,
  ReviewEmployeeSummary,
  ReviewMaterialSummary,
  ReviewTimingStatus,
} from "@/lib/planning/projectReviewSummary";

type Props = {
  open: boolean;
  onClose: () => void;
  summary: ProjectReviewSummary | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionDisabled?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getTimingTone(status: ReviewTimingStatus) {
  if (status === "early") {
    return "border-emerald-300/80 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300";
  }

  if (status === "on time") {
    return "border-sky-300/80 bg-sky-500/10 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300";
  }

  if (status === "late") {
    return "border-rose-300/80 bg-rose-500/10 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300";
  }

  if (status === "completed") {
    return "border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/70 text-gray-500 dark:text-slate-400";
  }

  if (status === "working on it...") {
    return "border-amber-300/80 bg-amber-500/10 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300";
  }

  return "border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400";
}

function TimingPill({ status }: { status: ReviewTimingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        getTimingTone(status),
      )}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-slate-100 md:text-lg">
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="shrink-0 border-b border-gray-200 dark:border-slate-700 px-3.5 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">
          {title}
        </div>
        <p className="mt-0.5 text-[11px] leading-4 text-gray-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5",
          "[&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700",
          "[&::-webkit-scrollbar-track]:bg-transparent",
        )}>
        {children}
      </div>
    </section>
  );
}

function MaterialRow({ material }: { material: ReviewMaterialSummary }) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-[11px] sm:grid-cols-[minmax(0,2fr)_80px_120px] sm:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-900 dark:text-slate-100">
          {material.name}
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500 dark:text-slate-400">
          {material.unit || "No unit specified"}
        </div>
      </div>
      <div className="text-gray-500 dark:text-slate-400">
        {material.totalQuantity.toLocaleString()}
      </div>
      <div className="text-left font-medium text-gray-900 dark:text-slate-100 sm:text-right">
        {formatCurrency(material.totalCost)}
      </div>
    </div>
  );
}

function getEmployeePerformance(employee: ReviewEmployeeSummary) {
  const totalTracked =
    employee.earlyCount + employee.onTimeCount + employee.lateCount;

  if (totalTracked <= 0) {
    return {
      score: 0,
      label: "No scored work yet",
      tone: "border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 dark:bg-slate-800/40",
    };
  }

  const score = Math.round(
    ((employee.earlyCount + employee.onTimeCount) / totalTracked) * 100,
  );

  if (score >= 90) {
    return {
      score,
      label: "Excellent",
      tone: "border-emerald-300/80 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
    };
  }

  if (score >= 75) {
    return {
      score,
      label: "Strong",
      tone: "border-sky-300/80 bg-sky-500/10 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300",
    };
  }

  if (score >= 50) {
    return {
      score,
      label: "Fair",
      tone: "border-amber-300/80 bg-amber-500/10 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300",
    };
  }

  return {
    score,
    label: "Needs attention",
    tone: "border-rose-300/80 bg-rose-500/10 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300",
  };
}

export default function ProjectReviewModal({
  open,
  onClose,
  summary,
  actionLabel,
  onAction,
  actionDisabled = false,
}: Props) {
  const employees = useMemo(() => summary?.employees ?? [], [summary]);
  const mainTasks = useMemo(() => summary?.mainTasks ?? [], [summary]);
  const [resourceView, setResourceView] = useState<"materials" | "equipment">(
    "materials",
  );
  const [selectedEmployeeIdState, setSelectedEmployeeIdState] = useState("");
  const [openMainTaskIds, setOpenMainTaskIds] = useState<string[]>([]);
  const selectedEmployeeId = employees.some(
    (employee) => employee.id === selectedEmployeeIdState,
  )
    ? selectedEmployeeIdState
    : (employees[0]?.id ?? "");

  // Auto-open the first main task whenever a new summary is loaded; once the
  // user toggles, their state takes over and is preserved (including closing
  // every task).
  useEffect(() => {
    setOpenMainTaskIds(mainTasks.length > 0 ? [mainTasks[0].id] : []);
  }, [summary, mainTasks]);

  const selectedEmployeeIndex = Math.max(
    0,
    employees.findIndex((employee) => employee.id === selectedEmployeeId),
  );

  const selectedEmployee =
    employees[selectedEmployeeIndex] ?? employees[0] ?? null;

  const totalEmployeePages = employees.length;

  const employeePagerLabel = useMemo(() => {
    if (!selectedEmployee) return "No employee selected";

    return `${selectedEmployeeIndex + 1} of ${totalEmployeePages}`;
  }, [selectedEmployee, selectedEmployeeIndex, totalEmployeePages]);

  function handleChangeEmployee(direction: -1 | 1) {
    if (!employees.length) return;

    const nextIndex =
      (selectedEmployeeIndex + direction + employees.length) % employees.length;
    setSelectedEmployeeIdState(employees[nextIndex].id);
  }

  function toggleMainTask(mainTaskId: string) {
    setOpenMainTaskIds((prev) =>
      prev.includes(mainTaskId)
        ? prev.filter((id) => id !== mainTaskId)
        : [...prev, mainTaskId],
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className={cn(
          "flex h-[90vh] w-[min(94vw,1640px)] max-w-[94vw] flex-col overflow-hidden border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0 shadow-xl",
          "sm:max-w-[92vw]",
        )}>
        <DialogHeader className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 md:px-5">
          <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
            <DialogTitle className="text-sm font-semibold tracking-tight text-gray-900 dark:text-slate-100 md:text-base">
              Review and Final Checks
            </DialogTitle>

            {summary ? (
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[9px] font-semibold tracking-[0.16em] text-slate-100 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900">
                  {summary.projectCode || "NO PROJECT CODE"}
                </span>
                <div className="truncate text-[12px] font-medium text-gray-900 dark:text-slate-100 md:text-sm">
                  {summary.projectTitle || "Unnamed Project"}
                </div>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden bg-gray-50 dark:bg-slate-950 px-4 py-3 md:px-5">
          {!summary ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-10 text-center text-xs text-gray-500 dark:text-slate-400 md:text-sm">
              No review data is available for this project yet.
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
              <section className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-5">
                <SummaryCard
                  label="Main Tasks"
                  value={String(summary.totalMainTasks)}
                />
                <SummaryCard
                  label="Subtasks"
                  value={String(summary.totalSubTasks)}
                />
                <SummaryCard
                  label="Materials"
                  value={String(summary.totalMaterials)}
                />
                <SummaryCard
                  label="Equipment"
                  value={String(summary.totalEquipment)}
                />
                <SummaryCard
                  label="Employees"
                  value={String(summary.totalEmployees)}
                />
              </section>

              <section className="grid min-h-0 overflow-hidden gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                <SectionCard
                  title="Tasks"
                  description="Completed work, timing status, equipment, and assigned staff.">
                  <div className="space-y-2">
                    {mainTasks.map((mainTask) => {
                      const isOpen = openMainTaskIds.includes(mainTask.id);

                      return (
                        <div
                          key={mainTask.id}
                          className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40">
                          <button
                            type="button"
                            onClick={() => toggleMainTask(mainTask.id)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-900 dark:text-slate-100">
                              {mainTask.title}
                            </div>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-gray-500 dark:text-slate-400 transition-transform",
                                isOpen ? "rotate-0" : "-rotate-90",
                              )}
                            />
                          </button>

                          {isOpen ? (
                            <div className="space-y-2 border-t border-gray-200 dark:border-slate-700 px-3 pb-2.5 pt-2">
                              {mainTask.subTasks.length > 0 ? (
                                mainTask.subTasks.map((subTask) => (
                                  <div
                                    key={subTask.id}
                                    className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-[11px] font-medium text-gray-900 dark:text-slate-100">
                                          {subTask.title}
                                        </div>
                                        <div className="mt-1 text-[10px] text-gray-500 dark:text-slate-400">
                                          {subTask.estimatedHours > 0
                                            ? `${subTask.estimatedHours} hrs planned`
                                            : "No duration"}
                                        </div>
                                      </div>

                                      <TimingPill
                                        status={subTask.timingStatus}
                                      />
                                    </div>

                                    <div className="mt-2 grid gap-x-3 gap-y-1 text-[10px] leading-4 text-gray-500 dark:text-slate-400 xl:grid-cols-2">
                                      <div>
                                        Planned:{" "}
                                        {formatDateTime(subTask.scheduledStart)}
                                      </div>
                                      <div>
                                        Finished:{" "}
                                        {formatDateTime(subTask.completedAt)}
                                      </div>
                                      <div>
                                        Equipment:{" "}
                                        {subTask.equipmentNames.length > 0
                                          ? subTask.equipmentNames.join(", ")
                                          : "None recorded"}
                                      </div>
                                      <div>
                                        Staff:{" "}
                                        {subTask.employeeNames.length > 0
                                          ? subTask.employeeNames.join(", ")
                                          : "No assigned staff"}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-4 text-[11px] text-gray-500 dark:text-slate-400">
                                  No subtasks were recorded under this main
                                  task.
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                <div className="grid min-h-0 overflow-hidden gap-3 lg:grid-rows-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="shrink-0 border-b border-gray-200 px-3.5 py-1.5 dark:border-slate-700">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">
                        Employees
                      </div>
                    </div>

                    {selectedEmployee ? (
                      (() => {
                        const performance = getEmployeePerformance(selectedEmployee);

                        const stats = [
                          { label: "Score", value: `${performance.score}%` },
                          { label: "Early", value: String(selectedEmployee.earlyCount) },
                          { label: "On Time", value: String(selectedEmployee.onTimeCount) },
                          { label: "Late", value: String(selectedEmployee.lateCount) },
                        ];

                        return (
                          <>
                            <div className="shrink-0 border-b border-gray-200 px-3.5 py-2 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleChangeEmployee(-1)}
                                  disabled={employees.length <= 1}
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                                  )}>
                                  <ChevronLeft className="h-4 w-4" />
                                </button>

                                <div className="min-w-0 flex-1 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100 md:text-sm">
                                      {selectedEmployee.name}
                                    </div>
                                    <span
                                      className={cn(
                                        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                                        performance.tone,
                                      )}>
                                      {performance.label}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
                                    {employeePagerLabel}
                                    {selectedEmployee.role || selectedEmployee.specialty
                                      ? ` · ${[selectedEmployee.role, selectedEmployee.specialty].filter(Boolean).join(" • ")}`
                                      : ""}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleChangeEmployee(1)}
                                  disabled={employees.length <= 1}
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                                  )}>
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="mt-2 grid grid-cols-4 gap-1.5">
                                {stats.map((stat) => (
                                  <div
                                    key={stat.label}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">
                                      {stat.label}
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold tracking-tight text-gray-900 dark:text-slate-100">
                                      {stat.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div
                              className={cn(
                                "min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 py-2.5",
                                "[&::-webkit-scrollbar]:w-2",
                                "[&::-webkit-scrollbar-thumb]:rounded-full",
                                "[&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700",
                                "[&::-webkit-scrollbar-track]:bg-transparent",
                              )}>
                              {selectedEmployee.assignedTasks.length > 0 ? (
                                selectedEmployee.assignedTasks.map((task) => (
                                  <div
                                    key={`${selectedEmployee.id}-${task.subTaskId}`}
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-[11px] font-medium text-gray-900 dark:text-slate-100 md:text-xs">
                                          {task.subTaskTitle}
                                        </div>
                                        <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                                          {task.mainTaskTitle}
                                        </div>
                                      </div>
                                      <TimingPill status={task.timingStatus} />
                                    </div>

                                    <div className="mt-2 grid gap-1 text-[10px] leading-4 text-gray-500 dark:text-slate-400">
                                      <div>Planned start: {formatDateTime(task.scheduledStart)}</div>
                                      <div>Finished: {formatDateTime(task.completedAt)}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-5 text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                  No employee task timing to review yet.
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <div className="flex-1 p-3.5">
                        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-[11px] text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                          No employee assignments were found for this project.
                        </div>
                      </div>
                    )}
                  </section>

                  <SectionCard
                    title={
                      resourceView === "materials" ? "Materials" : "Equipment"
                    }
                    description={
                      resourceView === "materials"
                        ? `${formatCountLabel(summary.materials.length, "material")} aggregated across the project.`
                        : `${formatCountLabel(summary.equipment.length, "equipment item")} logged in the project workflow.`
                    }>
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setResourceView("materials")}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                          resourceView === "materials"
                            ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                        )}>
                        Materials
                      </button>
                      <button
                        type="button"
                        onClick={() => setResourceView("equipment")}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                          resourceView === "equipment"
                            ? "border-sky-300 bg-sky-500/10 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300"
                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                        )}>
                        Equipment
                      </button>
                    </div>

                    {resourceView === "materials" ? (
                      <div className="space-y-2">
                        {summary.materials.length > 0 ? (
                          summary.materials.map((material) => (
                            <MaterialRow
                              key={material.id}
                              material={material}
                            />
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-4 text-[11px] text-gray-500 dark:text-slate-400">
                            No materials were recorded for this project.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {summary.equipment.length > 0 ? (
                          summary.equipment.map((equipment) => (
                            <div
                              key={equipment.name}
                              className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-medium text-gray-900 dark:text-slate-100">
                                  {equipment.name}
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-slate-400">
                                  Used {equipment.usageCount} time
                                  {equipment.usageCount === 1 ? "" : "s"}
                                </div>
                              </div>

                              {equipment.notes.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {equipment.notes.map((note) => (
                                    <span
                                      key={`${equipment.name}-${note}`}
                                      className="rounded-full border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-400">
                                      {note}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-4 text-[11px] text-gray-500 dark:text-slate-400">
                            No equipment usage was recorded for this project.
                          </div>
                        )}
                      </div>
                    )}
                  </SectionCard>
                </div>
              </section>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-gray-900 dark:text-slate-100 transition hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-slate-800/70 dark:hover:text-slate-100">
            Close
          </button>

          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition",
                actionDisabled
                  ? "cursor-not-allowed bg-slate-300 dark:bg-slate-700"
                  : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400",
              )}>
              {actionLabel}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
