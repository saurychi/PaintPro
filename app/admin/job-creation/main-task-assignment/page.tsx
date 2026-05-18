"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Plus,
  X,
  Loader2,
  RefreshCw,
  GripVertical,
  Search,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import {
  getCachedMainTasks,
  setCachedMainTasks,
  getCachedSubTasks,
  setCachedSubTasks,
  getCachedMaterials,
  setCachedMaterials,
  setCachedScheduledStartDatetime,
  setCachedStep,
  getCachedProjectMeta,
  ensureWizardCacheHydrated,
  markWizardDirty,
  type CachedSubTask,
  type CachedMaterial,
} from "@/lib/wizardCache";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import CreateTaskModal from "@/components/project-creation/CreateTaskModal";
import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";

const ACCENT = "#4ade80";
const ACCENT_SOFT = "rgba(74, 222, 128, 0.14)";
const ACCENT_BORDER = "rgba(74, 222, 128, 0.35)";

type Task = {
  id: string;
  name: string;
  project_task_id?: string;
};

// project_task / projects.scheduled_start_datetime is stored as a full ISO
// timestamp. /api/planning/getEmployees expects a YYYY-MM-DD slice so it
// can resolve the weekday and the staff-unavailability blocks for that
// day. Returns "" when the project has no scheduled start yet.
function extractScheduledDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Number of employees we seed onto every default subtask when the admin
// adds a main task in manual mode. Matches the project's "team of four"
// default crew size; the admin can adjust on the employee-assignment
// page if a particular subtask needs a different head count.
const DEFAULT_SUBTASK_EMPLOYEE_COUNT = 4;

// Fallback estimated hours per subtask when the catalog has no duration
// signal. Without this the project-schedule page renders zero-length
// rows that collapse to a single point in the timeline; one hour gives
// the admin a visible slot to drag/resize.
const DEFAULT_SUBTASK_ESTIMATED_HOURS = 1;

