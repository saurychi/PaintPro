"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DayCellMountArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import {
  CalendarDays,
  BriefcaseBusiness,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import ScheduleSkeleton from "@/components/schedule/ScheduleSkeleton";
import UnavailableDayModal, {
  type UnavailableDayFormValue,
} from "@/components/schedule/UnavailableDayModal";
import UnavailableBlockDetailModal from "@/components/schedule/UnavailableBlockDetailModal";
import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";
import { useHolidaySettings } from "@/lib/settings/useHolidaySettings";
import { useProjectNow } from "@/lib/time/useProjectNow";
import {
  getProjectRoute as resolveProjectRoute,
  normalizeProjectStatus,
} from "@/lib/planning/projectRoute";
import {
  buildTimelineSegmentEvents,
  timelineSegmentClassName,
} from "@/lib/schedule/timelineSegments";

type EventStatus = "current" | "behind" | "done" | "pending";

type ProjectStatus = "current" | "behind" | "done" | "pending";

type ScheduleProject = {
  id: string;
  projectCode: string | null;
  title: string;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  status: ProjectStatus;
  rawStatus: string;
  // Cancellation phase (review / document / payment / employee /
  // conclude / done). Used by getProjectRoute to decide whether a
  // cancelled project routes to the dashboard or the report list.
  cancellationPhase?: string | null;
  dateLabel: string;
  activeDays?: string[];
};

type FCEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    status: EventStatus;
    type: "project";
    projectCode: string | null;
    rawStatus: string;
    scheduledStartDatetime?: string | null;
    scheduledEndDatetime?: string | null;
  };
};

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200";

const STATUS_COLORS: Record<
  EventStatus,
  { bg: string; border: string; text: string; tint: string }
> = {
  current: {
    bg: "#00c065",
    border: "#00a054",
    text: "#ffffff",
    tint: "rgba(0, 192, 101, 0.10)",
  },
  behind: {
    bg: "#ef4444",
    border: "#dc2626",
    text: "#ffffff",
    tint: "rgba(239, 68, 68, 0.10)",
  },
  done: {
    bg: "#9ca3af",
    border: "#6b7280",
    text: "#ffffff",
    tint: "rgba(156, 163, 175, 0.10)",
  },
  pending: {
    bg: "#facc15",
    border: "#eab308",
    text: "#1f2937",
    tint: "rgba(250, 204, 21, 0.18)",
  },
};

function addUtcDays(yyyymmdd: string, days: number) {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toFCEventSegments(project: ScheduleProject): FCEvent[] {
  const days = Array.from(new Set(project.activeDays ?? [])).sort();
  if (days.length === 0) return [];

  const status: EventStatus = project.status;
  const colors = STATUS_COLORS[status];
  const segments: FCEvent[] = [];

  let segmentStart = days[0];
  let segmentEnd = days[0];

  function pushSegment() {
    segments.push({
      id: `${project.id}-seg${segments.length}`,
      title: project.title,
      start: segmentStart,
      end: addUtcDays(segmentEnd, 1),
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      extendedProps: {
        status,
        type: "project",
        projectCode: project.projectCode,
        rawStatus: project.rawStatus,
        scheduledStartDatetime: project.scheduledStartDatetime,
        scheduledEndDatetime: project.scheduledEndDatetime,
      },
    });
  }

  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === addUtcDays(segmentEnd, 1)) {
      segmentEnd = days[i];
    } else {
      pushSegment();
      segmentStart = days[i];
      segmentEnd = days[i];
    }
  }
  pushSegment();

  return segments;
}

