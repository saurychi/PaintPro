"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { BriefcaseBusiness, CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";
import { useProjectNow } from "@/lib/time/useProjectNow";
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

  const colors = STATUS_COLORS[project.status];
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
        status: project.status,
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
    if (totalSegs > 1 && segIndex > 0) {
      return (
        <div className="px-1 py-0.5 text-[9px] font-medium leading-tight opacity-90 truncate">
          ↳ continued
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
        <span className="truncate text-[10px] font-semibold">
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

  if (ext?.type === "unavailable-day-bg") {
    return (
      <div className="flex h-full w-full items-start overflow-hidden px-1 py-1">
        <span className="truncate text-[10px] font-semibold leading-tight text-red-900 dark:text-red-100">
          {info.event.title}
        </span>
      </div>
    );
  }
  if (ext?.type === "holiday-bg") {
    return (
      <div className="flex h-full w-full items-start overflow-hidden px-1 py-1">
        <span className="truncate text-[10px] font-semibold leading-tight text-amber-900 dark:text-amber-100">
          {info.event.title}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center overflow-hidden px-1 py-0.5">
      <span className="truncate text-[10px] font-semibold leading-none">
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

function getUnavailableTypeLabel(day: ScheduleUnavailableDay) {
  return day.source === "holiday" ? "Holiday" : "Blocked day";
}

export default function ClientSchedule() {
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
  const [refreshing, setRefreshing] = useState(false);
  // Toggle between the month-grid "calendar" view and the time-axis
  // "timeline" view (mirrors the project-schedule page in
  // /admin/job-creation/project-schedule).
  const [scheduleViewMode, setScheduleViewMode] = useState<
    "calendar" | "timeline"
  >("calendar");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [projectsResponse, unavailableResponse] = await Promise.all([
        fetch("/api/schedule/getProjects", {
          method: "GET",
          cache: "no-store",
        }),
        fetch("/api/schedule/unavailable-days", {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      const projectsData = await projectsResponse.json();
      const unavailableData = await unavailableResponse.json();

      if (!projectsResponse.ok) {
        throw new Error(
          projectsData?.error || "Failed to load schedule projects.",
        );
      }

      if (!unavailableResponse.ok) {
        throw new Error(
          unavailableData?.error || "Failed to load unavailable days.",
        );
      }

      const nextProjects: ScheduleProject[] = Array.isArray(
        projectsData?.projects,
      )
        ? projectsData.projects
        : [];

      setProjects(nextProjects);
      setCurrentProject(projectsData?.currentProject ?? null);
      setSubtasks(
        Array.isArray(projectsData?.subtasks) ? projectsData.subtasks : [],
      );
      setUnavailableDays(
        Array.isArray(unavailableData?.unavailableDays)
          ? unavailableData.unavailableDays
          : [],
      );
    } catch (error) {
      console.error("Failed to load client schedule:", error);
      setProjects([]);
      setCurrentProject(null);
      setSubtasks([]);
      setUnavailableDays([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadData();
      toast.success("Schedule refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh schedule.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  // Date-only set of full-day blocks the segment renderer should skip
  // past so a subtask spanning a holiday paints as two pieces with the
  // blocked column empty between them.
  const timelineUnavailableDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const day of unavailableDays) {
      if (day.isFullDay && typeof day.blockedDate === "string") {
        set.add(day.blockedDate);
      }
    }
    return set;
  }, [unavailableDays]);

  // Timeline-mode events: one block per SUBTASK at its real start/end
  // times. Calendar-mode events are date-only segments which timeGridWeek
  // hides (allDaySlot=false), so we need this granular list to render
  // anything visible in the timeline.
  const fcTimelineEvents = useMemo<EventInput[]>(() => {
    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const out: EventInput[] = [];
    for (const s of subtasks) {
      if (typeof s.scheduledStartDatetime !== "string") continue;
      const project = projectsById.get(s.projectId);
      if (!project) continue;
      const colors = STATUS_COLORS[project.status];
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
        timelineUnavailableDateSet,
      );
      out.push(...segments);
    }
    return out;
  }, [subtasks, projects, timelineUnavailableDateSet]);

  const fcEvents = useMemo<FCEvent[]>(
    () => projects.flatMap((project) => toFCEventSegments(project)),
    [projects],
  );

  // (Project-tinted backgrounds removed — they painted a soft green
  // wash behind every project's run of subtasks. Each subtask chip
  // already carries the project's status color.)

  const unavailableEvents = useMemo<EventInput[]>(() => {
    return unavailableDays.map((day): EventInput => {
      const isHoliday = day.source === "holiday";
      // Timeline mode renders blocks as bg events at the actual hour
      // range so partial-time blocks paint a striped band over only
      // those hours, while full-day blocks naturally span the whole
      // 00:00-24:00 column. Calendar mode keeps the all-day pill.
      if (scheduleViewMode === "timeline") {
        return {
          id: day.id,
          title: day.reason,
          start: day.blockedStartDatetime,
          end: day.blockedEndDatetime,
          allDay: false,
          display: "background",
          classNames: [
            isHoliday
              ? "fc-client-holiday-event"
              : "fc-client-unavailable-event",
          ],
          extendedProps: {
            type: isHoliday ? "holiday-bg" : "unavailable-day-bg",
          },
        };
      }
      if (isHoliday) {
        return {
          id: day.id,
          title: day.reason,
          start: day.blockedDate,
          allDay: true,
          backgroundColor: "#fef3c7",
          borderColor: "#fde68a",
          textColor: "#92400e",
          classNames: ["fc-client-holiday-event"],
          extendedProps: {
            type: "holiday",
          },
        };
      }
      return {
        id: day.id,
        title: day.reason,
        start: day.blockedDate,
        allDay: true,
        display: "background",
        backgroundColor: "#fee2e2",
        borderColor: "#fecaca",
        classNames: ["fc-client-unavailable-event"],
        extendedProps: {
          type: "unavailable-day",
        },
      };
    });
  }, [unavailableDays, scheduleViewMode]);

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

  const unavailableByDate = useMemo(() => {
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
    ? (unavailableByDate.get(selectedDate) ?? [])
    : [];
  const upcomingUnavailableDays = useMemo(() => {
    return unavailableDays
      .filter((day) => day.blockedDate >= todayKey)
      .slice(0, 8);
  }, [unavailableDays, todayKey]);

  const handleEventClick = (info: EventClickArg) => {
    const dateKey = (info.event.startStr || "").slice(0, 10);
    if (dateKey) setSelectedDate(dateKey);
  };

  const handleDateClick = (info: DateClickArg) => {
    setSelectedDate(info.dateStr);
  };

  return (
    <>
      <style>{`
        .client-schedule-page .fc {
          --fc-border-color: #e5e7eb;
          --fc-today-bg-color: #ecfdf5;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f9fafb;
          font-family: inherit;
          height: 100%;
        }

        .client-schedule-page .fc .fc-toolbar-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #111827;
        }

        .client-schedule-page .fc .fc-button {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #374151 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
          border-radius: 0.65rem !important;
          padding: 0.3rem 0.58rem !important;
          font-size: 0.72rem !important;
          font-weight: 600 !important;
          transition: background 0.15s, border-color 0.15s !important;
        }

        .client-schedule-page .fc .fc-button:hover {
          background: #f9fafb !important;
          border-color: #d1d5db !important;
        }

        .client-schedule-page .fc .fc-button:focus {
          box-shadow: none !important;
        }

        .client-schedule-page .fc .fc-toolbar.fc-header-toolbar {
          margin-bottom: 0.45rem;
        }

        .client-schedule-page .fc .fc-col-header-cell {
          padding: 0.3rem 0;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #6b7280;
          text-transform: uppercase;
          border-color: #e5e7eb;
          background: #f9fafb;
        }

        .client-schedule-page .fc .fc-daygrid-day {
          background: #ffffff;
        }

        .client-schedule-page .fc .fc-daygrid-day-frame {
          min-height: 0 !important;
          padding: 0.12rem;
        }

        .client-schedule-page .fc .fc-daygrid-day-top {
          min-height: 1.25rem;
        }

        .client-schedule-page .fc .fc-daygrid-day-number {
          font-size: 0.67rem;
          font-weight: 600;
          color: #4b5563;
          padding: 0.18rem 0.32rem;
        }

        .client-schedule-page .fc .fc-day_other {
          background: #f9fafb;
        }

        .client-schedule-page .fc .fc-day_other .fc-daygrid-day-number {
          color: #cbd5e1;
        }

        .client-schedule-page .fc .fc-daygrid-day.fc-day-today {
          background-color: #ecfdf5 !important;
        }

        .client-schedule-page .fc .fc-daygrid-day-events {
          margin: 0 0.1rem 0.1rem;
        }

        .client-schedule-page .fc .fc-daygrid-event-harness {
          margin-top: 0.08rem;
        }

        .client-schedule-page .fc .fc-event {
          border-radius: 0.35rem !important;
          cursor: pointer;
          min-height: 1.05rem;
        }

        .client-schedule-page .fc .fc-event:hover {
          filter: brightness(0.97);
        }

        /* Multi-segment chips — see admin/schedule for full notes. */
        .client-schedule-page .fc .fc-event.seg-first {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
        .client-schedule-page .fc .fc-event.seg-mid,
        .client-schedule-page .fc .fc-event.seg-last {
          opacity: 0.78;
        }
        .client-schedule-page .fc .fc-event.seg-mid {
          border-radius: 0 !important;
        }
        .client-schedule-page .fc .fc-event.seg-last {
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
        }
        .client-schedule-page .fc .fc-timegrid-event-harness {
          left: 0 !important;
          right: 0 !important;
          width: auto !important;
          margin-right: 0 !important;
        }
        .client-schedule-page .fc .fc-timegrid-event-harness-inset {
          left: 0 !important;
          right: 0 !important;
        }

        .client-schedule-page .fc .fc-scrollgrid,
        .client-schedule-page .fc .fc-scrollgrid table {
          border-radius: 0.7rem;
          overflow: hidden;
        }

        /* Only flatten the scroller for the dayGrid month view — the
           timeGrid week view needs its internal vertical scroller alive
           so the user can reach later hours. */
        .client-schedule-page .fc .fc-daygrid .fc-scroller {
          overflow: hidden !important;
        }

        .client-schedule-page .fc .fc-timegrid .fc-scroller {
          overflow-y: auto !important;
        }

        .client-schedule-page .fc .fc-event.fc-client-holiday-event {
          border-radius: 0.35rem !important;
          border: 1px solid #fde68a !important;
        }

        /* Sunday + manual unavailable days — red striped column wash
           in timeline view, mirroring the project-schedule wizard. */
        .client-schedule-page .fc .fc-day.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.1) !important;
        }
        .client-schedule-page .fc-timeGridWeek-view
          .fc-timegrid-col.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.1) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            rgba(239, 68, 68, 0.12) 8px,
            rgba(239, 68, 68, 0.12) 12px
          ) !important;
        }
        .client-schedule-page .fc-timeGridWeek-view
          .fc-col-header-cell.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.18) !important;
          color: #b91c1c !important;
        }
        .client-schedule-page .fc-timeGridWeek-view
          .fc-col-header-cell.fc-day-unavailable a {
          color: #b91c1c !important;
        }
        .dark .client-schedule-page .fc-timeGridWeek-view
          .fc-timegrid-col.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.16) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            rgba(239, 68, 68, 0.22) 8px,
            rgba(239, 68, 68, 0.22) 12px
          ) !important;
        }

        /* Timeline-mode unavailable + holiday bg events: red / amber
           diagonal-stripe band that matches the project-schedule
           wizard. Full-day rows produce a column-wide striped wash;
           partial-time rows produce a horizontal striped band. */
        .client-schedule-page .fc-timeGridWeek-view
          .fc-bg-event.fc-client-unavailable-event {
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
        .client-schedule-page .fc-timeGridWeek-view
          .fc-bg-event.fc-client-holiday-event {
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
        .dark .client-schedule-page .fc-timeGridWeek-view
          .fc-bg-event.fc-client-unavailable-event {
          background-color: rgba(239, 68, 68, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(239, 68, 68, 0.32) 6px,
            rgba(239, 68, 68, 0.32) 10px
          ) !important;
        }
        .dark .client-schedule-page .fc-timeGridWeek-view
          .fc-bg-event.fc-client-holiday-event {
          background-color: rgba(245, 158, 11, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(245, 158, 11, 0.34) 6px,
            rgba(245, 158, 11, 0.34) 10px
          ) !important;
        }

        .dark .client-schedule-page .fc {
          --fc-border-color: #334155;
          --fc-today-bg-color: rgba(0, 192, 101, 0.12);
          --fc-page-bg-color: #111827;
          --fc-neutral-bg-color: #1f2937;
        }

        .dark .client-schedule-page .fc .fc-toolbar-title {
          color: #f8fafc;
        }

        .dark .client-schedule-page .fc .fc-button {
          background: #111827 !important;
          border-color: #334155 !important;
          color: #e5e7eb !important;
          box-shadow: none !important;
        }

        .dark .client-schedule-page .fc .fc-button:hover {
          background: #1f2937 !important;
          border-color: #475569 !important;
        }

        .dark .client-schedule-page .fc .fc-col-header-cell {
          background: #111827;
          border-color: #334155;
          color: #94a3b8;
        }

        .dark .client-schedule-page .fc .fc-daygrid-day {
          background: #111827;
        }

        .dark .client-schedule-page .fc .fc-day_other {
          background: #0f172a;
        }

        .dark .client-schedule-page .fc .fc-daygrid-day-number {
          color: #cbd5e1;
        }

        .dark .client-schedule-page .fc .fc-day_other .fc-daygrid-day-number {
          color: #64748b;
        }

        .dark .client-schedule-page .fc .fc-daygrid-day.fc-day-today {
          background-color: rgba(0, 192, 101, 0.12) !important;
        }
      `}</style>

      <div className="client-schedule-page p-3 sm:p-4 text-gray-900 dark:text-gray-100 lg:h-[calc(100vh-var(--admin-header-offset,0px))] lg:min-h-0 lg:overflow-hidden">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          Schedule
        </h1>

        <div className="mt-3 lg:min-h-0 lg:h-[calc(100%-2.25rem)]">
          <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:h-full lg:min-h-0 lg:overflow-hidden">
            <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center min-h-[40vh] lg:h-full">
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-700" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Loading schedule...
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-3 lg:h-full lg:min-h-0">
                  <div className="col-span-12 flex flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-9 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-2.5 dark:border-slate-700">
                      {/* Left: view toggle */}
                      <div className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        {(["calendar", "timeline"] as const).map((mode) => {
                          const active = scheduleViewMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setScheduleViewMode(mode)}
                              className={`inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[11px] font-semibold transition ${
                                active
                                  ? "text-white shadow-sm"
                                  : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
                              }`}
                              style={
                                active ? { backgroundColor: "#00c065" } : undefined
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
                          { label: "Holiday", color: "#fde68a" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Right: refresh */}
                      <div className="flex flex-nowrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRefresh()}
                          disabled={refreshing}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                          />
                          Refresh
                        </button>
                      </div>
                    </div>

                    {/* Calendar needs an explicit height. On mobile the parent
                        is no longer a fixed-height flex, so flex-1 collapses;
                        give it a viewport-anchored min-height there. */}
                    <div className="rounded-lg border border-gray-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950 min-h-[60vh] lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                      <div className="h-full min-h-[60vh] lg:min-h-0">
                        <FullCalendar
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
                          events={
                            scheduleViewMode === "timeline"
                              ? [...fcTimelineEvents, ...unavailableEvents]
                              : [...fcEvents, ...unavailableEvents]
                          }
                          dayCellClassNames={(arg) => {
                            const yyyy = arg.date.getFullYear();
                            const mm = String(
                              arg.date.getMonth() + 1,
                            ).padStart(2, "0");
                            const dd = String(arg.date.getDate()).padStart(
                              2,
                              "0",
                            );
                            const dateKey = `${yyyy}-${mm}-${dd}`;
                            // Sunday only gets the off-day wash in
                            // timeline view — calendar (month) view
                            // stays neutral.
                            const isSunday =
                              scheduleViewMode === "timeline" &&
                              arg.date.getDay() === 0;
                            return isSunday ||
                              timelineUnavailableDateSet.has(dateKey)
                              ? ["fc-day-unavailable"]
                              : [];
                          }}
                          dayHeaderClassNames={(arg) => {
                            const yyyy = arg.date.getFullYear();
                            const mm = String(
                              arg.date.getMonth() + 1,
                            ).padStart(2, "0");
                            const dd = String(arg.date.getDate()).padStart(
                              2,
                              "0",
                            );
                            const dateKey = `${yyyy}-${mm}-${dd}`;
                            const isSunday =
                              scheduleViewMode === "timeline" &&
                              arg.date.getDay() === 0;
                            return isSunday ||
                              timelineUnavailableDateSet.has(dateKey)
                              ? ["fc-day-unavailable"]
                              : [];
                          }}
                          eventClick={handleEventClick}
                          dateClick={handleDateClick}
                          eventContent={renderEventContent}
                          slotEventOverlap={false}
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
                          // expandRows on the 24h time-grid would compress
                          // every hour into the viewport and kill scroll.
                          // Disabling it lets each slot keep its natural
                          // height (~25px) so FullCalendar's own internal
                          // vertical scroller appears in timeline mode.
                          expandRows={scheduleViewMode !== "timeline"}
                          dayMaxEvents={1}
                          fixedWeekCount={false}
                          moreLinkClick="popover"
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

                  <aside className="col-span-12 flex flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <section className="shrink-0 pb-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                        Current Project Status
                      </p>

                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                          <span>
                            Status:{" "}
                            {currentProject?.status ?? "No active project"}
                          </span>
                        </div>

                        <div>
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-50">
                            {currentProject?.projectCode ?? "â€”"}
                          </div>
                          <div className="mt-0.5 text-xs leading-4 text-gray-600 dark:text-gray-400">
                            {currentProject?.title ?? "No project selected"}
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="border-t border-gray-200 dark:border-slate-700" />

                    <section className="flex min-h-0 basis-[34%] flex-col pt-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                        Unavailable Days
                      </p>

                      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="divide-y divide-gray-200 dark:divide-slate-700">
                          {upcomingUnavailableDays.length ? (
                            upcomingUnavailableDays.map((day) => (
                              <button
                                key={day.id}
                                type="button"
                                className="block w-full rounded-lg px-1.5 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-slate-800/70"
                                onClick={() => setSelectedDate(day.blockedDate)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                      {formatShortDate(day.blockedDate)}
                                    </div>
                                    <div className="mt-0.5 text-xs font-semibold leading-4 text-gray-900 dark:text-gray-50">
                                      {day.reason}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                      day.source === "holiday"
                                        ? "border border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-400/15 text-amber-800 dark:border-amber-500/40 dark:bg-amber-400/15 dark:text-amber-200"
                                        : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
                                    ].join(" ")}
                                  >
                                    {getUnavailableTypeLabel(day)}
                                  </span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-[110px] items-center justify-center text-center text-xs text-gray-500 dark:text-gray-400">
                              No unavailable days yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    <div className="border-t border-gray-200 dark:border-slate-700" />

                    <section className="flex min-h-0 flex-1 flex-col pt-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                        Projects
                      </p>

                      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="divide-y divide-gray-200 dark:divide-slate-700">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="block w-full rounded-lg px-1.5 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-slate-800/70"
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
                                <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-0.5 text-xs font-semibold leading-4 text-gray-900 dark:text-gray-50">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-[140px] items-center justify-center text-center text-xs text-gray-500 dark:text-gray-400">
                              No projects yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedDate ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-[92%] max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                      Day Details
                    </p>
                    <h3 className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">
                      {formatLongDate(selectedDate)}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 dark:hover:text-gray-100"
                    aria-label="Close"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
                <div className="grid gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Projects
                    </div>

                    <div className="mt-2 grid gap-2">
                      {selectedDayProjects.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400">
                          No projects scheduled.
                        </div>
                      ) : (
                        selectedDayProjects.map((project) => {
                          const colors = STATUS_COLORS[project.status];
                          return (
                            <div
                              key={project.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm dark:border-slate-700 dark:bg-slate-800"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: colors.bg }}
                                  />
                                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                                    {project.title}
                                  </p>
                                </div>
                                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                  {project.projectCode ?? "â€”"} ·{" "}
                                  {project.dateLabel}
                                </p>
                              </div>
                              <span className="shrink-0 text-[11px] font-medium capitalize text-gray-700 dark:text-gray-300">
                                {project.status}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <CalendarDays className="h-4 w-4" />
                      Unavailable Days
                    </div>

                    <div className="mt-2 grid gap-2">
                      {selectedDayUnavailableDays.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400">
                          No unavailable days recorded.
                        </div>
                      ) : (
                        selectedDayUnavailableDays.map((day) => (
                          <div
                            key={day.id}
                            className={[
                              "rounded-lg border px-3 py-2.5",
                              day.source === "holiday"
                                ? "border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-400/15"
                                : "border-red-200 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/15",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 dark:text-gray-50">
                                    {day.reason}
                                  </p>
                                  <span
                                    className={[
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                      day.source === "holiday"
                                        ? "border border-amber-200 bg-white/70 text-amber-800"
                                        : "border border-red-200 bg-white/70 text-red-700",
                                    ].join(" ")}
                                  >
                                    {getUnavailableTypeLabel(day)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-slate-700 px-5 py-4 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedDate(null)}
                  className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200"
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
        ) : null}
      </div>
    </>
  );
}
