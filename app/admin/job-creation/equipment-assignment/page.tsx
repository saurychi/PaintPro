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

type StepStatus = "done" | "active" | "pending";

type AssignedEquipment = {
  id: string;
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
  const [isSavingFromModal, setIsSavingFromModal] = useState(false);

  const allowBrowserBackRef = useRef(false);
  const suppressLeaveGuardRef = useRef(false);

  const [equipmentCatalog, setEquipmentCatalog] = useState<
    EquipmentCatalogItem[]
  >([]);
  const [equipmentModalState, setEquipmentModalState] = useState<{
    open: boolean;
    mainTaskId: string;
    subTaskId: string;
    subTaskTitle: string;
    selectedIds: string[];
  }>({
    open: false,
    mainTaskId: "",
    subTaskId: "",
    subTaskTitle: "",
    selectedIds: [],
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

  function requestLeave(action: "next" | "back" | "browserBack") {
    if (!isDirty) {
      if (action === "next") {
        setIsNavigatingNext(true);
        void handleConfirmSave(true, "next");
        return;
      }

      if (action === "back") {
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
      setIsSavingFromModal(true);

      const saveEquipmentResponse = await fetch(
        "/api/planning/saveProjectSubTaskEquipment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectSubTasks: services.flatMap((group) =>
              group.children.map((step) => ({
                project_sub_task_id: step.id,
                equipments: step.equipments.map((item) => ({
                  id: item.id,
                  quantity: Number(item.quantity ?? 1),
                })),
              })),
            ),
          }),
        },
      );

      const saveEquipmentData = await saveEquipmentResponse.json();

      if (!saveEquipmentResponse.ok) {
        setIsSavingFromModal(false);
        setIsNavigatingNext(false);
        toast.error(
          saveEquipmentData?.error || "Failed to save equipment assignment.",
        );
        return;
      }

      const response = await fetch("/api/planning/updateProjectStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          status: action === "back" ? "materials_pending" : "schedule_pending",
        }),
      });

      const data = await response.json();
      setIsSavingFromModal(false);

      if (!response.ok) {
        setIsNavigatingNext(false);
        toast.error(data?.error || "Failed to update project status.");
        return;
      }

      setIsDirty(false);
    }

    if (action === "next") {
      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      window.location.href =
        `/admin/job-creation/project-schedule?projectId=${projectId}`;
      return;
    }

    setIsNavigatingNext(false);

    if (action === "back") {
      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      window.location.href =
        `/admin/job-creation/materials-assignment?projectId=${projectId}`;
      return;
    }

    if (action === "browserBack") {
      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
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
      subTaskId,
      subTaskTitle: step.title,
      selectedIds: step.equipments.map((item) => item.id),
    });
  }

  function closeEquipmentModal() {
    setEquipmentModalState({
      open: false,
      mainTaskId: "",
      subTaskId: "",
      subTaskTitle: "",
      selectedIds: [],
    });
  }

  function toggleEquipmentSelection(item: EquipmentCatalogItem) {
    setEquipmentModalState((prev) => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(item.id)
        ? prev.selectedIds.filter((id) => id !== item.id)
        : [...prev.selectedIds, item.id],
    }));
  }

  function saveEquipmentSelection() {
    const selectedSet = new Set(equipmentModalState.selectedIds);

    setServices((prev) =>
      prev.map((group) => {
        if (group.id !== equipmentModalState.mainTaskId) return group;

        return {
          ...group,
          children: group.children.map((step) => {
            if (step.id !== equipmentModalState.subTaskId) return step;

            const existingMap = new Map(
              step.equipments.map((item) => [item.id, item]),
            );

            const nextEquipments = equipmentCatalog
              .filter((item) => selectedSet.has(item.id))
              .map((item) => {
                const existing = existingMap.get(item.id);

                return {
                  id: item.id,
                  name: item.name,
                  quantity: existing?.quantity ?? 1,
                  unitCost: item.unitCost ?? null,
                };
              });

            return {
              ...step,
              equipments: nextEquipments,
            };
          }),
        };
      }),
    );

    setIsDirty(true);
    closeEquipmentModal();
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

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Equipment</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

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
                      Equipment Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Assign equipment per sub task. Each sub task should have its
                    own equipment list.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Equipment Setup
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                <div className="space-y-2.5">
                  {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      Loading equipment assignment...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      No subtasks found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white"
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
                              isOpen ? "bg-emerald-50/40" : "bg-white"
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
                                  <span className="truncate text-[13px] font-semibold text-gray-900">
                                    {group.title}
                                  </span>

                                  {isOpen && (
                                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      MAIN TASK
                                    </span>
                                  )}
                                </div>

                                <div className="mt-0.5 text-[11px] text-gray-500">
                                  {group.children.length} sub task
                                  {group.children.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>

                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )}
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                                  No subtasks under this main task.
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-200">
                                  {group.children.map((step, index) => (
                                    <div key={step.id} className="py-4">
                                      <div className="flex items-center gap-3 px-1 py-1">
                                        <div className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-600">
                                          {index + 1}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[13px] font-semibold text-gray-900">
                                            {step.title}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => openEquipmentModal(group.id, step.id)}
                                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 shrink-0"
                                          style={{
                                            backgroundColor: ACCENT_SOFT,
                                            color: ACCENT,
                                          }}
                                        >
                                          <Plus className="h-4 w-4" />
                                          Add Equipment
                                        </button>
                                      </div>

                                      <div className="mt-3 pl-10">
                                        {step.equipments.length === 0 ? (
                                          <div className="px-3 py-3 text-[12px] text-gray-500">
                                            No equipment assigned to this sub task yet.
                                          </div>
                                        ) : (
                                          <div className="divide-y divide-gray-200">
                                            {step.equipments.map((equipment, equipmentIndex) => (
                                              <div
                                                key={`${step.id}-${equipment.id}-${equipmentIndex}`}
                                                className="grid grid-cols-[minmax(0,1fr)_90px_40px] items-center gap-3 px-3 py-3"
                                              >
                                                <div className="min-w-0">
                                                  <div className="truncate text-[13px] font-medium text-gray-800">
                                                    {equipment.name}
                                                  </div>
                                                </div>

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
                                                  className="h-9 rounded-md border border-gray-200 px-3 text-[12px] text-gray-800 outline-none transition-all duration-150 focus:border-emerald-400 hover:opacity-85 active:scale-[0.98]"
                                                />

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeAssignedEquipment(
                                                      group.id,
                                                      step.id,
                                                      equipment.id,
                                                    )
                                                  }
                                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transform transition-all duration-150 hover:bg-red-100 hover:text-red-600 hover:opacity-85 hover:scale-[0.985] active:scale-95"
                                                  aria-label={`Remove ${equipment.name}`}
                                                  title="Remove"
                                                >
                                                  <X className="h-4 w-4" />
                                                </button>
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

                <div className="h-6" />
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">
                  Equipment Assignment
                </div>
                <div className="mt-1 text-[12px] text-gray-500">
                  Assign equipment to each sub task before moving to overview.
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] text-gray-600">
                  <Wrench className="h-4 w-4 text-gray-400" />
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

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Save changes?
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Do you want to save your equipment changes before leaving this page?
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
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95"
                >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95"
              >
                Don't Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                disabled={isSavingFromModal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                style={{ backgroundColor: ACCENT }}
              >
                {isSavingFromModal ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AddEquipmentModal
        open={equipmentModalState.open}
        subTaskTitle={equipmentModalState.subTaskTitle}
        equipmentItems={equipmentCatalog}
        selectedIds={equipmentModalState.selectedIds}
        onToggle={toggleEquipmentSelection}
        onClose={closeEquipmentModal}
        onSave={saveEquipmentSelection}
      />
    </div>
  );
}
