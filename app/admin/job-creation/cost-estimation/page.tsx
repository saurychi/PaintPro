"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";

type CostEstimationResponse = {
  project: {
    project_id: string;
    project_code: string | null;
    title: string | null;
    description: string | null;
    site_address: string | null;
    status: string | null;
  };
  markupRate: number;
  mainTasks: Array<{
    projectTaskId: string;
    mainTaskId: string;
    title: string;
    sortOrder: number;
    materialTotal: number;
    laborTotal: number;
    totalCost: number;
    materials: Array<{
      projectTaskMaterialId: string;
      materialId: string;
      name: string;
      unit: string | null;
      estimatedQuantity: number;
      unitCost: number;
      estimatedCost: number;
    }>;
    subtasks: Array<{
      projectSubTaskId: string;
      subTaskId: string;
      title: string;
      estimatedHours: number;
      hourlyWageTotal: number;
      laborCost: number;
      scheduledStartDatetime?: string | null;
      scheduledEndDatetime?: string | null;
      assignedStaff: Array<{
        id: string;
        name: string;
        hourlyWage: number;
      }>;
    }>;
  }>;
  summary: {
    materialTotal: number;
    laborTotal: number;
    totalCost: number;
    profitAmount: number;
    quotationTotal: number;
  };
  error?: string;
  details?: string;
};

