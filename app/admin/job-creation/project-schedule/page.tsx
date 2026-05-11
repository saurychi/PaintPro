"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Clock3, List, Loader2, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import { getCachedSubTasks, getCachedMainTasks, setCachedSubTasks, setCachedStep, ensureWizardCacheHydrated, markWizardDirty } from "@/lib/wizardCache";
import { useProjectNow } from "@/lib/time/useProjectNow";
import type { CachedSubTask } from "@/lib/wizardCache";
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
// Sunday + lunch (12-13 LOCAL) + work-hour (09-17) rules shared with the
// schedule generator and the staff-completion cascade so a span never
// changes shape based on which call path produced it.
import {
  computeWorkSegments,
  isNonWorkingDay,
  placeWorkSpan,
} from "@/lib/schedule/workHours";

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

// Computes the envelope end (last segment's end) for a task that
// occupies `hours` of work starting at `startIso`. Mirrors the segment
// model used by `snapToAvailableSpan` so start + computed end reflect
// the same lunch / unavailable-day pauses the renderer paints.
function endIsoWithLunch(
  startIso: string | null,
  hours: number | null,
  unavailable?: Set<string>,
) {
  if (!startIso || typeof hours !== "number" || hours <= 0) {
    return addHoursToIso(startIso, hours);
  }
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return placeWorkSpan(start, hours, unavailable).end.toISOString();
}

function localDateKey(date: Date) {
  // Match the YYYY-MM-DD slice the cascade compares against (derived from
  // unavailable_days.blocked_start_datetime), computed from the LOCAL day so a
  // 23:00 timestamp doesn't accidentally match the next UTC date.
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
  // isNonWorkingDay treats Sunday as blocked too — no need to seed the
  // set with every Sunday.
  while (isNonWorkingDay(date, unavailable) && skipped < 365) {
    date.setDate(date.getDate() + 1);
    skipped += 1;
  }

  return { iso: date.toISOString(), skippedDays: skipped };
}

