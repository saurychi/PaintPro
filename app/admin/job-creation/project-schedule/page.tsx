"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";

type StepStatus = "done" | "active" | "pending";

type ServiceStep = {
  id: string;
  subTaskId: string;
  title: string;
  status: "pending" | "active" | "done";
  estimatedHours: number | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  children: ServiceStep[];
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";

const SESSION_DRAFT_KEY = "paintpro-basic-details-draft";

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

function normalizeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSortOrder(
  value: unknown,
  fallback = Number.MAX_SAFE_INTEGER,
) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInputDateTimeLocal(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (num: number) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromInputDateTimeLocal(value: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function addHoursToIso(startIso: string | null, hours: number | null) {
  if (!startIso || hours === null) return null;

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return end.toISOString();
}

function diffHours(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;

  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hours >= 0 ? Number(hours.toFixed(2)) : 0;
}

function getGroupSummary(group: ServiceGroup) {
  const validStarts = group.children
    .map((child) => child.scheduledStartDatetime)
    .filter(Boolean) as string[];

  const validEnds = group.children
    .map((child) => child.scheduledEndDatetime)
    .filter(Boolean) as string[];

  const totalHours = group.children.reduce(
    (sum, child) => sum + (child.estimatedHours ?? 0),
    0,
  );

  const earliestStart =
    validStarts.length > 0
      ? new Date(
          Math.min(...validStarts.map((value) => new Date(value).getTime())),
        ).toISOString()
      : null;

  const latestEnd =
    validEnds.length > 0
      ? new Date(
          Math.max(...validEnds.map((value) => new Date(value).getTime())),
        ).toISOString()
      : null;

  return {
    totalHours: Number(totalHours.toFixed(2)),
    earliestStart,
    latestEnd,
  };
}

export default function ProjectSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [jobNo, setJobNo] = useState("Project Schedule");
  const [siteName, setSiteName] = useState("Review the generated schedule");

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

  useEffect(() => {
    async function loadSchedule() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        let loaded = false;

        try {
          const response = await fetch(
            `/api/planning/getProjectSubTasks?projectId=${projectId}`,
          );

          const data = await response.json();

          if (response.ok) {
            const rawGroups = Array.isArray(data?.projectSubTasks)
              ? data.projectSubTasks
              : Array.isArray(data?.subTasks)
                ? data.subTasks
                : Array.isArray(data?.rows)
                  ? data.rows
                  : [];

            const sortedRows = [...rawGroups].sort((a: any, b: any) => {
              const mainTaskOrder =
                normalizeSortOrder(
                  a?.project_task?.sort_order ??
                    a?.project_task?.main_task?.sort_order ??
                    a?.main_task_sort_order,
                ) -
                normalizeSortOrder(
                  b?.project_task?.sort_order ??
                    b?.project_task?.main_task?.sort_order ??
                    b?.main_task_sort_order,
                );

              if (mainTaskOrder !== 0) return mainTaskOrder;

              const subTaskOrder =
                normalizeSortOrder(a?.sort_order ?? a?.sub_task?.sort_order) -
                normalizeSortOrder(b?.sort_order ?? b?.sub_task?.sort_order);

              if (subTaskOrder !== 0) return subTaskOrder;

              const aTitle = String(
                a?.sub_task?.description ?? a?.sub_task_description ?? a?.title ?? "",
              );
              const bTitle = String(
                b?.sub_task?.description ?? b?.sub_task_description ?? b?.title ?? "",
              );

              return aTitle.localeCompare(bTitle);
            });

            const groupedMap = new Map<string, ServiceGroup>();

            for (const row of sortedRows) {
              const mainTaskId =
                row?.project_task?.main_task?.main_task_id ??
                row?.main_task_id ??
                row?.project_task_id ??
                crypto.randomUUID();

              const mainTaskTitle =
                row?.project_task?.main_task?.name ??
                row?.main_task_name ??
                "Main Task";

              if (!groupedMap.has(mainTaskId)) {
                groupedMap.set(mainTaskId, {
                  id: mainTaskId,
                  title: mainTaskTitle,
                  status: "pending",
                  children: [],
                });
              }

              const group = groupedMap.get(mainTaskId);
              if (!group) continue;

              const step: ServiceStep = {
                id:
                  row?.project_sub_task_id ??
                  row?.id ??
                  `${mainTaskId}-${row?.sub_task?.sub_task_id ?? crypto.randomUUID()}`,
                subTaskId:
                  row?.sub_task?.sub_task_id ??
                  row?.sub_task_id ??
                  row?.project_sub_task_id ??
                  "",
                title:
                  row?.sub_task?.description ??
                  row?.sub_task_description ??
                  row?.title ??
                  "Sub Task",
                status: "pending",
                estimatedHours: normalizeNumber(
                  row?.estimated_hours ?? row?.estimatedHours,
                ),
                scheduledStartDatetime:
                  row?.scheduled_start_datetime ??
                  row?.scheduledStartDatetime ??
                  null,
                scheduledEndDatetime:
                  row?.scheduled_end_datetime ??
                  row?.scheduledEndDatetime ??
                  null,
              };

              group.children.push(step);
            }

            const nextServices = Array.from(groupedMap.values());

            if (nextServices.length > 0) {
              setServices(nextServices);
              setExpanded(new Set(nextServices.map((group) => group.id)));

              setJobNo(data?.project?.project_code ?? "Project Schedule");
              setSiteName(
                data?.project?.title ??
                  data?.project?.site_address ??
                  "Review the generated schedule",
              );

              loaded = true;
            }
          }
        } catch {
          // fallback below
        }

        if (!loaded) {
          const draftRaw = sessionStorage.getItem(SESSION_DRAFT_KEY);

          if (!draftRaw) {
            setServices([]);
            return;
          }

          const draft = JSON.parse(draftRaw);

          const generatedTasks = Array.isArray(draft?.generatedTasks)
            ? draft.generatedTasks
            : [];

          const nextServices: ServiceGroup[] = [...generatedTasks]
            .sort(
              (a: any, b: any) =>
                normalizeSortOrder(a?.sortOrder ?? a?.sort_order) -
                normalizeSortOrder(b?.sortOrder ?? b?.sort_order),
            )
            .map((task: any, taskIndex: number) => ({
              id: `task-${taskIndex}`,
              title: task?.name ?? "Main Task",
              status: "pending",
              children: Array.isArray(task?.sub_tasks)
                ? [...task.sub_tasks]
                    .sort(
                      (a: any, b: any) =>
                        normalizeSortOrder(a?.sortOrder ?? a?.sort_order) -
                        normalizeSortOrder(b?.sortOrder ?? b?.sort_order),
                    )
                    .map((subTask: any, subTaskIndex: number) => ({
                      id: `task-${taskIndex}-sub-${subTaskIndex}`,
                      subTaskId: String(subTaskIndex),
                      title: subTask?.title ?? "Sub Task",
                      status: "pending",
                      estimatedHours: normalizeNumber(
                        subTask?.duration?.adjustedDurationHours ??
                          subTask?.duration?.roundedHours ??
                          subTask?.duration?.estimatedHours,
                      ),
                      scheduledStartDatetime:
                        subTask?.scheduledStartDatetime ?? null,
                      scheduledEndDatetime: subTask?.scheduledEndDatetime ?? null,
                    }))
                : [],
            }),
            );

          setServices(nextServices);
          setExpanded(new Set(nextServices.map((group) => group.id)));

          setJobNo(draft?.projectCode ?? "Project Schedule");
          setSiteName(
            draft?.basicDetails?.projectName ??
              draft?.basicDetails?.address ??
              "Review the generated schedule",
          );
        }
      } catch (error: any) {
        toast.error(error?.message || "Failed to load project schedule.");
      } finally {
        setLoading(false);
      }
    }

    loadSchedule();
  }, [projectId]);

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

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
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

  function getStatusForAction(action: "next" | "back" | "browserBack") {
    return action === "next"
      ? "employee_assignment_pending"
      : "equipment_pending";
  }

  function navigateForAction(action: "next" | "back" | "browserBack") {
    if (action === "next") {
      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      router.push(`/admin/job-creation/employee-assignment?projectId=${projectId}`);
      return;
    }

    if (action === "back") {
      suppressLeaveGuardRef.current = true;
      allowBrowserBackRef.current = true;
      router.push(
        `/admin/job-creation/equipment-assignment?projectId=${projectId}`,
      );
      return;
    }

    suppressLeaveGuardRef.current = true;
    allowBrowserBackRef.current = true;
    window.history.back();
  }

  function requestLeave(action: "next" | "back" | "browserBack") {
    if (!isDirty) {
      if (action === "next") {
        setIsNavigatingNext(true);
        void (async () => {
          const ok = await updateProjectStatus(getStatusForAction("next"));
          if (!ok) {
            setIsNavigatingNext(false);
            return;
          }
          navigateForAction("next");
        })();
        return;
      }

      if (action === "back") {
        setIsNavigatingBack(true);
        void (async () => {
          const ok = await updateProjectStatus(getStatusForAction("back"));
          if (!ok) {
            setIsNavigatingBack(false);
            return;
          }
          navigateForAction("back");
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
      try {
        setIsSavingFromModal(true);

        const payload = services.flatMap((group) =>
          group.children.map((child) => ({
            projectSubTaskId: child.id,
            estimatedHours: child.estimatedHours,
            scheduledStartDatetime: child.scheduledStartDatetime,
            scheduledEndDatetime: child.scheduledEndDatetime,
          })),
        );

        const saveResponse = await fetch("/api/planning/saveProjectSchedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId,
            schedules: payload,
            nextStatus: getStatusForAction(action),
          }),
        });

        const saveData = await saveResponse.json();

        if (!saveResponse.ok) {
          throw new Error(
            saveData?.error || "Failed to save project schedule.",
          );
        }

        setIsDirty(false);
        toast.success("Project schedule saved.");
      } catch (error: any) {
        setIsSavingFromModal(false);
        setIsNavigatingNext(false);
        toast.error(error?.message || "Failed to save project schedule.");
        return;
      } finally {
        setIsSavingFromModal(false);
      }
    } else if (action === "next" || action === "back" || action === "browserBack") {
      const ok = await updateProjectStatus(getStatusForAction(action));

      if (!ok) {
        setIsNavigatingNext(false);
        setIsNavigatingBack(false);
        return;
      }
    }

    navigateForAction(action);
  }

  const totalSubTasks = useMemo(() => {
    return services.reduce((sum, group) => sum + group.children.length, 0);
  }, [services]);

  function updateStepField(
    groupId: string,
    stepId: string,
    field: "estimatedHours" | "scheduledStartDatetime" | "scheduledEndDatetime",
    rawValue: string,
  ) {
    setServices((prev) => {
      const next = prev.map((group) => ({
        ...group,
        children: group.children.map((child) => ({ ...child })),
      }));

      const flatRefs: Array<{ groupIndex: number; childIndex: number }> = [];

      next.forEach((group, groupIndex) => {
        group.children.forEach((_, childIndex) => {
          flatRefs.push({ groupIndex, childIndex });
        });
      });

      const targetFlatIndex = flatRefs.findIndex(
        ({ groupIndex, childIndex }) => {
          const child = next[groupIndex].children[childIndex];
          return next[groupIndex].id === groupId && child.id === stepId;
        },
      );

      if (targetFlatIndex === -1) return prev;

      const { groupIndex, childIndex } = flatRefs[targetFlatIndex];
      const target = next[groupIndex].children[childIndex];

      if (field === "estimatedHours") {
        target.estimatedHours =
          rawValue === "" ? null : Math.max(0, Number(rawValue));
        target.scheduledEndDatetime = addHoursToIso(
          target.scheduledStartDatetime,
          target.estimatedHours,
        );
      }

      if (field === "scheduledStartDatetime") {
        target.scheduledStartDatetime = fromInputDateTimeLocal(rawValue);
        target.scheduledEndDatetime = addHoursToIso(
          target.scheduledStartDatetime,
          target.estimatedHours,
        );
      }

      if (field === "scheduledEndDatetime") {
        target.scheduledEndDatetime = fromInputDateTimeLocal(rawValue);
        target.estimatedHours = diffHours(
          target.scheduledStartDatetime,
          target.scheduledEndDatetime,
        );
      }

      for (let i = targetFlatIndex + 1; i < flatRefs.length; i++) {
        const prevRef = flatRefs[i - 1];
        const currRef = flatRefs[i];

        const previousStep =
          next[prevRef.groupIndex].children[prevRef.childIndex];
        const currentStep =
          next[currRef.groupIndex].children[currRef.childIndex];

        currentStep.scheduledStartDatetime = previousStep.scheduledEndDatetime;
        currentStep.scheduledEndDatetime = addHoursToIso(
          currentStep.scheduledStartDatetime,
          currentStep.estimatedHours,
        );
      }

      return next;
    });

    setIsDirty(true);
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
          <span>Project Schedule</span>
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
                      Project Schedule
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review estimated hours and scheduled date/time of each sub
                    task.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Schedule Review
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                <div className="space-y-2.5">
                  {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      Loading project schedule...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      No scheduled subtasks found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);
                      const summary = getGroupSummary(group);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white">
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
                            }`}>
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
                                </div>
                                <div className="mt-0.5 text-[12px] text-gray-500">
                                  {group.children.length} sub task
                                  {group.children.length === 1 ? "" : "s"}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                                  <span>{summary.totalHours} hrs total</span>
                                  <span>
                                    Start:{" "}
                                    {formatDateTime(summary.earliestStart)}
                                  </span>
                                  <span>
                                    End: {formatDateTime(summary.latestEnd)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            />
                          </div>

                          {isOpen ? (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="px-3 py-3 text-[12px] text-gray-500">
                                  No subtasks under this main task.
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-200">
                                  {group.children.map((step) => (
                                    <div key={step.id} className="py-3">
                                      <div className="grid grid-cols-1 gap-3 pl-2 lg:grid-cols-[minmax(0,1.2fr)_170px_1fr_1fr]">
                                        <div className="min-w-0">
                                          <div className="text-[13px] font-semibold text-gray-900">
                                            {step.title}
                                          </div>
                                        </div>

                                        <div className="flex items-start gap-2 text-[12px] text-gray-700">
                                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                          <div className="w-full">
                                            <div className="text-gray-500 mb-1">
                                              Estimated Hours
                                            </div>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.25"
                                              value={step.estimatedHours ?? ""}
                                              onChange={(e) =>
                                                updateStepField(
                                                  group.id,
                                                  step.id,
                                                  "estimatedHours",
                                                  e.target.value,
                                                )
                                              }
                                              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-emerald-500"
                                            />
                                          </div>
                                        </div>

                                        <div className="flex items-start gap-2 text-[12px] text-gray-700">
                                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                          <div className="w-full">
                                            <div className="text-gray-500 mb-1">
                                              Start Datetime
                                            </div>
                                            <input
                                              type="datetime-local"
                                              value={toInputDateTimeLocal(
                                                step.scheduledStartDatetime,
                                              )}
                                              onChange={(e) =>
                                                updateStepField(
                                                  group.id,
                                                  step.id,
                                                  "scheduledStartDatetime",
                                                  e.target.value,
                                                )
                                              }
                                              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-emerald-500"
                                            />
                                          </div>
                                        </div>

                                        <div className="flex items-start gap-2 text-[12px] text-gray-700">
                                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                          <div className="w-full">
                                            <div className="text-gray-500 mb-1">
                                              End Datetime
                                            </div>
                                            <input
                                              type="datetime-local"
                                              value={toInputDateTimeLocal(
                                                step.scheduledEndDatetime,
                                              )}
                                              onChange={(e) =>
                                                updateStepField(
                                                  group.id,
                                                  step.id,
                                                  "scheduledEndDatetime",
                                                  e.target.value,
                                                )
                                              }
                                              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-emerald-500"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
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
                <div className="flex items-center gap-2 text-[12px] text-gray-600">
                  <Clock3 className="h-4 w-4 text-gray-400" />
                  {totalSubTasks} scheduled sub task
                  {totalSubTasks === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="schedule" />
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
                Do you want to save your schedule changes before leaving this
                page?
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
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                Don't Save
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                disabled={isSavingFromModal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
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
