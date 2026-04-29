"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import { normalizeMarkupRate } from "@/lib/planning/costEstimation";

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
const ACCENT_SOFT = "#e6f9ef";
const ACCENT_BORDER = "#b7efcf";

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

export default function CostEstimationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState<"back" | "next" | null>(null);
  const [markupInput, setMarkupInput] = useState("30");
  const [data, setData] = useState<CostEstimationResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<"back" | "next" | null>(null);
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

      if (options?.resetDirty) setIsDirty(false);
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

  async function updateProjectStatus(status: string) {
    const response = await fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status }),
    });
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(
        [responseData?.error, responseData?.details].filter(Boolean).join(": ") ||
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
            router.push(`/admin/job-creation/employee-assignment?projectId=${projectId}`);
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

  async function handleConfirmSave(shouldSave: boolean, forcedAction?: "back" | "next") {
    const action = forcedAction ?? pendingAction;
    setShowSaveConfirm(false);
    if (!action) return;

    if (shouldSave) {
      try {
        setIsSavingFromModal(true);

        const saveResponse = await fetch("/api/planning/saveProjectCostEstimation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, markupRate: Number(markupInput) }),
        });
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
        toast.error(error?.message || "Failed to save project cost estimation.");
        return;
      } finally {
        setIsSavingFromModal(false);
      }
    }

    try {
      const nextStatus = action === "back" ? "employee_assignment_pending" : "overview_pending";
      await updateProjectStatus(nextStatus);
      setPendingAction(null);

      if (action === "next") {
        router.push(`/admin/job-creation/overview?projectId=${projectId}`);
        return;
      }
      router.push(`/admin/job-creation/employee-assignment?projectId=${projectId}`);
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to continue.");
    }
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
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* page header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Cost Estimation</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* left column: cost + breakdown stacked */}
          <div className="flex min-h-0 flex-col gap-4">

            {/* ── Cost section (compact) ─────────────────────────────────── */}
            <section className="shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />

              {/* section header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-gray-900">Cost Summary</p>
                </div>
                <div
                  className="inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT_SOFT, color: ACCENT }}>
                  Pricing Review
                </div>
              </div>

              {/* compact cost row */}
              <div className="px-5 py-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-[13px] text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : !pricingSummary ? (
                  <div className="text-[13px] text-gray-500">No cost data available.</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-0 gap-y-2">
                    {/* Materials */}
                    <div className="flex min-w-[130px] flex-col px-4 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Materials
                      </span>
                      <span className="mt-1 text-[15px] font-semibold text-gray-800">
                        {formatCurrency(pricingSummary.materialTotal)}
                      </span>
                    </div>

                    <span className="text-[16px] font-light text-gray-300">+</span>

                    {/* Labor */}
                    <div className="flex min-w-[130px] flex-col px-4 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Labor
                      </span>
                      <span className="mt-1 text-[15px] font-semibold text-gray-800">
                        {formatCurrency(pricingSummary.laborTotal)}
                      </span>
                    </div>

                    <span className="text-[16px] font-light text-gray-300">=</span>

                    {/* Base cost */}
                    <div
                      className="flex min-w-[130px] flex-col rounded-lg px-4 py-2"
                      style={{ backgroundColor: ACCENT_SOFT }}>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: ACCENT }}>
                        Base Cost
                      </span>
                      <span className="mt-1 text-[15px] font-semibold text-gray-900">
                        {formatCurrency(pricingSummary.baseCost)}
                      </span>
                    </div>

                    {/* divider */}
                    <div className="mx-4 hidden h-10 w-px bg-gray-200 lg:block" />

                    {/* Markup rate input */}
                    <div className="flex flex-col px-2 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
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
                            setIsDirty(true);
                          }}
                          className="h-8 w-[76px] rounded-md border border-gray-200 bg-white pl-2.5 pr-6 text-[13px] font-medium text-gray-900 outline-none transition focus:border-emerald-400"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                          %
                        </span>
                      </div>
                    </div>

                    <span className="text-[16px] font-light text-gray-300">+</span>

                    {/* Markup amount */}
                    <div className="flex min-w-[130px] flex-col px-4 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Markup Amount
                      </span>
                      <span className="mt-1 text-[15px] font-semibold text-gray-800">
                        {formatCurrency(pricingSummary.markupPrice)}
                      </span>
                    </div>

                    <span className="text-[16px] font-light text-gray-300">=</span>

                    {/* Quotation total */}
                    <div
                      className="flex min-w-[140px] flex-col rounded-lg px-4 py-2"
                      style={{ backgroundColor: ACCENT_SOFT }}>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: ACCENT }}>
                        Quotation Total
                      </span>
                      <span className="mt-1 text-[16px] font-bold text-gray-900">
                        {formatCurrency(pricingSummary.quotationTotal)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Breakdown section (scrollable) ─────────────────────────── */}
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

              <div className="shrink-0 border-b border-gray-200 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-gray-900">Main Task Breakdown</p>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  Detailed cost breakdown by main task — materials, equipment, and subtasks.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
                <div className="h-full overflow-y-auto pr-2 green-scrollbar space-y-2.5">
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-700" />
                        <span className="text-sm font-medium text-gray-700">
                          Loading breakdown...
                        </span>
                      </div>
                    </div>
                  ) : !data || data.mainTasks.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
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
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                          {/* task header */}
                          <button
                            type="button"
                            onClick={() => toggleTask(task.projectTaskId)}
                            className={`w-full px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/40" : "bg-white hover:bg-gray-50"
                            }`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[14px] font-semibold text-gray-900">
                                  {task.title}
                                </div>
                                <div className="mt-0.5 text-[11px] text-gray-500">
                                  Materials: {formatCurrency(task.materialTotal)} &middot; Labor:{" "}
                                  {formatCurrency(task.laborTotal)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[13px] font-semibold text-gray-900">
                                  {formatCurrency(task.totalCost)}
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 text-gray-400 transition-transform ${
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
                              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "materials")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-gray-50">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-gray-900">
                                      Materials
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {task.materials.length} item{task.materials.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
                                      materialsOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {materialsOpen && (
                                  <div className="border-t border-gray-200 px-4 py-2.5">
                                    {task.materials.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500">
                                        No materials assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {task.materials.map((material) => (
                                          <div
                                            key={material.projectTaskMaterialId}
                                            className="grid grid-cols-[minmax(0,1fr)_80px_100px_100px] items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2">
                                            <div>
                                              <div className="text-[12px] font-medium text-gray-900">
                                                {material.name}
                                              </div>
                                              <div className="text-[11px] text-gray-400">
                                                {material.unit || "—"}
                                              </div>
                                            </div>
                                            <div className="text-[11px] text-gray-600 text-right">
                                              Qty {material.estimatedQuantity}
                                            </div>
                                            <div className="text-[11px] text-gray-600 text-right">
                                              {formatCurrency(material.unitCost)}
                                            </div>
                                            <div className="text-[12px] font-medium text-gray-800 text-right">
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
                              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "equipment")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-gray-50">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-gray-900">
                                      Equipment
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {equipmentItems.length} item{equipmentItems.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
                                      equipmentOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {equipmentOpen && (
                                  <div className="border-t border-gray-200 px-4 py-2.5">
                                    {equipmentItems.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500">
                                        No equipment assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {equipmentItems.map((eq) => (
                                          <div
                                            key={`${eq.projectSubTaskId}-${eq.id}`}
                                            className="grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2">
                                            <div>
                                              <div className="text-[12px] font-medium text-gray-900">
                                                {eq.name}
                                              </div>
                                              <div className="text-[11px] text-gray-400">
                                                {eq.subTaskTitle}
                                              </div>
                                            </div>
                                            <div className="text-[11px] text-gray-600 text-right">
                                              Qty {eq.quantity}
                                            </div>
                                            <div className="text-[11px] text-gray-500 text-right">
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
                              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSection(task.projectTaskId, "subtasks")
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-gray-50">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-gray-900">
                                      Subtasks
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {task.subtasks.length} item{task.subtasks.length === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
                                      subtasksOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {subtasksOpen && (
                                  <div className="border-t border-gray-200 px-4 py-2.5">
                                    {task.subtasks.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500">
                                        No subtasks assigned.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {task.subtasks.map((subtask) => (
                                          <div
                                            key={subtask.projectSubTaskId}
                                            className="rounded-md border border-gray-100 bg-white px-3 py-2">
                                            <div className="text-[12px] font-medium text-gray-900">
                                              {subtask.title}
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
                                              <span>Hours: {subtask.estimatedHours}</span>
                                              <span>
                                                Wage/hr: {formatCurrency(subtask.hourlyWageTotal)}
                                              </span>
                                              <span>
                                                Start:{" "}
                                                {formatDateTime(subtask.scheduledStartDatetime)}
                                              </span>
                                              <span className="font-medium text-gray-800">
                                                {formatCurrency(subtask.laborCost)}
                                              </span>
                                            </div>
                                            {subtask.assignedStaff.length > 0 && (
                                              <div className="mt-1 text-[11px] text-gray-400">
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
                  <div className="h-2" />
                </div>
              </div>
            </section>
          </div>

          {/* sidebar — same pattern as all other job-creation pages */}
          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">{projectCode}</div>
                <div className="mt-1 text-[12px] text-gray-500">{projectTitle}</div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="cost_estimation" />
            </div>
          </aside>
        </div>

        {/* footer nav */}
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

      {/* save confirm modal */}
      {showSaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Save changes?</h3>
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
