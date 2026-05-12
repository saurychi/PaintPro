"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  PencilLine,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import {
  getWizardCache,
  setCachedStep,
  clearWizardCache,
  ensureWizardCacheHydrated,
} from "@/lib/wizardCache";
import { calculateProjectCostEstimation } from "@/lib/planning/costEstimation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";

type MaterialItem = {
  project_task_material_id: string;
  material_id: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  estimated_quantity: number | null;
  estimated_cost: number | null;
};

type AssignedStaff = {
  project_sub_task_staff_id: string;
  user_id: string;
  user: {
    id: string;
    username: string | null;
    email: string | null;
    specialty: unknown;
  } | null;
};

type EquipmentItem = {
  name: string;
  notes: string | null;
};

type SubTaskItem = {
  project_sub_task_id: string;
  sub_task_id: string;
  description: string;
  estimated_hours: number | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  status: string | null;
  sort_order: number | null;
  equipments_used: EquipmentItem[];
  assigned_staff: AssignedStaff[];
};

type MainTaskItem = {
  project_task_id: string;
  main_task_id: string;
  title: string;
  sort_order: number | null;
  materials: MaterialItem[];
  subtasks: SubTaskItem[];
};

type ProjectOverviewResponse = {
  project: {
    project_id: string;
    project_code: string | null;
    title: string | null;
    description: string | null;
    site_address: string | null;
    status: string | null;
    estimated_budget: number | null;
    estimated_cost: number | null;
    estimated_profit: number | null;
  };
  mainTasks: MainTaskItem[];
};

