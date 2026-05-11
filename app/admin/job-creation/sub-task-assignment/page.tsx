"use client";

import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Plus,
  X,
  GripVertical,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import {
  getCachedSubTasks,
  setCachedSubTasks,
  setCachedStep,
  getCachedProjectMeta,
  getCachedMainTasks,
  ensureWizardCacheHydrated,
  markWizardDirty,
  type CachedSubTask,
} from "@/lib/wizardCache";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import SubTaskPickerModal from "@/components/project-creation/SubTaskPickerModal";
import CreateSubTaskModal from "@/components/project-creation/CreateSubTaskModal";
import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";

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
  projectTaskId: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  children: ServiceStep[];
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";
const ACCENT_BORDER = "#b7efcf";

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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  let hour12 = hh;
  let ampm = "AM";
  if (hh === 0) { hour12 = 12; ampm = "AM"; }
  else if (hh === 12) { hour12 = 12; ampm = "PM"; }
  else if (hh > 12) { hour12 = hh - 12; ampm = "PM"; }

  return `${pad2(d)} ${monthNames[m - 1]} ${y}, ${hour12}:${pad2(mm)} ${ampm}`;
}

export default function SubTaskAssignment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/main-task-assignment");
    router.prefetch("/admin/job-creation/materials-assignment");
  }, [router]);

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loadingSubTasks, setLoadingSubTasks] = useState(true);
  const [projectCode, setProjectCode] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [servicesHistory, setServicesHistory] = useState<ServiceGroup[][]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [subTaskCatalog, setSubTaskCatalog] = useState<
    Record<
      string,
      {
        mainTaskTitle: string;
        subTasks: { id: string; name: string; sortOrder: number }[];
      }
    >
  >({});

  const [pickerOpenForMainTaskId, setPickerOpenForMainTaskId] = useState<string | null>(null);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [createSubTaskModalOpen, setCreateSubTaskModalOpen] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [subTaskPendingDelete, setSubTaskPendingDelete] = useState<{
    mainTaskId: string;
    subTaskId: string;
    title: string;
  } | null>(null);
  const [selectedSubTaskKeysForDelete, setSelectedSubTaskKeysForDelete] =
    useState<Set<string>>(new Set());
  const [bulkDeleteForGroupId, setBulkDeleteForGroupId] = useState<string | null>(null);

  function getSelectedKeysForGroup(groupId: string) {
    const prefix = `${groupId}::`;
    return new Set(
      Array.from(selectedSubTaskKeysForDelete).filter((key) =>
        key.startsWith(prefix),
      ),
    );
  }

  // drag-and-drop state (tracks group + index)
  const [dragState, setDragState] = useState<{ groupId: string; index: number } | null>(null);
  const [dragOverState, setDragOverState] = useState<{ groupId: string; index: number } | null>(null);

  // ── drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(groupId: string, index: number) {
    setDragState({ groupId, index });
  }

  function handleDragOver(e: React.DragEvent, groupId: string, index: number) {
    e.preventDefault();
    if (!dragOverState || dragOverState.groupId !== groupId || dragOverState.index !== index) {
      setDragOverState({ groupId, index });
    }
  }

  function handleDrop(targetGroupId: string, targetIndex: number) {
    if (!dragState || dragState.groupId !== targetGroupId) {
      setDragState(null);
      setDragOverState(null);
      return;
    }

    const sourceIndex = dragState.index;

    if (sourceIndex !== targetIndex) {
      pushServicesHistory();
      setServices((prev) =>
        prev.map((group) => {
          if (group.id !== targetGroupId) return group;
          const next = [...group.children];
          const [moved] = next.splice(sourceIndex, 1);
          next.splice(targetIndex, 0, moved);
          return { ...group, children: next };
        }),
      );
      setIsDirty(true); markWizardDirty(projectId);
    }

    setDragState(null);
    setDragOverState(null);
  }

  function handleDragEnd() {
    setDragState(null);
    setDragOverState(null);
  }

  // ── load project subtasks ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadProjectSubTasks() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoadingSubTasks(false);
        return;
      }

      await ensureWizardCacheHydrated(projectId);

      // ── Cache-first: check wizard cache for subtasks ──
      const cachedSubTasks = getCachedSubTasks(projectId);
      const meta = getCachedProjectMeta(projectId);
      const cachedMainTasks = getCachedMainTasks(projectId);

      if (cachedSubTasks && cachedSubTasks.length > 0) {
        setProjectCode(meta?.projectCode ?? "");
        setProjectTitle(meta?.projectTitle ?? "");

        // Build ServiceGroup[] from cached subtasks
        const groupedMap = new Map<string, ServiceGroup>();

        for (const cached of cachedSubTasks) {
          const groupId = cached.mainTaskId;

          if (!groupedMap.has(groupId)) {
            // Find the main task title from cachedMainTasks
            const mainTaskName =
              cachedMainTasks?.find((t) => t.id === groupId)?.name ?? "";
            groupedMap.set(groupId, {
              id: groupId,
              projectTaskId: cached.projectTaskId,
              title: mainTaskName,
              scheduledAt: undefined,
              finishedAt: undefined,
              status: "pending",
              children: [],
            });
          }

          groupedMap.get(groupId)!.children.push({
            id: cached.id,
            subTaskId: cached.subTaskId,
            title: cached.title,
            sortOrder: cached.sortOrder,
            scheduledAt: cached.scheduledStartDatetime
              ? isoToPretty(cached.scheduledStartDatetime.slice(0, 16))
              : undefined,
            finishedAt: cached.scheduledEndDatetime
              ? isoToPretty(cached.scheduledEndDatetime.slice(0, 16))
              : undefined,
            status: "pending",
            assignedTo: "",
          });
        }

        const groupedServices = Array.from(groupedMap.values()).map((group) => ({
          ...group,
          children: [...group.children].sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            return sortDiff !== 0 ? sortDiff : a.title.localeCompare(b.title);
          }),
        }));

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
        setLoadingSubTasks(false);
        return;
      }

      // ── Cache miss — fetch from API ──
      try {
        setLoadingSubTasks(true);

        const response = await fetch(
          `/api/planning/getProjectSubTasks?projectId=${projectId}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            [data?.error || "Failed to load project subtasks.", data?.details || ""]
              .filter(Boolean)
              .join("\n\n"),
          );
        }

        const rows = Array.isArray(data?.projectSubTasks) ? data.projectSubTasks : [];

        setProjectCode(data?.project?.project_code ?? "");
        setProjectTitle(data?.project?.title ?? "");

        const groupedMap = new Map<string, ServiceGroup>();

        for (const row of rows) {
          const mainTask = row?.project_task?.main_task;
          const subTask = row?.sub_task;
          if (!mainTask || !subTask) continue;

          const groupId = mainTask.main_task_id;

          if (!groupedMap.has(groupId)) {
            groupedMap.set(groupId, {
              id: groupId,
              projectTaskId: row.project_task_id,
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
              row.status === "done" || row.status === "active" || row.status === "pending"
                ? row.status
                : "pending",
            assignedTo: row.assigned_user?.username ?? "",
          });
        }

        const groupedServices = Array.from(groupedMap.values()).map((group) => ({
          ...group,
          children: [...group.children].sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            return sortDiff !== 0 ? sortDiff : a.title.localeCompare(b.title);
          }),
        }));

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));

        // Populate cache for future visits. Critical: preserve any
        // equipment that's already in the cache from a prior hydrate —
        // overwriting with `[]` here is what wiped equipment in the
        // wizard flow before. Same pattern as buildSubTasksForCache.
        const existingCacheById = new Map(
          (getCachedSubTasks(projectId) ?? []).map((st) => [st.id, st]),
        );
        const subTasksForCache: CachedSubTask[] = groupedServices.flatMap((group) =>
          group.children.map((child) => {
            const prev = existingCacheById.get(child.id);
            return {
              id: child.id,
              subTaskId: child.subTaskId,
              mainTaskId: group.id,
              projectTaskId: group.projectTaskId,
              title: child.title,
              sortOrder: child.sortOrder,
              estimatedHours: prev?.estimatedHours ?? null,
              scheduledStartDatetime: prev?.scheduledStartDatetime ?? null,
              scheduledEndDatetime: prev?.scheduledEndDatetime ?? null,
              assignedEmployeeIds: prev?.assignedEmployeeIds ?? [],
              equipments: prev?.equipments ?? [],
            };
          }),
        );
        setCachedSubTasks(projectId, subTasksForCache);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project subtasks.");
      } finally {
        setLoadingSubTasks(false);
      }
    }

    loadProjectSubTasks();
  }, [projectId]);

  // ── load sub-task catalog ──────────────────────────────────────────────────
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
                  return sortDiff !== 0 ? sortDiff : a.name.localeCompare(b.name);
                }),
            };
            return acc;
          },
          {} as Record<
            string,
            { mainTaskTitle: string; subTasks: { id: string; name: string; sortOrder: number }[] }
          >,
        );

        setSubTaskCatalog(mapped);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load sub task catalog.");
      }
    }

    loadSubTaskCatalog();
  }, [projectId]);

  // ── keyboard undo ──────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
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

  // ── helpers ────────────────────────────────────────────────────────────────
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
        setIsDirty(true); markWizardDirty(projectId);
      }
      return nextHistory;
    });
  }

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleRemoveSelectedSubTask(mainTaskId: string, subTaskId: string) {
    pushServicesHistory();
    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== mainTaskId) return group;
        return { ...group, children: group.children.filter((child) => child.id !== subTaskId) };
      }),
    );
    setSelectedSubTaskKeysForDelete((prev) => {
      const next = new Set(prev);
      next.delete(`${mainTaskId}::${subTaskId}`);
      return next;
    });
    setIsDirty(true); markWizardDirty(projectId);
  }

  function handleRemoveSelectedSubTasks(keys: Set<string>) {
    if (keys.size === 0) return;
    pushServicesHistory();
    setServices((prev) =>
      prev.map((group) => ({
        ...group,
        children: group.children.filter(
          (child) => !keys.has(`${group.id}::${child.id}`),
        ),
      })),
    );
    setSelectedSubTaskKeysForDelete(new Set());
    setIsDirty(true); markWizardDirty(projectId);
  }

  function toggleSubTaskDeleteSelection(mainTaskId: string, subTaskId: string) {
    const key = `${mainTaskId}::${subTaskId}`;
    setSelectedSubTaskKeysForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── sub-task picker ────────────────────────────────────────────────────────
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
            const existing = group.children.find((child) => child.subTaskId === subTask.id);
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
            return sortDiff !== 0 ? sortDiff : a.title.localeCompare(b.title);
          }),
        };
      }),
    );

    setIsDirty(true); markWizardDirty(projectId);
    handleCloseSubTaskPicker();
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
      headers: { "Content-Type": "application/json" },
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
              sortOrder: Number(data.subTask.sort_order ?? payload.sortOrder ?? 0),
            },
            ...current.subTasks,
          ].sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            return sortDiff !== 0 ? sortDiff : a.name.localeCompare(b.name);
          }),
        },
      };
    });

    toast.success("Sub task created.");
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  function handleNext() {
    setIsNavigatingNext(true);
    setCachedSubTasks(projectId, buildSubTasksForCache());
    setIsDirty(false);
    setCachedStep(projectId, "materials_pending");
    setOptimisticProjectStatus(projectId, "materials_pending");
    router.push(`/admin/job-creation/materials-assignment?projectId=${projectId}`);
  }

  function handleGoBack() {
    setIsNavigatingBack(true);
    setCachedSubTasks(projectId, buildSubTasksForCache());
    setIsDirty(false);
    setCachedStep(projectId, "main_task_pending");
    setOptimisticProjectStatus(projectId, "main_task_pending");
    router.push(`/admin/job-creation/main-task-assignment?projectId=${projectId}`);
  }

  /** Build CachedSubTask[] from current services state, preserving fields managed by other pages */
  function buildSubTasksForCache(): CachedSubTask[] {
    const existing = getCachedSubTasks(projectId);
    const existingMap = new Map(existing?.map((st) => [st.id, st]) ?? []);

    return services.flatMap((group) =>
      group.children.map((child, index) => {
        const prev = existingMap.get(child.id);
        return {
          id: child.id,
          subTaskId: child.subTaskId,
          mainTaskId: group.id,
          projectTaskId: group.projectTaskId,
          title: child.title,
          sortOrder: index,
          estimatedHours: prev?.estimatedHours ?? null,
          scheduledStartDatetime: prev?.scheduledStartDatetime ?? null,
          scheduledEndDatetime: prev?.scheduledEndDatetime ?? null,
          assignedEmployeeIds: prev?.assignedEmployeeIds ?? [],
          equipments: prev?.equipments ?? [],
        };
      }),
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        {/* header */}
        <div className="flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold text-slate-900 dark:text-slate-100">
          <span>Project</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-500" aria-hidden />
          <span>Sub Task Assignment</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* main section */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 shadow-sm dark:border-slate-700">
            <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

            <div className="shrink-0 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sub Task Assignment</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Add and order the subtasks under each main task. Drag to reorder.
                  </p>
                </div>

                <div
                  className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Task Setup
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="green-scrollbar h-full overflow-y-auto pr-2">
                <div className="space-y-2.5">
                  {loadingSubTasks ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm dark:border-slate-700">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-700 dark:text-slate-200" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          Loading subtasks...
                        </span>
                      </div>
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No subtasks found for this project.
                    </div>
                  ) : (
                    services.map((g) => {
                      const isOpen = expanded.has(g.id);
                      const selectedForGroup = getSelectedKeysForGroup(g.id);

                      return (
                        <div
                          key={g.id}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700">
                          {/* group header */}
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
                            className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/50 dark:bg-emerald-500/10" : "bg-white dark:bg-slate-900"
                            }`}>
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`h-9 w-1 rounded-full transition ${isOpen ? "opacity-100" : "opacity-0"}`}
                                style={{ backgroundColor: ACCENT }}
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                    {g.title}
                                  </span>
                                  {isOpen && (
                                    <span
                                      className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                      MAIN TASK
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {g.children.length} sub task{g.children.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {selectedForGroup.size > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBulkDeleteForGroupId(g.id);
                                  }}
                                  className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                >
                                  Remove ({selectedForGroup.size})
                                </button>
                              ) : null}

                              {/* Add button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenSubTaskPicker(g.id);
                                }}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[12px] font-semibold text-emerald-600 transition hover:brightness-95 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                <Plus className="h-3.5 w-3.5" />
                                Add
                              </button>
                            </div>
                          </div>

                          {/* sub-task list */}
                          {isOpen && (
                            <div className="px-5 pb-4">
                              {g.children.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 py-6 text-center">
                                  <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                                    No sub tasks added yet
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-gray-400">
                                    Click &quot;Add&quot; above to select sub tasks.
                                  </p>
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700">
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {g.children.map((step, index) => {
                                      const isDragging =
                                        dragState?.groupId === g.id &&
                                        dragState?.index === index;
                                      const isOver =
                                        dragOverState?.groupId === g.id &&
                                        dragOverState?.index === index &&
                                        !(dragState?.groupId === g.id && dragState?.index === index);

                                      return (
                                        <div
                                          key={step.id}
                                          draggable
                                          onDragStart={() => handleDragStart(g.id, index)}
                                          onDragOver={(e) => handleDragOver(e, g.id, index)}
                                          onDrop={() => handleDrop(g.id, index)}
                                          onDragEnd={handleDragEnd}
                                          className={[
                                            "flex items-center gap-3 px-4 py-2.5 transition select-none cursor-grab active:cursor-grabbing",
                                            isDragging
                                              ? "opacity-40"
                                              : isOver
                                              ? "bg-emerald-50 border-l-2 border-l-green-400"
                                              : "hover:bg-slate-50 dark:hover:bg-slate-800/80",
                                          ].join(" ")}>
                                          {/* sort number */}
                                          <label className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
                                            <input
                                              type="checkbox"
                                              checked={selectedSubTaskKeysForDelete.has(
                                                `${g.id}::${step.id}`,
                                              )}
                                              onChange={() =>
                                                toggleSubTaskDeleteSelection(
                                                  g.id,
                                                  step.id,
                                                )
                                              }
                                              className="h-4 w-4 rounded border-slate-300 bg-transparent accent-[#00c065] dark:border-slate-600 dark:bg-transparent"
                                              aria-label={`Select ${step.title} for deletion`}
                                            />
                                          </label>
                                          <span
                                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                            {index + 1}
                                          </span>

                                          {/* grip */}
                                          <GripVertical className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-500" />

                                          {/* title */}
                                          <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                            {step.title}
                                          </div>

                                          {/* remove */}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setSubTaskPendingDelete({
                                                mainTaskId: g.id,
                                                subTaskId: step.id,
                                                title: step.title,
                                              })
                                            }
                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-500 transition hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                                            aria-label={`Remove ${step.title}`}>
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      );
                                    })}
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
              </div>
            </div>
          </section>

          {/* sidebar */}
          <aside className="flex h-full min-h-0 flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  {projectCode || "Sub Task Assignment"}
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  {projectTitle || "Review and organize subtasks under each main task."}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="sub_task" />
            </div>
          </aside>
        </div>

        {/* footer nav */}
        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            {isNavigatingBack ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go Back"}
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
        onOpenCreateModal={() => setCreateSubTaskModalOpen(true)}
      />

      <CreateSubTaskModal
        open={createSubTaskModalOpen}
        mainTaskTitle={
          pickerOpenForMainTaskId
            ? (subTaskCatalog[pickerOpenForMainTaskId]?.mainTaskTitle ?? "")
            : ""
        }
        onClose={() => setCreateSubTaskModalOpen(false)}
        onCreate={handleCreateCatalogSubTask}
      />

      <ConfirmDeleteModal
        open={Boolean(subTaskPendingDelete)}
        title="Remove subtask?"
        description={
          subTaskPendingDelete
            ? `Remove "${subTaskPendingDelete.title}" from this project?`
            : "Remove this subtask from this project?"
        }
        confirmLabel="Remove"
        onCancel={() => setSubTaskPendingDelete(null)}
        onConfirm={() => {
          if (subTaskPendingDelete) {
            handleRemoveSelectedSubTask(
              subTaskPendingDelete.mainTaskId,
              subTaskPendingDelete.subTaskId,
            );
          }
          setSubTaskPendingDelete(null);
        }}
      />

      <ConfirmDeleteModal
        open={Boolean(bulkDeleteForGroupId)}
        title="Remove selected subtasks?"
        description={`Remove ${bulkDeleteForGroupId ? getSelectedKeysForGroup(bulkDeleteForGroupId).size : 0} selected subtask${
          (bulkDeleteForGroupId ? getSelectedKeysForGroup(bulkDeleteForGroupId).size : 0) === 1 ? "" : "s"
        } from this project?`}
        confirmLabel="Remove selected"
        onCancel={() => setBulkDeleteForGroupId(null)}
        onConfirm={() => {
          if (bulkDeleteForGroupId) {
            handleRemoveSelectedSubTasks(getSelectedKeysForGroup(bulkDeleteForGroupId));
          }
          setBulkDeleteForGroupId(null);
        }}
      />

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

        /* Dark-mode polish for imported modals used on this page.
           These are UI-only overrides for modal buttons/controls that still use white classes internally. */
        .dark .fixed.inset-0 button[class*="bg-white"],
        .dark .fixed.inset-0 button[class*="border-gray-200"],
        .dark .fixed.inset-0 button[class*="border-slate-200"] {
          background-color: #0f172a !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-white"]:hover,
        .dark .fixed.inset-0 button[class*="border-gray-200"]:hover,
        .dark .fixed.inset-0 button[class*="border-slate-200"]:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }

        .dark .fixed.inset-0 button[class*="bg-emerald-50"],
        .dark .fixed.inset-0 button[class*="text-emerald"],
        .dark .fixed.inset-0 button[class*="text-green"] {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
          color: #6ee7b7 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-emerald-50"]:hover,
        .dark .fixed.inset-0 button[class*="text-emerald"]:hover,
        .dark .fixed.inset-0 button[class*="text-green"]:hover {
          background-color: rgba(16, 185, 129, 0.24) !important;
          color: #a7f3d0 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-red-50"],
        .dark .fixed.inset-0 button[class*="bg-rose-50"],
        .dark .fixed.inset-0 button[class*="text-red"],
        .dark .fixed.inset-0 button[class*="text-rose"] {
          background-color: rgba(244, 63, 94, 0.14) !important;
          border-color: rgba(244, 63, 94, 0.38) !important;
          color: #fda4af !important;
        }

        .dark .fixed.inset-0 button[class*="bg-red-50"]:hover,
        .dark .fixed.inset-0 button[class*="bg-rose-50"]:hover,
        .dark .fixed.inset-0 button[class*="text-red"]:hover,
        .dark .fixed.inset-0 button[class*="text-rose"]:hover {
          background-color: rgba(244, 63, 94, 0.22) !important;
          color: #fecdd3 !important;
        }

        .dark .fixed.inset-0 input,
        .dark .fixed.inset-0 textarea,
        .dark .fixed.inset-0 select {
          background-color: #0f172a !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark .fixed.inset-0 input::placeholder,
        .dark .fixed.inset-0 textarea::placeholder {
          color: #94a3b8 !important;
        }
      `}</style>
    </div>
  );
}