function renderEventContent(info: EventContentArg) {
  // Subtask events (timeline mode) carry the parent project's code so we
  // can stack the subtask name on top with the project code as a small
  // secondary line. That makes blocks readable even when the FC column is
  // narrow — the subtask name is what the user wants to see first.
  const ext = info.event.extendedProps as {
    type?: string;
    projectCode?: string | null;
  };
  if (ext?.type === "subtask") {
    const segIndex = (info.event.extendedProps as { segmentIndex?: number })
      ?.segmentIndex ?? 0;
    const totalSegs = (info.event.extendedProps as { totalSegments?: number })
      ?.totalSegments ?? 1;
    // Continuation chips skip the title/code block and just render a
    // continuation arrow so a multi-segment subtask reads as one labeled
    // chip plus visual continuations rather than three separate items.
    if (totalSegs > 1 && segIndex > 0) {
      return (
        <div className="px-1.5 py-0.5 text-[10px] font-medium leading-tight opacity-90 truncate">
          ↳ continued
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col overflow-hidden px-1.5 py-0.5 leading-tight">
        <span className="truncate text-[11px] font-semibold">
          {info.event.title}
        </span>
        {ext.projectCode ? (
          <span className="truncate text-[9px] opacity-80">
            {ext.projectCode}
          </span>
        ) : null}
      </div>
    );
  }

  // Timeline-mode background events: render the title at the top of
  // the tinted block so the user can see WHAT is blocking those hours
  // (matches the way the legend chip looks). Manual blocks get red
  // text, holidays get amber.
  if (ext?.type === "unavailable-day-bg") {
    return (
      <div className="flex h-full w-full items-start overflow-hidden px-1.5 py-1">
        <span className="truncate text-[11px] font-semibold leading-tight text-red-900 dark:text-red-100">
          {info.event.title}
        </span>
      </div>
    );
  }
  if (ext?.type === "holiday-bg") {
    return (
      <div className="flex h-full w-full items-start overflow-hidden px-1.5 py-1">
        <span className="truncate text-[11px] font-semibold leading-tight text-amber-900 dark:text-amber-100">
          {info.event.title}
        </span>
      </div>
    );
  }

  // Calendar-mode unavailable bg event fills the entire day cell. The
  // reason text rides on top, centered, so each blocked day reads as
  // ONE element — colored cell + label.
  if (ext?.type === "unavailable-day-cell") {
    return (
      <div className="flex h-full w-full items-center justify-center px-1.5 py-0.5 text-center">
        <span className="truncate text-[11px] font-bold leading-tight text-red-900 dark:text-red-100">
          {info.event.title}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center overflow-hidden px-1.5 py-0.5">
      <span className="truncate text-[11px] font-semibold leading-tight">
        {info.event.title}
      </span>
    </div>
  );
}

function formatLongDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Convert a stored ISO datetime (UTC) into the "YYYY-MM-DDTHH:mm" shape
// the <input type="datetime-local"> element expects, in the user's local
// timezone. The server side reverses this via new Date(value).toISOString().
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// Slice the YYYY-MM-DD portion off an ISO timestamp. UTC-based to match
// how the lib computes blockedDate.
function isoDateKey(iso: string): string {
  return String(iso || "").slice(0, 10);
}

// Add `days` to a YYYY-MM-DD string, returning a YYYY-MM-DD. UTC-based
// to avoid DST / local-tz drift.
function addDateKeyDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Find the contiguous "batch" of full-day rows containing `target` —
// rows produced by the multi-day-create flow share reason + blockType
// and fall on consecutive calendar days. When the user edits any one
// of them, we want the modal to surface the whole series as a
// "Multiple days" range so they can adjust or shrink the batch in one
// shot. Returns null when `target` is a standalone block, a holiday,
// or a sub-day specific-time block.
function detectBatchCluster(
  target: Partial<ScheduleUnavailableDay> | null | undefined,
  allDays: ScheduleUnavailableDay[],
): { startDate: string; endDate: string; ids: string[] } | null {
  if (
    !target ||
    !target.id ||
    !target.blockedDate ||
    !target.isFullDay ||
    target.source === "holiday"
  ) {
    return null;
  }

  // Index every active manual full-day row that shares this row's
  // reason + blockType, keyed by its blockedDate.
  const byDate = new Map<string, ScheduleUnavailableDay>();
  for (const d of allDays) {
    if (
      d.source === "manual" &&
      d.isFullDay &&
      d.reason === target.reason &&
      d.blockType === target.blockType
    ) {
      byDate.set(d.blockedDate, d);
    }
  }

  if (!byDate.has(target.blockedDate)) return null;

  // Walk back to the first day of the cluster.
  let firstDate = target.blockedDate;
  // Bound the loop so corrupt data can't spin forever.
  for (let i = 0; i < 1000; i += 1) {
    const prev = addDateKeyDays(firstDate, -1);
    if (byDate.has(prev)) firstDate = prev;
    else break;
  }

  // Walk forward to the last day of the cluster.
  let lastDate = target.blockedDate;
  for (let i = 0; i < 1000; i += 1) {
    const next = addDateKeyDays(lastDate, 1);
    if (byDate.has(next)) lastDate = next;
    else break;
  }

  // Single-day "cluster" isn't a batch — fall back to whole-day mode.
  if (firstDate === lastDate) return null;

  const ids: string[] = [];
  let cursor = firstDate;
  while (cursor <= lastDate) {
    const d = byDate.get(cursor);
    if (d) ids.push(d.id);
    cursor = addDateKeyDays(cursor, 1);
  }

  return { startDate: firstDate, endDate: lastDate, ids };
}

function toUnavailableModalValue(
  day?: Partial<ScheduleUnavailableDay> | null,
  dateOverride?: string | null,
  // The full active list, so we can detect that a single-row click
  // actually belongs to a contiguous multi-day batch and open the modal
  // in "Multiple days" mode with the whole series pre-filled.
  allDays?: ScheduleUnavailableDay[],
): UnavailableDayFormValue {
  // dateOverride is a YYYY-MM-DD from the calendar context menu / selected
  // day. When opening "create from this day" we default to whole-day mode
  // pre-filled with that date. Empty fallbacks are intentional — the modal
  // fills them from the simulated/real clock via useProjectNow internally.
  const fullDayDate =
    dateOverride ?? (day?.isFullDay ? day?.blockedDate : "") ?? "";

  // Pre-fill the specific-time inputs from an existing time-bound block.
  // Empty defaults are filled by the modal's [TIME-SIM] seeding step.
  const startDefault = day?.blockedStartDatetime
    ? isoToLocalInput(day.blockedStartDatetime)
    : "";
  const endDefault = day?.blockedEndDatetime
    ? isoToLocalInput(day.blockedEndDatetime)
    : "";

  // Detect the mode from the block's stored start/end + sibling rows:
  //   1. The clicked row sits inside a contiguous batch of full-day
  //      rows with the same reason+blockType → "multi-day" with the
  //      whole batch range pre-filled.
  //   2. 24h midnight-to-midnight singleton                 → "full-day"
  //   3. Single row whose end's date ≠ start's date         → "multi-day"
  //   4. Everything else (sub-day on a single date)         → "specific-time"
  // Creating fresh (no day) defaults to "full-day".
  const startDateKey = day?.blockedStartDatetime
    ? isoDateKey(day.blockedStartDatetime)
    : "";
  const endDateKey = day?.blockedEndDatetime
    ? isoDateKey(day.blockedEndDatetime)
    : "";
  const spansMultipleDays = Boolean(
    day &&
      !day.isFullDay &&
      startDateKey &&
      endDateKey &&
      startDateKey !== endDateKey,
  );

  const cluster =
    day && allDays ? detectBatchCluster(day, allDays) : null;

  const blockMode: "full-day" | "specific-time" | "multi-day" = cluster
    ? "multi-day"
    : day
      ? day.isFullDay
        ? "full-day"
        : spansMultipleDays
          ? "multi-day"
          : "specific-time"
      : "full-day";

  // Multi-day defaults: cluster range first (so all sibling rows are
  // surfaced as one series), then the single row's literal start/end,
  // finally the override / blockedDate fallbacks.
  const multiDayStart =
    dateOverride ?? cluster?.startDate ?? day?.blockedDate ?? "";
  const multiDayEnd =
    dateOverride ?? cluster?.endDate ?? endDateKey ?? day?.blockedDate ?? "";

  return {
    blockMode,
    fullDayDate,
    startDatetime: startDefault,
    endDatetime: endDefault,
    multiDayStartDate: multiDayStart,
    multiDayEndDate: multiDayEnd,
    reason: day?.reason ?? "",
    blockType:
      day?.blockType && day.blockType !== "holiday"
        ? day.blockType
        : "manual_block",
  };
}

function getUnavailableTypeLabel(day: ScheduleUnavailableDay) {
  if (day.source === "holiday") return "Holiday";

  if (day.blockType === "company_blackout") return "Company blackout";
  if (day.blockType === "manual_block") return "Manual block";
  if (day.blockType === "maintenance") return "Maintenance";
  return "Other";
}

export default function AdminSchedule() {
  const router = useRouter();
  const { settings: holidaySettings } = useHolidaySettings();
  const { now: projectNow, todayKey } = useProjectNow();

  const [projects, setProjects] = useState<ScheduleProject[]>([]);

  type ScheduleSubtask = {
    id: string;
    projectId: string;
    title: string;
    scheduledStartDatetime: string | null;
    scheduledEndDatetime: string | null;
    status: string;
    estimatedHours: number | null;
  };
  const [subtasks, setSubtasks] = useState<ScheduleSubtask[]>([]);
  const [unavailableDays, setUnavailableDays] = useState<
    ScheduleUnavailableDay[]
  >([]);
  const [currentProject, setCurrentProject] = useState<ScheduleProject | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailableLoading, setUnavailableLoading] = useState(true);
  const [savingUnavailableDay, setSavingUnavailableDay] = useState(false);
  const [deletingUnavailableDayId, setDeletingUnavailableDayId] = useState<
    string | null
  >(null);
  const [isUnavailableModalOpen, setIsUnavailableModalOpen] = useState(false);
  const [editingUnavailableDay, setEditingUnavailableDay] =
    useState<ScheduleUnavailableDay | null>(null);
  // Distinct from editingUnavailableDay: this drives the read-only
  // detail modal that opens when the user clicks an item in the side
  // panel's Unavailable Days list.
  const [viewingUnavailableDay, setViewingUnavailableDay] =
    useState<ScheduleUnavailableDay | null>(null);
  const [modalDateOverride, setModalDateOverride] = useState<string | null>(
    null,
  );
  const [calendarContextMenu, setCalendarContextMenu] = useState<{
    date: string;
    x: number;
    y: number;
  } | null>(null);
  // Toggle between the month-grid "calendar" view and the time-axis
  // "timeline" view (mirrors how the project-schedule page in
  // /admin/job-creation/project-schedule presents the schedule).
  const [scheduleViewMode, setScheduleViewMode] = useState<
    "calendar" | "timeline"
  >("calendar");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingUnavailableDays, setRefreshingUnavailableDays] =
    useState(false);
  // The calendar's currently visible date range, fed by FullCalendar's
  // datesSet callback. Used to scope the side panel's Unavailable Days
  // list to whatever month / week the user is looking at.
  const [calendarViewRange, setCalendarViewRange] = useState<{
    startKey: string;
    endKey: string;
  } | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/schedule/getProjects", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load schedule projects.");
      }

      const nextProjects: ScheduleProject[] = Array.isArray(data?.projects)
        ? data.projects
        : [];

      setProjects(nextProjects);
      setCurrentProject(data?.currentProject ?? null);
      setSubtasks(Array.isArray(data?.subtasks) ? data.subtasks : []);
    } catch (error) {
      console.error("Failed to load schedule projects:", error);
      setProjects([]);
      setCurrentProject(null);
      setSubtasks([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // manualOnly=true skips the external Nager.at holidays fetch and only
  // returns rows from the unavailable_days table. Used by the panel-level
  // refresh button so it returns fast without the holiday API roundtrip.
  const loadUnavailableDays = useCallback(
    async (options?: { manualOnly?: boolean }) => {
      try {
        setUnavailableLoading(true);

        const url = options?.manualOnly
          ? "/api/schedule/unavailable-days?manualOnly=true"
          : "/api/schedule/unavailable-days";
        const response = await fetch(url, {
          method: "GET",
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load unavailable days.");
        }

        setUnavailableDays(
          Array.isArray(data?.unavailableDays) ? data.unavailableDays : [],
        );
      } catch (error) {
        console.error("Failed to load unavailable days:", error);
        setUnavailableDays([]);
        throw error;
      } finally {
        setUnavailableLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadUnavailableDays();
  }, [loadUnavailableDays, holidaySettings.enabled, holidaySettings.countryCode]);

  const fcEvents = useMemo<FCEvent[]>(
    () => projects.flatMap((project) => toFCEventSegments(project)),
    [projects],
  );

  // Map of YYYY-MM-DD → the unavailable block that covers that date.
  // Drives both the full-cell tint (dayCellClassNames asks "is this key
  // present?") and the inline reason label (dayCellContent reads the
  // block off this map). When two blocks overlap on the same day, the
  // first one wins — UI shows one label per cell. Defined here, before
  // the timeline events memo, because the segment renderer needs the
  // set to know which days to skip past in computeWorkSegments.
  const unavailableByDate = useMemo(() => {
    const map = new Map<string, ScheduleUnavailableDay>();
    for (const day of unavailableDays) {
      // Holidays already render as their own pill in dayGrid; skip the
      // tint so they don't double up.
      if (day.source === "holiday") continue;

      let cursor = day.blockedStartDatetime.slice(0, 10);
      const endMs = new Date(day.blockedEndDatetime).getTime() - 1;
      const lastKey = !Number.isNaN(endMs)
        ? new Date(endMs).toISOString().slice(0, 10)
        : cursor;

      let safety = 0;
      while (cursor <= lastKey && safety < 1000) {
        if (!map.has(cursor)) map.set(cursor, day);
        cursor = addDateKeyDays(cursor, 1);
        safety += 1;
      }
    }
    return map;
  }, [unavailableDays]);

  // Set wrapper — dayCellClassNames just needs membership.
  const unavailableDateSet = useMemo(
    () => new Set(unavailableByDate.keys()),
    [unavailableByDate],
  );

  // Timeline-mode events: one block per SUBTASK (not per project) so the
  // user actually sees the individual scheduled work blocks inside each
  // project, with proper start/end times. Each subtask is colored by its
  // parent project's status. Date-only fallback (project segments) would
  // render as all-day, which is hidden here, so we couldn't see anything.
  const fcTimelineEvents = useMemo<EventInput[]>(() => {
    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const out: EventInput[] = [];
    for (const s of subtasks) {
      if (typeof s.scheduledStartDatetime !== "string") continue;
      const project = projectsById.get(s.projectId);
      if (!project) continue;
      const colors = STATUS_COLORS[project.status];
      // Fan out into per-segment chips so a subtask that crosses lunch
      // / a non-working day shows as multiple pieces with the lunch row
      // visually empty between them, matching the wizard's view.
      const segments = buildTimelineSegmentEvents(
        {
          id: s.id,
          title: s.title,
          scheduledStartDatetime: s.scheduledStartDatetime,
          scheduledEndDatetime: s.scheduledEndDatetime,
          estimatedHours: s.estimatedHours,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: colors.text,
          extendedProps: {
            status: project.status,
            type: "subtask",
            projectCode: project.projectCode,
            rawStatus: project.rawStatus,
            scheduledStartDatetime: s.scheduledStartDatetime,
            scheduledEndDatetime: s.scheduledEndDatetime,
            subtaskTitle: s.title,
            subtaskStatus: s.status,
          },
        },
        unavailableDateSet,
      );
      out.push(...segments);
    }
    return out;
  }, [subtasks, projects, unavailableDateSet]);

  // (Project-tinted background containers were removed — they painted a
  // soft green wash behind every project's run of subtasks, which the
  // user found visually noisy. Subtask chips alone now carry the
  // project status via their fill color.)

  const unavailableDayEvents = useMemo<EventInput[]>(() => {
    const events: EventInput[] = [];

    // Holidays: per-row events. Calendar view shows the visible
    // "Holiday" pill on the all-day row; timeline shows a tinted
    // column at the holiday's hour range. Distinct extendedProps
    // types let renderEventContent decide when to draw the title.
    for (const day of unavailableDays) {
      if (day.source !== "holiday") continue;

      if (scheduleViewMode === "timeline") {
        events.push({
          id: day.id,
          title: day.reason,
          start: day.blockedStartDatetime,
          end: day.blockedEndDatetime,
          allDay: false,
          display: "background",
          backgroundColor: "rgba(253, 224, 71, 0.45)",
          borderColor: "#facc15",
          classNames: ["fc-admin-holiday-event"],
          extendedProps: {
            type: "holiday-bg",
            unavailableDayId: day.id,
          },
        });
      } else {
        events.push({
          id: day.id,
          title: day.reason,
          start: day.blockedStartDatetime.slice(0, 10),
          end: day.blockedEndDatetime.slice(0, 10),
          allDay: true,
          backgroundColor: "#fef3c7",
          borderColor: "#fde68a",
          textColor: "#92400e",
          classNames: ["fc-admin-holiday-event"],
          extendedProps: {
            type: "holiday",
            unavailableDayId: day.id,
          },
        });
      }
    }

    // Manual blocks:
    //   - Timeline: per-row bg event at the actual hour range.
    //   - Calendar: ONE bg event per blocked DATE (deduped via
    //     unavailableByDate). FC's bg events are already
    //     `position: absolute; inset: 0` inside .fc-daygrid-day-frame,
    //     so each event paints the full cell — that's the "single
    //     layer" the user asked for. The reason text rides on top via
    //     renderEventContent.
    if (scheduleViewMode === "timeline") {
      for (const day of unavailableDays) {
        if (day.source === "holiday") continue;
        events.push({
          id: day.id,
          title: day.reason,
          start: day.blockedStartDatetime,
          end: day.blockedEndDatetime,
          allDay: false,
          display: "background",
          backgroundColor: "rgba(248, 113, 113, 0.55)",
          borderColor: "rgba(220, 38, 38, 0.7)",
          classNames: ["fc-admin-unavailable-event"],
          extendedProps: {
            type: "unavailable-day-bg",
            unavailableDayId: day.id,
          },
        });
      }
    } else {
      for (const [dateKey, block] of unavailableByDate) {
        events.push({
          id: `unavailable-cell-${dateKey}`,
          title: block.reason,
          start: dateKey,
          end: addDateKeyDays(dateKey, 1),
          allDay: true,
          display: "background",
          backgroundColor: "rgba(248, 113, 113, 0.45)",
          classNames: ["fc-admin-unavailable-event"],
          extendedProps: {
            type: "unavailable-day-cell",
            unavailableDayId: block.id,
          },
        });
      }
    }

    return events;
  }, [unavailableDays, scheduleViewMode, unavailableByDate]);

  const projectsByDate = useMemo(() => {
    const map = new Map<string, ScheduleProject[]>();
    for (const project of projects) {
      for (const key of project.activeDays ?? []) {
        const list = map.get(key) ?? [];
        list.push(project);
        map.set(key, list);
      }
    }
    return map;
  }, [projects]);

  const unavailableDaysByDate = useMemo(() => {
    const map = new Map<string, ScheduleUnavailableDay[]>();
    for (const day of unavailableDays) {
      const list = map.get(day.blockedDate) ?? [];
      list.push(day);
      map.set(day.blockedDate, list);
    }
    return map;
  }, [unavailableDays]);

  const selectedDayProjects = selectedDate
    ? (projectsByDate.get(selectedDate) ?? [])
    : [];
  const selectedDayUnavailableDays = selectedDate
    ? (unavailableDaysByDate.get(selectedDate) ?? [])
    : [];
  // Side panel mirrors the calendar view: when the user navigates to
  // May, the list shows May's blocks; navigate to June and the list
  // updates. Falls back to "upcoming from today" before FC has fired
  // its first datesSet (mount race).
  const upcomingUnavailableDays = useMemo(() => {
    if (calendarViewRange) {
      // FC's endStr is exclusive — filter < endKey, not <=.
      return unavailableDays
        .filter(
          (day) =>
            day.blockedDate >= calendarViewRange.startKey &&
            day.blockedDate < calendarViewRange.endKey,
        )
        .sort((a, b) => a.blockedDate.localeCompare(b.blockedDate));
    }
    return unavailableDays
      .filter((day) => day.blockedDate >= todayKey)
      .slice(0, 8);
  }, [unavailableDays, todayKey, calendarViewRange]);

  const handleEventClick = (info: EventClickArg) => {
    const startStr = info.event.startStr || "";
    const dateKey = startStr.slice(0, 10);
    if (dateKey) setSelectedDate(dateKey);
  };

  const handleDateClick = (info: DateClickArg) => {
    setCalendarContextMenu(null);
    setSelectedDate(info.dateStr);
  };

  function openCreateUnavailableDay(dateKey?: string | null) {
    setCalendarContextMenu(null);
    setEditingUnavailableDay(null);
    setModalDateOverride(dateKey ?? selectedDate ?? null);
    setIsUnavailableModalOpen(true);
  }

  function openEditUnavailableDay(day: ScheduleUnavailableDay) {
    setCalendarContextMenu(null);
    setEditingUnavailableDay(day);
    setModalDateOverride(null);
    setIsUnavailableModalOpen(true);
  }

  function handleCalendarDayMount(arg: DayCellMountArg) {
    arg.el.oncontextmenu = (event) => {
      event.preventDefault();
      setSelectedDate(null);
      setCalendarContextMenu({
        date: arg.dateStr,
        x: event.clientX,
        y: event.clientY,
      });
    };
  }

  useEffect(() => {
    if (!calendarContextMenu) return;

    function closeContextMenu() {
      setCalendarContextMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("contextmenu", closeContextMenu);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeContextMenu);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("contextmenu", closeContextMenu);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeContextMenu);
    };
  }, [calendarContextMenu]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadProjects(), loadUnavailableDays()]);
      toast.success("Schedule refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh schedule.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRefreshUnavailableDays() {
    if (refreshingUnavailableDays) return;
    setRefreshingUnavailableDays(true);
    try {
      await loadUnavailableDays({ manualOnly: true });
      toast.success("Unavailable days refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh unavailable days.",
      );
    } finally {
      setRefreshingUnavailableDays(false);
    }
  }

  async function handleSaveUnavailableDay(value: UnavailableDayFormValue) {
    setSavingUnavailableDay(true);

    try {
      // Editing + switching to multi-day means "replace this single row
      // with N full-day rows over the picked range." PATCH only updates
      // a single row, so we do DELETE-then-POST instead. Other edit
      // flows (whole-day / specific-time) go through PATCH as before.
      const isReplacingWithMultiDay =
        editingUnavailableDay !== null && value.blockMode === "multi-day";

      if (isReplacingWithMultiDay) {
        // The clicked row may be part of a multi-row batch (same reason
        // + blockType, consecutive days). Delete every row in the
        // cluster so the new POST can replace the entire series in one
        // shot — otherwise we'd leave stale day-rows behind that would
        // re-appear on the calendar after the new range was inserted.
        const cluster = detectBatchCluster(
          editingUnavailableDay,
          unavailableDays,
        );
        const idsToDelete = cluster?.ids ?? [editingUnavailableDay.id];

        const deleteResults = await Promise.all(
          idsToDelete.map((id) =>
            fetch("/api/schedule/unavailable-days", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ unavailableDayId: id }),
            }),
          ),
        );
        const failed = deleteResults.find((r) => !r.ok);
        if (failed) {
          const errBody = await failed.json().catch(() => null);
          throw new Error(
            errBody?.error || "Failed to remove existing block(s).",
          );
        }
      }

      const method =
        editingUnavailableDay && !isReplacingWithMultiDay ? "PATCH" : "POST";

      const response = await fetch("/api/schedule/unavailable-days", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // PATCH needs the id. POST flows ignore it.
          ...(method === "PATCH"
            ? { unavailableDayId: editingUnavailableDay?.id }
            : {}),
          // Whole-day:    server stamps midnight-UTC → next-midnight-UTC.
          // Specific-time: datetime-local pair → ISO start/end.
          // Multi-day:    server enumerates [start, end] inclusive and
          //               creates one full-day row per calendar day.
          ...(value.blockMode === "full-day"
            ? { fullDayDate: value.fullDayDate }
            : value.blockMode === "specific-time"
              ? {
                  blockedStartDatetime: value.startDatetime,
                  blockedEndDatetime: value.endDatetime,
                }
              : {
                  multiDayStartDate: value.multiDayStartDate,
                  multiDayEndDate: value.multiDayEndDate,
                }),
          reason: value.reason,
          blockType: value.blockType,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Failed to ${editingUnavailableDay ? "update" : "create"} unavailable day.`,
        );
      }

      // Refresh both manual + holiday rows so the side panel + calendar
      // pick up the new block right after the modal closes. (Using
      // manualOnly here would drop already-loaded holidays from state.)
      await loadUnavailableDays();
      setIsUnavailableModalOpen(false);
      setEditingUnavailableDay(null);
      setModalDateOverride(null);
      const createdCount = Number(data?.createdCount ?? 1);
      toast.success(
        isReplacingWithMultiDay
          ? `Replaced block with ${createdCount} day${createdCount === 1 ? "" : "s"}.`
          : editingUnavailableDay
            ? "Unavailable block updated."
            : createdCount > 1
              ? `${createdCount} unavailable blocks created.`
              : "Unavailable block created.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save unavailable day.",
      );
    } finally {
      setSavingUnavailableDay(false);
    }
  }

  // Raw delete: no native confirm prompt. Used by the new detail modal,
  // which has its own explicit Delete button.
  async function deleteUnavailableDay(day: ScheduleUnavailableDay) {
    setDeletingUnavailableDayId(day.id);

    try {
      const response = await fetch("/api/schedule/unavailable-days", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unavailableDayId: day.id,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete unavailable day.");
      }

      await loadUnavailableDays();
      toast.success("Unavailable day deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete unavailable day.",
      );
    } finally {
      setDeletingUnavailableDayId(null);
    }
  }

  async function handleDeleteUnavailableDay(day: ScheduleUnavailableDay) {
    const confirmed = window.confirm(
      `Delete unavailable day on ${formatLongDate(day.blockedDate)}?`,
    );
    if (!confirmed) return;
    await deleteUnavailableDay(day);
  }

  // Same status → route table the projects list uses, so clicking a
  // calendar event lands the admin on whatever surface that status
  // belongs on (e.g. downpayment_pending → dashboard with the modal
  // pre-opened, in_progress → dashboard with this project pre-selected).
  // See lib/planning/projectRoute.ts.
  function getProjectRoute(
    projectId: string,
    rawStatus: string,
    cancellationPhase?: string | null,
  ) {
    return resolveProjectRoute(
      projectId,
      normalizeProjectStatus(rawStatus),
      cancellationPhase ?? null,
    );
  }

  return (
    <>
      <style>{`
        .fc {
          --fc-border-color: #e5e7eb;
          --fc-today-bg-color: #f0fdf4;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f9fafb;
          font-family: inherit;
          height: 100%;
        }

        .dark .fc {
          --fc-border-color: #334155;
          --fc-today-bg-color: rgba(0, 192, 101, 0.14);
          --fc-page-bg-color: #0f172a;
          --fc-neutral-bg-color: #111827;
        }

        .fc .fc-toolbar-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #111827;
        }

        .dark .fc .fc-toolbar-title {
          color: #e5e7eb;
        }

        .fc .fc-button {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #374151 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
          border-radius: 0.75rem !important;
          padding: 0.42rem 0.7rem !important;
          font-size: 0.8rem !important;
          font-weight: 600 !important;
          transition: background 0.15s, border-color 0.15s, color 0.15s !important;
        }

        .dark .fc .fc-button {
          background: #111827 !important;
          border-color: #334155 !important;
          color: #e5e7eb !important;
          box-shadow: 0 8px 18px rgba(0,0,0,.22) !important;
        }

        .fc .fc-button:hover {
          background: #f9fafb !important;
        }

        .dark .fc .fc-button:hover {
          background: #1e293b !important;
          border-color: #475569 !important;
        }

        .fc .fc-button:focus {
          box-shadow: none !important;
        }

        .fc .fc-col-header-cell {
          padding: 4px 0;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #6b7280;
          text-transform: uppercase;
          border-color: #e5e7eb;
          background: #f9fafb;
        }

        .dark .fc .fc-col-header-cell {
          color: #cbd5e1;
          border-color: #334155;
          background: #1e293b;
        }

        .fc .fc-scrollgrid,
        .fc .fc-scrollgrid-section > * {
          border-color: #e5e7eb !important;
        }

        .dark .fc .fc-scrollgrid,
        .dark .fc .fc-scrollgrid-section > * {
          border-color: #334155 !important;
        }

        .fc .fc-daygrid-day {
          background: #ffffff;
        }

        .dark .fc .fc-daygrid-day {
          background: #0f172a;
        }

        .fc .fc-daygrid-day-number {
          font-size: 11px;
          font-weight: 600;
          color: #374151;
          padding: 3px 6px;
        }

        .dark .fc .fc-daygrid-day-number {
          color: #cbd5e1;
        }

        .fc .fc-day-other .fc-daygrid-day-number {
          color: #d1d5db;
        }

        .dark .fc .fc-day-other .fc-daygrid-day-number {
          color: #64748b;
        }

        .fc .fc-daygrid-day.fc-day-today {
          background-color: #f0fdf4 !important;
        }

        .dark .fc .fc-daygrid-day.fc-day-today {
          background-color: rgba(0, 192, 101, 0.14) !important;
        }

        .fc .fc-event {
          border-radius: 5px !important;
          cursor: pointer;
        }

        .fc .fc-event:hover {
          filter: brightness(0.95);
        }

        .dark .fc .fc-event:hover {
          filter: brightness(1.08);
        }

        .fc .fc-daygrid-event-harness {
          margin-top: 1px;
        }

        /* Multi-segment chips share a subTaskId — the first segment
           carries the title, continuations show "↳ continued". The
           continuation chips drop their borders + dim slightly so a
           pair reads as one task wrapping past lunch / off-day. */
        .fc .fc-event.seg-first {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
        .fc .fc-event.seg-mid,
        .fc .fc-event.seg-last {
          opacity: 0.78;
        }
        .fc .fc-event.seg-mid {
          border-radius: 0 !important;
        }
        .fc .fc-event.seg-last {
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
        }

        /* Pin every event harness to the full column width so FC's
           column-split layout doesn't render half-width chips when two
           events overlap in time. Mirrors the project-schedule wizard
           view — overlap is rare with the new strict-serial scheduler,
           but legacy DB rows can still produce it until they're
           re-saved through the on-load normalize. */
        .fc .fc-timegrid-event-harness {
          left: 0 !important;
          right: 0 !important;
          width: auto !important;
          margin-right: 0 !important;
        }
        .fc .fc-timegrid-event-harness-inset {
          left: 0 !important;
          right: 0 !important;
        }

        .fc .fc-daygrid-event {
          min-height: 18px;
        }

        .fc .fc-toolbar.fc-header-toolbar {
          margin-bottom: 8px;
        }

        .fc .fc-view-harness,
        .fc .fc-view-harness-active,
        .fc .fc-daygrid,
        .fc .fc-scrollgrid,
        .fc .fc-scrollgrid-section-body,
        .fc .fc-scrollgrid-section-body > td,
        .fc .fc-daygrid-body,
        .fc .fc-daygrid-body table {
          height: 100% !important;
        }

        /* Only flatten the scrollers for the dayGrid month view — the
           timeGrid week view needs its internal vertical scroller alive
           so the user can reach later hours. */
        .fc .fc-daygrid .fc-scroller,
        .fc .fc-daygrid .fc-scroller-liquid-absolute {
          overflow: hidden !important;
        }

        .fc .fc-daygrid-day-frame {
          min-height: 0 !important;
        }

        /* Make sure the time-grid scroller is allowed to scroll. */
        .fc .fc-timegrid .fc-scroller {
          overflow-y: auto !important;
        }

        .fc .fc-scroller {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }

        .dark .fc .fc-scroller {
          scrollbar-color: #64748b #0f172a;
        }

        .fc .fc-scroller::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .fc .fc-scroller::-webkit-scrollbar-track {
          background: transparent;
        }

        .fc .fc-scroller::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .dark .fc .fc-scroller::-webkit-scrollbar-thumb {
          background: #64748b;
          border: 2px solid #0f172a;
          background-clip: padding-box;
        }

        .fc .fc-scrollgrid,
        .fc .fc-scrollgrid table {
          border-radius: 0.75rem;
          overflow: hidden;
        }

        .fc .fc-event.fc-admin-holiday-event {
          border-radius: 6px !important;
          border: 1px solid #fde68a !important;
        }

        .dark .fc .fc-event.fc-admin-holiday-event {
          background-color: #fef3c7 !important;
          border-color: #facc15 !important;
          color: #78350f !important;
        }

        /* Bg events fill .fc-daygrid-day-frame via FC's default
           position:absolute / inset:0 — we just bump opacity past FC's
           0.3 default so the tint reads on white, and let the reason
           text render on top via renderEventContent. One DOM element,
           one visual layer. Timeline mode reuses the same rules — the
           bg event there covers the precise hour range because we feed
           it real start/end datetimes. */
        /* Calendar-mode unavailable cells: the COLOR comes from the TD
           itself (via .fc-day-unavailable from dayCellClassNames). FC's
           bg event sits on top transparent — its only job is to host
           the centered reason label. The border-color match makes the
           fill reach edge-to-edge with no visible gap between cells. */
        .fc .fc-day.fc-day-unavailable {
          background-color: rgba(248, 113, 113, 0.45) !important;
          border-color: rgba(248, 113, 113, 0.45) !important;
        }
        .dark .fc .fc-day.fc-day-unavailable {
          background-color: rgba(248, 113, 113, 0.35) !important;
          border-color: rgba(248, 113, 113, 0.35) !important;
        }

        /* Timeline view: paint blocked / Sunday columns with the same
           red diagonal-stripe wash the project-schedule wizard uses, so
           they visually read as off-limits even when there's no chip
           in them. The header cell above the column gets a tinted
           background + red label so the day name doesn't look "open". */
        .fc-timeGridWeek-view .fc-timegrid-col.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.1) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            rgba(239, 68, 68, 0.12) 8px,
            rgba(239, 68, 68, 0.12) 12px
          ) !important;
        }
        .fc-timeGridWeek-view .fc-col-header-cell.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.18) !important;
          color: #b91c1c !important;
        }
        .fc-timeGridWeek-view .fc-col-header-cell.fc-day-unavailable a {
          color: #b91c1c !important;
        }
        .dark .fc-timeGridWeek-view .fc-timegrid-col.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.16) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            rgba(239, 68, 68, 0.22) 8px,
            rgba(239, 68, 68, 0.22) 12px
          ) !important;
        }

        /* Both classes need opacity:1 to override FC's
           --fc-bg-event-opacity: 0.3 default — without this, even an
           rgba(...) at 0.85 alpha gets multiplied down by FC's 30%
           opacity, ending up looking like a 25% wash. */
        .fc .fc-bg-event.fc-admin-unavailable-event,
        .fc .fc-bg-event.fc-admin-holiday-event {
          opacity: 1 !important;
          margin: 0 !important;
        }

        /* Calendar view: bg event is just a transparent host for the
           label — the .fc-day-unavailable TD rule paints the whole
           cell, so we don't want a border/radius/fill cluttering it. */
        .fc-dayGridMonth-view .fc-bg-event.fc-admin-unavailable-event,
        .fc-dayGridMonth-view .fc-bg-event.fc-admin-holiday-event {
          background-color: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
        }

        /* Timeline view: red diagonal-stripe band that visually
           matches the project-schedule wizard's unavailable blocks.
           Full-day rows produce a full column-wide striped wash
           (since the bg event spans the whole 00:00-24:00 column);
           partial-time rows produce a horizontal striped band over
           just the affected hours. The 3px red left accent makes the
           band read as "blocked time", and the title text rides on
           top via renderEventContent. */
        .fc-timeGridWeek-view .fc-bg-event.fc-admin-unavailable-event {
          background-color: rgba(239, 68, 68, 0.12) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(239, 68, 68, 0.22) 6px,
            rgba(239, 68, 68, 0.22) 10px
          ) !important;
          opacity: 1 !important;
          border-left: 3px solid rgb(239, 68, 68) !important;
          border-radius: 0 !important;
        }
        .fc-timeGridWeek-view .fc-bg-event.fc-admin-holiday-event {
          background-color: rgba(245, 158, 11, 0.12) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(245, 158, 11, 0.28) 6px,
            rgba(245, 158, 11, 0.28) 10px
          ) !important;
          opacity: 1 !important;
          border-left: 3px solid rgb(245, 158, 11) !important;
          border-radius: 0 !important;
        }
        .dark .fc-timeGridWeek-view .fc-bg-event.fc-admin-unavailable-event {
          background-color: rgba(239, 68, 68, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(239, 68, 68, 0.32) 6px,
            rgba(239, 68, 68, 0.32) 10px
          ) !important;
        }
        .dark .fc-timeGridWeek-view .fc-bg-event.fc-admin-holiday-event {
          background-color: rgba(245, 158, 11, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(245, 158, 11, 0.34) 6px,
            rgba(245, 158, 11, 0.34) 10px
          ) !important;
        }

        /* Project-container background events in the timeline view.
           Default FC styling on background events would let the tint
           bleed off the column edges; tighten it down so the container
           reads as a single capsule encasing its subtasks. */
        .fc .fc-project-bg-event {
          opacity: 1 !important;
        }
        .dark .fc .fc-project-bg-event {
          filter: brightness(1.4);
        }

        .fc .fc-daygrid-day-frame {
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .fc .fc-daygrid-day-frame:hover {
          background: #f9fafb;
        }

        .dark .fc .fc-daygrid-day-frame:hover {
          background: rgba(30, 41, 59, 0.78);
        }

        /* Don't let the frame hover-bg cover the cell's red tint when
           hovering a blocked day — the inner frame paints over the
           TD's background-color, which is what was making the cell go
           white/gray on hover. */
        .fc .fc-day.fc-day-unavailable .fc-daygrid-day-frame:hover {
          background: transparent !important;
        }
      `}</style>

      <div className="min-h-screen overflow-y-auto bg-gray-50 p-4 text-gray-900 dark:bg-[#0b1120] dark:text-slate-100 lg:h-[calc(100vh-var(--admin-header-offset,0px))] lg:min-h-0 lg:overflow-hidden">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Schedule</h1>

        <div className="mt-3 lg:h-[calc(100%-2.75rem)] lg:min-h-0">
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-black/30 lg:h-full lg:min-h-0 lg:overflow-hidden">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="px-2.5 py-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {loading ? (
                <ScheduleSkeleton />
              ) : (
                <div className="grid grid-cols-12 gap-3 lg:h-full lg:min-h-0">
                  <div className="col-span-12 flex flex-col rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/25 lg:col-span-9 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      {/* Left: view toggle */}
                      <div className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        {(["calendar", "timeline"] as const).map((mode) => {
                          const active = scheduleViewMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setScheduleViewMode(mode)}
                              className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold transition ${
                                active
                                  ? "text-white shadow-sm"
                                  : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
                              }`}
                              style={
                                active ? { backgroundColor: ACCENT } : undefined
                              }
                            >
                              {mode === "calendar" ? "Calendar" : "Timeline"}
                            </button>
                          );
                        })}
                      </div>

                      {/* Center: legend */}
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {[
                          { label: "Current", color: "#00c065" },
                          { label: "Behind", color: "#ef4444" },
                          { label: "Done", color: "#9ca3af" },
                          { label: "Pending", color: "#facc15" },
                          { label: "Blocked day", color: "#fca5a5" },
                          ...(holidaySettings.enabled
                            ? [{ label: "Holiday", color: "#fde68a" }]
                            : []),
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-[11px] font-medium text-gray-600 dark:text-slate-300">
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Right: refresh + requests */}
                      <div className="flex flex-nowrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRefresh()}
                          disabled={refreshing}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                          />
                          Refresh
                        </button>

                        <button
                          type="button"
                          onClick={() => router.push("/admin/schedule/requests")}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#00c065] px-4 text-xs font-semibold text-white transition hover:bg-[#00a054] active:scale-[0.99]"
                        >
                          Requests
                        </button>
                      </div>
                    </div>

                    <div
                      className={`h-[60vh] rounded-2xl border ${BORDER} bg-gray-50 p-2 dark:border-slate-700 dark:bg-slate-950 sm:h-[70vh] lg:h-auto lg:min-h-0 lg:flex-1 lg:overflow-hidden`}
                    >
                      <div className="h-full min-h-0">
                        <FullCalendar
                          // Re-key on view change so FullCalendar fully
                          // remounts with the new initialView and the view-
                          // specific props below take effect cleanly.
                          key={`${todayKey}-${scheduleViewMode}`}
                          plugins={[
                            dayGridPlugin,
                            timeGridPlugin,
                            interactionPlugin,
                          ]}
                          initialView={
                            scheduleViewMode === "timeline"
                              ? "timeGridWeek"
                              : "dayGridMonth"
                          }
                          initialDate={projectNow}
                          // Timeline mode needs events with real start/end
                          // TIMES, not date-only segments — those would be
                          // treated as all-day and hidden by allDaySlot=false.
                          // The project-background events go FIRST so the
                          // subtask blocks render on top of their tinted
                          // project container.
                          events={
                            scheduleViewMode === "timeline"
                              ? [...fcTimelineEvents, ...unavailableDayEvents]
                              : [...fcEvents, ...unavailableDayEvents]
                          }
                          dayCellDidMount={handleCalendarDayMount}
                          // Tint the entire <td> for blocked days. FC's
                          // bg events paint inside .fc-daygrid-day-frame,
                          // so the cell border still shows around them.
                          // Painting the TD itself fills the whole cell
                          // including the border-box area; the matching
                          // CSS rule also nukes the cell border so the
                          // fill reaches edge-to-edge with no visible
                          // gap. Skipped in timeline mode — bg events
                          // there cover the precise hour range.
                          dayCellClassNames={(arg) => {
                            const yyyy = arg.date.getFullYear();
                            const mm = String(arg.date.getMonth() + 1).padStart(
                              2,
                              "0",
                            );
                            const dd = String(arg.date.getDate()).padStart(
                              2,
                              "0",
                            );
                            const dateKey = `${yyyy}-${mm}-${dd}`;
                            // Sunday only gets the off-day wash in
                            // timeline view — in calendar (month) view
                            // it stays neutral, since the workweek rule
                            // is a scheduling concept and the month
                            // overview is meant to look like a normal
                            // calendar.
                            const isSunday =
                              scheduleViewMode === "timeline" &&
                              arg.date.getDay() === 0;
                            return isSunday || unavailableDateSet.has(dateKey)
                              ? ["fc-day-unavailable"]
                              : [];
                          }}
                          // Header row gets the same class so the day
                          // label above a blocked column reads red too.
                          dayHeaderClassNames={(arg) => {
                            const yyyy = arg.date.getFullYear();
                            const mm = String(arg.date.getMonth() + 1).padStart(
                              2,
                              "0",
                            );
                            const dd = String(arg.date.getDate()).padStart(
                              2,
                              "0",
                            );
                            const dateKey = `${yyyy}-${mm}-${dd}`;
                            const isSunday =
                              scheduleViewMode === "timeline" &&
                              arg.date.getDay() === 0;
                            return isSunday || unavailableDateSet.has(dateKey)
                              ? ["fc-day-unavailable"]
                              : [];
                          }}
                          eventClick={handleEventClick}
                          dateClick={handleDateClick}
                          eventContent={renderEventContent}
                          // Force chips to fill their day column even
                          // when two events overlap in time. Combined
                          // with the segment fan-out above, this keeps
                          // the timeline visually clean — no half-width
                          // / quarter-width "split" chips.
                          slotEventOverlap={false}
                          // Tag continuation chips so the CSS can drop
                          // their borders / dim them — same model as
                          // the wizard's project-schedule view.
                          eventClassNames={(arg) => {
                            const segIndex = (
                              arg.event.extendedProps as {
                                segmentIndex?: number;
                              }
                            )?.segmentIndex;
                            const totalSegs = (
                              arg.event.extendedProps as {
                                totalSegments?: number;
                              }
                            )?.totalSegments;
                            const cls = timelineSegmentClassName(
                              segIndex,
                              totalSegs,
                            );
                            return cls ? [cls] : [];
                          }}
                          // Fires whenever the visible date range changes
                          // (prev/next, today, view switch, initial mount).
                          // Powers the "show only what's currently
                          // visible" filter on the side-panel list.
                          datesSet={(arg) => {
                            setCalendarViewRange({
                              startKey: arg.startStr.slice(0, 10),
                              endKey: arg.endStr.slice(0, 10),
                            });
                          }}
                          headerToolbar={{
                            left: "prev",
                            center: "title",
                            right: "next",
                          }}
                          firstDay={1}
                          height="100%"
                          // contentHeight=100% on time-grid forces the
                          // 24-hour table to compress into the visible
                          // area, killing the scroller. Only set it for
                          // month view, where there's no internal scroll.
                          contentHeight={
                            scheduleViewMode === "timeline" ? undefined : "100%"
                          }
                          // expandRows on the 24h time-grid would also
                          // compress every hour into the viewport. Off
                          // for timeline mode so each slot keeps its
                          // natural height and FC's own internal vertical
                          // scroller appears.
                          expandRows={scheduleViewMode !== "timeline"}
                          // Month-view only props — no-ops in time-grid view.
                          fixedWeekCount={false}
                          dayMaxEvents={1}
                          // Time-grid view config (ignored by dayGridMonth).
                          allDaySlot={false}
                          nowIndicator
                          slotMinTime="00:00:00"
                          slotMaxTime="24:00:00"
                          scrollTime="08:00:00"
                          slotDuration="00:30:00"
                          slotLabelInterval="01:00"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/25 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <div className="flex flex-col px-3 py-3 lg:min-h-0 lg:flex-1">
                      <section className="shrink-0 pb-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: ACCENT }}
                            aria-hidden="true"
                          />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                            Status
                          </p>
                        </div>

                        <div className="pl-3">
                          <div className="flex items-center gap-2 text-[12px] font-medium text-gray-700 dark:text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="truncate">
                              {currentProject?.status ?? "No active project"}
                            </span>
                          </div>

                          <div className="mt-2 min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {currentProject?.projectCode ?? "—"}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-gray-600 dark:text-slate-400">
                              {currentProject?.title ?? "No project selected"}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="shrink-0 border-t border-gray-200 py-3 dark:border-slate-800">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: ACCENT }}
                              aria-hidden="true"
                            />
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                              Unavailable Days
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void handleRefreshUnavailableDays()
                              }
                              disabled={refreshingUnavailableDays}
                              aria-label="Refresh unavailable days"
                              title="Refresh unavailable days"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  refreshingUnavailableDays ? "animate-spin" : ""
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateUnavailableDay()}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Plus className="h-3 w-3" />
                              Add
                            </button>
                          </div>
                        </div>

                        <div className="max-h-[210px] divide-y divide-gray-200 overflow-y-auto pr-1 dark:divide-slate-800">
                          {unavailableLoading ? (
                            <div className="flex items-center justify-center py-4 text-[12px] text-gray-500 dark:text-slate-400">
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              Loading blocked days...
                            </div>
                          ) : upcomingUnavailableDays.length > 0 ? (
                            upcomingUnavailableDays.map((day) => (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => setViewingUnavailableDay(day)}
                                className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-slate-800/80"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                                      {formatShortDate(day.blockedDate)}
                                    </p>
                                    <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-gray-900 dark:text-slate-100">
                                      {day.reason}
                                    </p>
                                  </div>
                                  <span
                                    className={[
                                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                      day.source === "holiday"
                                        ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                                        : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
                                    ].join(" ")}
                                  >
                                    {getUnavailableTypeLabel(day)}
                                  </span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="py-4 text-center text-[12px] text-gray-500 dark:text-slate-400">
                              No blocked days yet.
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="flex flex-col border-t border-gray-200 pt-3 dark:border-slate-800 lg:min-h-0 lg:flex-1">
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: ACCENT }}
                              aria-hidden="true"
                            />
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                              Projects
                            </p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-slate-800 dark:text-slate-300">
                            {projects.length}
                          </span>
                        </div>

                        <div className="max-h-[260px] divide-y divide-gray-200 overflow-y-auto pr-1 dark:divide-slate-800 lg:max-h-none lg:min-h-0 lg:flex-1">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-slate-800/80"
                                onClick={() => {
                                  const startKey =
                                    project.scheduledStartDatetime
                                      ? project.scheduledStartDatetime.slice(
                                          0,
                                          10,
                                        )
                                      : "";
                                  if (startKey) setSelectedDate(startKey);
                                }}
                              >
                                <div className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-gray-800 dark:text-slate-200">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="py-5 text-center text-[12px] text-gray-500 dark:text-slate-400">
                              No projects yet.
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedDate && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-[92%] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="h-1 w-full rounded-t-2xl"
                style={{ backgroundColor: ACCENT }}
              />

              <div className="border-b border-gray-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ACCENT }}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        Day Details
                      </p>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-slate-100">
                      {formatLongDate(selectedDate)}
                    </h3>
                  </div>

                  <button
                    onClick={() => setSelectedDate(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                <div className="grid gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Projects
                    </div>

                    <div className="mt-2 grid gap-2">
                      {selectedDayProjects.length === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed ${BORDER} bg-gray-50 px-3 py-4 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400`}
                        >
                          No projects scheduled.
                        </div>
                      ) : (
                        selectedDayProjects.map((project) => {
                          const colors = STATUS_COLORS[project.status];
                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                router.push(
                                  getProjectRoute(
                                    project.id,
                                    project.rawStatus,
                                    project.cancellationPhase ?? null,
                                  ),
                                );
                                setSelectedDate(null);
                              }}
                              className={`flex items-center justify-between gap-3 rounded-xl border ${BORDER} bg-white px-3 py-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/25 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-950/20`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: colors.bg }}
                                  />
                                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                                    {project.title}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                                  {project.projectCode ?? "—"} ·{" "}
                                  {project.dateLabel}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                Open →
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        <CalendarDays className="h-4 w-4" />
                        Unavailable Days
                      </div>

                      <button
                        type="button"
                        onClick={() => openCreateUnavailableDay(selectedDate)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>

                    <div className="grid gap-2">
                      {selectedDayUnavailableDays.length === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed ${BORDER} bg-gray-50 px-3 py-4 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400`}
                        >
                          No unavailable days recorded.
                        </div>
                      ) : (
                        selectedDayUnavailableDays.map((day) => (
                          <div
                            key={day.id}
                            className={[
                              "rounded-xl border px-3 py-3",
                              day.source === "holiday"
                                ? "border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/15"
                                : "border-red-200 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/15",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                    {day.reason}
                                  </p>
                                  <span
                                    className={[
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                      day.source === "holiday"
                                        ? "border border-amber-200 bg-white/70 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                                        : "border border-red-200 bg-white/70 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
                                    ].join(" ")}
                                  >
                                    {getUnavailableTypeLabel(day)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">
                                  {day.isFullDay
                                    ? "All day"
                                    : `${new Date(
                                        day.blockedStartDatetime,
                                      ).toLocaleString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })} – ${new Date(
                                        day.blockedEndDatetime,
                                      ).toLocaleString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}`}
                                </p>
                              </div>

                              {day.isEditable ? (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditUnavailableDay(day)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                    aria-label="Edit unavailable day"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteUnavailableDay(day)
                                    }
                                    disabled={
                                      deletingUnavailableDayId === day.id
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                    aria-label="Delete unavailable day"
                                  >
                                    {deletingUnavailableDayId === day.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="shrink-0 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                  Read only
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-slate-800">
                <button
                  onClick={() => setSelectedDate(null)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT;
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {calendarContextMenu ? (
          <div
            className="fixed inset-0 z-[70]"
            onClick={() => setCalendarContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setCalendarContextMenu(null);
            }}
          >
            <div
              className="absolute min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50"
              style={{
                left: calendarContextMenu.x,
                top: calendarContextMenu.y,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-3 py-2 dark:border-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  {formatLongDate(calendarContextMenu.date)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openCreateUnavailableDay(calendarContextMenu.date)}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4 text-[#00c065]" />
                Create unavailable day
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <UnavailableDayModal
        key={`${editingUnavailableDay?.id ?? "create"}-${modalDateOverride ?? "none"}-${isUnavailableModalOpen ? "open" : "closed"}`}
        open={isUnavailableModalOpen}
        mode={editingUnavailableDay ? "edit" : "create"}
        initialValue={toUnavailableModalValue(
          editingUnavailableDay,
          modalDateOverride,
          unavailableDays,
        )}
        saving={savingUnavailableDay}
        onClose={() => {
          if (savingUnavailableDay) return;
          setIsUnavailableModalOpen(false);
          setEditingUnavailableDay(null);
          setModalDateOverride(null);
        }}
        onSubmit={(value) => void handleSaveUnavailableDay(value)}
      />

      <UnavailableBlockDetailModal
        open={viewingUnavailableDay !== null}
        block={viewingUnavailableDay}
        deleting={
          viewingUnavailableDay !== null &&
          deletingUnavailableDayId === viewingUnavailableDay.id
        }
        onClose={() => setViewingUnavailableDay(null)}
        onEdit={() => {
          if (!viewingUnavailableDay) return;
          // Hand off to the create/edit modal in edit mode. The detail
          // modal closes; the user's actions land in the existing flow.
          openEditUnavailableDay(viewingUnavailableDay);
          setViewingUnavailableDay(null);
        }}
        onDelete={async () => {
          if (!viewingUnavailableDay) return;
          const target = viewingUnavailableDay;
          await deleteUnavailableDay(target);
          setViewingUnavailableDay(null);
        }}
      />
    </>
  );
}