// Snap a requested start to the first valid working moment that can
// host a task of `hours` work. With segments, the placement helper
// itself walks past lunch / non-working days, so all we need to return
// is the first segment's start. `skippedDays` counts whole days the
// snap moved past so callers can show "shifted N days" toasts.
function snapToAvailableSpan(
  startIso: string | null,
  hours: number | null,
  unavailable: Set<string>,
): { iso: string | null; skippedDays: number } {
  if (!startIso) return { iso: startIso, skippedDays: 0 };
  if (hours === null || hours <= 0) {
    return snapToAvailableDay(startIso, unavailable);
  }

  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return { iso: startIso, skippedDays: 0 };

  const placed = placeWorkSpan(date, hours, unavailable);
  if (placed.segments.length === 0) {
    return { iso: startIso, skippedDays: 0 };
  }

  const originalDay = new Date(date);
  originalDay.setHours(0, 0, 0, 0);
  const snappedDay = new Date(placed.start);
  snappedDay.setHours(0, 0, 0, 0);
  const skippedDays = Math.max(
    0,
    Math.round(
      (snappedDay.getTime() - originalDay.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  return { iso: placed.start.toISOString(), skippedDays };
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
    const newEnd = endIsoWithLunch(newStart, step.estimatedHours, unavailable);

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

  useEffect(() => {
    router.prefetch("/admin/job-creation/equipment-assignment");
    router.prefetch("/admin/job-creation/employee-assignment");
  }, [router]);

  const { now: projectNow } = useProjectNow();

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [jobNo, setJobNo] = useState("Project Schedule");
  const [siteName, setSiteName] = useState("Review the generated schedule");

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(
    () => new Set(),
  );
  // Full-fidelity blocks (start, end, isFullDay, reason) so partial-time
  // blocks can render as background bands on the time grid even when the
  // YYYY-MM-DD set above doesn't capture them. Whole-day rows still go
  // through the day-cell painter; this is purely additive.
  type UnavailableBlock = {
    startIso: string;
    endIso: string;
    isFullDay: boolean;
    reason: string | null;
  };
  const [unavailableBlocks, setUnavailableBlocks] = useState<
    UnavailableBlock[]
  >([]);
  // Time blocks where staff assigned to THIS project are already booked on
  // OTHER active projects. Rendered as grey background bands so the user
  // can see WHY a calendar gap exists (instead of empty whitespace that
  // looks like a scheduler bug).
  type StaffBusyBlock = {
    projectSubTaskId: string;
    projectCode: string | null;
    projectTitle: string | null;
    subTaskTitle: string;
    startDatetime: string;
    endDatetime: string;
  };
  const [staffBusyBlocks, setStaffBusyBlocks] = useState<StaffBusyBlock[]>([]);
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
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  // Undo stack of past `services` snapshots. Each drag/resize pushes the
  // pre-mutation state; Ctrl/Cmd+Z pops and restores. Capped so a long
  // editing session can't balloon memory.
  const historyRef = useRef<ServiceGroup[][]>([]);
  const HISTORY_LIMIT = 50;

  // Helper: convert cached subtasks into ServiceGroup[] for display
  function cachedSubTasksToServiceGroups(cached: CachedSubTask[]): ServiceGroup[] {
    // Attempt to get main task names from cache for better display
    const mainTasks = getCachedMainTasks(projectId);
    const mainTaskNameMap = new Map<string, string>();
    if (mainTasks) {
      for (const mt of mainTasks) {
        mainTaskNameMap.set(mt.id, mt.name);
      }
    }

    const groupedMap = new Map<string, ServiceGroup>();
    for (const st of cached) {
      if (!groupedMap.has(st.mainTaskId)) {
        groupedMap.set(st.mainTaskId, {
          id: st.mainTaskId,
          title: mainTaskNameMap.get(st.mainTaskId) ?? "Main Task",
          status: "pending",
          children: [],
        });
      }
      const group = groupedMap.get(st.mainTaskId)!;
      group.children.push({
        id: st.id,
        subTaskId: st.subTaskId,
        title: st.title,
        status: "pending",
        estimatedHours: st.estimatedHours,
        scheduledStartDatetime: st.scheduledStartDatetime,
        scheduledEndDatetime: st.scheduledEndDatetime,
      });
    }
    return Array.from(groupedMap.values());
  }

  async function loadSchedule(forceRefresh = false) {
    if (!projectId) {
      toast.error("Missing project ID.");
      setLoading(false);
      return;
    }

    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      await ensureWizardCacheHydrated(projectId);

      if (!forceRefresh) {
        const cached = getCachedSubTasks(projectId);
        if (cached && cached.length > 0) {
          const nextServices = cachedSubTasksToServiceGroups(cached);
          setServices(nextServices);
          historyRef.current = [];
          setLoading(false);
          return;
        }
      }

        // ─── Cache miss: fetch from API ────────────────────────────────────
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
            // Also build CachedSubTask[] to store in cache. Critical:
            // preserve equipment that's already in the cache from a
            // prior hydrate — the schedule API doesn't return it, so
            // overwriting with `[]` here would wipe equipment for
            // every subtask. Same pattern as buildSubTasksForCache.
            const existingCacheById = new Map(
              (getCachedSubTasks(projectId) ?? []).map((st) => [st.id, st]),
            );
            const cachedSubTasks: CachedSubTask[] = [];

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

              const projectTaskId =
                row?.project_task_id ??
                row?.project_task?.project_task_id ??
                "";

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

              const stepId =
                row?.project_sub_task_id ??
                row?.id ??
                `${mainTaskId}-${row?.sub_task?.sub_task_id ?? crypto.randomUUID()}`;

              const subTaskId =
                row?.sub_task?.sub_task_id ??
                row?.sub_task_id ??
                row?.project_sub_task_id ??
                "";

              const title =
                row?.sub_task?.description ??
                row?.sub_task_description ??
                row?.title ??
                "Sub Task";

              const estimatedHours = normalizeNumber(
                row?.estimated_hours ?? row?.estimatedHours,
              );

              const scheduledStartDatetime =
                row?.scheduled_start_datetime ??
                row?.scheduledStartDatetime ??
                null;

              const scheduledEndDatetime =
                row?.scheduled_end_datetime ??
                row?.scheduledEndDatetime ??
                null;

              const step: ServiceStep = {
                id: stepId,
                subTaskId,
                title,
                status: "pending",
                estimatedHours,
                scheduledStartDatetime,
                scheduledEndDatetime,
              };

              group.children.push(step);

              // Build the cached entry. Equipment falls back to
              // existing cache entry first (preserving createProject's
              // saved equipment), THEN to row.equipments (legacy API
              // shape that doesn't actually exist on this endpoint),
              // THEN to []. Without the cache fallback, equipment was
              // being silently wiped here.
              const prevCached = existingCacheById.get(stepId);
              cachedSubTasks.push({
                id: stepId,
                subTaskId,
                mainTaskId,
                projectTaskId,
                title,
                sortOrder: cachedSubTasks.length,
                estimatedHours,
                scheduledStartDatetime,
                scheduledEndDatetime,
                assignedEmployeeIds:
                  row?.assignedEmployeeIds ??
                  row?.assigned_employee_ids ??
                  prevCached?.assignedEmployeeIds ??
                  [],
                equipments:
                  prevCached?.equipments ?? row?.equipments ?? [],
              });
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

              // Cache the fetched subtasks
              setCachedSubTasks(projectId, cachedSubTasks);

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
        setRefreshing(false);
      }
  }

  useEffect(() => {
    // Always pull fresh schedule data from the DB on mount, not the
    // session cache. The cache can lag the DB when the schedule was
    // regenerated elsewhere in the wizard (e.g. an earlier conflict-fix
    // pass on basic-details), and the cache short-circuit would render
    // those stale times — making the user click Refresh to see the
    // gap-free version. Cost: one extra fetch on every visit.
    loadSchedule(true);
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
        const blocks: UnavailableBlock[] = [];
        for (const day of days) {
          // Whole-day blocks go to the day-key set so isNonWorkingDay
          // skips them during placement and the column paints red. We
          // exclude partial blocks here because adding them would mark
          // the WHOLE day blocked even though only a few hours are.
          if (day?.isFullDay && typeof day?.blockedDate === "string") {
            set.add(day.blockedDate);
          }
          // Every block (full or partial) is captured here so the time
          // grid can paint a visible cue for the actual time range.
          if (
            typeof day?.blockedStartDatetime === "string" &&
            typeof day?.blockedEndDatetime === "string"
          ) {
            blocks.push({
              startIso: day.blockedStartDatetime,
              endIso: day.blockedEndDatetime,
              isFullDay: Boolean(day.isFullDay),
              reason:
                typeof day?.reason === "string" && day.reason.trim()
                  ? day.reason.trim()
                  : null,
            });
          }
        }
        setUnavailableDates(set);
        setUnavailableBlocks(blocks);
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

  // Pull busy slots for THIS project's assigned staff from other active
  // projects, so the calendar can show a "Busy: PP-XXXX" overlay instead
  // of an unexplained gap. Re-runs whenever the project changes.
  useEffect(() => {
    if (!projectId) {
      setStaffBusyBlocks([]);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/planning/getStaffBusyBlocks?projectId=${encodeURIComponent(projectId)}`,
    )
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (Array.isArray(data?.busyBlocks)) {
          setStaffBusyBlocks(data.busyBlocks);
        }
      })
      .catch(() => {
        // Non-fatal: timeline just won't show the overlay if this fails.
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Reset the one-shot normalize guard whenever a different project is
  // opened, so the new project's saved schedule gets its own pass.
  useEffect(() => {
    normalizeDoneRef.current = false;
  }, [projectId]);

  // Auto-normalize on load: walk the schedule once sequentially via
  // compactScheduleFromIndex(0) so legacy data gets cleaned up under
  // the segment model. This:
  //   - Re-snaps starts past unavailable / Sunday days
  //   - Re-computes ends from the segment-aware helper (so chips stored
  //     under the old slide model get correct end-times)
  //   - Pushes any subtask that overlaps the prior one forward,
  //     eliminating cross-task overlap left over by older generator runs
  //
  // When anything moves, we also fire a silent POST to
  // /api/planning/saveProjectSchedule so the corrected times persist to
  // the DB. Without this the same rows would re-normalize on every load
  // and pop a toast each time.
  useEffect(() => {
    if (normalizeDoneRef.current) return;
    if (loading) return;
    if (!unavailableDatesLoaded) return;
    if (services.length === 0) return;

    normalizeDoneRef.current = true;

    const result = compactScheduleFromIndex(services, 0, unavailableDates);
    if (result.movedCount === 0) return;

    setServices(result.services);
    updateCacheFromServices(result.services);

    // Persist the snapped values so subsequent loads see clean data
    // and skip this branch entirely. Best-effort — a failure just
    // means the next load will re-normalize, no user-visible damage.
    if (projectId) {
      const schedules = result.services.flatMap((group) =>
        group.children
          .filter((child) => child.scheduledStartDatetime)
          .map((child) => ({
            projectSubTaskId: child.id,
            estimatedHours: child.estimatedHours,
            scheduledStartDatetime: child.scheduledStartDatetime,
            scheduledEndDatetime: child.scheduledEndDatetime,
          })),
      );
      if (schedules.length > 0) {
        void fetch("/api/planning/saveProjectSchedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, schedules }),
        }).catch((error) => {
          console.warn(
            "[project-schedule] auto-normalize save failed (will retry on next load):",
            error,
          );
        });
      }
    }
  }, [loading, unavailableDatesLoaded, services, unavailableDates, projectId]);


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

  // Write the current services state back into the wizard cache so
  // downstream pages see the latest schedule fields on each subtask.
  function updateCacheFromServices(currentServices: ServiceGroup[]) {
    const existing = getCachedSubTasks(projectId);
    if (!existing) return;

    // Build a lookup of schedule fields from the UI state keyed by subtask id
    const scheduleMap = new Map<
      string,
      { estimatedHours: number | null; start: string | null; end: string | null }
    >();
    for (const group of currentServices) {
      for (const child of group.children) {
        scheduleMap.set(child.id, {
          estimatedHours: child.estimatedHours,
          start: child.scheduledStartDatetime,
          end: child.scheduledEndDatetime,
        });
      }
    }

    const updated = existing.map((st) => {
      const patch = scheduleMap.get(st.id);
      if (!patch) return st;
      return {
        ...st,
        estimatedHours: patch.estimatedHours,
        scheduledStartDatetime: patch.start,
        scheduledEndDatetime: patch.end,
      };
    });

    setCachedSubTasks(projectId, updated);
  }

  function handleNext() {
    setIsNavigatingNext(true);
    updateCacheFromServices(services);
    setIsDirty(false);
    setCachedStep(projectId, "employee_assignment_pending");
    setOptimisticProjectStatus(projectId, "employee_assignment_pending");
    router.push(`/admin/job-creation/employee-assignment?projectId=${projectId}`);
  }

  function handleGoBack() {
    setIsNavigatingBack(true);
    updateCacheFromServices(services);
    setIsDirty(false);
    setCachedStep(projectId, "equipment_pending");
    setOptimisticProjectStatus(projectId, "equipment_pending");
    router.push(`/admin/job-creation/equipment-assignment?projectId=${projectId}`);
  }

  const totalSubTasks = useMemo(() => {
    return services.reduce((sum, group) => sum + group.children.length, 0);
  }, [services]);

  // Build the FullCalendar event list from the same `services` state the
  // list editor used. Each subtask is fanned out into one chip per work
  // segment (split by lunch / unavailable days / 17:00) so the lunch row
  // and blocked columns stay visually empty even for multi-block tasks.
  // Continuation chips share the subtask's id via `extendedProps.subTaskId`
  // and are non-draggable; only the FIRST segment is editable so a drag
  // moves the whole task.
  const calendarEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];

    services.forEach((group, groupIndex) => {
      const color = colorForMainTask(groupIndex);
      for (const step of group.children) {
        if (!step.scheduledStartDatetime) continue;
        const startDate = new Date(step.scheduledStartDatetime);
        if (Number.isNaN(startDate.getTime())) continue;

        // Prefer the subtask's known work-hours; fall back to the wall-
        // clock duration of the stored span when hours are missing (e.g.
        // legacy rows). Fallback uses the span as-is — without a known
        // work-hour count we can't resegment.
        const hours =
          typeof step.estimatedHours === "number" && step.estimatedHours > 0
            ? step.estimatedHours
            : null;

        if (hours === null) {
          if (!step.scheduledEndDatetime) continue;
          out.push({
            id: step.id,
            title: step.title,
            start: step.scheduledStartDatetime,
            end: step.scheduledEndDatetime,
            backgroundColor: color.bg,
            borderColor: color.border,
            textColor: "#ffffff",
            extendedProps: {
              subTaskId: step.id,
              segmentIndex: 0,
              totalSegments: 1,
              mainTaskTitle: group.title,
              estimatedHours: step.estimatedHours,
            },
          });
          continue;
        }

        const segments = computeWorkSegments(startDate, hours, unavailableDates);
        if (segments.length === 0) continue;

        segments.forEach((seg, segIndex) => {
          out.push({
            id: `${step.id}__seg${segIndex}`,
            title: step.title,
            start: seg.start.toISOString(),
            end: seg.end.toISOString(),
            backgroundColor: color.bg,
            borderColor: color.border,
            textColor: "#ffffff",
            // Only the first segment is the drag handle for the whole
            // task. Continuation chips render in place but ignore drags
            // (and aren't resizable since duration is owned by the task,
            // not a single segment).
            startEditable: segIndex === 0,
            durationEditable: segIndex === segments.length - 1,
            extendedProps: {
              subTaskId: step.id,
              segmentIndex: segIndex,
              totalSegments: segments.length,
              mainTaskTitle: group.title,
              estimatedHours: step.estimatedHours,
            },
          });
        });
      }
    });

    // Partial-time unavailable blocks render as red striped background
    // bands on the time grid for the exact hours they cover. Whole-day
    // blocks are skipped here — those are already painted via
    // dayCellClassNames + a red column wash.
    for (const block of unavailableBlocks) {
      if (block.isFullDay) continue;
      out.push({
        start: block.startIso,
        end: block.endIso,
        display: "background",
        classNames: ["fc-partial-unavailable"],
        title: block.reason ?? "Unavailable",
        extendedProps: {
          partialUnavailable: true,
          reason: block.reason,
        },
      });
    }

    // Staff busy on other projects — render as grey background bands so
    // the user sees WHY the scheduler skipped a slot. Hover/title gives
    // the project code and subtask name.
    for (const block of staffBusyBlocks) {
      const label = block.projectCode
        ? `Busy: ${block.projectCode} — ${block.subTaskTitle}`
        : `Busy — ${block.subTaskTitle}`;
      out.push({
        id: `busy__${block.projectSubTaskId}`,
        start: block.startDatetime,
        end: block.endDatetime,
        display: "background",
        classNames: ["fc-staff-busy"],
        title: label,
        extendedProps: {
          staffBusy: true,
          projectCode: block.projectCode,
          subTaskTitle: block.subTaskTitle,
        },
      });
    }

    return out;
  }, [services, unavailableDates, unavailableBlocks, staffBusyBlocks]);

  // Tag unavailable days on both the column and header so the calendar
  // shows them red. We do this with class names instead of background
  // events because background events don't always render across the full
  // column height in timeGrid views, while a CSS-styled cell does.
  // Paint a column red on the calendar if it's in the manual unavailable
  // set OR a Sunday — the snap helpers refuse to land on either, so the
  // visual must match.
  const isUnavailableDay = (date: Date) =>
    isNonWorkingDay(date, unavailableDates);

  // Land the calendar on the first scheduled day so the user opens directly
  // onto their data instead of "today" (which often has nothing on it).
  const initialCalendarDate = useMemo(() => {
    const allStarts = services
      .flatMap((g) => g.children.map((s) => s.scheduledStartDatetime))
      .filter((value): value is string => Boolean(value));
    if (allStarts.length === 0) return projectNow;
    const minMs = Math.min(...allStarts.map((iso) => new Date(iso).getTime()));
    return new Date(minMs);
  }, [services, projectNow]);

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
    setIsDirty(true); markWizardDirty(projectId);
  }

  function handleEventDrop(arg: EventDropArg) {
    // FullCalendar passes the segment-chip's id (e.g. `subId__seg2`); the
    // real subtask id lives in extendedProps so continuation chips can
    // map back to their owner. Drag is only enabled on segment 0, but
    // guard anyway in case FC ever fires for a non-zero segment.
    const subTaskId =
      (arg.event.extendedProps?.subTaskId as string | undefined) ??
      arg.event.id;
    const segmentIndex =
      (arg.event.extendedProps?.segmentIndex as number | undefined) ?? 0;
    if (segmentIndex !== 0) {
      arg.revert();
      return;
    }

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
      const found = group.children.find((s) => s.id === subTaskId);
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
    const blockedDates = unavailableDates;
    let totalSkippedDays = snapped.skippedDays;

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

      const targetFlatIndex = flatRefs.findIndex(({ groupIndex, childIndex }) => {
        return next[groupIndex].children[childIndex].id === subTaskId;
      });
      if (targetFlatIndex === -1) return prev;

      const { groupIndex, childIndex } = flatRefs[targetFlatIndex];
      const target = next[groupIndex].children[childIndex];
      target.scheduledStartDatetime = snapped.iso;
      target.scheduledEndDatetime = endIsoWithLunch(
        snapped.iso,
        target.estimatedHours,
        blockedDates,
      );

      // Cascade ALL subsequent subtasks (across main tasks, in flat
      // order) so dragging a task forward serialises everything after
      // it. Matches the single-cursor model in projectScheduling.ts —
      // no two subtasks ever share a time slot.
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
        currentStep.scheduledEndDatetime = endIsoWithLunch(
          currentStep.scheduledStartDatetime,
          currentStep.estimatedHours,
          blockedDates,
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

    setIsDirty(true); markWizardDirty(projectId);
  }

  function handleEventResize(arg: EventResizeDoneArg) {
    // Resize is enabled on the LAST segment only (see calendarEvents).
    // The new end of that segment becomes the task's new envelope end;
    // total work-hours = original work-hours of earlier segments + the
    // duration of this final segment after resize.
    const subTaskId =
      (arg.event.extendedProps?.subTaskId as string | undefined) ??
      arg.event.id;
    const segmentIndex =
      (arg.event.extendedProps?.segmentIndex as number | undefined) ?? 0;
    const totalSegments =
      (arg.event.extendedProps?.totalSegments as number | undefined) ?? 1;
    const newSegStartIso = arg.event.start
      ? arg.event.start.toISOString()
      : null;
    const newSegEndIso = arg.event.end ? arg.event.end.toISOString() : null;
    if (!newSegEndIso) {
      arg.revert();
      return;
    }
    // Single-segment task: the whole task's start+end follow the resize.
    // Multi-segment: reject a resize on anything other than the last chip.
    if (totalSegments > 1 && segmentIndex !== totalSegments - 1) {
      arg.revert();
      return;
    }

    pushHistory();
    const blockedDates = unavailableDates;
    let totalSkippedDays = 0;

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

      const targetFlatIndex = flatRefs.findIndex(({ groupIndex, childIndex }) => {
        return next[groupIndex].children[childIndex].id === subTaskId;
      });
      if (targetFlatIndex === -1) return prev;

      const { groupIndex, childIndex } = flatRefs[targetFlatIndex];
      const target = next[groupIndex].children[childIndex];

      // Recompute total work-hours from the resized segment + the
      // earlier segments' work content. For single-segment tasks the
      // start can also have moved, so trust the chip's start.
      const taskStartIso =
        totalSegments === 1 && newSegStartIso
          ? newSegStartIso
          : target.scheduledStartDatetime;

      if (taskStartIso) {
        const segments = computeWorkSegments(
          new Date(taskStartIso),
          target.estimatedHours ?? 0,
          blockedDates,
        );
        const earlierHours = segments
          .slice(0, totalSegments - 1)
          .reduce(
            (sum, seg) =>
              sum + (seg.end.getTime() - seg.start.getTime()) / 3_600_000,
            0,
          );
        const finalSegStartMs = arg.event.start
          ? arg.event.start.getTime()
          : segments[segments.length - 1]?.start.getTime();
        const finalSegEndMs = new Date(newSegEndIso).getTime();
        const finalSegHours = Math.max(
          0,
          (finalSegEndMs - (finalSegStartMs ?? finalSegEndMs)) / 3_600_000,
        );
        const newTotalHours = earlierHours + finalSegHours;

        target.scheduledStartDatetime = taskStartIso;
        target.estimatedHours = Number(newTotalHours.toFixed(2));
        target.scheduledEndDatetime = endIsoWithLunch(
          taskStartIso,
          target.estimatedHours,
          blockedDates,
        );
      } else {
        target.scheduledStartDatetime = newSegStartIso;
        target.scheduledEndDatetime = newSegEndIso;
        target.estimatedHours = diffHours(newSegStartIso, newSegEndIso);
      }

      // Cascade ALL subsequent subtasks in flat order — see
      // handleEventDrop's matching note. Single-cursor model.
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
        currentStep.scheduledEndDatetime = endIsoWithLunch(
          currentStep.scheduledStartDatetime,
          currentStep.estimatedHours,
          blockedDates,
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

    setIsDirty(true); markWizardDirty(projectId);
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
    setIsDirty(true); markWizardDirty(projectId);

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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadSchedule(true)}
                    disabled={refreshing}
                    title="Refresh from database"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
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
                  now={projectNow}
                  firstDay={1}
                  allDaySlot={false}
                  nowIndicator
                  // Force every chip to take the full column width even
                  // when two events technically overlap in time. Without
                  // this FC splits the column into half-width / quarter-
                  // width chips ("half-squares"). The scheduler now
                  // produces strict-serial output, but legacy DB rows
                  // generated under the older parallel logic can still
                  // overlap until they're re-saved through the on-load
                  // normalize.
                  slotEventOverlap={false}
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
                      // Sundays + the unavailable set are equally
                      // off-limits (matches the snap helpers above).
                      if (isNonWorkingDay(cursor, unavailableDates)) {
                        return false;
                      }
                      cursor.setDate(cursor.getDate() + 1);
                    }
                    return true;
                  }}
                  // Reject drops/resizes that would land on top of any
                  // OTHER subtask's chip. The same subtask's continuation
                  // segments are allowed to overlap during the gesture
                  // because they'll get repositioned by the drop handler.
                  eventOverlap={(stillEvent, movingEvent) => {
                    const stillId = stillEvent.extendedProps?.subTaskId as
                      | string
                      | undefined;
                    const movingId = movingEvent?.extendedProps?.subTaskId as
                      | string
                      | undefined;
                    return Boolean(stillId && movingId && stillId === movingId);
                  }}
                  // Tag continuation chips so the CSS can de-emphasise
                  // them (square corners, lighter, no left accent stripe)
                  // and they read as visual continuations of the labeled
                  // first chip rather than independent tasks.
                  eventClassNames={(arg) => {
                    const segIndex =
                      (arg.event.extendedProps?.segmentIndex as number | undefined) ?? 0;
                    const totalSegs =
                      (arg.event.extendedProps?.totalSegments as number | undefined) ?? 1;
                    if (totalSegs <= 1) return [];
                    if (segIndex === 0) return ["seg-first"];
                    if (segIndex === totalSegs - 1) return ["seg-last"];
                    return ["seg-mid"];
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
                      segmentIndex?: number;
                      totalSegments?: number;
                    };
                    const hours = props?.estimatedHours;
                    const segIndex = props?.segmentIndex ?? 0;
                    const totalSegs = props?.totalSegments ?? 1;
                    // Continuation chips skip the title/hours block and just
                    // render an arrow so the pair (or trio) reads as one
                    // labeled task + visual continuations rather than three
                    // separate items the user has to mentally de-duplicate.
                    if (totalSegs > 1 && segIndex > 0) {
                      return (
                        <div className="px-1.5 py-0.5 text-[10px] font-medium opacity-90 leading-tight truncate">
                          ↳ continued
                        </div>
                      );
                    }
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
        /* Force every event to fill its day column edge-to-edge. FC's
           default layout splits the column into half/quarter widths
           when events overlap in time; this overrides that so each
           chip always takes the full width. */
        .schedule-calendar .fc .fc-timegrid-event-harness {
          left: 0 !important;
          right: 0 !important;
          width: auto !important;
          margin-right: 0 !important;
        }
        .schedule-calendar .fc .fc-timegrid-event-harness-inset {
          left: 0 !important;
          right: 0 !important;
        }
        /* Segment chips: the first chip carries the title and accent
           stripe like a normal event; continuation chips drop the left
           accent stripe and round only their outer corner so the pair
           visually reads as one task wrapping past lunch / off-day. */
        .schedule-calendar .fc .fc-event.seg-first {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
        .schedule-calendar .fc .fc-event.seg-mid,
        .schedule-calendar .fc .fc-event.seg-last {
          border-width: 0 !important;
          opacity: 0.78;
        }
        .schedule-calendar .fc .fc-event.seg-mid {
          border-radius: 0 !important;
        }
        .schedule-calendar .fc .fc-event.seg-last {
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
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
        /* Partial-time unavailable blocks (specific time ranges, not
           whole days). Red striped band on the time grid for the exact
           hours covered, with a title overlay so the user can see why. */
        .schedule-calendar .fc .fc-bg-event.fc-partial-unavailable {
          background-color: rgba(239, 68, 68, 0.12) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(239, 68, 68, 0.22) 6px,
            rgba(239, 68, 68, 0.22) 10px
          );
          opacity: 1 !important;
          border-left: 3px solid rgb(239, 68, 68) !important;
          border-radius: 0 !important;
        }
        .schedule-calendar .fc .fc-bg-event.fc-partial-unavailable .fc-event-title {
          color: rgb(153, 27, 27);
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          letter-spacing: 0.02em;
          white-space: normal;
        }
        /* Staff busy on other projects — grey diagonal band so the user
           can see why the scheduler skipped a slot. Distinct from the red
           partial-unavailable band (admin-imposed) by colour and stripe
           direction. */
        .schedule-calendar .fc .fc-bg-event.fc-staff-busy {
          background-color: rgba(100, 116, 139, 0.12) !important;
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 6px,
            rgba(100, 116, 139, 0.28) 6px,
            rgba(100, 116, 139, 0.28) 10px
          );
          opacity: 1 !important;
          border-left: 3px solid rgb(100, 116, 139) !important;
          border-radius: 0 !important;
        }
        .schedule-calendar .fc .fc-bg-event.fc-staff-busy .fc-event-title {
          color: rgb(51, 65, 85);
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          letter-spacing: 0.02em;
          white-space: normal;
        }
      `}</style>
    </div>
  );
}
