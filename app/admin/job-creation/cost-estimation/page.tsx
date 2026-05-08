"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import { normalizeMarkupRate, calculateProjectCostEstimation, type CostEstimationInput, type CostEstimationMainTask } from "@/lib/planning/costEstimation";
import { getCachedSubTasks, getCachedMainTasks, getCachedMaterials, getCachedMarkupRate, setCachedMarkupRate, setCachedStep, getCachedRefData, getCachedProjectMeta, ensureWizardCacheHydrated, markWizardDirty } from "@/lib/wizardCache";

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
      equipment: Array<{
        id: string;
        equipmentId?: string | null;
        name: string;
        quantity: number;
        unitCost: number;
        notes?: string | null;
      }>;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getSectionKey(
  projectTaskId: string,
  section: "materials" | "equipment" | "subtasks",
) {
  return `${projectTaskId}:${section}`;
}

/**
 * Build CostEstimationResponse from wizard cache data using the pure
 * calculateProjectCostEstimation function.
 */
function buildCostFromCache(projectId: string): CostEstimationResponse | null {
  const mainTasks = getCachedMainTasks(projectId);
  const subTasks = getCachedSubTasks(projectId);
  const materials = getCachedMaterials(projectId);
  const refData = getCachedRefData(projectId);
  const meta = getCachedProjectMeta(projectId);
  const markupRate = getCachedMarkupRate(projectId) ?? 30;

  if (!mainTasks || !subTasks || !materials || !meta) return null;

  const staffUsers = refData?.staffUsers ?? [];

  // Build staff lookup by id
  const staffById = new Map(
    staffUsers.map((s) => [s.id, { id: s.id, name: s.username, hourlyWage: s.hourly_wage }]),
  );

  // Build CostEstimationMainTask[] from cache
  const costMainTasks: CostEstimationMainTask[] = mainTasks.map((mt) => {
    const projectTaskId = mt.project_task_id ?? mt.id;

    // Materials for this main task
    const taskMaterials = materials
      .filter((m) => m.projectTaskId === projectTaskId)
      .map((m) => ({
        projectTaskMaterialId: m.id,
        materialId: m.materialId,
        name: m.name,
        unit: m.unit,
        estimatedQuantity: m.quantity,
        unitCost: m.unitCost,
        estimatedCost: m.estimatedCost,
      }));

    // Subtasks for this main task
    const taskSubTasks = subTasks
      .filter((st) => st.projectTaskId === projectTaskId)
      .map((st) => ({
        projectSubTaskId: st.id,
        subTaskId: st.subTaskId,
        title: st.title,
        estimatedHours: st.estimatedHours ?? 0,
        assignedStaff: st.assignedEmployeeIds
          .map((empId) => staffById.get(empId))
          .filter((s): s is { id: string; name: string; hourlyWage: number } => !!s),
        equipment: st.equipments.map((eq) => ({
          id: eq.id,
          equipmentId: eq.equipmentId,
          name: eq.name,
          quantity: eq.quantity,
          unitCost: eq.unitCost,
          notes: eq.notes,
        })),
        scheduledStartDatetime: st.scheduledStartDatetime,
        scheduledEndDatetime: st.scheduledEndDatetime,
      }));

    return {
      projectTaskId,
      mainTaskId: mt.id,
      title: mt.name,
      sortOrder: 0,
      materials: taskMaterials,
      subtasks: taskSubTasks,
    };
  });

  const input: CostEstimationInput = {
    project: {
      projectId,
      projectCode: meta.projectCode,
      title: meta.projectTitle,
      description: meta.description,
      siteAddress: meta.siteAddress,
      status: null,
    },
    markupRate,
    mainTasks: costMainTasks,
  };

  const result = calculateProjectCostEstimation(input);

  return result as CostEstimationResponse;
}