const ACCENT = "#00c065";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function specialtyList(value: unknown) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export default function OverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/cost-estimation");
    router.prefetch("/admin/job-creation/quotation-generation");
  }, [router]);

  const [loading, setLoading] = useState(true);
  // Stepper for the "Generating quotation" overlay. The save-generated API
  // call is the slowest part, so we segment the user-visible progress into
  // three stages (save → render → finish) and update it as the handler
  // advances. Helps the multi-second wait feel intentional instead of stuck.
  type GenerationStep = "save" | "render" | "finish" | null;
  const [generationStep, setGenerationStep] = useState<GenerationStep>(null);
  const [isNavigating, setIsNavigating] = useState<"back" | "quote" | null>(
    null,
  );
  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [mainTasks, setMainTasks] = useState<MainTaskItem[]>([]);
  const [expandedMainTasks, setExpandedMainTasks] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    async function loadOverview() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoading(false);
        return;
      }

      await ensureWizardCacheHydrated(projectId);

      // Try building overview from wizard cache
      const cache = getWizardCache(projectId);
      if (cache && cache.mainTasks.length > 0 && cache.subTasks.length > 0) {
        const staffMap = new Map(
          (cache.refData.staffUsers ?? []).map((s) => [s.id, s]),
        );

        const estimation = calculateProjectCostEstimation({
          project: {
            projectId: cache.projectId,
            projectCode: cache.projectCode,
            title: cache.projectTitle,
            description: cache.description,
            siteAddress: cache.siteAddress,
            status: "overview_pending",
          },
          markupRate: cache.markupRate,
          mainTasks: cache.mainTasks.map((mt, i) => {
            const taskSubTasks = cache.subTasks.filter((st) => st.mainTaskId === mt.id);
            const taskMaterials = cache.materials.filter(
              (m) => m.projectTaskId === (mt.project_task_id ?? mt.id),
            );
            return {
              projectTaskId: mt.project_task_id ?? mt.id,
              mainTaskId: mt.id,
              title: mt.name,
              sortOrder: i,
              materials: taskMaterials.map((m) => ({
                projectTaskMaterialId: m.id,
                materialId: m.materialId,
                name: m.name,
                unit: m.unit,
                estimatedQuantity: m.quantity,
                unitCost: m.unitCost,
                estimatedCost: m.estimatedCost,
              })),
              subtasks: taskSubTasks.map((st) => ({
                projectSubTaskId: st.id,
                subTaskId: st.subTaskId,
                title: st.title,
                estimatedHours: st.estimatedHours ?? 0,
                assignedStaff: st.assignedEmployeeIds.map((uid) => {
                  const user = staffMap.get(uid);
                  return { id: uid, name: user?.username ?? "", hourlyWage: user?.hourly_wage ?? 0 };
                }),
                equipment: st.equipments.map((eq) => ({
                  id: eq.id,
                  equipmentId: eq.equipmentId,
                  name: eq.name,
                  quantity: eq.quantity,
                  unitCost: eq.unitCost,
                })),
                scheduledStartDatetime: st.scheduledStartDatetime,
                scheduledEndDatetime: st.scheduledEndDatetime,
              })),
            };
          }),
        });

        const overviewProject: ProjectOverviewResponse["project"] = {
          project_id: cache.projectId,
          project_code: cache.projectCode,
          title: cache.projectTitle,
          description: cache.description,
          site_address: cache.siteAddress,
          status: "overview_pending",
          estimated_budget: estimation.summary.quotationTotal,
          estimated_cost: estimation.summary.totalCost,
          estimated_profit: estimation.summary.profitAmount,
        };

        const overviewMainTasks: MainTaskItem[] = cache.mainTasks.map((mt, i) => {
          const ptId = mt.project_task_id ?? mt.id;
          const taskSubTasks = cache.subTasks.filter((st) => st.mainTaskId === mt.id);
          const taskMaterials = cache.materials.filter((m) => m.projectTaskId === ptId);

          return {
            project_task_id: ptId,
            main_task_id: mt.id,
            title: mt.name,
            sort_order: i,
            materials: taskMaterials.map((m) => ({
              project_task_material_id: m.id,
              material_id: m.materialId,
              name: m.name,
              unit: m.unit,
              unit_cost: m.unitCost,
              estimated_quantity: m.quantity,
              estimated_cost: m.estimatedCost,
            })),
            subtasks: taskSubTasks.map((st) => ({
              project_sub_task_id: st.id,
              sub_task_id: st.subTaskId,
              description: st.title,
              estimated_hours: st.estimatedHours,
              scheduled_start_datetime: st.scheduledStartDatetime,
              scheduled_end_datetime: st.scheduledEndDatetime,
              status: null,
              sort_order: st.sortOrder,
              equipments_used: st.equipments.map((eq) => ({ name: eq.name, notes: eq.notes ?? null })),
              assigned_staff: st.assignedEmployeeIds.map((uid) => {
                const user = staffMap.get(uid);
                return {
                  project_sub_task_staff_id: uid,
                  user_id: uid,
                  user: user ? { id: uid, username: user.username, email: user.email, specialty: null } : null,
                };
              }),
            })),
          };
        });

        setProject(overviewProject);
        setMainTasks(overviewMainTasks);
        setExpandedMainTasks(new Set(overviewMainTasks.map((t) => t.project_task_id)));
        setLoading(false);
        return;
      }

      // Cache miss — fallback to API
      try {
        setLoading(true);

        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${projectId}`,
        );

        const data = (await response.json()) as ProjectOverviewResponse & {
          error?: string;
          details?: string;
        };

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load project overview.",
          );
        }

        const nextMainTasks = Array.isArray(data.mainTasks)
          ? data.mainTasks
          : [];

        setProject(data.project);
        setMainTasks(nextMainTasks);
        setExpandedMainTasks(
          new Set(nextMainTasks.map((task) => task.project_task_id)),
        );
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project overview.");
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, [projectId]);

  function toggleMainTask(projectTaskId: string) {
    setExpandedMainTasks((prev) => {
      const next = new Set(prev);
      if (next.has(projectTaskId)) next.delete(projectTaskId);
      else next.add(projectTaskId);
      return next;
    });
  }

  // The "Change" buttons next to each section navigate back to that step.
  function handleChangeNavigate(status: string, path: string) {
    setCachedStep(projectId, status as any);
    setOptimisticProjectStatus(projectId, status);
    router.push(path);
  }

  function handleGoBack() {
    setIsNavigating("back");
    setCachedStep(projectId, "cost_estimation_pending");
    setOptimisticProjectStatus(projectId, "cost_estimation_pending");
    router.push(`/admin/job-creation/cost-estimation?projectId=${projectId}`);
  }

  async function handleGenerateQuotation() {
    setIsNavigating("quote");
    setGenerationStep("save");

    // Batch-save all cached wizard data to the database. We deliberately
    // DO NOT advance the status here — if PDF generation fails below,
    // the status flip would still be committed and a refresh would land
    // the user on /quotation-generation with no PDF in storage (the
    // "Failed to generate quotation PDF" loop). The status only moves
    // forward AFTER the PDF is in the bucket.
    const cache = getWizardCache(projectId);
    if (cache) {
      try {
        const response = await fetch("/api/planning/batchSaveProject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            mainTasks: cache.mainTasks,
            subTasks: cache.subTasks,
            materials: cache.materials,
            markupRate: cache.markupRate,
            // Intentionally omit `downpayment`. projects.downpayment is the
            // cumulative amount the client has actually paid (tracked by
            // DownpaymentModal via /api/planning/manageDownpayment).
            // The TARGET downpayment is derived from downpaymentRate *
            // quotationTotal whenever it needs to be displayed.
            downpaymentRate: cache.downpaymentPercent ?? 0,
            status: "overview_pending",
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          toast.error(data?.error || "Failed to save project.");
          setIsNavigating(null);
          setGenerationStep(null);
          return;
        }

        clearWizardCache(projectId);
      } catch (error: any) {
        toast.error(error?.message || "Failed to save project.");
        setIsNavigating(null);
        setGenerationStep(null);
        return;
      }
    }

    // Generate the quotation PDF and stash it in the bucket so the quotation
    // page can stream it straight from storage instead of regenerating the
    // HTML preview every time. We block navigation on this so the next page
    // opens with the file already in place.
    setGenerationStep("render");
    try {
      const generateResponse = await fetch("/api/quotation/save-generated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!generateResponse.ok) {
        const data = await generateResponse.json().catch(() => null);
        // Surface whatever the server reported in `details` so the
        // toast actually tells us what's failing — the bare "Failed to
        // generate quotation PDF" message hides the real cause.
        const baseError = data?.error || "Failed to generate quotation PDF.";
        toast.error(
          data?.details ? `${baseError} (${data.details})` : baseError,
        );
        setIsNavigating(null);
        setGenerationStep(null);
        return;
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate quotation PDF.");
      setIsNavigating(null);
      setGenerationStep(null);
      return;
    }

    // PDF is in the bucket — now (and only now) flip the status so a
    // refresh from anywhere routes the user to /quotation-generation.
    setGenerationStep("finish");
    try {
      const statusResponse = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          status: "quotation_pending",
        }),
      });
      if (!statusResponse.ok) {
        const data = await statusResponse.json().catch(() => null);
        toast.error(data?.error || "Failed to update project status.");
        setIsNavigating(null);
        setGenerationStep(null);
        return;
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update project status.");
      setIsNavigating(null);
      setGenerationStep(null);
      return;
    }

    setOptimisticProjectStatus(projectId, "quotation_pending");
    // Mark the modal complete before the soft navigation so the spinner
    // doesn't linger across the brief gap before the destination paints.
    // ?fresh=1 tells the next page the bucket file is already current
    // and to skip the (expensive) regeneration on mount.
    setGenerationStep(null);
    setIsNavigating(null);
    router.push(
      `/admin/job-creation/quotation-generation?projectId=${projectId}&fresh=1`,
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0"
            aria-hidden
          />
          <span>Overview</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Project Overview
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Review all generated project details before proceeding.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Final Review
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                {loading ? (
                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                    Loading project overview...
                  </div>
                ) : mainTasks.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                    No overview data found for this project.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mainTasks.map((task) => {
                      const isOpen = expandedMainTasks.has(
                        task.project_task_id,
                      );

                      return (
                        <div
                          key={task.project_task_id}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <div
                            className={`w-full px-4 py-3 transition ${
                              isOpen ? "bg-emerald-50/50 dark:bg-emerald-500/10" : "bg-white dark:bg-slate-900"
                            }`}>
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleMainTask(task.project_task_id)
                                }
                                className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                <div
                                  className={`h-9 w-1 rounded-full ${
                                    isOpen ? "opacity-100" : "opacity-0"
                                  }`}
                                  style={{ backgroundColor: ACCENT }}
                                />

                                <div className="min-w-0">
                                  <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                                    {task.title}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                                    {task.subtasks.length} sub task
                                    {task.subtasks.length === 1
                                      ? ""
                                      : "s"} • {task.materials.length} material
                                    {task.materials.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </button>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleChangeNavigate(
                                      "main_task_pending",
                                      `/admin/job-creation/main-task-assignment?projectId=${projectId}`,
                                    )
                                  }
                                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                  <PencilLine className="h-3.5 w-3.5" />
                                  Change
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleMainTask(task.project_task_id)
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 text-slate-500 dark:text-slate-400 transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[0.985] active:scale-95">
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform ${
                                      isOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>

                          {isOpen ? (
                            <div className="space-y-4 px-5 pb-4">
                              <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                    Materials
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleChangeNavigate(
                                        "materials_pending",
                                        `/admin/job-creation/materials-assignment?projectId=${projectId}`,
                                      )
                                    }
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Change
                                  </button>
                                </div>

                                {task.materials.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                                    No materials assigned.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {task.materials.map((material) => (
                                      <div
                                        key={material.project_task_material_id}
                                        className="rounded-md border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_130px_130px]">
                                          <div className="min-w-0">
                                            <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                              {material.name}
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                              {material.unit || "Unit not set"}
                                            </div>
                                          </div>

                                          <div className="text-[12px] text-slate-700 dark:text-slate-200 md:text-right">
                                            Qty:{" "}
                                            {material.estimated_quantity ?? 0}
                                          </div>

                                          <div className="text-[12px] font-medium text-slate-800 dark:text-slate-100 md:text-right">
                                            {formatCurrency(
                                              material.estimated_cost,
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                    Sub Tasks
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleChangeNavigate(
                                        "sub_task_pending",
                                        `/admin/job-creation/sub-task-assignment?projectId=${projectId}`,
                                      )
                                    }
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Change
                                  </button>
                                </div>

                                {task.subtasks.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                                    No subtasks assigned.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {task.subtasks.map((subtask) => (
                                      <div
                                        key={subtask.project_sub_task_id}
                                        className="rounded-md border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                                        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                          {subtask.description}
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Schedule
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleChangeNavigate(
                                                  "schedule_pending",
                                                  `/admin/job-creation/project-schedule?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          <div className="grid grid-cols-1 gap-2 text-[12px] text-slate-700 dark:text-slate-200 lg:grid-cols-3">
                                            <div>
                                              Estimated Hours:{" "}
                                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                                {subtask.estimated_hours ?? 0}
                                              </span>
                                            </div>
                                            <div>
                                              Start:{" "}
                                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                                {formatDateTime(
                                                  subtask.scheduled_start_datetime,
                                                )}
                                              </span>
                                            </div>
                                            <div>
                                              End:{" "}
                                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                                {formatDateTime(
                                                  subtask.scheduled_end_datetime,
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Equipment
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleChangeNavigate(
                                                  "equipment_pending",
                                                  `/admin/job-creation/equipment-assignment?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          {subtask.equipments_used.length ===
                                          0 ? (
                                            <div className="text-[12px] text-slate-500 dark:text-slate-400">
                                              No equipment assigned.
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              {subtask.equipments_used.map(
                                                (equipment, index) => (
                                                  <span
                                                    key={`${subtask.project_sub_task_id}-${equipment.name}-${index}`}
                                                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                                                    {equipment.name}
                                                  </span>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Assigned Staff
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleChangeNavigate(
                                                  "employee_assignment_pending",
                                                  `/admin/job-creation/employee-assignment?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          {subtask.assigned_staff.length ===
                                          0 ? (
                                            <div className="text-[12px] text-slate-500 dark:text-slate-400">
                                              No staff assigned.
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              {subtask.assigned_staff.map(
                                                (staff) => {
                                                  const name =
                                                    staff.user?.username ||
                                                    staff.user?.email ||
                                                    "Staff";
                                                  const specialties =
                                                    specialtyList(
                                                      staff.user?.specialty ??
                                                        null,
                                                    );

                                                  return (
                                                    <div
                                                      key={
                                                        staff.project_sub_task_staff_id
                                                      }
                                                      className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/70">
                                                      <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                                        {name}
                                                      </div>

                                                      {specialties.length >
                                                      0 ? (
                                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                                          {specialties.map(
                                                            (specialty) => (
                                                              <span
                                                                key={`${staff.project_sub_task_staff_id}-${specialty}`}
                                                                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                                                {specialty}
                                                              </span>
                                                            ),
                                                          )}
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  );
                                                },
                                              )}
                                            </div>
                                          )}
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
                )}
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  {project?.project_code || "Project Overview"}
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  {project?.title ||
                    project?.site_address ||
                    "No project title"}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-4 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
                <div>
                  Budget:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.estimated_budget)}
                  </span>
                </div>
                <div>
                  Cost:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.estimated_cost)}
                  </span>
                </div>
                <div>
                  Profit:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.estimated_profit)}
                  </span>
                </div>
                <div>
                  Status:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {project?.status || "Unknown"}
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="overview" />
            </div>
          </aside>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 text-[13px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100">
            {isNavigating === "back" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>

          <button
            type="button"
            onClick={handleGenerateQuotation}
            disabled={isNavigating !== null}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            style={{ backgroundColor: ACCENT }}>
            {isNavigating === "quote" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Generate Quotation"
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

      {/* Generating-quotation overlay. Three-step progress: save → render →
          finish. Each step ticks to a check once handleGenerateQuotation
          moves past it, so the user gets concrete feedback during the
          multi-second PDF render instead of an opaque spinner. */}
      {isNavigating === "quote" ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-500/10">
                <Loader2
                  className="h-7 w-7 animate-spin"
                  style={{ color: ACCENT }}
                />
              </div>
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100">
                Generating quotation
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                This usually takes a few seconds.
              </p>

              <ul className="mt-4 w-full space-y-2 text-left">
                {(
                  [
                    { id: "save", label: "Saving project data" },
                    { id: "render", label: "Rendering quotation PDF" },
                    { id: "finish", label: "Finishing up" },
                  ] as const
                ).map((step) => {
                  const order: GenerationStep[] = ["save", "render", "finish"];
                  const currentIdx = generationStep
                    ? order.indexOf(generationStep)
                    : -1;
                  const stepIdx = order.indexOf(step.id);
                  const state =
                    currentIdx === -1
                      ? "pending"
                      : stepIdx < currentIdx
                        ? "done"
                        : stepIdx === currentIdx
                          ? "active"
                          : "pending";
                  return (
                    <li
                      key={step.id}
                      className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/40">
                      <span
                        className={[
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                          state === "pending"
                            ? "border-gray-200 bg-white text-gray-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500"
                            : "",
                        ].join(" ")}
                        style={
                          state === "done"
                            ? {
                                borderColor: ACCENT,
                                backgroundColor: ACCENT,
                                color: "#ffffff",
                              }
                            : state === "active"
                              ? {
                                  borderColor: ACCENT,
                                  backgroundColor: "#ffffff",
                                  color: ACCENT,
                                }
                              : undefined
                        }>
                        {state === "done" ? (
                          <Check className="h-3 w-3" />
                        ) : state === "active" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          stepIdx + 1
                        )}
                      </span>
                      <span
                        className={[
                          "text-[12px] font-medium",
                          state === "active"
                            ? "text-gray-900 dark:text-slate-100"
                            : state === "done"
                              ? "text-gray-500 line-through dark:text-slate-500"
                              : "text-gray-500 dark:text-slate-400",
                        ].join(" ")}>
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