const ACCENT = "#00c065";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CostEstimationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState<"back" | "next" | null>(
    null,
  );
  const [markupInput, setMarkupInput] = useState("30");
  const [data, setData] = useState<CostEstimationResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<"back" | "next" | null>(
    null,
  );
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isSavingFromModal, setIsSavingFromModal] = useState(false);

  async function loadCostEstimation(
    markupValue?: string,
    options?: { resetDirty?: boolean },
  ) {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const params = new URLSearchParams({
        projectId,
      });

      if (
        markupValue !== undefined &&
        markupValue !== null &&
        markupValue !== ""
      ) {
        params.set("markupRate", markupValue);
      }

      const response = await fetch(
        `/api/planning/getProjectCostEstimation?${params.toString()}`,
      );

      const result = (await response.json()) as CostEstimationResponse;

      if (!response.ok) {
        throw new Error(
          [result?.error, result?.details].filter(Boolean).join(": ") ||
            "Failed to load cost estimation.",
        );
      }

      setData(result);
      setExpanded(new Set(result.mainTasks.map((task) => task.projectTaskId)));
      setMarkupInput(String((result.markupRate ?? 0) * 100));

      if (options?.resetDirty) {
        setIsDirty(false);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load project cost estimation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCostEstimation(undefined, { resetDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggleTask(projectTaskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectTaskId)) next.delete(projectTaskId);
      else next.add(projectTaskId);
      return next;
    });
  }

  async function handleRecalculate() {
    await loadCostEstimation(markupInput);
  }

  async function updateProjectStatus(status: string) {
    const response = await fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        status,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        [data?.error, data?.details].filter(Boolean).join(": ") ||
          "Failed to update project status.",
      );
    }
  }

  function requestLeave(action: "back" | "next") {
    if (!isDirty) {
      if (action === "next") {
        void handleConfirmSave(true, "next");
      } else {
        void (async () => {
          try {
            await updateProjectStatus("employee_assignment_pending");
            router.push(
              `/admin/job-creation/employee-assignment?projectId=${projectId}`,
            );
          } catch (error: any) {
            setIsNavigating(null);
            toast.error(error?.message || "Failed to update project status.");
          }
        })();
      }
      return;
    }

    setPendingAction(action);
    setShowSaveConfirm(true);
  }

  function handleGoBack() {
    setIsNavigating("back");
    requestLeave("back");
  }

  function handleNext() {
    setIsNavigating("next");
    requestLeave("next");
  }

  async function handleConfirmSave(
    shouldSave: boolean,
    forcedAction?: "back" | "next",
  ) {
    const action = forcedAction ?? pendingAction;

    setShowSaveConfirm(false);

    if (!action) return;

    if (shouldSave) {
      try {
        setIsSavingFromModal(true);

        const saveResponse = await fetch(
          "/api/planning/saveProjectCostEstimation",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              projectId,
              markupRate: Number(markupInput),
            }),
          },
        );

        const saveData = await saveResponse.json();

        if (!saveResponse.ok) {
          throw new Error(
            [saveData?.error, saveData?.details].filter(Boolean).join(": ") ||
              "Failed to save project cost estimation.",
          );
        }

        setIsDirty(false);
        toast.success("Project cost estimation saved.");
      } catch (error: any) {
        setIsSavingFromModal(false);
        setIsNavigating(null);
        toast.error(
          error?.message || "Failed to save project cost estimation.",
        );
        return;
      } finally {
        setIsSavingFromModal(false);
      }
    }

    try {
      const nextStatus =
        action === "back" ? "employee_assignment_pending" : "overview_pending";

      await updateProjectStatus(nextStatus);

      setPendingAction(null);

      if (action === "next") {
        router.push(`/admin/job-creation/overview?projectId=${projectId}`);
        return;
      }

      router.push(
        `/admin/job-creation/employee-assignment?projectId=${projectId}`,
      );
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to continue.");
    }
  }

  const projectCode = data?.project.project_code || "Cost Estimation";
  const projectTitle =
    data?.project.title ||
    data?.project.site_address ||
    "Review project totals";

  const summaryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "Materials Total",
        value: formatCurrency(data.summary.materialTotal),
      },
      {
        label: "Labor Total",
        value: formatCurrency(data.summary.laborTotal),
      },
      {
        label: "Total Cost",
        value: formatCurrency(data.summary.totalCost),
      },
      {
        label: "Profit",
        value: formatCurrency(data.summary.profitAmount),
      },
      {
        label: "Quotation Total",
        value: formatCurrency(data.summary.quotationTotal),
      },
    ];
  }, [data]);

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Cost Estimation</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Cost Estimation
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review all generated project details after cost estimation
                    before generating quotation.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Pricing Review
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar space-y-4">
                {loading ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                    Loading cost estimation...
                  </div>
                ) : !data ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                    No cost estimation data found.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {summaryCards.map((card) => (
                        <div
                          key={card.label}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {card.label}
                          </div>
                          <div className="mt-2 text-[18px] font-semibold text-gray-900">
                            {card.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <div className="border-b border-gray-200 px-4 py-3">
                        <div className="text-[13px] font-semibold text-gray-900">
                          Main Task Breakdown
                        </div>
                      </div>

                      <div className="space-y-3 px-3 py-3">
                        {data.mainTasks.map((task) => {
                          const isOpen = expanded.has(task.projectTaskId);

                          return (
                            <div
                              key={task.projectTaskId}
                              className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <button
                                type="button"
                                onClick={() => toggleTask(task.projectTaskId)}
                                className={`w-full px-4 py-3 text-left transition ${
                                  isOpen ? "bg-emerald-50/40" : "bg-white"
                                }`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[15px] font-semibold text-gray-900">
                                      {task.title}
                                    </div>
                                    <div className="mt-1 text-[12px] text-gray-500">
                                      Materials:{" "}
                                      {formatCurrency(task.materialTotal)} •
                                      Labor: {formatCurrency(task.laborTotal)}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <div className="text-[13px] font-semibold text-gray-900">
                                      {formatCurrency(task.totalCost)}
                                    </div>

                                    <ChevronDown
                                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                        isOpen ? "rotate-180" : ""
                                      }`}
                                    />
                                  </div>
                                </div>
                              </button>

                              {isOpen ? (
                                <div className="space-y-4 px-5 pb-4">
                                  <div>
                                    <div className="mb-2 text-[12px] font-semibold text-gray-700">
                                      Materials
                                    </div>

                                    {task.materials.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
                                        No materials assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {task.materials.map((material) => (
                                          <div
                                            key={material.projectTaskMaterialId}
                                            className="rounded-md border border-gray-200 bg-white px-3 py-3">
                                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_120px]">
                                              <div className="min-w-0">
                                                <div className="text-[12px] font-medium text-gray-900">
                                                  {material.name}
                                                </div>
                                                <div className="mt-1 text-[11px] text-gray-500">
                                                  {material.unit ||
                                                    "Unit not set"}
                                                </div>
                                              </div>

                                              <div className="text-[12px] text-gray-700 md:text-right">
                                                Qty:{" "}
                                                {material.estimatedQuantity}
                                              </div>

                                              <div className="text-[12px] text-gray-700 md:text-right">
                                                {formatCurrency(
                                                  material.unitCost,
                                                )}
                                              </div>

                                              <div className="text-[12px] font-medium text-gray-800 md:text-right">
                                                {formatCurrency(
                                                  material.estimatedCost,
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="mb-2 text-[12px] font-semibold text-gray-700">
                                      Labor
                                    </div>

                                    {task.subtasks.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
                                        No subtasks assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {task.subtasks.map((subtask) => (
                                          <div
                                            key={subtask.projectSubTaskId}
                                            className="rounded-md border border-gray-200 bg-white px-3 py-3">
                                            <div className="text-[12px] font-medium text-gray-900">
                                              {subtask.title}
                                            </div>

                                            <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] text-gray-700 md:grid-cols-4">
                                              <div>
                                                Hours: {subtask.estimatedHours}
                                              </div>
                                              <div>
                                                Wage/hr Total:{" "}
                                                {formatCurrency(
                                                  subtask.hourlyWageTotal,
                                                )}
                                              </div>
                                              <div>
                                                Start:{" "}
                                                {formatDateTime(
                                                  subtask.scheduledStartDatetime,
                                                )}
                                              </div>
                                              <div className="md:text-right font-medium text-gray-900">
                                                {formatCurrency(
                                                  subtask.laborCost,
                                                )}
                                              </div>
                                            </div>

                                            <div className="mt-2 text-[11px] text-gray-500">
                                              Assigned Staff:{" "}
                                              {subtask.assignedStaff.length > 0
                                                ? subtask.assignedStaff
                                                    .map(
                                                      (staff) =>
                                                        `${staff.name} (${formatCurrency(
                                                          staff.hourlyWage,
                                                        )}/hr)`,
                                                    )
                                                    .join(", ")
                                                : "None"}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">
                  {projectCode}
                </div>
                <div className="mt-1 text-[12px] text-gray-500">
                  {projectTitle}
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4 space-y-4">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Markup Rate (%)
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={markupInput}
                      onChange={(e) => {
                        setMarkupInput(e.target.value);
                        setIsDirty(true);
                      }}
                      className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 pr-8 text-[13px] text-gray-900 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-500">
                      %
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRecalculate}
                  disabled={loading}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-70">
                  Recalculate
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="cost_estimation" />
            </div>
          </aside>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transition duration-150 hover:bg-gray-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70">
            {isNavigating === "back" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transition duration-150 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: ACCENT }}>
            {isNavigating === "next" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>

      {showSaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Save changes?
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Do you want to save your cost estimation changes before leaving?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowSaveConfirm(false);
                  setPendingAction(null);
                  setIsNavigating(null);
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                Don&apos;t Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                disabled={isSavingFromModal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: ACCENT }}>
                {isSavingFromModal ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Project Totals"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .green-scrollbar {
          scrollbar-color: ${ACCENT} #eaf7e4;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
}