export default function CostEstimationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/employee-assignment");
    router.prefetch("/admin/job-creation/overview");
  }, [router]);

  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState<"back" | "next" | null>(null);
  const [markupInput, setMarkupInput] = useState("30");
  const [data, setData] = useState<CostEstimationResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const [isDirty, setIsDirty] = useState(false);

  function applyData(result: CostEstimationResponse, resetDirty?: boolean) {
    const nextExpandedTasks = new Set(result.mainTasks.map((task) => task.projectTaskId));
    const nextExpandedSections = new Set<string>();
    result.mainTasks.forEach((task) => {
      nextExpandedSections.add(getSectionKey(task.projectTaskId, "materials"));
      nextExpandedSections.add(getSectionKey(task.projectTaskId, "equipment"));
      nextExpandedSections.add(getSectionKey(task.projectTaskId, "subtasks"));
    });

    setData(result);
    setExpanded(nextExpandedTasks);
    setExpandedSections(nextExpandedSections);
    setMarkupInput(String((result.markupRate ?? 0) * 100));

    if (resetDirty) setIsDirty(false);
  }

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

      await ensureWizardCacheHydrated(projectId);

      // Try building from wizard cache first
      const cached = buildCostFromCache(projectId);
      if (cached) {
        applyData(cached, options?.resetDirty);
        return;
      }

      // Fallback: fetch from API
      const params = new URLSearchParams({ projectId });
      if (markupValue !== undefined && markupValue !== null && markupValue !== "") {
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

      applyData(result, options?.resetDirty);
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

  function toggleSection(
    projectTaskId: string,
    section: "materials" | "equipment" | "subtasks",
  ) {
    const sectionKey = getSectionKey(projectTaskId, section);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }

  function handleNext() {
    setIsNavigating("next");
    setCachedMarkupRate(projectId, Number(markupInput));
    setIsDirty(false);
    setCachedStep(projectId, "overview_pending");
    setOptimisticProjectStatus(projectId, "overview_pending");
    router.push(`/admin/job-creation/overview?projectId=${projectId}`);
  }

  function handleGoBack() {
    setIsNavigating("back");
    setCachedMarkupRate(projectId, Number(markupInput));
    setIsDirty(false);
    setCachedStep(projectId, "employee_assignment_pending");
    setOptimisticProjectStatus(projectId, "employee_assignment_pending");
    router.push(`/admin/job-creation/employee-assignment?projectId=${projectId}`);
  }

  const projectCode = data?.project.project_code || "Cost Estimation";
  const projectTitle = data?.project.title || data?.project.site_address || "Review project totals";

  const pricingSummary = useMemo(() => {
    if (!data) return null;
    const materialTotal = Number(data.summary.materialTotal ?? 0);
    const laborTotal = Number(data.summary.laborTotal ?? 0);
    const baseCost = Number(data.summary.totalCost ?? 0);
    const markupRate = normalizeMarkupRate(Number(markupInput));
    const markupPrice = roundMoney(baseCost * markupRate);
    const quotationTotal = roundMoney(baseCost + markupPrice);
    return { materialTotal, laborTotal, baseCost, markupPrice, quotationTotal };
  }, [data, markupInput]);

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        {/* page header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0" aria-hidden />
          <span>Cost Estimation</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* left column: cost + breakdown stacked */}
          <div className="flex min-h-0 flex-col gap-4">

            {/* ── Cost section (compact) ─────────────────────────────────── */}
            <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
              <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />

              {/* section header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost Summary</p>
                </div>
                <div
                  className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Pricing Review
                </div>
              </div>

              {/* compact cost row */}
              <div className="px-5 py-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : !pricingSummary ? (
                  <div className="text-[13px] text-slate-500 dark:text-slate-400">No cost data available.</div>
                ) : (
                  <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-3">
                      {/* Materials */}
                      <div className="flex min-w-0 flex-col rounded-lg px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Materials
                        </span>
                        <span className="mt-1 truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                          {formatCurrency(pricingSummary.materialTotal)}
                        </span>
                      </div>

                      <span className="flex justify-center text-[16px] font-light text-slate-300 dark:text-slate-500">+</span>

                      {/* Labor */}
                      <div className="flex min-w-0 flex-col rounded-lg px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Labor
                        </span>
                        <span className="mt-1 truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                          {formatCurrency(pricingSummary.laborTotal)}
                        </span>
                      </div>

                      <span className="flex justify-center text-[16px] font-light text-slate-300 dark:text-slate-500">=</span>

                      {/* Base cost */}
                      <div className="flex min-w-0 flex-col rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/15">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                          Base Cost
                        </span>
                        <span className="mt-1 truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(pricingSummary.baseCost)}
                        </span>
                      </div>
                    </div>

                    <div className="hidden h-10 w-px bg-slate-200 dark:bg-slate-700 xl:block" />

                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
                      {/* Markup rate input */}
                      <div className="flex min-w-0 flex-col py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Markup Rate
                        </span>
                        <div className="relative mt-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={markupInput}
                            onChange={(e) => {
                              setMarkupInput(e.target.value);
                              setIsDirty(true); markWizardDirty(projectId);
                            }}
                            className="h-8 w-full max-w-[126px] rounded-md border border-slate-200 bg-white pl-2.5 pr-6 text-[13px] font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 dark:text-slate-500">
                            %
                          </span>
                        </div>
                      </div>

                      {/* Markup amount */}
                      <div className="flex min-w-0 flex-col px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Markup Amount
                        </span>
                        <span className="mt-1 truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                          {formatCurrency(pricingSummary.markupPrice)}
                        </span>
                      </div>

                      {/* Quotation total */}
                      <div className="flex min-w-0 flex-col rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/15">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                          Quotation Total
                        </span>
                        <span className="mt-1 truncate text-[16px] font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(pricingSummary.quotationTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Breakdown section (scrollable) ─────────────────────────── */}
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
              <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

              <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Main Task Breakdown</p>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Detailed cost breakdown by main task — materials, equipment, and subtasks.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
                <div className="h-full overflow-y-auto pr-2 green-scrollbar space-y-2.5">
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-5 py-4 shadow-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-700 dark:text-slate-200" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          Loading breakdown...
                        </span>
                      </div>
                    </div>
                  ) : !data || data.mainTasks.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      No task breakdown data found.
                    </div>
                  ) : (
                    data.mainTasks.map((task) => {
                      const isOpen = expanded.has(task.projectTaskId);
                      const materialsOpen = expandedSections.has(
                        getSectionKey(task.projectTaskId, "materials"),
                      );
                      const equipmentOpen = expandedSections.has(
                        getSectionKey(task.projectTaskId, "equipment"),
                      );
                      const subtasksOpen = expandedSections.has(
                        getSectionKey(task.projectTaskId, "subtasks"),
                      );
                      const equipmentItems = task.subtasks.flatMap((subtask) =>
                        subtask.equipment.map((eq) => ({
                          ...eq,
                          projectSubTaskId: subtask.projectSubTaskId,
                          subTaskTitle: subtask.title,
                        })),
                      );

                      return (
                        <div
                          key={task.projectTaskId}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          {/* task header */}
                          <button
                            type="button"
                            onClick={() => toggleTask(task.projectTaskId)}
                            className={`w-full px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/50 dark:bg-emerald-500/12" : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                            }`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                                  {task.title}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  Materials: {formatCurrency(task.materialTotal)} &middot; Labor:{" "}
                                  {formatCurrency(task.laborTotal)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                  {formatCurrency(task.totalCost)}
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${
                                    isOpen ? "rotate-180" : ""
                                  }`}
                                />
                              </div>
                            </div>
                          </button>

                          {/* task details */}
                          {isOpen && (
                            <div className="space-y-2 px-4 pb-3">
                              {/* materials subsection */}
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "materials")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                                      Materials
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {task.materials.length} item{task.materials.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform ${
                                      materialsOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {materialsOpen && (
                                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2.5">
                                    {task.materials.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">
                                        No materials assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {task.materials.map((material) => (
                                          <div
                                            key={material.projectTaskMaterialId}
                                            className="grid grid-cols-[minmax(0,1fr)_80px_100px_100px] items-center gap-2 rounded-md border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950/70 px-3 py-2">
                                            <div>
                                              <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                                {material.name}
                                              </div>
                                              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                                {material.unit || "—"}
                                              </div>
                                            </div>
                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 text-right">
                                              Qty {material.estimatedQuantity}
                                            </div>
                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 text-right">
                                              {formatCurrency(material.unitCost)}
                                            </div>
                                            <div className="text-[12px] font-medium text-slate-800 dark:text-slate-100 text-right">
                                              {formatCurrency(material.estimatedCost)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* equipment subsection */}
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "equipment")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                                      Equipment
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {equipmentItems.length} item{equipmentItems.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform ${
                                      equipmentOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {equipmentOpen && (
                                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2.5">
                                    {equipmentItems.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">
                                        No equipment assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {equipmentItems.map((eq) => (
                                          <div
                                            key={`${eq.projectSubTaskId}-${eq.id}`}
                                            className="grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] items-center gap-2 rounded-md border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950/70 px-3 py-2">
                                            <div>
                                              <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                                {eq.name}
                                              </div>
                                              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                                {eq.subTaskTitle}
                                              </div>
                                            </div>
                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 text-right">
                                              Qty {eq.quantity}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right">
                                              {eq.notes || "—"}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* subtasks subsection */}
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "subtasks")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                                      Subtasks
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {task.subtasks.length} item{task.subtasks.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform ${
                                      subtasksOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {subtasksOpen && (
                                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2.5">
                                    {task.subtasks.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">
                                        No subtasks assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {task.subtasks.map((subtask) => (
                                          <div
                                            key={subtask.projectSubTaskId}
                                            className="rounded-md border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950/70 px-3 py-2">
                                            <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                              {subtask.title}
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                                              <span>Hours: {subtask.estimatedHours}</span>
                                              <span>
                                                Wage/hr: {formatCurrency(subtask.hourlyWageTotal)}
                                              </span>
                                              <span>
                                                Start:{" "}
                                                {formatDateTime(subtask.scheduledStartDatetime)}
                                              </span>
                                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                                {formatCurrency(subtask.laborCost)}
                                              </span>
                                            </div>
                                            {subtask.assignedStaff.length > 0 && (
                                              <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                                Staff:{" "}
                                                {subtask.assignedStaff
                                                  .map(
                                                    (s) =>
                                                      `${s.name} (${formatCurrency(s.hourlyWage)}/hr)`,
                                                  )
                                                  .join(", ")}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* sidebar — same pattern as all other job-creation pages */}
          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{projectCode}</div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{projectTitle}</div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="cost_estimation" />
            </div>
          </aside>
        </div>

        {/* footer nav */}
        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
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

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .dark .green-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .dark .green-scrollbar::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }
        .green-scrollbar {
          scrollbar-color: ${ACCENT} #eaf7e4;
          scrollbar-width: thin;
        }
        .dark .green-scrollbar {
          scrollbar-color: ${ACCENT} #0f172a;
        }
      `}</style>
    </div>
  );
}
