"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import AddEquipmentModal, {
  EquipmentCatalogItem,
} from "@/components/project-creation/AddEquipmentModal";
import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";

type StepStatus = "done" | "active" | "pending";

type AssignedEquipment = {
  id: string;
  equipmentId?: string | null;
  name: string;
  quantity: number;
  unitCost?: number | null;
};

type ServiceStep = {
  id: string;
  subTaskId: string;
  title: string;
  status: "pending" | "active" | "done";
  assignedTo?: string;
  equipments: AssignedEquipment[];
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  children: ServiceStep[];
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";

export default function EquipmentAssignmentPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "next" | "back" | "browserBack" | null
  >(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [equipmentPendingDelete, setEquipmentPendingDelete] = useState<{
    mainTaskId: string;
    subTaskId: string;
    equipmentId: string;
    name: string;
  } | null>(null);
  const [selectedEquipmentKeysForDelete, setSelectedEquipmentKeysForDelete] =
    useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<{
    mainTaskId: string;
    subTaskId: string;
  } | null>(null);

  const allowBrowserBackRef = useRef(false);
  const suppressLeaveGuardRef = useRef(false);
  // Tracks which subtasks the user actually modified, so Save only sends
  // those rows instead of UPDATE'ing every subtask in the project.
  const dirtySubTaskIdsRef = useRef<Set<string>>(new Set());

  const [equipmentCatalog, setEquipmentCatalog] = useState<
    EquipmentCatalogItem[]
  >([]);
  const [equipmentModalState, setEquipmentModalState] = useState<{
    open: boolean;
    mainTaskId: string;
    mainTaskTitle: string;
    subTaskId: string;
    subTaskTitle: string;
  }>({
    open: false,
    mainTaskId: "",
    mainTaskTitle: "",
    subTaskId: "",
    subTaskTitle: "",
  });

  useEffect(() => {
    async function loadProjectSubTaskEquipment() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `/api/planning/getProjectSubTaskEquipment?projectId=${projectId}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Failed to load project subtask equipment.",
          );
        }

        const rows = Array.isArray(data?.projectSubTaskEquipment)
          ? data.projectSubTaskEquipment
          : [];

        const groupedMap = new Map<string, ServiceGroup>();

        for (const row of rows) {
          const mainTask = row?.project_task?.main_task;
          const subTask = row?.sub_task;

          if (!mainTask || !subTask) continue;

          const groupId = mainTask.main_task_id;

          if (!groupedMap.has(groupId)) {
            groupedMap.set(groupId, {
              id: groupId,
              title: mainTask.name,
              status: "pending",
              children: [],
            });
          }

          groupedMap.get(groupId)!.children.push({
            id: row.project_sub_task_id,
            subTaskId: row.sub_task_id,
            title: subTask.description,
            status:
              row.status === "done" ||
              row.status === "active" ||
              row.status === "pending"
                ? row.status
                : "pending",
            assignedTo: row.assigned_user?.username ?? "",
            equipments: Array.isArray(row.equipments)
              ? row.equipments.map((item: any) => ({
                  id: item.id,
                  equipmentId: item.equipmentId ?? null,
                  name: item.name,
                  quantity: Number(item.quantity ?? 1),
                  unitCost: Number(item.unitCost ?? 0),
                }))
              : [],
          });
        }

        const groupedServices = Array.from(groupedMap.values()).map((group) => ({
          ...group,
          children: [...group.children].sort((a, b) =>
            a.title.localeCompare(b.title),
          ),
        }));

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
      } catch (error: any) {
        toast.error(
          error?.message || "Failed to load project subtask equipment.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadProjectSubTaskEquipment();
  }, [projectId]);

  useEffect(() => {
    async function loadEquipmentCatalog() {
      try {
        const response = await fetch("/api/planning/getEquipmentCatalog");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load equipment catalog.");
        }

        setEquipmentCatalog(Array.isArray(data?.equipment) ? data.equipment : []);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load equipment catalog.");
        setEquipmentCatalog([]);
      }
    }

    loadEquipmentCatalog();
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (suppressLeaveGuardRef.current) return;
      if (!isDirty) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

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

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function clearLeaveButtonLoading() {
    setIsNavigatingNext(false);
    setIsNavigatingBack(false);
  }

  function setLeaveButtonLoading(action: "next" | "back" | "browserBack") {
    setIsNavigatingNext(action === "next");
    setIsNavigatingBack(action === "back");
  }

  function requestLeave(action: "next" | "back" | "browserBack") {
    if (!isDirty) {
      if (action === "next") {
        setIsNavigatingNext(true);
        void handleConfirmSave(true, "next");
        return;
      }

      if (action === "back") {
        setIsNavigatingBack(true);
        void (async () => {
          const ok = await updateProjectStatus("materials_pending");
          if (!ok) {
            setIsNavigatingBack(false);
            return;
          }
          suppressLeaveGuardRef.current = true;
          allowBrowserBackRef.current = true;
          window.location.href = `/admin/job-creation/materials-assignment?projectId=${projectId}`;
        })();
        return;
      }

      if (action === "browserBack") {
        allowBrowserBackRef.current = true;
        window.history.back();
        return;
      }

      return;
    }

    clearLeaveButtonLoading();
    setPendingAction(action);
    setShowSaveConfirm(true);
  }

  function handleNext() {
    requestLeave("next");
  }

  function handleGoBack() {
    requestLeave("back");
  }

  async function handleConfirmSave(shouldSave: boolean, overrideAction?: "next" | "back" | "browserBack") {
    const action = overrideAction ?? pendingAction;
    if (!overrideAction) {
      setShowSaveConfirm(false);
      setPendingAction(null);
    }

    if (!action) return;

    setLeaveButtonLoading(action);

    if (shouldSave) {
      const dirtyIds = dirtySubTaskIdsRef.current;
      const projectSubTasks = services.flatMap((group) =>
        group.children
          .filter((step) => dirtyIds.has(step.id))
          .map((step) => ({
            project_sub_task_id: step.id,
            equipments: step.equipments.map((item) => ({
              id: item.id,
              equipmentId: item.equipmentId ?? null,
              name: item.name,
              quantity: Number(item.quantity ?? 1),
            })),
          })),
      );

      const nextStatus =
        action === "back" ? "materials_pending" : "schedule_pending";

      // Only dirty subtasks + the status flip are sent. The API runs both in
      // a single Promise.all server-side, so this is one round-trip.
      const saveResponse = await fetch(
        "/api/planning/saveProjectSubTaskEquipment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, nextStatus, projectSubTasks }),
        },
      );

      const saveData = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        clearLeaveButtonLoading();
        toast.error(saveData?.error || "Failed to save equipment assignment.");
        return;
      }

      dirtySubTaskIdsRef.current = new Set();
      setIsDirty(false);
    }

    suppressLeaveGuardRef.current = true;
    allowBrowserBackRef.current = true;

    // Match main-task-assignment / sub-task-assignment: full-page nav via
    // window.location.href. Browser shows its native loading state instead of
    // an in-app spinner that sits while Next.js JIT-compiles the destination
    // (which is what was making router.push feel like minutes of waiting).
    if (action === "next") {
      window.location.href = `/admin/job-creation/project-schedule?projectId=${projectId}`;
      return;
    }

    if (action === "back") {
      window.location.href = `/admin/job-creation/materials-assignment?projectId=${projectId}`;
      return;
    }

    clearLeaveButtonLoading();

    if (action === "browserBack") {
      window.history.back();
      return;
    }
  }

  function openEquipmentModal(mainTaskId: string, subTaskId: string) {
    const group = services.find((item) => item.id === mainTaskId);
    const step = group?.children.find((item) => item.id === subTaskId);
    if (!group || !step) return;

    setEquipmentModalState({
      open: true,
      mainTaskId,
      mainTaskTitle: group.title,
      subTaskId,
      subTaskTitle: step.title,
    });
  }

  function closeEquipmentModal() {
    setEquipmentModalState({
      open: false,
      mainTaskId: "",
      mainTaskTitle: "",
      subTaskId: "",
      subTaskTitle: "",
    });
  }

  function handleAddEquipmentToSubTask(item: EquipmentCatalogItem) {
    if (!equipmentModalState.mainTaskId || !equipmentModalState.subTaskId) {
      toast.error("No sub task selected.");
      return;
    }

    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== equipmentModalState.mainTaskId) return group;

        return {
          ...group,
          children: group.children.map((step) => {
            if (step.id !== equipmentModalState.subTaskId) return step;
            if (
              step.equipments.some(
                (equipment) => (equipment.equipmentId ?? equipment.id) === item.id,
              )
            ) {
              return step;
            }

            return {
              ...step,
              equipments: [
                ...step.equipments,
                {
                  id: item.id,
                  equipmentId: item.id,
                  name: item.name,
                  quantity: 1,
                  unitCost: item.unitCost ?? null,
                },
              ],
            };
          }),
        };
      }),
    );

    dirtySubTaskIdsRef.current.add(equipmentModalState.subTaskId);
    setIsDirty(true);
  }

  function removeSelectedEquipment(keys: Set<string>) {
    if (keys.size === 0) return;

    setServices((prev) =>
      prev.map((group) => ({
        ...group,
        children: group.children.map((step) => ({
          ...step,
          equipments: step.equipments.filter(
            (equipment) =>
              !keys.has(`${group.id}::${step.id}::${equipment.id}`),
          ),
        })),
      })),
    );

    for (const key of keys) {
      const parts = key.split("::");
      if (parts.length >= 2) dirtySubTaskIdsRef.current.add(parts[1]);
    }

    // Drop only the keys we just deleted from the global selection — leave
    // selections in other sub tasks intact so each sub task keeps its own
    // bulk-delete scope.
    setSelectedEquipmentKeysForDelete((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
    setIsDirty(true);
  }

  function toggleEquipmentDeleteSelection(
    mainTaskId: string,
    subTaskId: string,
    equipmentId: string,
  ) {
    const key = `${mainTaskId}::${subTaskId}::${equipmentId}`;
    setSelectedEquipmentKeysForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleRemoveEquipmentFromModal(equipmentId: string) {
    if (!equipmentModalState.mainTaskId || !equipmentModalState.subTaskId) {
      toast.error("No sub task selected.");
      return;
    }

    const equipment = services
      .find((group) => group.id === equipmentModalState.mainTaskId)
      ?.children.find((step) => step.id === equipmentModalState.subTaskId)
      ?.equipments.find((item) => (item.equipmentId ?? item.id) === equipmentId);

    setEquipmentPendingDelete({
      mainTaskId: equipmentModalState.mainTaskId,
      subTaskId: equipmentModalState.subTaskId,
      equipmentId: equipment?.id || equipmentId,
      name: equipment?.name || "this equipment",
    });
  }

  function updateEquipmentQuantity(
    mainTaskId: string,
    subTaskId: string,
    equipmentId: string,
    quantity: number,
  ) {
    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== mainTaskId) return group;

        return {
          ...group,
          children: group.children.map((step) => {
            if (step.id !== subTaskId) return step;

            return {
              ...step,
              equipments: step.equipments.map((item) =>
                item.id === equipmentId
                  ? { ...item, quantity: Math.max(1, quantity || 1) }
                  : item,
              ),
            };
          }),
        };
      }),
    );

    setSelectedEquipmentKeysForDelete((prev) => {
      const next = new Set(prev);
      next.delete(`${mainTaskId}::${subTaskId}::${equipmentId}`);
      return next;
    });
    dirtySubTaskIdsRef.current.add(subTaskId);
    setIsDirty(true);
  }

  function removeAssignedEquipment(
    mainTaskId: string,
    subTaskId: string,
    equipmentId: string,
  ) {
    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== mainTaskId) return group;

        return {
          ...group,
          children: group.children.map((step) => {
            if (step.id !== subTaskId) return step;

            return {
              ...step,
              equipments: step.equipments.filter(
                (item) => item.id !== equipmentId,
              ),
            };
          }),
        };
      }),
    );

    dirtySubTaskIdsRef.current.add(subTaskId);
    setIsDirty(true);
  }

  async function updateProjectStatus(status: string) {
    const response = await fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data?.error || "Failed to update project status.");
      return false;
    }
    return true;
  }

  const totalAssignedEquipment = useMemo(() => {
    return services.reduce(
      (sum, group) =>
        sum +
        group.children.reduce(
          (childSum, step) => childSum + step.equipments.length,
          0,
        ),
      0,
    );
  }, [services]);

  // Bulk-delete selections are scoped per sub task — keys look like
  // "mainTaskId::subTaskId::equipmentId", so we group by the
  // "mainTaskId::subTaskId" prefix so each sub task's "Remove (N)" button
  // only counts and removes its own checked equipment rows.
  const selectedKeysBySubTask = useMemo(() => {
    const bySubTask = new Map<string, Set<string>>();
    for (const key of selectedEquipmentKeysForDelete) {
      const parts = key.split("::");
      if (parts.length < 3) continue;
      const subTaskKey = `${parts[0]}::${parts[1]}`;
      const set = bySubTask.get(subTaskKey) ?? new Set<string>();
      set.add(key);
      bySubTask.set(subTaskKey, set);
    }
    return bySubTask;
  }, [selectedEquipmentKeysForDelete]);

  const bulkDeleteKeys = bulkDeleteScope
    ? (selectedKeysBySubTask.get(
        `${bulkDeleteScope.mainTaskId}::${bulkDeleteScope.subTaskId}`,
      ) ?? new Set<string>())
    : new Set<string>();

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0" aria-hidden />
          <span>Equipment</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

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
                      Equipment Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Assign equipment per sub task. Each sub task should have its
                    own equipment list.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Equipment Setup
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                <div className="space-y-2.5">
                  {loading ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Loading equipment assignment...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      No subtasks found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroup(group.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleGroup(group.id);
                              }
                            }}
                            className={`flex w-full items-center justify-between px-4 py-3 text-left transition cursor-pointer ${
                              isOpen ? "bg-emerald-50/40 dark:bg-emerald-500/10" : "bg-white dark:bg-slate-900"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`h-9 w-1 rounded-full ${
                                  isOpen ? "opacity-100" : "opacity-0"
                                }`}
                                style={{ backgroundColor: ACCENT }}
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                    {group.title}
                                  </span>

                                  {isOpen && (
                                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                      MAIN TASK
                                    </span>
                                  )}
                                </div>

                                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {group.children.length} sub task
                                  {group.children.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>

                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            )}
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                                  No subtasks under this main task.
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {group.children.map((step, index) => (
                                    <div key={step.id} className="py-4">
                                      <div className="flex items-center gap-3 px-1 py-1">
                                        <div className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                          {index + 1}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                            {step.title}
                                          </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                          {(selectedKeysBySubTask.get(
                                            `${group.id}::${step.id}`,
                                          )?.size ?? 0) > 0 ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setBulkDeleteScope({
                                                  mainTaskId: group.id,
                                                  subTaskId: step.id,
                                                });
                                                setBulkDeleteOpen(true);
                                              }}
                                              className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                            >
                                              Remove (
                                              {selectedKeysBySubTask.get(
                                                `${group.id}::${step.id}`,
                                              )?.size ?? 0}
                                              )
                                            </button>
                                          ) : null}
                                          <button
                                            type="button"
                                            onClick={() => openEquipmentModal(group.id, step.id)}
                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[12px] font-semibold text-emerald-600 transform transition-all duration-150 hover:bg-emerald-100 hover:opacity-85 hover:scale-[0.985] active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                                          >
                                            <Plus className="h-4 w-4" />
                                            Add Equipment
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-3 pl-10">
                                        {step.equipments.length === 0 ? (
                                          <div className="px-3 py-3 text-[12px] text-slate-500 dark:text-slate-400">
                                            No equipment assigned to this sub task yet.
                                          </div>
                                        ) : (
                                          <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {step.equipments.map((equipment, equipmentIndex) => (
                                              <div
                                                key={`${step.id}-${equipment.id}-${equipmentIndex}`}
                                                className="grid grid-cols-[28px_minmax(0,1fr)_112px_40px] items-center gap-3 px-3 py-2.5"
                                              >
                                                <label className="inline-flex h-6 w-6 items-center justify-center">
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedEquipmentKeysForDelete.has(
                                                      `${group.id}::${step.id}::${equipment.id}`,
                                                    )}
                                                    onChange={() =>
                                                      toggleEquipmentDeleteSelection(
                                                        group.id,
                                                        step.id,
                                                        equipment.id,
                                                      )
                                                    }
                                                    className="h-4 w-4 rounded border-slate-300 bg-transparent accent-[#00c065] dark:border-slate-600 dark:bg-transparent"
                                                    aria-label={`Select ${equipment.name} for deletion`}
                                                  />
                                                </label>
                                                <div className="min-w-0">
                                                  <div className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                                    {equipment.name}
                                                  </div>
                                                </div>

                                                <div className="flex items-center justify-end gap-2">
                                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                    Qty
                                                  </span>
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    value={equipment.quantity}
                                                    onChange={(e) =>
                                                      updateEquipmentQuantity(
                                                        group.id,
                                                        step.id,
                                                        equipment.id,
                                                        Number(e.target.value),
                                                      )
                                                    }
                                                    aria-label={`Quantity for ${equipment.name}`}
                                                    className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 outline-none transition-all duration-150 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 hover:opacity-85 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                                  />
                                                </div>

                                                <div className="flex justify-end">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setEquipmentPendingDelete({
                                                        mainTaskId: group.id,
                                                        subTaskId: step.id,
                                                        equipmentId: equipment.id,
                                                        name: equipment.name,
                                                      })
                                                    }
                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transform transition-all duration-150 hover:bg-red-100 hover:text-red-600 hover:opacity-85 hover:scale-[0.985] active:scale-95 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:text-red-200"
                                                    aria-label={`Remove ${equipment.name}`}
                                                    title="Remove"
                                                  >
                                                    <X className="h-4 w-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
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

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  Equipment Assignment
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  Assign equipment to each sub task before moving to overview.
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                  <Wrench className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  {totalAssignedEquipment} assigned equipment item
                  {totalAssignedEquipment === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="equipment" />
            </div>
          </aside>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
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
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            style={{ backgroundColor: ACCENT }}
          >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Save changes?
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Do you want to save your equipment changes before leaving this page?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowSaveConfirm(false);
                  setPendingAction(null);
                  clearLeaveButtonLoading();
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Don't Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                style={{ backgroundColor: ACCENT }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AddEquipmentModal
        open={equipmentModalState.open}
        mainTaskTitle={equipmentModalState.mainTaskTitle}
        subTaskTitle={equipmentModalState.subTaskTitle}
        equipmentItems={equipmentCatalog}
        selectedEquipment={
          services
            .find((group) => group.id === equipmentModalState.mainTaskId)
            ?.children.find(
              (step) => step.id === equipmentModalState.subTaskId,
            )
            ?.equipments.map((item) => ({
              id: item.equipmentId ?? item.id,
              name: item.name,
            })) ?? []
        }
        onAddEquipment={handleAddEquipmentToSubTask}
        onRemoveEquipment={handleRemoveEquipmentFromModal}
        onClose={closeEquipmentModal}
      />

      <ConfirmDeleteModal
        open={Boolean(equipmentPendingDelete)}
        title="Remove equipment?"
        description={
          equipmentPendingDelete
            ? `Remove "${equipmentPendingDelete.name}" from this subtask?`
            : "Remove this equipment from this subtask?"
        }
        confirmLabel="Remove"
        onCancel={() => setEquipmentPendingDelete(null)}
        onConfirm={() => {
          if (equipmentPendingDelete) {
            removeAssignedEquipment(
              equipmentPendingDelete.mainTaskId,
              equipmentPendingDelete.subTaskId,
              equipmentPendingDelete.equipmentId,
            );
          }
          setEquipmentPendingDelete(null);
        }}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title="Remove selected equipment?"
        description={`Remove ${bulkDeleteKeys.size} selected equipment item${
          bulkDeleteKeys.size === 1 ? "" : "s"
        } from this sub task?`}
        confirmLabel="Remove selected"
        onCancel={() => {
          setBulkDeleteOpen(false);
          setBulkDeleteScope(null);
        }}
        onConfirm={() => {
          removeSelectedEquipment(bulkDeleteKeys);
          setBulkDeleteOpen(false);
          setBulkDeleteScope(null);
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

        .dark .fixed.inset-0 button[class*="bg-red"],
        .dark .fixed.inset-0 button[class*="bg-rose"],
        .dark .fixed.inset-0 button[class*="text-red"],
        .dark .fixed.inset-0 button[class*="text-rose"] {
          background-color: rgba(244, 63, 94, 0.16) !important;
          border-color: rgba(244, 63, 94, 0.38) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
}