// ── Add Task Modal ────────────────────────────────────────────────────────────
function AddTaskModal({
  tasks,
  loading,
  refreshing,
  onAdd,
  onClose,
  onCreateNew,
  onRefresh,
}: {
  tasks: Task[];
  loading: boolean;
  refreshing: boolean;
  onAdd: (task: Task) => void;
  onClose: () => void;
  onCreateNew: () => void;
  onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTasks = normalizedQuery
    ? tasks.filter((task) => task.name.toLowerCase().includes(normalizedQuery))
    : tasks;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
        style={{ maxHeight: "80vh" }}
      >
        {/* header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            Add Main Task
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || loading}
              title="Refresh list"
              className="grid h-7 w-7 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-95"
              style={{
                borderColor: ACCENT_BORDER,
                backgroundColor: ACCENT_SOFT,
                color: ACCENT,
              }}
            >
              <RefreshCw
                className={[
                  "h-3.5 w-3.5",
                  refreshing ? "animate-spin" : "",
                ].join(" ")}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 dark:text-slate-400 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search main tasks"
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-[13px] text-gray-800 dark:text-slate-100 outline-none transition focus:border-[#4ade80] focus:ring-2 focus:ring-[#4ade80]/15 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 dark:text-slate-500 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear task search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* task list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 green-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gray-500 dark:text-slate-400">
              All available tasks have already been added.
            </p>
          ) : filteredTasks.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gray-500 dark:text-slate-400">
              No main tasks match your search.
            </p>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <span className="text-[13px] text-gray-800 dark:text-slate-100">
                    {task.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdd(task)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-95"
                    style={{
                      borderColor: ACCENT_BORDER,
                      backgroundColor: ACCENT_SOFT,
                      color: ACCENT,
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Create New Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MainTaskAssignment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/basic-details");
    router.prefetch("/admin/job-creation/sub-task-assignment");
  }, [router]);

  const [jobNo, setJobNo] = useState("");
  const [siteName, setSiteName] = useState("");
  // YYYY-MM-DD slice of the project's scheduled start. Passed to the
  // employees endpoint when seeding default staff for a newly-added
  // main task so unavailability blocks for that date are honored.
  const [scheduledDate, setScheduledDate] = useState<string>("");
  // Skip the loading flash on Go Back / repeat visits — when the wizard
  // cache already has main tasks for this project, the effect below can
  // render from cache synchronously without spinning.
  const [loadingProject, setLoadingProject] = useState(() => {
    if (typeof window === "undefined") return true;
    const cached = getCachedMainTasks(projectId);
    return !cached || cached.length === 0 || !cached[0]?.id;
  });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [refreshingTasks, setRefreshingTasks] = useState(false);

  const [selected, setSelected] = useState<Task[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  // Undo stack. Each entry snapshots the full cache slice the next
  // setCachedMainTasks may cascade-drop (subtasks + materials), not just
  // the main-task list, so Ctrl+Z can put everything back exactly as it
  // was. Without snapshotting the cascade victims, restoring `selected`
  // alone leaves downstream pages pointing at a main task whose nested
  // sub-task / material rows were already pruned.
  type SelectedHistoryEntry = {
    selected: Task[];
    subTasks: CachedSubTask[];
    materials: CachedMaterial[];
  };
  const [selectedHistory, setSelectedHistory] = useState<SelectedHistoryEntry[]>(
    [],
  );

  const [isDirty, setIsDirty] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [isProcessingNext, setIsProcessingNext] = useState(false);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [selectedTaskIdsForDelete, setSelectedTaskIdsForDelete] = useState<
    Set<string>
  >(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // drag-and-drop
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null) return;
    if (dragIndex !== targetIndex) {
      pushSelectedHistory();
      const next = [...selected];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      setSelected(next);
      commitSelectedToCache(next);
      setIsDirty(true); markWizardDirty(projectId);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  function pushSelectedHistory() {
    const subTasksSnapshot = projectId ? getCachedSubTasks(projectId) ?? [] : [];
    const materialsSnapshot = projectId
      ? getCachedMaterials(projectId) ?? []
      : [];
    setSelectedHistory((prev) => [
      ...prev,
      {
        selected,
        subTasks: subTasksSnapshot,
        materials: materialsSnapshot,
      },
    ]);
  }

  // Push the user's current main-task selection into the wizard cache.
  // setCachedMainTasks cascades to drop subtasks + materials belonging
  // to tasks that are no longer in the list, which is what keeps the
  // project-schedule (and every other downstream page) from showing
  // ghost rows for tasks the admin removed here.
  function commitSelectedToCache(updated: Task[]) {
    if (!projectId) return;
    setCachedMainTasks(
      projectId,
      updated.map((t) => ({
        id: t.id,
        name: t.name,
        project_task_id: t.project_task_id,
      })),
    );
  }

  function addTask(task: Task) {
    pendingScrollTopRef.current = listRef.current?.scrollTop ?? null;
    pushSelectedHistory();
    const isNew = !selected.some((item) => item.id === task.id);
    const updated = isNew ? [...selected, task] : selected;
    setSelected(updated);
    commitSelectedToCache(updated);
    setIsDirty(true); markWizardDirty(projectId);

    // Fire-and-forget: pre-populate the wizard cache with the
    // catalog's default subtasks for this main task. In AI mode the
    // cache already has them via the generated draft, so we skip in
    // that case. In manual mode this is what makes the
    // sub-task-assignment page land with subtasks ready to review
    // instead of an empty picker the admin would have to click
    // through for every main task.
    if (isNew) {
      void prefetchDefaultSubTasks(task);
    }
  }

  async function prefetchDefaultSubTasks(task: Task) {
    if (!projectId) return;
    try {
      const existing = getCachedSubTasks(projectId) ?? [];
      // Skip if the cache already has subtasks for this main task —
      // means we're either replaying the AI flow or the admin
      // re-added a main task they just removed.
      if (existing.some((st) => st.mainTaskId === task.id)) return;

      const response = await fetch(
        `/api/planning/getSubTasksByMainTask?mainTaskIds=${encodeURIComponent(task.id)}`,
      );
      if (!response.ok) return;
      const data = await response.json();
      const fetched: Array<{ id: string; name: string; sortOrder?: number }> =
        Array.isArray(data?.subTasks) ? data.subTasks : [];
      if (fetched.length === 0) return;

      // Build the (taskName, subTaskTitle) pairs once — the batched
      // catalog lookups (equipment, materials) and the employee
      // assignment endpoint all key off the same shape.
      const pairs = fetched.map((sub) => ({
        taskName: task.name,
        subTaskTitle: sub.name,
      }));

      // Equipment / materials / employees defaults are independent —
      // fan them out in parallel. Each failure is non-fatal: the admin
      // can still fill the gap on the downstream pages, so we treat
      // missing data as "empty default" rather than aborting the seed.
      const [equipmentResult, materialsResult, employeesResult] =
        await Promise.allSettled([
          fetch("/api/planning/getEquipmentBatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: pairs }),
          }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/planning/getMaterialsBatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: pairs }),
          }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/planning/getEmployees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduledDate: scheduledDate || undefined,
              tasks: [
                {
                  taskName: task.name,
                  subTasks: fetched.map((sub) => ({
                    title: sub.name,
                    requiredEmployeeCount: DEFAULT_SUBTASK_EMPLOYEE_COUNT,
                  })),
                },
              ],
            }),
          }).then((r) => (r.ok ? r.json() : null)),
        ]);

      const equipmentBySubTaskTitle = new Map<
        string,
        Array<{ equipment_id: string; name: string }>
      >();
      if (
        equipmentResult.status === "fulfilled" &&
        equipmentResult.value &&
        Array.isArray(equipmentResult.value.results)
      ) {
        for (const row of equipmentResult.value.results) {
          const subTaskTitle =
            typeof row?.subTaskTitle === "string" ? row.subTaskTitle : "";
          if (!subTaskTitle) continue;
          equipmentBySubTaskTitle.set(
            subTaskTitle.toLowerCase(),
            Array.isArray(row.equipment) ? row.equipment : [],
          );
        }
      }

      // Materials live on the main-task-level cache slot, so we union
      // every subtask's default catalog into one deduped list keyed
      // by material_id.
      type DefaultMaterial = {
        material_id: string;
        name: string;
        unit: string;
        unit_cost: number;
      };
      const dedupedMaterials = new Map<string, DefaultMaterial>();
      if (
        materialsResult.status === "fulfilled" &&
        materialsResult.value &&
        Array.isArray(materialsResult.value.results)
      ) {
        for (const row of materialsResult.value.results) {
          for (const mat of Array.isArray(row?.materials)
            ? row.materials
            : []) {
            if (!mat?.material_id) continue;
            if (dedupedMaterials.has(mat.material_id)) continue;
            dedupedMaterials.set(mat.material_id, {
              material_id: mat.material_id,
              name: String(mat.name ?? ""),
              unit: String(mat.unit ?? ""),
              unit_cost: Number(mat.unit_cost ?? 0) || 0,
            });
          }
        }
      }

      const employeesBySubTaskTitle = new Map<string, string[]>();
      if (
        employeesResult.status === "fulfilled" &&
        employeesResult.value &&
        Array.isArray(employeesResult.value.assignments)
      ) {
        for (const group of employeesResult.value.assignments) {
          for (const assignment of Array.isArray(group?.assignments)
            ? group.assignments
            : []) {
            const subTaskTitle =
              typeof assignment?.subTaskTitle === "string"
                ? assignment.subTaskTitle
                : "";
            if (!subTaskTitle) continue;
            const ids = Array.isArray(assignment.employees)
              ? assignment.employees
                  .map((emp: { id?: string }) =>
                    typeof emp?.id === "string" ? emp.id : "",
                  )
                  .filter(Boolean)
              : [];
            employeesBySubTaskTitle.set(subTaskTitle.toLowerCase(), ids);
          }
        }
      }

      const additions: CachedSubTask[] = fetched.map((sub, idx) => {
        const titleKey = sub.name.toLowerCase();
        const subEquipment = equipmentBySubTaskTitle.get(titleKey) ?? [];
        const subEmployees = employeesBySubTaskTitle.get(titleKey) ?? [];
        // One piece of equipment per assigned crew member. If the
        // assignment endpoint returned zero employees (no eligible
        // staff for that day), fall back to the requested crew size
        // so the admin still sees a meaningful default count.
        const equipmentQuantity =
          subEmployees.length > 0
            ? subEmployees.length
            : DEFAULT_SUBTASK_EMPLOYEE_COUNT;
        return {
          // Temp id so the cache slot is unique; batchSaveProject at
          // the overview step replaces these with real DB ids.
          id: `temp-${task.id}-${sub.id}`,
          subTaskId: sub.id,
          mainTaskId: task.id,
          projectTaskId: task.project_task_id ?? "",
          title: sub.name,
          sortOrder:
            typeof sub.sortOrder === "number" ? sub.sortOrder : idx,
          estimatedHours: DEFAULT_SUBTASK_ESTIMATED_HOURS,
          scheduledStartDatetime: null,
          scheduledEndDatetime: null,
          assignedEmployeeIds: subEmployees,
          equipments: subEquipment.map((eq, i) => ({
            id: `temp-eq-${task.id}-${sub.id}-${i}`,
            equipmentId: eq.equipment_id,
            name: eq.name,
            quantity: equipmentQuantity,
            unitCost: 0,
          })),
        };
      });

      // Re-read the cache before merging so we don't clobber any
      // updates that landed while the fetch was in flight.
      const latest = getCachedSubTasks(projectId) ?? [];
      if (latest.some((st) => st.mainTaskId === task.id)) return;
      setCachedSubTasks(projectId, [...latest, ...additions]);

      // Manual-mode tasks have no project_task_id yet — group the
      // seeded materials under the main_task_id, which the materials
      // page already treats as the fallback group id and which the
      // batch save translates back to the real project_task_id at
      // overview time.
      const materialProjectTaskId =
        task.project_task_id && task.project_task_id.length > 0
          ? task.project_task_id
          : task.id;
      const seededMaterials: CachedMaterial[] = Array.from(
        dedupedMaterials.values(),
      ).map((mat) => {
        const quantity = 1;
        return {
          id: `temp-mat-${task.id}-${mat.material_id}`,
          projectTaskId: materialProjectTaskId,
          materialId: mat.material_id,
          name: mat.name,
          unit: mat.unit || null,
          quantity,
          unitCost: mat.unit_cost,
          estimatedCost: quantity * mat.unit_cost,
        };
      });
      if (seededMaterials.length > 0) {
        const latestMaterials = getCachedMaterials(projectId) ?? [];
        // Avoid duplicating a material the admin already has on this
        // task (e.g. when re-adding a main task after removal).
        const existingKeys = new Set(
          latestMaterials.map(
            (m) => `${m.projectTaskId}::${m.materialId}`,
          ),
        );
        const newMaterials = seededMaterials.filter(
          (m) => !existingKeys.has(`${m.projectTaskId}::${m.materialId}`),
        );
        if (newMaterials.length > 0) {
          setCachedMaterials(projectId, [...latestMaterials, ...newMaterials]);
        }
      }

      // With subtasks + estimated hours + assigned staff now in cache,
      // ask the scheduler to lay them out over the project's work
      // calendar. The endpoint already respects work hours, lunch, and
      // unavailable days (manual blocks + holidays), so manual mode
      // gets the same gating as the AI flow.
      await scheduleCachedSubTasks();
    } catch {
      // Silent — sub-task-assignment still lets the admin add
      // subtasks via the picker. The auto-populate is a convenience.
    }
  }

  async function scheduleCachedSubTasks() {
    if (!projectId) return;
    const meta = getCachedProjectMeta(projectId);
    const projectStart = meta?.scheduledStartDatetime ?? null;
    if (!projectStart) return;

    const cachedMainTasks = getCachedMainTasks(projectId) ?? [];
    const cachedSubTasks = getCachedSubTasks(projectId) ?? [];
    if (cachedMainTasks.length === 0 || cachedSubTasks.length === 0) return;

    const subTasksByMain = new Map<string, CachedSubTask[]>();
    for (const st of cachedSubTasks) {
      const list = subTasksByMain.get(st.mainTaskId) ?? [];
      list.push(st);
      subTasksByMain.set(st.mainTaskId, list);
    }
    for (const list of subTasksByMain.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const generatedTasks = cachedMainTasks
      .filter((mt) => (subTasksByMain.get(mt.id)?.length ?? 0) > 0)
      .map((mt, mainIdx) => ({
        name: mt.name,
        priority: mainIdx,
        sub_tasks: (subTasksByMain.get(mt.id) ?? []).map((st, subIdx) => ({
          title: st.title,
          priority: subIdx,
          duration: {
            estimatedHours:
              st.estimatedHours ?? DEFAULT_SUBTASK_ESTIMATED_HOURS,
          },
          employees: st.assignedEmployeeIds.map((id) => ({ id })),
        })),
      }));

    if (generatedTasks.length === 0) return;

    let scheduleData:
      | {
          scheduledItems?: Array<{
            taskName: string;
            subTaskTitle: string;
            scheduledStartDatetime?: string | null;
            scheduledEndDatetime?: string | null;
          }>;
        }
      | null = null;
    try {
      const response = await fetch("/api/planning/getProjectSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            scheduled_start_datetime: projectStart,
            scheduled_end_datetime: null,
          },
          generatedTasks,
        }),
      });
      if (!response.ok) return;
      scheduleData = await response.json();
    } catch {
      return;
    }

    const items = Array.isArray(scheduleData?.scheduledItems)
      ? scheduleData.scheduledItems
      : [];
    if (items.length === 0) return;

    const scheduleMap = new Map<
      string,
      { start: string | null; end: string | null }
    >();
    for (const item of items) {
      scheduleMap.set(`${item.taskName}__${item.subTaskTitle}`, {
        start: item.scheduledStartDatetime ?? null,
        end: item.scheduledEndDatetime ?? null,
      });
    }

    // Re-read the cache one more time before merging — subtask edits
    // (renames, removals) may have landed while the scheduler was
    // running, and we don't want to resurrect deleted rows.
    const latestSubTasks = getCachedSubTasks(projectId) ?? [];
    const mainTaskNameById = new Map(
      (getCachedMainTasks(projectId) ?? []).map((mt) => [mt.id, mt.name]),
    );

    const updated = latestSubTasks.map((st) => {
      const taskName = mainTaskNameById.get(st.mainTaskId) ?? "";
      const schedule = scheduleMap.get(`${taskName}__${st.title}`);
      if (!schedule || !schedule.start || !schedule.end) return st;
      // Skip rewriting subtasks whose schedule already matches — keeps
      // setCachedSubTasks idempotent and lets a no-op pass through
      // without touching sessionStorage.
      if (
        st.scheduledStartDatetime === schedule.start &&
        st.scheduledEndDatetime === schedule.end
      ) {
        return st;
      }
      return {
        ...st,
        scheduledStartDatetime: schedule.start,
        scheduledEndDatetime: schedule.end,
      };
    });

    setCachedSubTasks(projectId, updated);
  }

  function removeSelected(taskId: string) {
    pendingScrollTopRef.current = listRef.current?.scrollTop ?? null;
    pushSelectedHistory();
    const updated = selected.filter((item) => item.id !== taskId);
    setSelected(updated);
    commitSelectedToCache(updated);
    setSelectedTaskIdsForDelete((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setIsDirty(true); markWizardDirty(projectId);
  }

  function removeSelectedTasks(taskIds: Set<string>) {
    if (taskIds.size === 0) return;
    pendingScrollTopRef.current = listRef.current?.scrollTop ?? null;
    pushSelectedHistory();
    const updated = selected.filter((item) => !taskIds.has(item.id));
    setSelected(updated);
    commitSelectedToCache(updated);
    setSelectedTaskIdsForDelete(new Set());
    setIsDirty(true); markWizardDirty(projectId);
  }

  function toggleTaskDeleteSelection(taskId: string) {
    setSelectedTaskIdsForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleAllTaskDeleteSelection() {
    const allIds = selected.map((task) => task.id);
    const allSelected =
      allIds.length > 0 &&
      allIds.every((id) => selectedTaskIdsForDelete.has(id));

    setSelectedTaskIdsForDelete(allSelected ? new Set() : new Set(allIds));
  }

  function handleOpenAddTaskModal() {
    setAddTaskModalOpen(true);
  }

  function handleCloseAddTaskModal() {
    setAddTaskModalOpen(false);
  }

  function handleAddFromModal(task: Task) {
    addTask(task);
  }

  function handleOpenCreateTaskModal() {
    setAddTaskModalOpen(false);
    setCreateTaskModalOpen(true);
  }

  function handleCloseCreateTaskModal() {
    setCreateTaskModalOpen(false);
  }

  async function handleCreateTask(payload: {
    name: string;
    sortOrder: string;
    surfaceKey: string;
    formulaTemplateId: string;
    subTasks: {
      description: string;
      sortOrder: string;
      materialIds: string[];
      equipmentIds: string[];
    }[];
  }) {
    const response = await fetch("/api/planning/createMainTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        [data?.error, data?.details].filter(Boolean).join(": ") ||
        "Failed to create task.";
      toast.error(message);
      throw new Error(message);
    }

    const newTask: Task = {
      id: data.mainTask.main_task_id,
      name: data.mainTask.name,
    };

    // Link the chosen formula via material_estimation_rules. Mirrors
    // the settings-page Add Main Task flow: main task is created
    // first, formula is linked after. If linking fails we keep the
    // main task and surface a warning so the admin can re-link from
    // Edit Estimations rather than losing the whole creation.
    let linkSummary = `Surface: ${payload.surfaceKey}`;
    try {
      const ruleResponse = await fetch(
        "/api/planning/material-estimation-rule",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mainTaskId: newTask.id,
            formulaTemplateId: payload.formulaTemplateId,
            materialName: payload.name,
            minimumQuantity: 0,
            isActive: true,
          }),
        },
      );
      const ruleBody = await ruleResponse.json().catch(() => null);
      if (!ruleResponse.ok) {
        throw new Error(
          [ruleBody?.error, ruleBody?.details]
            .filter(Boolean)
            .join(" - ") || "Failed to link formula.",
        );
      }
      linkSummary = `Linked to formula. Surface: ${payload.surfaceKey}.`;
    } catch (linkError) {
      const message =
        linkError instanceof Error
          ? linkError.message
          : "Could not attach the selected formula.";
      toast.error("Formula link failed.", {
        description: `${message} The main task was still created. Wire the formula manually from Edit Estimations.`,
      });
    }

    pushSelectedHistory();
    const updated = selected.some((item) => item.id === newTask.id)
      ? selected
      : [...selected, newTask];
    setSelected(updated);
    commitSelectedToCache(updated);
    setIsDirty(true); markWizardDirty(projectId);
    toast.success(`Task "${newTask.name}" created.`, {
      description: linkSummary,
    });
    loadAllMainTasks({ silent: true });
  }

  function undoSelectedTasks() {
    setSelectedHistory((prev) => {
      if (prev.length === 0) return prev;
      const nextHistory = [...prev];
      const previous = nextHistory.pop();
      if (previous) {
        pendingScrollTopRef.current = listRef.current?.scrollTop ?? null;
        setSelected(previous.selected);
        // Order matters: setCachedMainTasks filters subTasks/materials
        // against the currently-cached lists, which are still in the
        // post-delete pruned state. Restore the main-task list first,
        // then overwrite the cascade victims with the snapshot so the
        // dropped sub-tasks + materials come back intact.
        commitSelectedToCache(previous.selected);
        if (projectId) {
          setCachedSubTasks(projectId, previous.subTasks);
          setCachedMaterials(projectId, previous.materials);
        }
      }
      return nextHistory;
    });
  }

  function handleNext() {
    setIsProcessingNext(true);
    setCachedMainTasks(
      projectId,
      selected.map((t) => ({ id: t.id, name: t.name, project_task_id: t.project_task_id })),
    );
    setIsDirty(false);
    setCachedStep(projectId, "sub_task_pending");
    setOptimisticProjectStatus(projectId, "sub_task_pending");
    router.push(`/admin/job-creation/sub-task-assignment?projectId=${projectId}`);
  }

  function handleGoBack() {
    setCachedMainTasks(
      projectId,
      selected.map((t) => ({ id: t.id, name: t.name, project_task_id: t.project_task_id })),
    );
    setIsDirty(false);
    setCachedStep(projectId, "main_task_pending");
    setOptimisticProjectStatus(projectId, "main_task_pending");
    router.push(`/admin/job-creation/basic-details?projectId=${projectId}`);
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
      undoSelectedTasks();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function loadAllMainTasks(opts?: { silent?: boolean }) {
    try {
      if (opts?.silent) setRefreshingTasks(true);
      else setLoadingTasks(true);

      const response = await fetch("/api/planning/getMainTasks", {
        method: "GET",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error || "Failed to load main tasks.", data?.details || ""]
            .filter(Boolean)
            .join("\n\n"),
        );
      }

      const rows = Array.isArray(data?.mainTasks) ? data.mainTasks : [];
      const mapped: Task[] = rows
        .map((item: any) => ({ id: item.main_task_id, name: item.name }))
        .filter((item: Task) => item.id && item.name);

      setAllTasks(mapped);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load main tasks.");
    } finally {
      setLoadingTasks(false);
      setRefreshingTasks(false);
    }
  }

  useEffect(() => {
    loadAllMainTasks();
  }, []);

  useEffect(() => {
    async function loadProjectMainTasks() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoadingProject(false);
        return;
      }

      const hydrated = await ensureWizardCacheHydrated(projectId);

      // Try loading from wizard cache first (instant)
      const cached = getCachedMainTasks(projectId);
      const meta = getCachedProjectMeta(projectId);
      if (cached && cached.length > 0 && cached[0].id) {
        setJobNo(meta?.projectCode || "");
        setSiteName(meta?.projectTitle || "");
        setScheduledDate(
          extractScheduledDate(meta?.scheduledStartDatetime ?? null),
        );
        setSelected(cached.map((t) => ({ id: t.id, name: t.name, project_task_id: t.project_task_id })));
        setLoadingProject(false);
        return;
      }

      // Cache miss — fetch from API and populate cache
      try {
        setLoadingProject(true);
        const response = await fetch(
          `/api/planning/getProjectMainTasks?projectId=${projectId}`,
          { method: "GET" },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            [
              data?.error || "Failed to load project main tasks.",
              data?.details || "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
        }

        const projectRow = data?.project;
        const projectTasks = Array.isArray(data?.mainTasks)
          ? data.mainTasks
          : [];

        setJobNo(projectRow?.project_code || "");
        setSiteName(projectRow?.title || "");
        const scheduledStartIso =
          projectRow?.scheduled_start_datetime ?? null;
        setScheduledDate(extractScheduledDate(scheduledStartIso));
        setCachedScheduledStartDatetime(projectId, scheduledStartIso);

        const loadedTasks: Task[] = projectTasks
          .map((item: any) => ({
            id: item.main_task?.main_task_id || item.project_task_id,
            name: item.main_task?.name || "Unnamed Main Task",
            project_task_id: item.project_task_id,
          }))
          .filter((item: Task) => item.name);

        setSelected(loadedTasks);

        // Populate cache for future visits
        setCachedMainTasks(
          projectId,
          loadedTasks.map((t) => ({ id: t.id, name: t.name, project_task_id: t.project_task_id })),
        );
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project main tasks.");
      } finally {
        setLoadingProject(false);
      }
    }

    loadProjectMainTasks();
  }, [projectId]);

  useLayoutEffect(() => {
    if (!listRef.current) return;
    if (pendingScrollTopRef.current === null) return;
    listRef.current.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [selected]);

  useEffect(() => {
    const validIds = new Set(selected.map((task) => task.id));
    setSelectedTaskIdsForDelete((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selected]);

  // tasks not yet added (available in the modal)
  const selectedIds = new Set(selected.map((t) => t.id));
  const availableTasks = allTasks.filter((t) => !selectedIds.has(t.id));

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-50 text-gray-900 dark:text-slate-100 dark:bg-slate-800">
      <div className="flex h-full flex-col gap-2 overflow-hidden px-4 pb-3 pt-3 lg:px-5">
        {/* Header */}
        <div className="flex items-center gap-2 text-[17px] font-semibold text-gray-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0 dark:text-slate-600"
            aria-hidden
          />
          <span>Main Tasks</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main section */}
          <section className="min-h-0 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            {/* Section header */}
            <div className="shrink-0 border-b border-gray-200 px-4 py-2.5 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-md"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      Main Task Assignment
                    </p>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-600 dark:text-slate-400">
                    Add and order the main tasks for this project. Drag to
                    reorder.
                  </p>
                </div>

                <div
                  className="inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: ACCENT_BORDER,
                    backgroundColor: ACCENT_SOFT,
                    color: ACCENT,
                  }}
                >
                  Task Setup
                </div>
              </div>
            </div>

            {/* Added Main Tasks panel */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Panel header */}
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {selected.length > 0 ? (
                    <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-gray-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={
                          selected.length > 0 &&
                          selected.every((task) =>
                            selectedTaskIdsForDelete.has(task.id),
                          )
                        }
                        onChange={toggleAllTaskDeleteSelection}
                        className="task-checkbox h-4 w-4"
                        aria-label="Select all main tasks for deletion"
                      />
                      Main tasks
                    </label>
                  ) : null}
                  <span className="text-[12px] font-semibold text-gray-700 dark:text-slate-200">
                    Added Main Tasks
                  </span>
                  {selected.length > 0 && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                      style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                    >
                      {selected.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedTaskIdsForDelete.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteOpen(true)}
                      className="inline-flex items-center justify-center rounded-md border border-rose-300/60 bg-rose-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-500/15 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200 dark:hover:bg-rose-400/15"
                    >
                      Remove
                      <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700 dark:bg-rose-400/15 dark:text-rose-100">
                        {selectedTaskIdsForDelete.size}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleOpenAddTaskModal}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
                    style={{
                      borderColor: ACCENT_BORDER,
                      backgroundColor: ACCENT_SOFT,
                      color: ACCENT,
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              </div>

              {/* Task list */}
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto px-4 py-2 green-scrollbar"
              >
                {loadingProject ? (
                  <div className="flex h-full min-h-[200px] items-center justify-center">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-700" />
                      <span className="text-sm font-medium text-gray-700">
                        Loading project main tasks...
                      </span>
                    </div>
                  </div>
                ) : selected.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div
                      className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: ACCENT_SOFT }}
                    >
                      <Plus className="h-5 w-5" style={{ color: ACCENT }} />
                    </div>
                    <p className="text-[13px] font-medium text-gray-700">
                      No tasks added yet
                    </p>
                    <p className="mt-1 text-[12px] text-gray-500 dark:text-slate-400">
                      Click &quot;Add&quot; above to select main tasks for this
                      project.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selected.map((task, index) => {
                      const isDragging = dragIndex === index;
                      const isOver =
                        dragOverIndex === index && dragIndex !== index;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={() => handleDrop(index)}
                          onDragEnd={handleDragEnd}
                          className={[
                            "flex items-center gap-3 rounded-lg border px-3 py-2 transition select-none cursor-grab active:cursor-grabbing",
                            isDragging
                              ? "opacity-40 border-dashed"
                              : isOver
                                ? "border-[#4ade80] bg-[#4ade80]/10 shadow-sm"
                                : "border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/80",
                          ].join(" ")}
                        >
                          {/* sort order number */}
                          <label className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedTaskIdsForDelete.has(task.id)}
                              onChange={() =>
                                toggleTaskDeleteSelection(task.id)
                              }
                              className="task-checkbox h-4 w-4"
                              aria-label={`Select ${task.name} for deletion`}
                            />
                          </label>
                          <span
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                            style={{
                              backgroundColor: ACCENT_SOFT,
                              color: ACCENT,
                            }}
                          >
                            {index + 1}
                          </span>

                          {/* grip handle */}
                          <GripVertical className="h-4 w-4 shrink-0 text-gray-300 dark:text-slate-600" />

                          {/* task name */}
                          <span className="flex-1 truncate text-[13px] font-medium text-gray-800 dark:text-slate-100">
                            {task.name}
                          </span>

                          {/* remove button */}
                          <button
                            type="button"
                            onClick={() => setTaskPendingDelete(task)}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-200/70 bg-red-50 text-red-500 transition hover:bg-red-100 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300 dark:hover:bg-red-400/15"
                            aria-label={`Remove ${task.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    <div className="h-1" />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="flex h-full min-h-0 flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="px-4 py-3">
                <div className="text-[16px] font-semibold text-gray-900 dark:text-slate-100">
                  {jobNo}
                </div>
                <div className="mt-1 text-[12px] text-gray-500 dark:text-slate-400">
                  {siteName}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="main_task" />
            </div>
          </aside>
        </div>

        {/* Footer nav */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 pt-1">
          <button
            type="button"
            onClick={handleNext}
            disabled={isProcessingNext}
            className="inline-flex h-9 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white bg-[#4ade80] dark:bg-green-400 transform transition-all duration-150 hover:opacity-90 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          >
            {isProcessingNext ? (
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

      {/* Add Task Modal */}
      {addTaskModalOpen && (
        <AddTaskModal
          tasks={availableTasks}
          loading={loadingTasks}
          refreshing={refreshingTasks}
          onAdd={(task) => {
            handleAddFromModal(task);
          }}
          onClose={handleCloseAddTaskModal}
          onCreateNew={handleOpenCreateTaskModal}
          onRefresh={() => loadAllMainTasks({ silent: true })}
        />
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        open={createTaskModalOpen}
        onClose={handleCloseCreateTaskModal}
        onSave={handleCreateTask}
      />

      <div className="confirm-delete-button-friendly">
        <ConfirmDeleteModal
          open={Boolean(taskPendingDelete)}
          title="Remove main task?"
          description={
            taskPendingDelete
              ? `Remove "${taskPendingDelete.name}" from this project?`
              : "Remove this main task from this project?"
          }
          confirmLabel="Remove"
          onCancel={() => setTaskPendingDelete(null)}
          onConfirm={() => {
            if (taskPendingDelete) removeSelected(taskPendingDelete.id);
            setTaskPendingDelete(null);
          }}
        />
      </div>

      <div className="confirm-delete-button-friendly">
        <ConfirmDeleteModal
          open={bulkDeleteOpen}
          title="Remove selected main tasks?"
          description={`Remove ${selectedTaskIdsForDelete.size} selected main task${
            selectedTaskIdsForDelete.size === 1 ? "" : "s"
          } from this project?`}
          confirmLabel="Remove selected"
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={() => {
            removeSelectedTasks(selectedTaskIdsForDelete);
            setBulkDeleteOpen(false);
          }}
        />
      </div>

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: rgba(148, 163, 184, 0.16);
          border-radius: 999px;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.2);
        }
        .green-scrollbar {
          scrollbar-color: ${ACCENT} rgba(148, 163, 184, 0.16);
          scrollbar-width: thin;
        }
        .task-checkbox {
          appearance: none;
          -webkit-appearance: none;
          display: inline-grid;
          place-content: center;
          border-radius: 0.25rem;
          border: 1px solid rgba(100, 116, 139, 0.9);
          background: transparent;
          cursor: pointer;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease,
            background-color 150ms ease;
        }
        .task-checkbox:hover {
          border-color: ${ACCENT};
        }
        .task-checkbox:checked {
          border-color: ${ACCENT};
          background-color: transparent;
          box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.16);
        }
        .task-checkbox:checked::before {
          content: "";
          width: 0.55rem;
          height: 0.55rem;
          background: ${ACCENT};
          clip-path: polygon(
            14% 44%,
            0 60%,
            39% 100%,
            100% 18%,
            84% 6%,
            36% 72%
          );
        }

        .confirm-delete-button-friendly button {
          border-color: rgb(229 231 235);
          background-color: rgb(255 255 255);
          color: rgb(55 65 81);
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            color 150ms ease,
            filter 150ms ease,
            transform 150ms ease;
        }

        .confirm-delete-button-friendly button:hover {
          background-color: rgb(249 250 251);
        }

        .confirm-delete-button-friendly button:last-of-type {
          border-color: rgb(254 202 202);
          background-color: rgb(254 242 242);
          color: rgb(185 28 28);
        }

        .confirm-delete-button-friendly button:last-of-type:hover {
          background-color: rgb(254 226 226);
        }

        .dark .confirm-delete-button-friendly button {
          border-color: rgb(51 65 85);
          background-color: rgb(15 23 42);
          color: rgb(226 232 240);
        }

        .dark .confirm-delete-button-friendly button:hover {
          background-color: rgb(30 41 59);
        }

        .dark .confirm-delete-button-friendly button:last-of-type {
          border-color: rgba(251, 113, 133, 0.4);
          background-color: rgba(244, 63, 94, 0.16);
          color: rgb(254 205 211);
        }

        .dark .confirm-delete-button-friendly button:last-of-type:hover {
          background-color: rgba(244, 63, 94, 0.24);
        }
      `}</style>
    </div>
  );
}
