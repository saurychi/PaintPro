"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Hammer,
  GripVertical,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import AddMainTaskModal from "@/components/task-management/AddMainTaskModal";
import AddSubTaskModal from "@/components/task-management/AddSubTaskModal";
import MainTaskReplacementModal from "@/components/task-management/MainTaskReplacementModal";
import ResourceSelectionModal from "@/components/task-management/ResourceSelectionModal";
import SubTaskReplacementModal from "@/components/task-management/SubTaskReplacementModal";
import {
  sortMainTasks,
  sortSubTasks,
  type TaskManagementMainTask,
  type TaskManagementResourceOption,
  type TaskManagementSubTask,
} from "@/lib/taskManagement";

type TaskManagementResponse = {
  mainTasks?: TaskManagementMainTask[];
  subTasks?: TaskManagementSubTask[];
  materialOptions?: TaskManagementResourceOption[];
  equipmentOptions?: TaskManagementResourceOption[];
  error?: string;
};

type MainTaskSaveResponse = {
  success?: boolean;
  mainTask?: TaskManagementMainTask;
  error?: string;
};

type SubTaskSaveResponse = {
  success?: boolean;
  subTasks?: TaskManagementSubTask[];
  error?: string;
};

type DeleteResponse = {
  success?: boolean;
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function upsertMainTasks(
  current: TaskManagementMainTask[],
  updates: TaskManagementMainTask[],
) {
  const map = new Map(current.map((item) => [item.main_task_id, item]));

  for (const item of updates) {
    map.set(item.main_task_id, item);
  }

  return sortMainTasks(Array.from(map.values()));
}

function upsertSubTasks(
  current: TaskManagementSubTask[],
  updates: TaskManagementSubTask[],
) {
  const map = new Map(current.map((item) => [item.sub_task_id, item]));

  for (const item of updates) {
    map.set(item.sub_task_id, item);
  }

  return Array.from(map.values());
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function requestConfirmation(args: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
}) {
  const {
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancel",
  } = args;

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    toast.warning(title, {
      description,
      duration: 12000,
      action: {
        label: confirmLabel,
        onClick: () => finish(true),
      },
      cancel: {
        label: cancelLabel,
        onClick: () => finish(false),
      },
      onDismiss: () => finish(false),
    });
  });
}

