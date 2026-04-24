"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, Plus, X, Loader2, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import CreateTaskModal from "@/components/project-creation/CreateTaskModal";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const ACCENT_SOFT = "#e6f9ef";
const ACCENT_BORDER = "#b7efcf";
const BORDER = "border-gray-200";


type Task = {
  id: string;
  name: string;
  project_task_id?: string;
};

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function MainTaskAssignment() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [jobNo, setJobNo] = useState("");
  const [siteName, setSiteName] = useState("");
  const [loadingProject, setLoadingProject] = useState(true);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [refreshingTasks, setRefreshingTasks] = useState(false);

  const [selected, setSelected] = useState<Task[]>([]);

  const mainTaskListRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const skipPopstateGuardRef = useRef(false);
  const [selectedHistory, setSelectedHistory] = useState<Task[][]>([]);

  const [pendingAction, setPendingAction] = useState<
    "next" | "back" | "browserBack" | null
  >(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const allowBrowserBackRef = useRef(false);
  const suppressLeaveGuardRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [isProcessingNext, setIsProcessingNext] = useState(false);
  const [isSavingFromModal, setIsSavingFromModal] = useState(false);

  function pushSelectedHistory() {
    setSelectedHistory((prev) => [...prev, selected]);
  }

  function isSelected(task: Task) {
    return selected.some((s) => s.id === task.id);
  }

  function addTask(task: Task) {
    pendingScrollTopRef.current = mainTaskListRef.current?.scrollTop ?? null;
    pushSelectedHistory();

    setSelected((prev) => {
      if (prev.some((item) => item.id === task.id)) return prev;
      return [task, ...prev];
    });

    setIsDirty(true);
  }

  function removeSelected(taskId: string) {
    pendingScrollTopRef.current = mainTaskListRef.current?.scrollTop ?? null;
    pushSelectedHistory();

    setSelected((prev) => prev.filter((item) => item.id !== taskId));

    setIsDirty(true);
  }

  function removeFromList(task: Task) {
    pendingScrollTopRef.current = mainTaskListRef.current?.scrollTop ?? null;
    pushSelectedHistory();

    setSelected((prev) => prev.filter((item) => item.id !== task.id));

    setIsDirty(true);
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

    pushSelectedHistory();
    setSelected((prev) => {
      if (prev.some((item) => item.id === newTask.id)) return prev;
      return [newTask, ...prev];
    });
    setIsDirty(true);
    toast.success(`Task "${newTask.name}" created.`);
    loadAllMainTasks({ silent: true });
  }

  function undoSelectedTasks() {
    setSelectedHistory((prev) => {
      if (prev.length === 0) return prev;

      const nextHistory = [...prev];
      const previousSelected = nextHistory.pop();

      if (previousSelected) {
        pendingScrollTopRef.current =
          mainTaskListRef.current?.scrollTop ?? null;
        setSelected(previousSelected);
      }

      return nextHistory;
    });
  }

  function handleNext() {
    requestLeave("next");
  }

  function requestLeave(action: "next" | "back" | "browserBack") {
    if (!isDirty) {
      void handleConfirmSave(action === "next", action);
      return;
    }

    if (action !== "next") {
      setIsProcessingNext(false);
    }

    setPendingAction(action);
    setShowSaveConfirm(true);
  }

  async function saveMainTaskChanges() {
    if (!projectId) {
      toast.error("Missing project ID.");
      return false;
    }

    try {
      const response = await fetch("/api/planning/saveProjectMainTasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          mainTasks: selected,
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
          `Failed to save main tasks. (${response.status})`;

        toast.error(message);
        return false;
      }

      setIsDirty(false);
      return true;
    } catch (error: any) {
      toast.error(
        error?.message || "Something went wrong while saving main tasks.",
      );
      return false;
    }
  }

  async function handleConfirmSave(
    shouldSave: boolean,
    forcedAction?: "next" | "back" | "browserBack",
  ) {
    const action = forcedAction ?? pendingAction;
    if (!action) return;

    setShowSaveConfirm(false);
    setPendingAction(null);

    if (action === "browserBack") {
      if (shouldSave) {
        setIsSavingFromModal(true);
        const saved = await saveMainTaskChanges();
        setIsSavingFromModal(false);
        if (!saved) {
          setIsProcessingNext(false);
          return;
        }
      }

      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      setIsDirty(false);
      window.history.back();
      return;
    }

    const target =
      action === "next"
        ? `/admin/job-creation/sub-task-assignment?projectId=${projectId}`
        : `/admin/job-creation/basic-details?projectId=${projectId}`;

    if (!shouldSave) {
      if (action === "next") {
        setIsProcessingNext(true);
      } else {
        setIsProcessingNext(false);
      }

      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      window.location.href = target;
      return;
    }

    if (action === "next") {
      setIsProcessingNext(true);
    }

    setIsSavingFromModal(true);
    const saved = await saveMainTaskChanges();

    console.log("Saving done");
    console.log("saved =", saved);
    console.log("target =", target);

    setIsSavingFromModal(false);

    if (!saved) {
      setIsProcessingNext(false);
      return;
    }

    suppressLeaveGuardRef.current = true;
    setIsDirty(false);
    allowBrowserBackRef.current = true;

    console.log("About to navigate");
    window.location.href = target;
  }

  useEffect(() => {
    skipPopstateGuardRef.current = false;
    setIsProcessingNext(false);
    setIsSavingFromModal(false);
  }, [pathname]);

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
      if (opts?.silent) {
        setRefreshingTasks(true);
      } else {
        setLoadingTasks(true);
      }

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
        .map((item: any) => ({
          id: item.main_task_id,
          name: item.name,
        }))
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

        const loadedTasks: Task[] = projectTasks
          .map((item: any) => ({
            id: item.main_task?.main_task_id || item.project_task_id,
            name: item.main_task?.name || "Unnamed Main Task",
            project_task_id: item.project_task_id,
          }))
          .filter((item: Task) => item.name);

        setSelected(loadedTasks);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project main tasks.");
      } finally {
        setLoadingProject(false);
      }
    }

    loadProjectMainTasks();
  }, [projectId]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (skipPopstateGuardRef.current) {
        return;
      }

      if (allowBrowserBackRef.current) {
        allowBrowserBackRef.current = false;
        return;
      }

      if (!isDirty) {
        allowBrowserBackRef.current = true;
        window.history.back();
        return;
      }

      window.history.pushState(null, "", window.location.href);
      setPendingAction("browserBack");
      setShowSaveConfirm(true);
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (suppressLeaveGuardRef.current) return;
      if (!isDirty) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useLayoutEffect(() => {
    if (!mainTaskListRef.current) return;
    if (pendingScrollTopRef.current === null) return;

    mainTaskListRef.current.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [selected]);

  const selectedTaskIds = new Set(selected.map((task) => task.id));

  const groupedTasks = [
    ...allTasks.filter((task) => selectedTaskIds.has(task.id)),
    ...allTasks.filter((task) => !selectedTaskIds.has(task.id)),
  ];

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Main Tasks</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-h-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-md"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Main Task Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review, add, and manage the main tasks for this project.
                  </p>
                </div>

                <div
                  className="inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: ACCENT_BORDER,
                    backgroundColor: ACCENT_SOFT,
                    color: ACCENT,
                  }}>
                  Task Setup
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 px-6 pt-4 pb-4 overflow-hidden">
              <div className="grid h-full min-h-0 grid-rows-[35%_minmax(0,65%)] gap-4">
                <div className="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white flex flex-col">
                  <div className="border-b border-gray-200 px-4 py-3 text-[12px] font-semibold text-gray-700">
                    Added Main Tasks
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 green-scrollbar">
                    <div className="flex flex-wrap content-start gap-2">
                      {selected.length ? (
                        selected.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-2 rounded-sm border border-green-200 px-2.5 py-1 text-[12px] font-semibold"
                            style={{
                              backgroundColor: ACCENT_SOFT,
                              color: ACCENT,
                            }}>
                            <button
                              type="button"
                              onClick={() => removeSelected(t.id)}
                              className="grid h-4 w-4 place-items-center rounded-sm bg-white/80 hover:bg-white"
                              aria-label="Remove selected task"
                              title="Remove">
                              <X className="h-3 w-3 text-[#4FAE2A]" />
                            </button>
                            {t.name}
                          </span>
                        ))
                      ) : (
                        <div className="text-[12px] text-gray-500">
                          No tasks added yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white flex flex-col">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="grid flex-1 grid-cols-[88px_1fr] gap-4">
                        <div className="text-[12px] font-semibold text-gray-700">
                          Actions
                        </div>
                        <div className="text-[12px] font-semibold text-gray-700">
                          Main Tasks
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => loadAllMainTasks({ silent: true })}
                        disabled={refreshingTasks || loadingTasks}
                        title="Refresh task list"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-95"
                        style={{
                          borderColor: ACCENT_BORDER,
                          backgroundColor: ACCENT_SOFT,
                          color: ACCENT,
                        }}>
                        <RefreshCw
                          className={[
                            "h-3.5 w-3.5",
                            refreshingTasks ? "animate-spin" : "",
                          ].join(" ")}
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    ref={mainTaskListRef}
                    className="flex-1 min-h-0 overflow-y-auto px-4 py-2 green-scrollbar">
                    {loadingProject ? (
                      <div className="flex h-full min-h-[260px] items-center justify-center">
                        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-700" />
                          <span className="text-sm font-medium text-gray-700">
                            Loading project main tasks...
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-gray-200">
                          {loadingTasks ? (
                            <div className="px-1 py-4 text-[13px] text-gray-500">
                              Loading available main tasks...
                            </div>
                          ) : allTasks.length === 0 ? (
                            <div className="px-1 py-4 text-[13px] text-gray-500">
                              No main tasks found.
                            </div>
                          ) : (
                            groupedTasks.map((task) => {
                              const selectedFlag = isSelected(task);

                              return (
                                <div
                                  key={task.id}
                                  className="grid grid-cols-[88px_1fr] gap-4 items-center py-2.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      selectedFlag
                                        ? removeFromList(task)
                                        : addTask(task)
                                    }
                                    className={[
                                      "h-8 rounded-md border font-medium text-[12px]",
                                      "inline-flex items-center justify-center gap-1.5 px-2.5 transition",
                                      selectedFlag
                                        ? "hover:bg-red-50"
                                        : "hover:bg-gray-50",
                                    ].join(" ")}
                                    style={{
                                      borderColor: selectedFlag
                                        ? "#fecaca"
                                        : "#b7efcf",
                                      backgroundColor: selectedFlag
                                        ? "#fef2f2"
                                        : "#e6f9ef",
                                      color: selectedFlag
                                        ? "#dc2626"
                                        : "#00c065",
                                    }}>
                                    {selectedFlag ? (
                                      <>
                                        <X className="h-3.5 w-3.5" />
                                        Remove
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="h-3.5 w-3.5" />
                                        Add
                                      </>
                                    )}
                                  </button>

                                  <div className="relative min-h-12">
                                    <div className="flex min-h-12 items-center px-1 text-[13px] text-gray-800">
                                      <span className="truncate">
                                        {task.name}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div className="h-3" />
                      </>
                    )}
                  </div>
                </div>
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
                  style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="main_task" />
            </div>
          </aside>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleNext}
            disabled={isProcessingNext}
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            style={{ backgroundColor: ACCENT }}>
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

      {showSaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Save changes?
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Do you want to save your main task changes before leaving?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowSaveConfirm(false);
                  setPendingAction(null);
                  setIsProcessingNext(false);
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
                disabled={isSavingFromModal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: ACCENT }}>
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
