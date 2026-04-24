"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, PencilLine } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function formatDateTime(value: string | null) {
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

  const [loading, setLoading] = useState(true);
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

  async function handleGoBack() {
    try {
      setIsNavigating("back");
      await updateProjectStatus("cost_estimation_pending");
      router.push(`/admin/job-creation/cost-estimation?projectId=${projectId}`);
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to go back.");
    }
  }

  async function handleGenerateQuotation() {
    try {
      setIsNavigating("quote");
      await updateProjectStatus("quotation_pending");
      router.push(`/admin/job-creation/quotation-generation?projectId=${projectId}`);
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to continue to quotation.");
    }
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Overview</span>
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
                      Project Overview
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review all generated project details before proceeding.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Final Review
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                {loading ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                    Loading project overview...
                  </div>
                ) : mainTasks.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
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
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <div
                            className={`w-full px-4 py-3 transition ${
                              isOpen ? "bg-emerald-50/40" : "bg-white"
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
                                  <div className="text-[15px] font-semibold text-gray-900">
                                    {task.title}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-gray-500">
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
                                    router.push(
                                      `/admin/job-creation/main-task-assignment?projectId=${projectId}`,
                                    )
                                  }
                                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                  <PencilLine className="h-3.5 w-3.5" />
                                  Change
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleMainTask(task.project_task_id)
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-150 hover:bg-gray-50 hover:scale-[0.985] active:scale-95">
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
                                  <div className="text-[12px] font-semibold text-gray-700">
                                    Materials
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      router.push(
                                        `/admin/job-creation/materials-assignment?projectId=${projectId}`,
                                      )
                                    }
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Change
                                  </button>
                                </div>

                                {task.materials.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
                                    No materials assigned.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {task.materials.map((material) => (
                                      <div
                                        key={material.project_task_material_id}
                                        className="rounded-md border border-gray-200 bg-white px-3 py-3">
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_130px_130px]">
                                          <div className="min-w-0">
                                            <div className="text-[12px] font-medium text-gray-900">
                                              {material.name}
                                            </div>
                                            <div className="mt-1 text-[11px] text-gray-500">
                                              {material.unit || "Unit not set"}
                                            </div>
                                          </div>

                                          <div className="text-[12px] text-gray-700 md:text-right">
                                            Qty:{" "}
                                            {material.estimated_quantity ?? 0}
                                          </div>

                                          <div className="text-[12px] font-medium text-gray-800 md:text-right">
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
                                  <div className="text-[12px] font-semibold text-gray-700">
                                    Sub Tasks
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      router.push(
                                        `/admin/job-creation/sub-task-assignment?projectId=${projectId}`,
                                      )
                                    }
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Change
                                  </button>
                                </div>

                                {task.subtasks.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
                                    No subtasks assigned.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {task.subtasks.map((subtask) => (
                                      <div
                                        key={subtask.project_sub_task_id}
                                        className="rounded-md border border-gray-200 bg-white px-3 py-3">
                                        <div className="text-[13px] font-semibold text-gray-900">
                                          {subtask.description}
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Schedule
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push(
                                                  `/admin/job-creation/project-schedule?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          <div className="grid grid-cols-1 gap-2 text-[12px] text-gray-700 lg:grid-cols-3">
                                            <div>
                                              Estimated Hours:{" "}
                                              <span className="font-medium text-gray-900">
                                                {subtask.estimated_hours ?? 0}
                                              </span>
                                            </div>
                                            <div>
                                              Start:{" "}
                                              <span className="font-medium text-gray-900">
                                                {formatDateTime(
                                                  subtask.scheduled_start_datetime,
                                                )}
                                              </span>
                                            </div>
                                            <div>
                                              End:{" "}
                                              <span className="font-medium text-gray-900">
                                                {formatDateTime(
                                                  subtask.scheduled_end_datetime,
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Equipment
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push(
                                                  `/admin/job-creation/equipment-assignment?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          {subtask.equipments_used.length ===
                                          0 ? (
                                            <div className="text-[12px] text-gray-500">
                                              No equipment assigned.
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              {subtask.equipments_used.map(
                                                (equipment, index) => (
                                                  <span
                                                    key={`${subtask.project_sub_task_id}-${equipment.name}-${index}`}
                                                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                                                    {equipment.name}
                                                  </span>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        <div className="mt-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Assigned Staff
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push(
                                                  `/admin/job-creation/employee-assignment?projectId=${projectId}`,
                                                )
                                              }
                                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                              <PencilLine className="h-3.5 w-3.5" />
                                              Change
                                            </button>
                                          </div>

                                          {subtask.assigned_staff.length ===
                                          0 ? (
                                            <div className="text-[12px] text-gray-500">
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
                                                      className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                                      <div className="text-[12px] font-medium text-gray-900">
                                                        {name}
                                                      </div>

                                                      {specialties.length >
                                                      0 ? (
                                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                                          {specialties.map(
                                                            (specialty) => (
                                                              <span
                                                                key={`${staff.project_sub_task_staff_id}-${specialty}`}
                                                                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
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

                <div className="h-6" />
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">
                  {project?.project_code || "Project Overview"}
                </div>
                <div className="mt-1 text-[12px] text-gray-500">
                  {project?.title ||
                    project?.site_address ||
                    "No project title"}
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4 space-y-2 text-[12px] text-gray-600">
                <div>
                  Budget:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(project?.estimated_budget)}
                  </span>
                </div>
                <div>
                  Cost:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(project?.estimated_cost)}
                  </span>
                </div>
                <div>
                  Profit:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(project?.estimated_profit)}
                  </span>
                </div>
                <div>
                  Status:{" "}
                  <span className="font-medium text-gray-900">
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

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100">
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