export default function TaskManagementSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [mainTasks, setMainTasks] = useState<TaskManagementMainTask[]>([]);
  const [subTasks, setSubTasks] = useState<TaskManagementSubTask[]>([]);
  const [persistedSubTasks, setPersistedSubTasks] = useState<
    TaskManagementSubTask[]
  >([]);
  const [materialOptions, setMaterialOptions] = useState<
    TaskManagementResourceOption[]
  >([]);
  const [equipmentOptions, setEquipmentOptions] = useState<
    TaskManagementResourceOption[]
  >([]);
  const [selectedMainTaskId, setSelectedMainTaskId] = useState<string | null>(
    null,
  );
  const [selectedSubTaskId, setSelectedSubTaskId] = useState<string | null>(
    null,
  );
  const [mainReplacementOpen, setMainReplacementOpen] = useState(false);
  const [subReplacementOpen, setSubReplacementOpen] = useState(false);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceModalType, setResourceModalType] = useState<
    "materials" | "equipment"
  >("materials");
  const [addMainTaskOpen, setAddMainTaskOpen] = useState(false);
  const [addSubTaskOpen, setAddSubTaskOpen] = useState(false);
  const [isSavingMainTask, setIsSavingMainTask] = useState(false);
  const [isSavingSubTasks, setIsSavingSubTasks] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [isDeletingMainTask, setIsDeletingMainTask] = useState(false);
  const [deletingSubTaskId, setDeletingSubTaskId] = useState<string | null>(
    null,
  );
  const [expandedSubTaskIds, setExpandedSubTaskIds] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setPageError(null);

      try {
        const response = await fetch("/api/planning/task-management", {
          cache: "no-store",
        });
        const data = await parseJson<TaskManagementResponse>(response);

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load task management data.");
        }

        const nextMainTasks = sortMainTasks(data?.mainTasks ?? []);
        const nextSubTasks = data?.subTasks ?? [];

        if (cancelled) return;

        setMainTasks(nextMainTasks);
        setSubTasks(nextSubTasks);
        setPersistedSubTasks(nextSubTasks);
        setExpandedSubTaskIds([]);
        setMaterialOptions(data?.materialOptions ?? []);
        setEquipmentOptions(data?.equipmentOptions ?? []);
        setSelectedMainTaskId((current) => {
          if (
            current &&
            nextMainTasks.some((task) => task.main_task_id === current)
          ) {
            return current;
          }

          return nextMainTasks[0]?.main_task_id ?? null;
        });
      } catch (error) {
        const message = getErrorMessage(
          error,
          "Failed to load task management data.",
        );

        if (cancelled) return;

        setPageError(message);
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedMainTaskId && mainTasks.some((task) => task.main_task_id === selectedMainTaskId)) {
      return;
    }

    setSelectedMainTaskId(mainTasks[0]?.main_task_id ?? null);
  }, [mainTasks, selectedMainTaskId]);

  useEffect(() => {
    if (selectedSubTaskId && subTasks.some((task) => task.sub_task_id === selectedSubTaskId)) {
      return;
    }

    setSelectedSubTaskId(null);
  }, [subTasks, selectedSubTaskId]);

  useEffect(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, [selectedMainTaskId]);

  const filteredMainTasks = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return mainTasks;

    return mainTasks.filter((task) =>
      task.name.toLowerCase().includes(query),
    );
  }, [mainTasks, searchValue]);

  const selectedMainTask = useMemo(
    () =>
      mainTasks.find((task) => task.main_task_id === selectedMainTaskId) ?? null,
    [mainTasks, selectedMainTaskId],
  );

  const selectedSubtasks = useMemo(() => {
    if (!selectedMainTask) return [];

    return sortSubTasks(
      subTasks.filter(
        (subtask) => subtask.main_task_id === selectedMainTask.main_task_id,
      ),
    );
  }, [selectedMainTask, subTasks]);

  const selectedSubTask = useMemo(
    () =>
      subTasks.find((subtask) => subtask.sub_task_id === selectedSubTaskId) ??
      null,
    [selectedSubTaskId, subTasks],
  );

  const mainTaskNameById = useMemo(
    () => new Map(mainTasks.map((task) => [task.main_task_id, task.name])),
    [mainTasks],
  );
  const subTaskNameById = useMemo(
    () => new Map(subTasks.map((task) => [task.sub_task_id, task.description])),
    [subTasks],
  );
  const materialNameById = useMemo(
    () => new Map(materialOptions.map((item) => [item.id, item.name])),
    [materialOptions],
  );
  const equipmentNameById = useMemo(
    () => new Map(equipmentOptions.map((item) => [item.id, item.name])),
    [equipmentOptions],
  );

  async function saveMainTaskRequest(payload: {
    mainTaskId?: string;
    name: string;
    isActive: boolean;
    defaultSortOrder: number | null;
    replacedByMainTaskId: string | null;
  }) {
    const response = await fetch("/api/planning/task-management/main-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await parseJson<MainTaskSaveResponse>(response);

    if (!response.ok || !data?.mainTask) {
      throw new Error(data?.error || "Failed to save main task.");
    }

    return data.mainTask;
  }

  async function saveSubTasksRequest(
    payload: Array<{
      subTaskId?: string;
      mainTaskId: string;
      description: string;
      isActive: boolean;
      replacedBySubTaskId: string | null;
      defaultEquipment: string[];
      defaultMaterials: string[];
      defaultSortOrder: number | null;
    }>,
  ) {
    const response = await fetch("/api/planning/task-management/sub-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subTasks: payload }),
    });

    const data = await parseJson<SubTaskSaveResponse>(response);

    if (!response.ok || !data?.subTasks) {
      throw new Error(data?.error || "Failed to save subtasks.");
    }

    return data.subTasks;
  }

  function mergeSavedMainTasks(savedRows: TaskManagementMainTask[]) {
    setMainTasks((current) => upsertMainTasks(current, savedRows));
  }

  function mergeSavedSubTasks(savedRows: TaskManagementSubTask[]) {
    setSubTasks((current) => upsertSubTasks(current, savedRows));
    setPersistedSubTasks((current) => upsertSubTasks(current, savedRows));
  }

  function updateSelectedMainTask(
    patch: Partial<TaskManagementMainTask>,
  ) {
    if (!selectedMainTaskId) return;

    setMainTasks((current) =>
      sortMainTasks(
        current.map((task) =>
          task.main_task_id === selectedMainTaskId ? { ...task, ...patch } : task,
        ),
      ),
    );
  }

  function updateSubTask(
    subTaskId: string,
    patch: Partial<TaskManagementSubTask>,
  ) {
    setSubTasks((current) =>
      current.map((task) =>
        task.sub_task_id === subTaskId ? { ...task, ...patch } : task,
      ),
    );
  }

  function toggleSubTaskExpanded(subTaskId: string) {
    setExpandedSubTaskIds((current) =>
      current.includes(subTaskId)
        ? current.filter((item) => item !== subTaskId)
        : [...current, subTaskId],
    );
  }

  function handleSubTaskDragStart(index: number) {
    setDragIndex(index);
  }

  function handleSubTaskDragOver(
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) {
    event.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleSubTaskDrop(targetIndex: number) {
    if (dragIndex === null || !selectedMainTask) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    if (dragIndex !== targetIndex) {
      setSubTasks((current) => {
        const currentSelected = sortSubTasks(
          current.filter(
            (subtask) => subtask.main_task_id === selectedMainTask.main_task_id,
          ),
        );
        const otherSubTasks = current.filter(
          (subtask) => subtask.main_task_id !== selectedMainTask.main_task_id,
        );
        const reordered = [...currentSelected];
        const [moved] = reordered.splice(dragIndex, 1);

        if (!moved) return current;

        reordered.splice(targetIndex, 0, moved);

        const normalizedRows = reordered.map((subtask, index) => ({
          ...subtask,
          default_sort_order: index + 1,
        }));

        return [...otherSubTasks, ...normalizedRows];
      });
    }

    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleSubTaskDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  async function handleSaveMainTask() {
    if (!selectedMainTask) return;

    setIsSavingMainTask(true);

    try {
      const savedMainTask = await saveMainTaskRequest({
        mainTaskId: selectedMainTask.main_task_id,
        name: selectedMainTask.name,
        isActive: selectedMainTask.is_active,
        defaultSortOrder: selectedMainTask.default_sort_order,
        replacedByMainTaskId: selectedMainTask.replaced_by_main_task_id,
      });

      mergeSavedMainTasks([savedMainTask]);
      toast.success("Main task saved.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save main task."));
    } finally {
      setIsSavingMainTask(false);
    }
  }

  async function handleSaveSelectedSubtasks() {
    if (!selectedMainTask || selectedSubtasks.length === 0) {
      toast.error("No subtasks to save for this main task.");
      return;
    }

    setIsSavingSubTasks(true);

    try {
      const savedRows = await saveSubTasksRequest(
        selectedSubtasks.map((subtask) => ({
          subTaskId: subtask.sub_task_id,
          mainTaskId: subtask.main_task_id,
          description: subtask.description,
          isActive: subtask.is_active,
          replacedBySubTaskId: subtask.replaced_by_sub_task_id,
          defaultEquipment: subtask.default_equipment,
          defaultMaterials: subtask.default_materials,
          defaultSortOrder: subtask.default_sort_order,
        })),
      );

      mergeSavedSubTasks(savedRows);
      toast.success("Subtasks saved.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save subtasks."));
    } finally {
      setIsSavingSubTasks(false);
    }
  }

  async function handleCreateMainTask(input: {
    name: string;
    defaultSortOrder: number;
    isActive: boolean;
  }) {
    setIsSavingModal(true);

    try {
      const savedMainTask = await saveMainTaskRequest({
        name: input.name,
        isActive: input.isActive,
        defaultSortOrder: input.defaultSortOrder,
        replacedByMainTaskId: null,
      });

      mergeSavedMainTasks([savedMainTask]);
      setSelectedMainTaskId(savedMainTask.main_task_id);
      setAddMainTaskOpen(false);
      toast.success("Main task created.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create main task."));
    } finally {
      setIsSavingModal(false);
    }
  }

  async function handleCreateSubTask(input: {
    mainTaskId: string;
    description: string;
    defaultSortOrder: number;
    isActive: boolean;
  }) {
    setIsSavingModal(true);

    try {
      const savedRows = await saveSubTasksRequest([
        {
          mainTaskId: input.mainTaskId,
          description: input.description,
          isActive: input.isActive,
          replacedBySubTaskId: null,
          defaultEquipment: [],
          defaultMaterials: [],
          defaultSortOrder: input.defaultSortOrder,
        },
      ]);

      mergeSavedSubTasks(savedRows);
      setAddSubTaskOpen(false);
      toast.success("Subtask created.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create subtask."));
    } finally {
      setIsSavingModal(false);
    }
  }

  async function handleSaveMainTaskReplacement(
    replacedByMainTaskId: string | null,
  ) {
    if (!selectedMainTask) return;

    setIsSavingModal(true);

    try {
      const savedMainTask = await saveMainTaskRequest({
        mainTaskId: selectedMainTask.main_task_id,
        name: selectedMainTask.name,
        isActive: selectedMainTask.is_active,
        defaultSortOrder: selectedMainTask.default_sort_order,
        replacedByMainTaskId,
      });

      mergeSavedMainTasks([savedMainTask]);
      setMainReplacementOpen(false);
      toast.success("Main task replacement updated.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Failed to update main task replacement."),
      );
    } finally {
      setIsSavingModal(false);
    }
  }

  async function handleSaveSubTaskReplacement(
    replacedBySubTaskId: string | null,
  ) {
    if (!selectedSubTask) return;

    setIsSavingModal(true);

    try {
      const savedRows = await saveSubTasksRequest([
        {
          subTaskId: selectedSubTask.sub_task_id,
          mainTaskId: selectedSubTask.main_task_id,
          description: selectedSubTask.description,
          isActive: selectedSubTask.is_active,
          replacedBySubTaskId,
          defaultEquipment: selectedSubTask.default_equipment,
          defaultMaterials: selectedSubTask.default_materials,
          defaultSortOrder: selectedSubTask.default_sort_order,
        },
      ]);

      mergeSavedSubTasks(savedRows);
      setSubReplacementOpen(false);
      toast.success("Subtask replacement updated.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Failed to update subtask replacement."),
      );
    } finally {
      setIsSavingModal(false);
    }
  }

  async function handleSaveResources(nextSelectedIds: string[]) {
    if (!selectedSubTask) return;

    setIsSavingModal(true);

    try {
      const savedRows = await saveSubTasksRequest([
        {
          subTaskId: selectedSubTask.sub_task_id,
          mainTaskId: selectedSubTask.main_task_id,
          description: selectedSubTask.description,
          isActive: selectedSubTask.is_active,
          replacedBySubTaskId: selectedSubTask.replaced_by_sub_task_id,
          defaultEquipment:
            resourceModalType === "equipment"
              ? nextSelectedIds
              : selectedSubTask.default_equipment,
          defaultMaterials:
            resourceModalType === "materials"
              ? nextSelectedIds
              : selectedSubTask.default_materials,
          defaultSortOrder: selectedSubTask.default_sort_order,
        },
      ]);

      mergeSavedSubTasks(savedRows);
      setResourceModalOpen(false);
      toast.success(
        `${resourceModalType === "materials" ? "Materials" : "Equipment"} updated.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save resources."));
    } finally {
      setIsSavingModal(false);
    }
  }

  async function handleDeleteMainTask() {
    if (!selectedMainTask) return;

    const confirmed = await requestConfirmation({
      title: "Delete main task?",
      description: `"${selectedMainTask.name}" will be removed if it no longer has subtasks under it.`,
      confirmLabel: "Delete",
    });

    if (!confirmed) return;

    setIsDeletingMainTask(true);

    try {
      const response = await fetch(
        "/api/planning/task-management/main-task/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainTaskId: selectedMainTask.main_task_id }),
        },
      );

      const data = await parseJson<DeleteResponse>(response);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete main task.");
      }

      const deletedMainTaskId = selectedMainTask.main_task_id;

      setMainTasks((current) =>
        current.filter((task) => task.main_task_id !== deletedMainTaskId),
      );

      toast.success("Main task deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete main task."));
    } finally {
      setIsDeletingMainTask(false);
    }
  }

  async function handleDeleteSubTask(subTaskId: string) {
    const subtask = subTasks.find((item) => item.sub_task_id === subTaskId);

    if (!subtask) return;

    const confirmed = await requestConfirmation({
      title: "Delete subtask?",
      description: `Remove "${subtask.description}" from the task catalog.`,
      confirmLabel: "Delete",
    });

    if (!confirmed) return;

    setDeletingSubTaskId(subTaskId);

    try {
      const response = await fetch(
        "/api/planning/task-management/sub-task/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subTaskId }),
        },
      );

      const data = await parseJson<DeleteResponse>(response);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete subtask.");
      }

      setSubTasks((current) =>
        current.filter((item) => item.sub_task_id !== subTaskId),
      );
      setPersistedSubTasks((current) =>
        current.filter((item) => item.sub_task_id !== subTaskId),
      );
      setExpandedSubTaskIds((current) =>
        current.filter((item) => item !== subTaskId),
      );
      toast.success("Subtask deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete subtask."));
    } finally {
      setDeletingSubTaskId(null);
    }
  }

  function handleRestoreSelectedSubtasks() {
    if (!selectedMainTask) return;

    const restoredRows = persistedSubTasks.filter(
      (subtask) => subtask.main_task_id === selectedMainTask.main_task_id,
    );

    setSubTasks((current) => {
      const otherRows = current.filter(
        (subtask) => subtask.main_task_id !== selectedMainTask.main_task_id,
      );
      return [...otherRows, ...restoredRows];
    });
    setDragIndex(null);
    setDragOverIndex(null);

    toast.success("Subtask changes reverted.");
  }

  function openSubTaskReplacementModal(subTaskId: string) {
    setSelectedSubTaskId(subTaskId);
    setSubReplacementOpen(true);
  }

  function openResourceModal(
    type: "materials" | "equipment",
    subTaskId: string,
  ) {
    setSelectedSubTaskId(subTaskId);
    setResourceModalType(type);
    setResourceModalOpen(true);
  }

  const resourceModalSelectedIds = selectedSubTask
    ? resourceModalType === "materials"
      ? selectedSubTask.default_materials
      : selectedSubTask.default_equipment
    : [];

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-gray-50 p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#00c065]" />
          Loading task catalog...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-gray-50 p-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-gray-900">
            Task Management
          </h1>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            Manage main tasks, subtasks, replacements, default materials, and
            default equipment.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddMainTaskOpen(true)}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-[#00c065] px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Main Task
        </button>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden">
        <aside className="col-span-12 min-h-0 overflow-hidden lg:col-span-3">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-100 px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search main task..."
                  className="h-8 w-full rounded-full border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-500 [&::-webkit-scrollbar-track]:bg-transparent">
              {filteredMainTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {filteredMainTasks.map((task) => {
                    const selected = task.main_task_id === selectedMainTaskId;
                    const replacementName =
                      (task.replaced_by_main_task_id &&
                        mainTaskNameById.get(task.replaced_by_main_task_id)) ||
                      null;

                    return (
                      <button
                        key={task.main_task_id}
                        type="button"
                        onClick={() => setSelectedMainTaskId(task.main_task_id)}
                        className={[
                          "w-full rounded-lg border px-2.5 py-2 text-left transition",
                          selected
                            ? "border-emerald-200 bg-emerald-50/70"
                            : "border-gray-200 bg-white hover:border-emerald-100 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-gray-900">
                              {task.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-gray-500">
                              Default sort {task.default_sort_order ?? "-"}
                            </p>
                          </div>

                          <span
                            className={[
                              "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium",
                              task.is_active
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 bg-gray-50 text-gray-500",
                            ].join(" ")}
                          >
                            {task.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        {replacementName ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-700">
                            <RefreshCcw className="h-3 w-3" />
                            Replaced by {replacementName}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
                  No main tasks matched your search.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="col-span-12 min-h-0 overflow-hidden lg:col-span-9">
          {pageError && mainTasks.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-white px-6 py-10 text-center shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Couldn&apos;t load the task catalog
                </p>
                <p className="mt-2 text-sm text-gray-500">{pageError}</p>
              </div>
            </div>
          ) : selectedMainTask ? (
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
              <section className="shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="h-1 w-full bg-[#00c065]" />

                <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_140px_140px]">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Main Task Name
                    </label>
                    <input
                      value={selectedMainTask.name}
                      onChange={(event) =>
                        updateSelectedMainTask({ name: event.target.value })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Default Sort
                    </label>
                    <input
                      type="number"
                      value={selectedMainTask.default_sort_order ?? 0}
                      onChange={(event) =>
                        updateSelectedMainTask({
                          default_sort_order: Number(event.target.value || 0),
                        })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </label>
                    <select
                      value={selectedMainTask.is_active ? "true" : "false"}
                      onChange={(event) =>
                        updateSelectedMainTask({
                          is_active: event.target.value === "true",
                        })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                </div>

                {selectedMainTask.replaced_by_main_task_id ? (
                  <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-amber-700">
                    Replaced by{" "}
                    {mainTaskNameById.get(
                      selectedMainTask.replaced_by_main_task_id,
                    ) || "Unknown main task"}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setMainReplacementOpen(true)}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Replace Main Task
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteMainTask}
                      disabled={isDeletingMainTask}
                      className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeletingMainTask ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveMainTask()}
                      disabled={isSavingMainTask}
                      className="inline-flex h-8 items-center gap-2 rounded-full bg-[#00c065] px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingMainTask ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                      {isSavingMainTask ? "Saving..." : "Save Main Task"}
                    </button>
                  </div>
                </div>
              </section>

              <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-gray-900">
                      Subtasks
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] text-gray-500">
                      Drag to reorder, toggle each row open, and edit status,
                      replacements, and default resources.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAddSubTaskOpen(true)}
                    className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-[#00c065] px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Subtask
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-500 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:hover:bg-emerald-600">
                  {selectedSubtasks.length > 0 ? (
                    <div className="space-y-2">
                      {selectedSubtasks.map((subtask, index) => {
                        const replacementName =
                          (subtask.replaced_by_sub_task_id &&
                            subTaskNameById.get(
                              subtask.replaced_by_sub_task_id,
                            )) ||
                          null;
                        const deleting = deletingSubTaskId === subtask.sub_task_id;
                        const expanded = expandedSubTaskIds.includes(
                          subtask.sub_task_id,
                        );
                        const isDragging = dragIndex === index;
                        const isOver =
                          dragOverIndex === index && dragIndex !== index;

                        return (
                          <div
                            key={subtask.sub_task_id}
                            className={[
                              "overflow-hidden rounded-xl border bg-white shadow-sm transition",
                              isDragging
                                ? "border-dashed border-emerald-300 opacity-40"
                                : isOver
                                  ? "border-emerald-400 bg-emerald-50/40"
                                  : "border-gray-200",
                            ].join(" ")}
                          >
                            <div
                              draggable
                              onDragStart={() => handleSubTaskDragStart(index)}
                              onDragOver={(event) =>
                                handleSubTaskDragOver(event, index)
                              }
                              onDrop={() => handleSubTaskDrop(index)}
                              onDragEnd={handleSubTaskDragEnd}
                              className="flex cursor-grab select-none items-center gap-3 px-3 py-3 active:cursor-grabbing"
                            >
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700">
                                {index + 1}
                              </span>

                              <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-gray-900">
                                    {subtask.description || "Untitled subtask"}
                                  </p>
                                  <span
                                    className={[
                                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                      subtask.is_active
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-gray-200 bg-gray-50 text-gray-500",
                                    ].join(" ")}
                                  >
                                    {subtask.is_active ? "Active" : "Inactive"}
                                  </span>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                  <span>Sort {subtask.default_sort_order ?? index + 1}</span>
                                  <span>
                                    {subtask.default_materials.length} material
                                    {subtask.default_materials.length === 1 ? "" : "s"}
                                  </span>
                                  <span>
                                    {subtask.default_equipment.length} equipment
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  toggleSubTaskExpanded(subtask.sub_task_id)
                                }
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                                aria-label={
                                  expanded ? "Collapse subtask" : "Expand subtask"
                                }
                              >
                                <ChevronRight
                                  className={[
                                    "h-4 w-4 transition-transform",
                                    expanded ? "rotate-90" : "",
                                  ].join(" ")}
                                />
                              </button>
                            </div>

                            {expanded ? (
                              <div className="border-t border-gray-100 px-3 py-3">
                                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_120px_110px]">
                                  <div>
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                      Description
                                    </label>
                                    <input
                                      value={subtask.description}
                                      onChange={(event) =>
                                        updateSubTask(subtask.sub_task_id, {
                                          description: event.target.value,
                                        })
                                      }
                                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                      Status
                                    </label>
                                    <select
                                      value={subtask.is_active ? "true" : "false"}
                                      onChange={(event) =>
                                        updateSubTask(subtask.sub_task_id, {
                                          is_active: event.target.value === "true",
                                        })
                                      }
                                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                                    >
                                      <option value="true">Active</option>
                                      <option value="false">Inactive</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                      Default Sort
                                    </label>
                                    <input
                                      type="number"
                                      value={subtask.default_sort_order ?? index + 1}
                                      onChange={(event) =>
                                        updateSubTask(subtask.sub_task_id, {
                                          default_sort_order: Number(
                                            event.target.value || 0,
                                          ),
                                        })
                                      }
                                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                                    />
                                  </div>
                                </div>

                                {replacementName ? (
                                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Replaced by {replacementName}
                                  </div>
                                ) : null}

                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Package className="h-3.5 w-3.5 text-[#00c065]" />
                                        <span className="text-[11px] font-semibold text-gray-900">
                                          Default Materials
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          openResourceModal(
                                            "materials",
                                            subtask.sub_task_id,
                                          )
                                        }
                                        className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        Edit
                                      </button>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {subtask.default_materials.length > 0 ? (
                                        subtask.default_materials.map((item) => (
                                          <span
                                            key={item}
                                            className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600"
                                          >
                                            {materialNameById.get(item) || item}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] text-gray-500">
                                          No default materials selected.
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Hammer className="h-3.5 w-3.5 text-[#00c065]" />
                                        <span className="text-[11px] font-semibold text-gray-900">
                                          Default Equipment
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          openResourceModal(
                                            "equipment",
                                            subtask.sub_task_id,
                                          )
                                        }
                                        className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        Edit
                                      </button>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {subtask.default_equipment.length > 0 ? (
                                        subtask.default_equipment.map((item) => (
                                          <span
                                            key={item}
                                            className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600"
                                          >
                                            {equipmentNameById.get(item) || item}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] text-gray-500">
                                          No default equipment selected.
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openSubTaskReplacementModal(subtask.sub_task_id)
                                    }
                                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-100"
                                  >
                                    <RefreshCcw className="h-3 w-3" />
                                    Replace Subtask
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteSubTask(subtask.sub_task_id)}
                                    disabled={deleting}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800 px-2.5 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {deleting ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-gray-900">
                        No subtasks yet
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Add the first subtask for {selectedMainTask.name}.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={handleRestoreSelectedSubtasks}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveSelectedSubtasks()}
                    disabled={isSavingSubTasks || selectedSubtasks.length === 0}
                    className="inline-flex h-8 items-center gap-2 rounded-full bg-[#00c065] px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingSubTasks ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {isSavingSubTasks ? "Saving..." : "Save Subtasks"}
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  No main tasks found
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Create a main task to start building your task catalog.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <MainTaskReplacementModal
        open={mainReplacementOpen}
        selectedMainTask={selectedMainTask}
        mainTasks={mainTasks}
        saving={isSavingModal}
        onClose={() => setMainReplacementOpen(false)}
        onSave={(replacementId) => void handleSaveMainTaskReplacement(replacementId)}
      />

      <SubTaskReplacementModal
        open={subReplacementOpen}
        selectedSubTask={selectedSubTask}
        subtasks={selectedSubtasks}
        saving={isSavingModal}
        onClose={() => setSubReplacementOpen(false)}
        onSave={(replacementId) => void handleSaveSubTaskReplacement(replacementId)}
      />

      <ResourceSelectionModal
        open={resourceModalOpen}
        type={resourceModalType}
        selectedSubTask={selectedSubTask}
        options={
          resourceModalType === "materials" ? materialOptions : equipmentOptions
        }
        selectedIds={resourceModalSelectedIds}
        saving={isSavingModal}
        onClose={() => setResourceModalOpen(false)}
        onSave={(selectedIds) => void handleSaveResources(selectedIds)}
      />

      <AddMainTaskModal
        open={addMainTaskOpen}
        saving={isSavingModal}
        onClose={() => setAddMainTaskOpen(false)}
        onSubmit={(input) => void handleCreateMainTask(input)}
      />

      <AddSubTaskModal
        open={addSubTaskOpen}
        selectedMainTask={selectedMainTask}
        saving={isSavingModal}
        onClose={() => setAddSubTaskOpen(false)}
        onSubmit={(input) => void handleCreateSubTask(input)}
      />
    </div>
  );
}
