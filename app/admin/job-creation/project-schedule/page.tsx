"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Clock3, List, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventDropArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
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

function addHoursToIso(startIso: string | null, hours: number | null) {
  if (!startIso || hours === null) return null;

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return end.toISOString();
}

function localDateKey(date: Date) {
  // Match the YYYY-MM-DD shape stored in unavailable_days.blocked_date,
  // computed from the LOCAL day so a 23:00 timestamp doesn't accidentally
  // match the next UTC date.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function snapToAvailableDay(
  iso: string | null,
  unavailable: Set<string>,
): { iso: string | null; skippedDays: number } {
  if (!iso) return { iso, skippedDays: 0 };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { iso, skippedDays: 0 };

  let skipped = 0;
  // Bound the loop so a misconfigured set can't spin forever.
  while (unavailable.has(localDateKey(date)) && skipped < 365) {
    date.setDate(date.getDate() + 1);
    skipped += 1;
  }

  return { iso: date.toISOString(), skippedDays: skipped };
}

// Span-aware variant: pushes the start forward until the FULL [start, end)
// span (where end = start + hours) clears every blocked day. This handles
// the long-event case where a subtask starts on a clean day but its
// duration runs through one — without this, the event renders chunks on
// red columns because FullCalendar splits multi-day events per-day.
function snapToAvailableSpan(
  startIso: string | null,
  hours: number | null,
  unavailable: Set<string>,
): { iso: string | null; skippedDays: number } {
  if (!startIso) return { iso: startIso, skippedDays: 0 };
  if (unavailable.size === 0) return { iso: startIso, skippedDays: 0 };
  if (hours === null || hours <= 0) {
    return snapToAvailableDay(startIso, unavailable);
  }

  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return { iso: startIso, skippedDays: 0 };

  let skipped = 0;
  for (let guard = 0; guard < 365; guard++) {
    const end = new Date(date.getTime() + hours * 60 * 60 * 1000);

    // Walk every calendar day the event touches: from the start's local
    // day through the day before `end` (an event ending exactly at
    // midnight doesn't occupy the next day).
    const cursor = new Date(date);
    cursor.setHours(0, 0, 0, 0);
    let firstBlocked: Date | null = null;
    while (cursor < end) {
      if (unavailable.has(localDateKey(cursor))) {
        firstBlocked = new Date(cursor);
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!firstBlocked) {
      return { iso: date.toISOString(), skippedDays: skipped };
    }

    // Move start to the day after the blocked one, preserving time-of-day
    // so the user's chosen hour isn't lost across the snap.
    const moved = new Date(firstBlocked);
    moved.setHours(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    );
    moved.setDate(moved.getDate() + 1);
    date.setTime(moved.getTime());
    skipped += 1;
  }

  return { iso: date.toISOString(), skippedDays: skipped };
}

// Stable palette for the calendar event chips. Derived per main task index
// so a single main task's subtasks read as one color block (Google-Calendar
// style "this is the same project" cue).
const MAIN_TASK_COLORS = [
  { bg: "#0ea5e9", border: "#0284c7" }, // sky
  { bg: "#10b981", border: "#059669" }, // emerald
  { bg: "#f59e0b", border: "#d97706" }, // amber
  { bg: "#a855f7", border: "#9333ea" }, // purple
  { bg: "#ef4444", border: "#dc2626" }, // red
  { bg: "#14b8a6", border: "#0d9488" }, // teal
  { bg: "#f472b6", border: "#ec4899" }, // pink
  { bg: "#6366f1", border: "#4f46e5" }, // indigo
];

function colorForMainTask(index: number) {
  return MAIN_TASK_COLORS[index % MAIN_TASK_COLORS.length];
}

// <input type="datetime-local"> uses the local "YYYY-MM-DDTHH:mm" shape with
// no timezone marker. Convert to/from ISO (UTC) so the input round-trips
// cleanly with `scheduledStartDatetime` strings stored in state.
function isoToLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function localInputValueToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Compare two ISO datetime strings by the instant they represent. Equality on
// the strings themselves is unsafe because Supabase returns "...+00:00" while
// Date#toISOString() returns "...Z" with milliseconds — two formats for the
// same moment.
function stringTimestampsEqual(a: string | null, b: string | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return false;
  return aMs === bMs;
}

// Walk subtasks in main-task → sort-order from `startFlatIndex` onwards,
// clamping each one's start to be at or after the previous step's end (so
// edits or stale DB rows can't leave subtasks overlapping) and snapping
// each [start, start+hours) span past any unavailable days. Used by both
// the auto-normalize-on-load pass and the list/calendar edit cascades.
function compactScheduleFromIndex(
  servicesIn: ServiceGroup[],
  startFlatIndex: number,
  unavailable: Set<string>,
): {
  services: ServiceGroup[];
  movedCount: number;
  skippedDays: number;
} {
  const next = servicesIn.map((group) => ({
    ...group,
    children: group.children.map((child) => ({ ...child })),
  }));

  const flatRefs: Array<{ groupIndex: number; childIndex: number }> = [];
  next.forEach((group, groupIndex) => {
    group.children.forEach((_, childIndex) => {
      flatRefs.push({ groupIndex, childIndex });
    });
  });

  let previousEnd: string | null = null;
  if (startFlatIndex > 0) {
    const prevRef = flatRefs[startFlatIndex - 1];
    previousEnd =
      next[prevRef.groupIndex].children[prevRef.childIndex]
        .scheduledEndDatetime;
  }

  let movedCount = 0;
  let skippedDays = 0;

  for (let i = startFlatIndex; i < flatRefs.length; i++) {
    const ref = flatRefs[i];
    const step = next[ref.groupIndex].children[ref.childIndex];

    if (!step.scheduledStartDatetime) {
      // Nothing to compact for unscheduled subtasks; skip but don't reset
      // previousEnd — a later scheduled subtask still chains from the last
      // known end so we don't introduce a backwards jump.
      continue;
    }

    let baseStart = step.scheduledStartDatetime;
    if (
      previousEnd &&
      new Date(baseStart).getTime() < new Date(previousEnd).getTime()
    ) {
      baseStart = previousEnd;
    }

    const snapped = snapToAvailableSpan(
      baseStart,
      step.estimatedHours,
      unavailable,
    );
    const newStart = snapped.iso;
    const newEnd = addHoursToIso(newStart, step.estimatedHours);

    // Compare by timestamp, not by string, since the DB returns ISO strings
    // with a "+00:00" offset while Date#toISOString() returns "Z" + ms — the
    // strings differ even when the instants match, which would otherwise
    // flag every subtask as moved on every load.
    const startMatches =
      stringTimestampsEqual(newStart, step.scheduledStartDatetime);
    const endMatches =
      stringTimestampsEqual(newEnd, step.scheduledEndDatetime);

    if (!startMatches || !endMatches) {
      step.scheduledStartDatetime = newStart;
      step.scheduledEndDatetime = newEnd;
      movedCount += 1;
    }

    skippedDays += snapped.skippedDays;
    previousEnd = newEnd;
  }

  return { services: next, movedCount, skippedDays };
}

function diffHours(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;

  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hours >= 0 ? Number(hours.toFixed(2)) : 0;
}

export default function ProjectSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [jobNo, setJobNo] = useState("Project Schedule");
  const [siteName, setSiteName] = useState("Review the generated schedule");

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(
    () => new Set(),
  );
  // Tracks whether the unavailable-days fetch has finished, regardless of
  // whether it returned anything. The auto-normalize pass needs this signal
  // so it doesn't run before the blocked-day set is available (and end up
  // doing nothing because the set was still empty).
  const [unavailableDatesLoaded, setUnavailableDatesLoaded] = useState(false);
  // Guard so the auto-normalize-on-load pass runs once per project load,
  // not every time `services` mutates (which would loop on its own
  // setServices call).
  const normalizeDoneRef = useRef(false);

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "next" | "back" | "browserBack" | null
  >(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isSavingFromModal, setIsSavingFromModal] = useState(false);

  const allowBrowserBackRef = useRef(false);
  // Undo stack of past `services` snapshots. Each drag/resize pushes the
  // pre-mutation state; Ctrl/Cmd+Z pops and restores. Capped so a long
  // editing session can't balloon memory.
  const historyRef = useRef<ServiceGroup[][]>([]);
  const HISTORY_LIMIT = 50;
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
              historyRef.current = [];

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
                        subTask?.duration?.estimatedHours ??
                          subTask?.duration?.roundedHours ??
                          subTask?.duration?.adjustedDurationHours,
                      ),
                      scheduledStartDatetime:
                        subTask?.scheduledStartDatetime ?? null,
                      scheduledEndDatetime: subTask?.scheduledEndDatetime ?? null,
                    }))
                : [],
            }),
            );

          setServices(nextServices);
          historyRef.current = [];

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
    async function loadUnavailableDates() {
      try {
        const response = await fetch("/api/schedule/unavailable-days");
        if (!response.ok) return;
        const data = await response.json();
        const days = Array.isArray(data?.unavailableDays)
          ? data.unavailableDays
          : [];
        const set = new Set<string>();
        for (const day of days) {
          if (typeof day?.blockedDate === "string") set.add(day.blockedDate);
        }
        setUnavailableDates(set);
      } catch {
        // Non-fatal: scheduling still works, we just won't auto-skip blocks.
      } finally {
        // Whether the fetch found blocks or not, we now know the set has
        // been populated, so the normalize-on-load pass can run.
        setUnavailableDatesLoaded(true);
      }
    }
    loadUnavailableDates();
  }, []);

  // Reset the one-shot normalize guard whenever a different project is
  // opened, so the new project's saved schedule gets its own pass.
  useEffect(() => {
    normalizeDoneRef.current = false;
  }, [projectId]);

  // Auto-fix on load: compact subtasks sequentially (each starts at or after
  // the previous one's end so DB rows from before the chunking fix don't
  // render as overlapping events) AND snap each span past unavailable days.
  // Runs exactly once per project load (after both the schedule and the
  // unavailable-days set have finished loading).
  useEffect(() => {
    if (normalizeDoneRef.current) return;
    if (loading) return;
    if (!unavailableDatesLoaded) return;
    if (services.length === 0) return;

    const { services: next, movedCount } = compactScheduleFromIndex(
      services,
      0,
      unavailableDates,
    );

    normalizeDoneRef.current = true;

    if (movedCount > 0) {
      setServices(next);
      // Persist immediately so reloads (or restarts) don't keep showing
      // events on now-blocked days. This runs without `nextStatus`, so it
      // only writes the corrected schedule rows — project status is not
      // touched.
      const payload = next.flatMap((group) =>
        group.children.map((child) => ({
          projectSubTaskId: child.id,
          estimatedHours: child.estimatedHours,
          scheduledStartDatetime: child.scheduledStartDatetime,
          scheduledEndDatetime: child.scheduledEndDatetime,
        })),
      );

      void (async () => {
        try {
          const response = await fetch("/api/planning/saveProjectSchedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, schedules: payload }),
          });
          if (!response.ok) {
            // Surface the server's error body so the dev console shows the
            // real cause instead of just "500".
            const bodyText = await response.text().catch(() => "");
            console.error(
              "[auto-normalize] saveProjectSchedule failed:",
              response.status,
              bodyText,
            );
            // If persistence fails, leave the page dirty so the user can
            // hit Save manually instead of silently losing the fix.
            setIsDirty(true);
            toast.error(
              `Adjusted ${movedCount} subtask${
                movedCount === 1 ? "" : "s"
              } (sequential + past unavailable days), but failed to persist. Save to retry.`,
            );
            return;
          }
          toast.message(
            `Auto-aligned ${movedCount} subtask${
              movedCount === 1 ? "" : "s"
            } (sequential + past unavailable days).`,
          );
        } catch {
          setIsDirty(true);
          toast.error(
            `Adjusted ${movedCount} subtask${
              movedCount === 1 ? "" : "s"
            } off unavailable days, but failed to persist. Save to retry.`,
          );
        }
      })();
    }
  }, [loading, unavailableDatesLoaded, services, unavailableDates, projectId]);

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

  // Ctrl+Z / Cmd+Z → undo the last drag or resize. Skipped while the user
  // is typing in an input/textarea so we don't fight the browser's native
  // text-undo. The save-confirm modal has no inputs, so it's not affected.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";
      if (!isUndo) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      undoLastChange();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Build the FullCalendar event list from the same `services` state the
  // list editor used. Each subtask becomes one event coloured by its main
  // task, plus background events for unavailable days so blocked dates show
  // up as a red wash.
  const calendarEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];

    services.forEach((group, groupIndex) => {
      const color = colorForMainTask(groupIndex);
      for (const step of group.children) {
        if (!step.scheduledStartDatetime || !step.scheduledEndDatetime) continue;
        out.push({
          id: step.id,
          title: step.title,
          start: step.scheduledStartDatetime,
          end: step.scheduledEndDatetime,
          backgroundColor: color.bg,
          borderColor: color.border,
          textColor: "#ffffff",
          extendedProps: {
            mainTaskTitle: group.title,
            estimatedHours: step.estimatedHours,
          },
        });
      }
    });

    return out;
  }, [services, unavailableDates]);

  // Tag unavailable days on both the column and header so the calendar
  // shows them red. We do this with class names instead of background
  // events because background events don't always render across the full
  // column height in timeGrid views, while a CSS-styled cell does.
  const isUnavailableDay = (date: Date) =>
    unavailableDates.has(localDateKey(date));

  // Land the calendar on the first scheduled day so the user opens directly
  // onto their data instead of "today" (which often has nothing on it).
  const initialCalendarDate = useMemo(() => {
    const allStarts = services
      .flatMap((g) => g.children.map((s) => s.scheduledStartDatetime))
      .filter((value): value is string => Boolean(value));
    if (allStarts.length === 0) return undefined;
    const minMs = Math.min(...allStarts.map((iso) => new Date(iso).getTime()));
    return new Date(minMs);
  }, [services]);

  function patchStep(
    stepId: string,
    patch: (step: ServiceStep) => ServiceStep,
  ) {
    setServices((prev) =>
      prev.map((group) => ({
        ...group,
        children: group.children.map((step) =>
          step.id === stepId ? patch(step) : step,
        ),
      })),
    );
  }

  // Snapshot the current services array so a subsequent drag/resize can be
  // reverted with Ctrl/Cmd+Z. We deep-clone via structuredClone so later
  // mutations to the live state don't bleed into the snapshot.
  function pushHistory() {
    historyRef.current.push(structuredClone(services));
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current.shift();
    }
  }

  function undoLastChange() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setServices(previous);
    setIsDirty(true);
  }

  function handleEventDrop(arg: EventDropArg) {
    const eventId = arg.event.id;
    const newStartIso = arg.event.start ? arg.event.start.toISOString() : null;
    if (!newStartIso) {
      arg.revert();
      return;
    }

    // Look up the dragged subtask's planned duration so the span-aware
    // snap can also push past blocked days the event would *cross*, not
    // just one its start lands on.
    let droppedHours: number | null = null;
    for (const group of services) {
      const found = group.children.find((s) => s.id === eventId);
      if (found) {
        droppedHours = found.estimatedHours;
        break;
      }
    }

    const snapped = snapToAvailableSpan(
      newStartIso,
      droppedHours,
      unavailableDates,
    );

    pushHistory();

    patchStep(eventId, (step) => ({
      ...step,
      scheduledStartDatetime: snapped.iso,
      scheduledEndDatetime: addHoursToIso(snapped.iso, step.estimatedHours),
    }));

    if (snapped.skippedDays > 0) {
      toast.message(
        `Skipped ${snapped.skippedDays} unavailable day${
          snapped.skippedDays === 1 ? "" : "s"
        }.`,
      );
    }

    setIsDirty(true);
  }

  function handleEventResize(arg: EventResizeDoneArg) {
    const eventId = arg.event.id;
    const newStartIso = arg.event.start ? arg.event.start.toISOString() : null;
    const newEndIso = arg.event.end ? arg.event.end.toISOString() : null;
    if (!newStartIso || !newEndIso) {
      arg.revert();
      return;
    }

    pushHistory();
    const blockedDates = unavailableDates;
    let totalSkippedDays = 0;

    setServices((prev) => {
      // Deep-clone children so the cascade can mutate in place without
      // tearing the previous state.
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

      const targetFlatIndex = flatRefs.findIndex(({ groupIndex, childIndex }) => {
        return next[groupIndex].children[childIndex].id === eventId;
      });
      if (targetFlatIndex === -1) return prev;

      const { groupIndex, childIndex } = flatRefs[targetFlatIndex];
      const target = next[groupIndex].children[childIndex];
      target.scheduledStartDatetime = newStartIso;
      target.scheduledEndDatetime = newEndIso;
      target.estimatedHours = diffHours(newStartIso, newEndIso);

      // Cascade: each subsequent subtask (in main-task → sort-order) starts
      // where the previous one ended, snapping forward so the *whole*
      // [start, end) span clears every blocked day. End is recomputed from
      // the subtask's own estimatedHours so each task keeps its planned
      // duration.
      for (let i = targetFlatIndex + 1; i < flatRefs.length; i++) {
        const prevRef = flatRefs[i - 1];
        const currRef = flatRefs[i];
        const previousStep =
          next[prevRef.groupIndex].children[prevRef.childIndex];
        const currentStep =
          next[currRef.groupIndex].children[currRef.childIndex];

        const cascaded = snapToAvailableSpan(
          previousStep.scheduledEndDatetime,
          currentStep.estimatedHours,
          blockedDates,
        );
        totalSkippedDays += cascaded.skippedDays;
        currentStep.scheduledStartDatetime = cascaded.iso;
        currentStep.scheduledEndDatetime = addHoursToIso(
          currentStep.scheduledStartDatetime,
          currentStep.estimatedHours,
        );
      }

      return next;
    });

    if (totalSkippedDays > 0) {
      toast.message(
        `Skipped ${totalSkippedDays} unavailable day${
          totalSkippedDays === 1 ? "" : "s"
        }.`,
      );
    }

    setIsDirty(true);
  }

  function handleEventClick(_arg: EventClickArg) {
    // Reserved for future inline editor; drag + resize cover the common cases.
  }

  // Shared list-edit pipeline: apply a per-step mutation, then run the
  // sequential compact-and-snap from the target onwards. compactScheduleFromIndex
  // also clamps the target's own start against the previous subtask's end, so a
  // user can't accidentally schedule an edit BEFORE the prior step finishes —
  // the target snaps forward, and downstream cascades follow.
  function applyListEditWithCascade(
    stepId: string,
    mutate: (step: ServiceStep) => void,
  ) {
    pushHistory();

    const cloned = services.map((group) => ({
      ...group,
      children: group.children.map((child) => ({ ...child })),
    }));

    const flatRefs: Array<{ groupIndex: number; childIndex: number }> = [];
    cloned.forEach((group, groupIndex) => {
      group.children.forEach((_, childIndex) => {
        flatRefs.push({ groupIndex, childIndex });
      });
    });

    const targetFlatIndex = flatRefs.findIndex(({ groupIndex, childIndex }) => {
      return cloned[groupIndex].children[childIndex].id === stepId;
    });
    if (targetFlatIndex === -1) return;

    const targetRef = flatRefs[targetFlatIndex];
    mutate(cloned[targetRef.groupIndex].children[targetRef.childIndex]);

    const { services: next, skippedDays } = compactScheduleFromIndex(
      cloned,
      targetFlatIndex,
      unavailableDates,
    );

    setServices(next);
    setIsDirty(true);

    if (skippedDays > 0) {
      toast.message(
        `Skipped ${skippedDays} unavailable day${
          skippedDays === 1 ? "" : "s"
        }.`,
      );
    }
  }

  function handleListStartChange(stepId: string, newStartIso: string) {
    applyListEditWithCascade(stepId, (step) => {
      step.scheduledStartDatetime = newStartIso;
    });
  }

  function handleListDurationChange(stepId: string, hours: number) {
    if (!Number.isFinite(hours) || hours < 0) return;
    applyListEditWithCascade(stepId, (step) => {
      step.estimatedHours = hours;
    });
  }

  // Editing the End column in the list view: derive the new duration from
  // (newEnd - currentStart), then run the same cascade pipeline so downstream
  // subtasks shift to start at the new end.
  function handleListEndChange(stepId: string, newEndIso: string) {
    let target: ServiceStep | undefined;
    for (const group of services) {
      const found = group.children.find((s) => s.id === stepId);
      if (found) {
        target = found;
        break;
      }
    }
    if (!target) return;

    const newDuration = diffHours(target.scheduledStartDatetime, newEndIso);
    if (newDuration === null || newDuration < 0) return;
    if (newDuration === target.estimatedHours) return;

    applyListEditWithCascade(stepId, (step) => {
      step.estimatedHours = newDuration;
    });
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0"
            aria-hidden
          />
          <span>Project Schedule</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

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
                      Project Schedule
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Review estimated hours and scheduled date/time of each sub
                    task.
                  </p>
                </div>

                <div
                  role="tablist"
                  aria-label="Schedule view mode"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[12px] font-semibold dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "calendar"}
                    onClick={() => setViewMode("calendar")}
                    className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${
                      viewMode === "calendar"
                        ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendar
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                    className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${
                      viewMode === "list"
                        ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}>
                    <List className="h-3.5 w-3.5" />
                    List
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-hidden px-3 py-2.5 ${
                viewMode === "calendar" ? "schedule-calendar" : ""
              }`}>
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Loading project schedule...
                </div>
              ) : services.every((g) => g.children.length === 0) ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  No scheduled subtasks found for this project.
                </div>
              ) : viewMode === "list" ? (
                <div className="green-scrollbar h-full overflow-y-auto pr-2">
                  <div className="space-y-2.5">
                    {services.map((g, groupIndex) => {
                      const isOpen = expandedGroups.has(g.id);
                      const accent = colorForMainTask(groupIndex);
                      return (
                        <div
                          key={g.id}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setExpandedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(g.id)) next.delete(g.id);
                                else next.add(g.id);
                                return next;
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExpandedGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(g.id)) next.delete(g.id);
                                  else next.add(g.id);
                                  return next;
                                });
                              }
                            }}
                            className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition ${
                              isOpen
                                ? "bg-emerald-50/50 dark:bg-emerald-500/10"
                                : "bg-white dark:bg-slate-900"
                            }`}>
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className="h-9 w-1 shrink-0 rounded-full"
                                style={{ backgroundColor: accent.bg }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                    {g.title}
                                  </span>
                                  {isOpen && (
                                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                      MAIN TASK
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {g.children.length} sub task
                                  {g.children.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            />
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {g.children.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-6 text-center dark:border-slate-700 dark:bg-slate-800/70">
                                  <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                                    No sub tasks scheduled
                                  </p>
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {g.children.map((step, index) => (
                                      <div
                                        key={step.id}
                                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/80">
                                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                          {index + 1}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                            {step.title}
                                          </div>
                                          <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                                            <div className="flex items-baseline gap-1.5">
                                              <dt className="shrink-0 font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                Duration
                                              </dt>
                                              <dd className="flex items-baseline gap-1 text-slate-700 dark:text-slate-200">
                                                <input
                                                  // key resets the uncontrolled input's defaultValue
                                                  // when state mutates from a cascade, so the row
                                                  // shows the snapped/cascaded value after edits.
                                                  key={`dur-${step.id}-${
                                                    step.estimatedHours ?? ""
                                                  }`}
                                                  type="number"
                                                  min={0}
                                                  step={0.25}
                                                  defaultValue={
                                                    typeof step.estimatedHours === "number"
                                                      ? step.estimatedHours
                                                      : ""
                                                  }
                                                  onBlur={(e) => {
                                                    const raw = e.target.value.trim();
                                                    if (!raw) return;
                                                    const v = Number(raw);
                                                    if (
                                                      !Number.isFinite(v) ||
                                                      v < 0 ||
                                                      v === step.estimatedHours
                                                    ) {
                                                      return;
                                                    }
                                                    handleListDurationChange(step.id, v);
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                      (e.currentTarget as HTMLInputElement).blur();
                                                    }
                                                  }}
                                                  className="h-6 w-14 rounded border border-slate-200 bg-white px-1.5 text-[12px] tabular-nums text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                />
                                                <span className="text-slate-500">h</span>
                                              </dd>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                              <dt className="shrink-0 font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                Start
                                              </dt>
                                              <dd className="text-slate-700 dark:text-slate-200">
                                                <input
                                                  key={`start-${step.id}-${
                                                    step.scheduledStartDatetime ?? ""
                                                  }`}
                                                  type="datetime-local"
                                                  defaultValue={isoToLocalInputValue(
                                                    step.scheduledStartDatetime,
                                                  )}
                                                  onBlur={(e) => {
                                                    const iso = localInputValueToIso(
                                                      e.target.value,
                                                    );
                                                    if (!iso) return;
                                                    if (iso === step.scheduledStartDatetime) return;
                                                    handleListStartChange(step.id, iso);
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                      (e.currentTarget as HTMLInputElement).blur();
                                                    }
                                                  }}
                                                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[12px] text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                />
                                              </dd>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                              <dt className="shrink-0 font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                End
                                              </dt>
                                              <dd className="text-slate-700 dark:text-slate-200">
                                                <input
                                                  key={`end-${step.id}-${
                                                    step.scheduledEndDatetime ?? ""
                                                  }`}
                                                  type="datetime-local"
                                                  defaultValue={isoToLocalInputValue(
                                                    step.scheduledEndDatetime,
                                                  )}
                                                  onBlur={(e) => {
                                                    const iso = localInputValueToIso(
                                                      e.target.value,
                                                    );
                                                    if (!iso) return;
                                                    if (iso === step.scheduledEndDatetime) return;
                                                    handleListEndChange(step.id, iso);
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                      (e.currentTarget as HTMLInputElement).blur();
                                                    }
                                                  }}
                                                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[12px] text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                />
                                              </dd>
                                            </div>
                                          </dl>
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
                    })}
                  </div>
                </div>
              ) : (
                <FullCalendar
                  plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                  initialView="timeGridWeek"
                  initialDate={initialCalendarDate}
                  firstDay={1}
                  allDaySlot={false}
                  nowIndicator
                  // Full 24-hour range so events at any hour are visible.
                  // The calendar auto-scrolls to morning on mount via
                  // scrollTime so the user doesn't open onto midnight.
                  slotMinTime="00:00:00"
                  slotMaxTime="24:00:00"
                  scrollTime="08:00:00"
                  slotDuration="00:30:00"
                  slotLabelInterval="01:00"
                  snapDuration="00:15:00"
                  height="100%"
                  expandRows
                  editable
                  eventStartEditable
                  eventDurationEditable
                  events={calendarEvents}
                  eventDrop={handleEventDrop}
                  eventResize={handleEventResize}
                  eventClick={handleEventClick}
                  dayCellClassNames={(arg) =>
                    isUnavailableDay(arg.date) ? ["fc-day-unavailable"] : []
                  }
                  dayHeaderClassNames={(arg) =>
                    isUnavailableDay(arg.date) ? ["fc-day-unavailable"] : []
                  }
                  // Block any drag/resize whose resulting span touches a
                  // blocked day — start, middle, OR end. The cursor goes
                  // "not-allowed" mid-gesture so the user can't drop the
                  // event into a state where it occupies a red column.
                  eventAllow={(dropInfo) => {
                    const start = dropInfo.start;
                    const end = dropInfo.end;
                    if (!start || !end) return true;
                    const cursor = new Date(start);
                    cursor.setHours(0, 0, 0, 0);
                    while (cursor < end) {
                      if (unavailableDates.has(localDateKey(cursor))) {
                        return false;
                      }
                      cursor.setDate(cursor.getDate() + 1);
                    }
                    return true;
                  }}
                  headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "timeGridWeek,timeGridDay,dayGridMonth",
                  }}
                  eventContent={(arg) => {
                    const props = arg.event.extendedProps as {
                      mainTaskTitle?: string;
                      estimatedHours?: number | null;
                    };
                    const hours = props?.estimatedHours;
                    return (
                      <div className="px-1.5 py-1 leading-tight">
                        <div className="text-[11px] font-semibold truncate">
                          {arg.event.title}
                        </div>
                        <div className="text-[10px] opacity-90 truncate">
                          {props?.mainTaskTitle ?? ""}
                          {typeof hours === "number" && hours > 0
                            ? ` · ${hours}h`
                            : ""}
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  {jobNo}
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{siteName}</div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                  <Clock3 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
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

        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Save changes?
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
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
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
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

        /* FullCalendar polish — match the rest of the app's typography +
           accent color, and tighten things so the calendar reads like a
           Google-Calendar-style timeline instead of FC's stock look. */
        .schedule-calendar .fc {
          --fc-border-color: #e5e7eb;
          --fc-today-bg-color: #ecfdf5;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f9fafb;
          font-family: inherit;
          height: 100%;
        }
        .schedule-calendar .fc .fc-toolbar-title {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }
        .schedule-calendar .fc .fc-button {
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          color: #334155 !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
          border-radius: 8px !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          text-transform: capitalize !important;
        }
        .schedule-calendar .fc .fc-button:hover {
          background: #f8fafc !important;
        }
        .schedule-calendar .fc .fc-button-active,
        .schedule-calendar .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: ${ACCENT} !important;
          border-color: ${ACCENT} !important;
          color: #ffffff !important;
        }
        .schedule-calendar .fc .fc-col-header-cell {
          background: #f8fafc;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #475569;
          padding: 6px 0;
        }
        .schedule-calendar .fc .fc-timegrid-slot-label {
          font-size: 10px;
          color: #64748b;
        }
        .schedule-calendar .fc .fc-timegrid-now-indicator-line {
          border-color: ${ACCENT};
        }
        .schedule-calendar .fc .fc-timegrid-now-indicator-arrow {
          border-color: ${ACCENT};
          color: ${ACCENT};
        }
        .schedule-calendar .fc .fc-event {
          border-radius: 6px !important;
          cursor: grab;
          border-width: 0 0 0 3px !important;
        }
        .schedule-calendar .fc .fc-event:active {
          cursor: grabbing;
        }
        .schedule-calendar .fc-day-today {
          background-color: rgba(0, 192, 101, 0.06) !important;
        }

        /* Unavailable days — red wash on the time-grid column and a red
           header cell so the user can't miss that the day is blocked. */
        .schedule-calendar .fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.1) !important;
        }
        .schedule-calendar .fc-col-header-cell.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.18) !important;
          color: #b91c1c !important;
        }
        .schedule-calendar .fc-col-header-cell.fc-day-unavailable a {
          color: #b91c1c !important;
        }
        /* Diagonal-stripe overlay on unavailable columns so the red is
           clearly an "unavailable" pattern, not just a styled day. */
        .schedule-calendar .fc-timegrid-col.fc-day-unavailable {
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            rgba(239, 68, 68, 0.08) 8px,
            rgba(239, 68, 68, 0.08) 12px
          );
        }
      `}</style>
    </div>
  );
}
