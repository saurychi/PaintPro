"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import SubTaskPickerModal from "@/components/project-creation/SubTaskPickerModal";
import CreateSubTaskModal from "@/components/project-creation/CreateSubTaskModal";
import CreateTaskModal from "@/components/project-creation/CreateTaskModal";

type StepStatus = "done" | "active" | "pending";

type ServiceStep = {
  id: string;
  subTaskId: string;
  title: string;
  sortOrder: number;
  scheduledAt?: string;
  finishedAt?: string;
  status: "pending" | "active" | "done";
  assignedTo?: string;
};

export type ServiceGroup = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  children: ServiceStep[];
};

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const ACCENT_SOFT = "#e6f9ef";
const BORDER = "border-gray-200";

type EditDraft = {
  assignedTo: string;
  description: string;
  payment: string;
  scheduledISO: string; // datetime-local value: "YYYY-MM-DDTHH:mm"
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToPretty(iso?: string) {
  if (!iso) return "";
  const [datePart, timePart] = iso.split("T");
  if (!datePart || !timePart) return "";

  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  const [hh, mm] = timePart.split(":").map((v) => Number(v));
  if (!y || !m || !d) return "";

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  let hour12 = hh;
  let ampm = "AM";
  if (hh === 0) {
    hour12 = 12;
    ampm = "AM";
  } else if (hh === 12) {
    hour12 = 12;
    ampm = "PM";
  } else if (hh > 12) {
    hour12 = hh - 12;
    ampm = "PM";
  }

  return `${pad2(d)} ${monthNames[m - 1]} ${y}, ${hour12}:${pad2(mm)} ${ampm}`;
}

export default function SubTaskAssignment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loadingSubTasks, setLoadingSubTasks] = useState(true);
  const [projectCode, setProjectCode] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [servicesHistory, setServicesHistory] = useState<ServiceGroup[][]>([]);
  const [pendingAction, setPendingAction] = useState<
    "next" | "back" | "browserBack" | null
  >(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const allowBrowserBackRef = useRef(false);

  const [subTaskCatalog, setSubTaskCatalog] = useState<
    Record<
      string,
      {
        mainTaskTitle: string;
        subTasks: { id: string; name: string; sortOrder: number }[];
      }
    >
  >({});

  const [pickerOpenForMainTaskId, setPickerOpenForMainTaskId] = useState<
    string | null
  >(null);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [createSubTaskModalOpen, setCreateSubTaskModalOpen] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  useEffect(() => {
    async function loadProjectSubTasks() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoadingSubTasks(false);
        return;
      }

      try {
        setLoadingSubTasks(true);

        const response = await fetch(
          `/api/planning/getProjectSubTasks?projectId=${projectId}`,
        );

        console.log("[SubTaskAssignment] response status:", response.status);

        const data = await response.json();

        console.log("[SubTaskAssignment] route response data:", data);

        if (!response.ok) {
          throw new Error(
            [
              data?.error || "Failed to load project subtasks.",
              data?.details || "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
        }

        const rows = Array.isArray(data?.projectSubTasks)
          ? data.projectSubTasks
          : [];

        setProjectCode(data?.project?.project_code ?? "");
        setProjectTitle(data?.project?.title ?? "");

        console.log("[SubTaskAssignment] rows from route:", rows);

        const groupedMap = new Map<string, ServiceGroup>();

        for (const row of rows) {
          const mainTask = row?.project_task?.main_task;
          const subTask = row?.sub_task;

          console.log("[SubTaskAssignment] row transform check:", {
            row,
            mainTask,
            subTask,
          });

          if (!mainTask || !subTask) continue;

          const groupId = mainTask.main_task_id;

          if (!groupedMap.has(groupId)) {
            groupedMap.set(groupId, {
              id: groupId,
              title: mainTask.name,
              scheduledAt: undefined,
              finishedAt: undefined,
              status: "pending",
              children: [],
            });
          }

          groupedMap.get(groupId)!.children.push({
            id: row.project_sub_task_id,
            subTaskId: row.sub_task_id,
            title: subTask.description,
            sortOrder: Number(subTask.sort_order ?? 0),
            scheduledAt: row.scheduled_start_datetime
              ? isoToPretty(String(row.scheduled_start_datetime).slice(0, 16))
              : undefined,
            finishedAt: row.actual_end_datetime
              ? isoToPretty(String(row.actual_end_datetime).slice(0, 16))
              : undefined,
            status:
              row.status === "done" ||
              row.status === "active" ||
              row.status === "pending"
                ? row.status
                : "pending",
            assignedTo: row.assigned_user?.username ?? "",
          });
        }

        const groupedServices = Array.from(groupedMap.values()).map(
          (group) => ({
            ...group,
            children: [...group.children].sort((a, b) => {
              const sortDiff = a.sortOrder - b.sortOrder;
              if (sortDiff !== 0) return sortDiff;
              return a.title.localeCompare(b.title);
            }),
          }),
        );

        console.log("[SubTaskAssignment] groupedServices:", groupedServices);

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project subtasks.");
      } finally {
        setLoadingSubTasks(false);
      }
    }

    loadProjectSubTasks();
  }, [projectId]);

  function pushServicesHistory() {
    setServicesHistory((prev) => [...prev, structuredClone(services)]);
  }

  function undoSubTaskChanges() {
    setServicesHistory((prev) => {
      if (prev.length === 0) return prev;

      const nextHistory = [...prev];
      const previousServices = nextHistory.pop();

      if (previousServices) {
        setServices(previousServices);
        setIsDirty(true);
      }

      return nextHistory;
    });
  }

  function requestLeave(action: "next" | "back" | "browserBack") {
    if (!isDirty) {
      if (action === "next") {
        setIsNavigatingNext(true);
        void handleConfirmSave(true, "next");
        return;
      }

      setIsNavigatingNext(false);

      if (action === "back") {
        void handleConfirmSave(true, "back");
        return;
      }

      if (action === "browserBack") {
        allowBrowserBackRef.current = true;
        window.history.back();
        return;
      }

      return;
    }

    if (action !== "next") {
      setIsNavigatingNext(false);
    }

    setPendingAction(action);
    setShowSaveConfirm(true);
  }

  function handleNext() {
    setIsNavigatingNext(true);
    requestLeave("next");
  }

  function handleOpenCreateSubTaskModal() {
    setCreateSubTaskModalOpen(true);
  }

  function handleCloseCreateSubTaskModal() {
    setCreateSubTaskModalOpen(false);
  }

  function handleGoBack() {
    if (!isDirty) {
      setIsNavigatingBack(true);
    }
    requestLeave("back");
  }

  async function handleConfirmSave(shouldSave: boolean, overrideAction?: "next" | "back" | "browserBack") {
    const action = overrideAction ?? pendingAction;
    if (!overrideAction) {
      setShowSaveConfirm(false);
      setPendingAction(null);
    }

    if (!action) return;

    if (shouldSave) {
      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          status: action === "back" ? "main_task_pending" : "materials_pending",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setIsNavigatingNext(false);
        setIsNavigatingBack(false);
        toast.error(data?.error || "Failed to update project status.");
        return;
      }

      setIsDirty(false);
    }

    if (action === "next") {
      window.location.href = `/admin/job-creation/materials-assignment?projectId=${projectId}`;
      return;
    }

    setIsNavigatingNext(false);

    if (action === "back") {
      window.location.href = `/admin/job-creation/main-task-assignment?projectId=${projectId}`;
      return;
    }

    if (action === "browserBack") {
      allowBrowserBackRef.current = true;
      window.history.back();
      return;
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isUndo =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";

      if (!isUndo) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTyping) return;

      event.preventDefault();
      undoSubTaskChanges();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [services]);

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);

    function handlePopState() {
      if (allowBrowserBackRef.current) return;

      if (!isDirty) {
        allowBrowserBackRef.current = true;
        window.history.back();
        return;
      }

      window.history.pushState(null, "", window.location.href);
      requestLeave("browserBack");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  useEffect(() => {
    async function loadSubTaskCatalog() {
      if (!projectId) return;

      try {
        const response = await fetch(
          `/api/planning/getProjectMainTaskSubTaskCatalog?projectId=${projectId}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load sub task catalog.");
        }

        const rows = Array.isArray(data?.catalog) ? data.catalog : [];

        const mapped = rows.reduce(
          (acc: any, row: any) => {
            const subTasks = Array.isArray(row.subTasks) ? row.subTasks : [];

            acc[row.mainTaskId] = {
              mainTaskTitle: row.mainTaskTitle ?? "",
              subTasks: [...subTasks]
                .map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
                }))
                .sort((a, b) => {
                  const sortDiff = a.sortOrder - b.sortOrder;
                  if (sortDiff !== 0) return sortDiff;
                  return a.name.localeCompare(b.name);
                }),
            };
            return acc;
          },
          {} as Record<
            string,
            {
              mainTaskTitle: string;
              subTasks: { id: string; name: string; sortOrder: number }[];
            }
          >,
        );

        setSubTaskCatalog(mapped);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load sub task catalog.");
      }
    }

    loadSubTaskCatalog();
  }, [projectId]);

  function handleOpenSubTaskPicker(mainTaskId: string) {
    const group = services.find((item) => item.id === mainTaskId);
    if (!group) return;

    setPickerSelectedIds(group.children.map((child) => child.subTaskId));
    setPickerOpenForMainTaskId(mainTaskId);
  }

  function handleTogglePickerSubTask(subTask: { id: string; name: string }) {
    setPickerSelectedIds((prev) =>
      prev.includes(subTask.id)
        ? prev.filter((id) => id !== subTask.id)
        : [subTask.id, ...prev],
    );
  }

  function handleCloseSubTaskPicker() {
    setPickerOpenForMainTaskId(null);
    setPickerSelectedIds([]);
  }

  async function handleCreateCatalogSubTask(payload: {
    description: string;
    sortOrder: string;
    defaultEquipmentIds: string[];
    defaultMaterialIds: string[];
  }) {
    if (!pickerOpenForMainTaskId) return;

    const response = await fetch("/api/planning/createSubTaskCatalogItem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mainTaskId: pickerOpenForMainTaskId,
        description: payload.description,
        sortOrder: payload.sortOrder,
        defaultEquipmentIds: payload.defaultEquipmentIds,
        defaultMaterialIds: payload.defaultMaterialIds,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data?.error || "Failed to create sub task.");
      return;
    }

    setSubTaskCatalog((prev) => {
      const current = prev[pickerOpenForMainTaskId];
      if (!current) return prev;

      return {
        ...prev,
        [pickerOpenForMainTaskId]: {
          ...current,
          subTasks: [
            {
              id: data.subTask.sub_task_id,
              name: data.subTask.description,
              sortOrder: Number(
                data.subTask.sort_order ?? payload.sortOrder ?? 0,
              ),
            },
            ...current.subTasks,
          ].sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            if (sortDiff !== 0) return sortDiff;
            return a.name.localeCompare(b.name);
          }),
        },
      };
    });

    toast.success("Sub task created.");
  }

  function handleSaveSubTaskPicker() {
    if (!pickerOpenForMainTaskId) return;

    const catalogEntry = subTaskCatalog[pickerOpenForMainTaskId];
    const catalogSubTasks = catalogEntry?.subTasks ?? [];

    pushServicesHistory();

    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== pickerOpenForMainTaskId) return group;

        const selectedSet = new Set(pickerSelectedIds);

        const orderedChildren = catalogSubTasks
          .filter((subTask) => selectedSet.has(subTask.id))
          .map((subTask): ServiceStep => {
            const existing = group.children.find(
              (child) => child.subTaskId === subTask.id,
            );

            return (
              existing ?? {
                id: `temp-${subTask.id}`,
                subTaskId: subTask.id,
                title: subTask.name,
                sortOrder: subTask.sortOrder,
                scheduledAt: "",
                finishedAt: "",
                status: "pending",
                assignedTo: "",
              }
            );
          });

        return {
          ...group,
          children: [...orderedChildren].sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            if (sortDiff !== 0) return sortDiff;
            return a.title.localeCompare(b.title);
          }),
        };
      }),
    );

    setIsDirty(true);
    handleCloseSubTaskPicker();
  }

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleOpenCreateTaskModal() {
    setCreateTaskModalOpen(true);
  }

  function handleCloseCreateTaskModal() {
    setCreateTaskModalOpen(false);
  }

  async function handleCreateTask(payload: {
    name: string;
    sortOrder: string;
    subTasks: {
      description: string;
      sortOrder: string;
      materialIds: string[];
      equipmentIds: string[];
    }[];
  }) {
    toast.message("Create Task is not connected to the database yet.");
  }

  function handleRemoveSelectedSubTask(mainTaskId: string, subTaskId: string) {
    pushServicesHistory();

    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== mainTaskId) return group;

        return {
          ...group,
          children: group.children.filter((child) => child.id !== subTaskId),
        };
      }),
    );

    setIsDirty(true);
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Sub Task Assignment</span>
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
                      Sub Task Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review and organize the subtasks under each main task.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Task Setup
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                <div className="space-y-2.5">
                  {loadingSubTasks ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      Loading subtasks...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      No subtasks found for this project.
                    </div>
                  ) : (
                    services.map((g) => {
                      const isOpen = expanded.has(g.id);

                      return (
                        <div
                          key={g.id}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroup(g.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleGroup(g.id);
                              }
                            }}
                            className={`flex w-full items-center justify-between px-4 py-3 text-left transition cursor-pointer ${
                              isOpen ? "bg-emerald-50/40" : "bg-white"
                            }`}>
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`h-9 w-[4px] rounded-full ${isOpen ? "opacity-100" : "opacity-0"}`}
                                style={{ backgroundColor: ACCENT }}
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-semibold text-gray-900">
                                    {g.title}
                                  </span>

                                  {isOpen && (
                                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-[2px] text-[10px] font-semibold text-emerald-700">
                                      MAIN TASK
                                    </span>
                                  )}
                                </div>

                                <div className="mt-[2px] text-[11px] text-gray-500">
                                  {g.children.length} sub task
                                  {g.children.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSubTaskPicker(g.id);
                              }}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition hover:brightness-95 shrink-0"
                              style={{
                                backgroundColor: ACCENT_SOFT,
                                color: ACCENT,
                              }}>
                              <Plus className="h-4 w-4" />
                              Add
                            </button>
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {g.children.length === 0 ? (
                                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                                  No selected sub tasks for this main task.
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                  <div className="divide-y divide-gray-200">
                                    {g.children.map((step, index) => (
                                      <div
                                        key={step.id}
                                        className="flex items-center gap-3 px-4 py-3">
                                        <div className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-600">
                                          {index + 1}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[13px] font-medium text-gray-800">
                                            {step.title}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveSelectedSubTask(
                                              g.id,
                                              step.id,
                                            )
                                          }
                                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition duration-150 hover:bg-red-100 hover:text-red-600 active:scale-95"
                                          aria-label="Remove sub task"
                                          title="Remove">
                                          <X className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="h-6" />
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">
                  Sub Task Assignment
                </div>
                <div className="mt-1 text-[12px] text-gray-500">
                  Review and organize the subtasks under each main task.
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4">
                <button
                  type="button"
                  onClick={handleOpenCreateTaskModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold transition hover:brightness-95"
                  style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="sub_task" />
            </div>
          </aside>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transition duration-150 hover:bg-gray-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70">
            {isNavigatingBack ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isNavigatingNext}
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transition duration-150 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: ACCENT }}>
            {isNavigatingNext ? (
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
                Do you want to save your sub task changes to the database before
                leaving this page?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowSaveConfirm(false);
                  setPendingAction(null);
                  setIsNavigatingNext(false);
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                Don't Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: ACCENT }}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SubTaskPickerModal
        open={!!pickerOpenForMainTaskId}
        mainTaskTitle={
          pickerOpenForMainTaskId
            ? (subTaskCatalog[pickerOpenForMainTaskId]?.mainTaskTitle ?? "")
            : ""
        }
        subTasks={
          pickerOpenForMainTaskId
            ? (subTaskCatalog[pickerOpenForMainTaskId]?.subTasks ?? [])
            : []
        }
        selectedIds={pickerSelectedIds}
        onToggle={handleTogglePickerSubTask}
        onClose={handleCloseSubTaskPicker}
        onSave={handleSaveSubTaskPicker}
        onOpenCreateModal={handleOpenCreateSubTaskModal}
      />

      <CreateSubTaskModal
        open={createSubTaskModalOpen}
        mainTaskTitle={
          pickerOpenForMainTaskId
            ? (subTaskCatalog[pickerOpenForMainTaskId]?.mainTaskTitle ?? "")
            : ""
        }
        onClose={handleCloseCreateSubTaskModal}
        onCreate={handleCreateCatalogSubTask}
      />

      <CreateTaskModal
        open={createTaskModalOpen}
        onClose={handleCloseCreateTaskModal}
        onSave={handleCreateTask}
      />

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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] font-semibold text-gray-700">{children}</div>
  );
}

function Value({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-[13px] text-gray-400 ${className}`}>
      {children ?? ""}
    </div>
  );
}
