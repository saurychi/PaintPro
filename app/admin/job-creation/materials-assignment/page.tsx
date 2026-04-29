"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import CreateTaskModal from "@/components/project-creation/CreateTaskModal";
import AddMaterialModal from "@/components/project-creation/AddMaterialModal";

type StepStatus = "done" | "active" | "pending";

type MaterialItem = {
  id: string;
  materialId: string;
  name: string;
  quantity: number;
  unitCost: number;
  estimatedCost: number;
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  projectTaskId: string;
  children: MaterialItem[];
};

type MaterialOption = {
  id: string;
  name: string;
  unitCost: number;
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";
const ACCENT_BORDER = "#b7efcf";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export default function MaterialsAssignment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [activeMainTaskId, setActiveMainTaskId] = useState<string>("");
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [loadingMaterialOptions, setLoadingMaterialOptions] = useState(false);
  const [jobNo, setJobNo] = useState("N/A");
  const [siteName, setSiteName] = useState("Project details unavailable");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"next" | "back" | null>(
    null,
  );
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  const undoStackRef = useRef<ServiceGroup[][]>([]);
  const redoStackRef = useRef<ServiceGroup[][]>([]);

  function cloneServicesState(value: ServiceGroup[]) {
    return value.map((group) => ({
      ...group,
      children: group.children.map((item) => ({ ...item })),
    }));
  }

  function updateServicesWithHistory(
    updater: (prev: ServiceGroup[]) => ServiceGroup[],
  ) {
    setServices((prev) => {
      const prevSnapshot = cloneServicesState(prev);
      const next = updater(prev);
      const nextSnapshot = cloneServicesState(next);

      if (JSON.stringify(prevSnapshot) !== JSON.stringify(nextSnapshot)) {
        undoStackRef.current.push(prevSnapshot);
        redoStackRef.current = [];
      }

      return next;
    });
  }

  function handleUndoServices() {
    if (undoStackRef.current.length === 0) return;

    setServices((current) => {
      const currentSnapshot = cloneServicesState(current);
      const previousSnapshot = undoStackRef.current.pop();

      if (!previousSnapshot) return current;

      redoStackRef.current.push(currentSnapshot);
      return previousSnapshot;
    });
  }

  useEffect(() => {
    async function loadProjectTaskMaterials() {
      if (!projectId) {
        setLoadingMaterials(false);
        return;
      }

      try {
        setLoadingMaterials(true);

        const response = await fetch(
          `/api/planning/getProjectTaskMaterials?projectId=${projectId}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load project materials.");
        }

        setJobNo(data?.project?.project_code || "N/A");
        setSiteName(data?.project?.title || "Project details unavailable");

        const rows = Array.isArray(data?.materials) ? data.materials : [];
        const projectTasks = Array.isArray(data?.projectTasks)
          ? data.projectTasks
          : [];

        const groupedMap = new Map<string, ServiceGroup>();

        for (const row of projectTasks) {
          const groupId = row.main_task_id || row.project_task_id;

          groupedMap.set(groupId, {
            id: groupId,
            title: row.main_task_name || "Main Task",
            status: "pending",
            projectTaskId: row.project_task_id,
            children: [],
          });
        }

        for (const row of rows) {
          const groupId = row.main_task_id || row.project_task_id;
          const existingGroup = groupedMap.get(groupId);

          if (existingGroup) {
            existingGroup.children.push({
              id: row.project_task_material_id,
              materialId: row.material_id ?? "",
              name: row.material_name,
              quantity: Number(row.quantity ?? 0),
              unitCost: Number(row.material_unit_cost ?? 0),
              estimatedCost: Number(row.estimated_cost ?? 0),
            });
            continue;
          }

          groupedMap.set(groupId, {
            id: groupId,
            title: row.main_task_name || "Main Task",
            status: "pending",
            projectTaskId: row.project_task_id,
            children: [
              {
                id: row.project_task_material_id,
                materialId: row.material_id ?? "",
                name: row.material_name,
                quantity: Number(row.quantity ?? 0),
                unitCost: Number(row.material_unit_cost ?? 0),
                estimatedCost: Number(row.estimated_cost ?? 0),
              },
            ],
          });
        }

        const groupedServices = Array.from(groupedMap.values());

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project materials.");
      } finally {
        setLoadingMaterials(false);
      }
    }

    loadProjectTaskMaterials();
  }, [projectId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      const isTypingElement =
        tagName === "input" ||
        tagName === "textarea" ||
        target?.isContentEditable;

      if (isTypingElement) return;

      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";

      if (!isUndoShortcut) return;

      event.preventDefault();
      handleUndoServices();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    console.log("Create task payload:", payload);
    setCreateTaskModalOpen(false);
  }

  async function handleOpenAddMaterialModal(groupId: string) {
    setActiveMainTaskId(groupId);
    setMaterialModalOpen(true);

    try {
      setLoadingMaterialOptions(true);

      const response = await fetch("/api/planning/getSubTaskResourceOptions");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load material options.");
      }

      const options = Array.isArray(data?.materials)
        ? data.materials.map((item: any) => ({
            id: item.id,
            name: item.name,
            unitCost: Number(item.unit_cost ?? 0),
          }))
        : [];

      setMaterialOptions(options);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load material options.");
    } finally {
      setLoadingMaterialOptions(false);
    }
  }

  function handleCloseAddMaterialModal() {
    setMaterialModalOpen(false);
    setActiveMainTaskId("");
  }

  function handleRemoveMaterialFromActiveGroup(materialRowId: string) {
    if (!activeMainTaskId) {
      toast.error("No main task selected.");
      return;
    }

    handleRemoveMaterialFromGroup(activeMainTaskId, materialRowId);
  }

  function handleAddMaterialToGroup(
    material: MaterialOption,
    quantity: number,
  ) {
    if (!activeMainTaskId) {
      toast.error("No main task selected.");
      return;
    }

    const safeQuantity = Number(quantity);
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }

    const estimatedCost = Number(material.unitCost || 0) * safeQuantity;

    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== activeMainTaskId) return group;

        return {
          ...group,
          children: [
            ...group.children,
            {
              id: `local_${material.id}_${Date.now()}`,
              materialId: material.id,
              name: material.name,
              quantity: safeQuantity,
              unitCost: Number(material.unitCost || 0),
              estimatedCost,
            },
          ],
        };
      }),
    );

    setExpanded((prev) => new Set(prev).add(activeMainTaskId));
    setIsDirty(true);
  }

  function handleUpdateMaterialQuantity(
    groupId: string,
    materialRowId: string,
    quantity: number,
  ) {
    const safeQuantity = Number(quantity);
    if (!Number.isFinite(safeQuantity)) return;

    const normalizedQuantity = Math.max(0.01, safeQuantity || 0.01);

    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          children: group.children.map((item) => {
            if (item.id !== materialRowId) return item;

            return {
              ...item,
              quantity: normalizedQuantity,
              estimatedCost: Number(item.unitCost || 0) * normalizedQuantity,
            };
          }),
        };
      }),
    );

    setIsDirty(true);
  }

  function handleRemoveMaterialFromGroup(groupId: string, materialRowId: string) {
    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          children: group.children.filter((item) => item.id !== materialRowId),
        };
      }),
    );

    setIsDirty(true);
    toast.success("Material removed.");
  }

  async function updateProjectStatus(status: string) {
    if (!projectId) {
      toast.error("Missing project ID.");
      return false;
    }

    try {
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

      let data: any = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message =
          [data?.error, data?.details].filter(Boolean).join(": ") ||
          `Failed to update project status. (${response.status})`;

        toast.error(message);
        return false;
      }

      return true;
    } catch (error: any) {
      toast.error(
        error?.message || "Something went wrong while updating project status.",
      );
      return false;
    }
  }

  function requestLeave(action: "next" | "back") {
    if (!isDirty) {
      if (action === "next") setIsNavigatingNext(true);
      void handleConfirmSave(false, action);
      return;
    }

    if (action !== "next") {
      setIsNavigatingNext(false);
    }

    setPendingAction(action);
    setShowSaveConfirm(true);
  }

  async function handleConfirmSave(
    shouldSave: boolean,
    forcedAction?: "next" | "back",
  ) {
    const action = forcedAction ?? pendingAction;

    setShowSaveConfirm(false);

    if (!action) return;

    if (shouldSave) {
      const groups = services.map((group) => ({
        projectTaskId: group.projectTaskId,
        materials: group.children.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          estimatedCost: item.estimatedCost,
        })),
      }));

      const saveResponse = await fetch(
        "/api/planning/saveProjectTaskMaterials",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, groups }),
        },
      );

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        setIsNavigatingNext(false);
        setIsNavigatingBack(false);
        toast.error(saveData?.error || "Failed to save materials.");
        return;
      }

      setIsDirty(false);
      toast.success("Materials saved.");
    }

    const nextStatus =
      action === "next" ? "equipment_pending" : "sub_task_pending";

    const updated = await updateProjectStatus(nextStatus);
    if (!updated) {
      setIsNavigatingNext(false);
      setIsNavigatingBack(false);
      return;
    }

    setPendingAction(null);

    if (action === "next") {
      router.push(
        `/admin/job-creation/equipment-assignment?projectId=${projectId}`,
      );
      return;
    }

    setIsNavigatingNext(false);
    setIsNavigatingBack(false);
    router.push(
      `/admin/job-creation/sub-task-assignment?projectId=${projectId}`,
    );
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

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Materials</span>
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
                      Materials Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review and organize materials under each main task.
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
                  {loadingMaterials ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      Loading materials...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      No materials found for this project.
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
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleGroup(group.id);
                              }
                            }}
                            className={`w-full cursor-pointer px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/40" : "bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
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
                                    {group.children.length} item
                                    {group.children.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenAddMaterialModal(group.id);
                                  }}
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition hover:brightness-95"
                                  style={{
                                    borderColor: ACCENT_BORDER,
                                    backgroundColor: ACCENT_SOFT,
                                    color: ACCENT,
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add Material
                                </button>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                                  No materials found for this main task.
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                  <div className="divide-y divide-gray-200">
                                    {group.children.map((item) => (
                                      <div key={item.id} className="px-4 py-3">
                                        <div className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-[minmax(0,1fr)_130px_120px_150px_40px] md:items-end">
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Material
                                            </div>
                                            <div className="truncate font-medium text-gray-900">
                                              {item.name}
                                            </div>
                                          </div>

                                          <div className="md:text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Unit Cost
                                            </div>
                                            <div className="font-medium text-gray-800">
                                              {formatCurrency(item.unitCost)}
                                            </div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Quantity
                                            </div>
                                            <input
                                              type="number"
                                              min="0.01"
                                              step="0.01"
                                              inputMode="decimal"
                                              value={item.quantity}
                                              onChange={(event) =>
                                                handleUpdateMaterialQuantity(
                                                  group.id,
                                                  item.id,
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none transition focus:border-emerald-400"
                                            />
                                          </div>

                                          <div className="md:text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                              Estimated Cost
                                            </div>
                                            <div className="font-medium text-gray-800">
                                              {formatCurrency(item.estimatedCost)}
                                            </div>
                                          </div>

                                          <div className="flex md:justify-end">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleRemoveMaterialFromGroup(
                                                  group.id,
                                                  item.id,
                                                )
                                              }
                                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600 active:scale-95"
                                              aria-label={`Remove ${item.name}`}
                                              title="Remove material"
                                            >
                                              <X className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
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
                  {jobNo}
                </div>
                <div className="mt-1 text-[12px] text-gray-500">{siteName}</div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4">
                <button
                  type="button"
                  onClick={handleOpenCreateTaskModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold transition hover:brightness-95"
                  style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                >
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="materials" />
            </div>
          </aside>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transition duration-150 hover:bg-gray-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
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
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transition duration-150 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
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
                Do you want to save your materials changes before leaving?
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
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Don't Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: ACCENT }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CreateTaskModal
        open={createTaskModalOpen}
        onClose={handleCloseCreateTaskModal}
        onSave={handleCreateTask}
      />

      <AddMaterialModal
        open={materialModalOpen}
        mainTaskTitle={
          services.find((group) => group.id === activeMainTaskId)?.title ||
          "Main Task"
        }
        existingMaterials={
          services.find((group) => group.id === activeMainTaskId)?.children ||
          []
        }
        materialOptions={materialOptions}
        loadingOptions={loadingMaterialOptions}
        onClose={handleCloseAddMaterialModal}
        onAddMaterial={handleAddMaterialToGroup}
        onRemoveMaterial={handleRemoveMaterialFromActiveGroup}
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
