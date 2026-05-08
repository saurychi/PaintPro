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
import {
  BriefcaseBusiness,
  CalendarDays,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";
import { supabase } from "@/lib/supabaseClient";
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

type StaffUnavailability = {
  id: string;
  startDatetime: string | null;
  endDatetime: string | null;
  reason: string | null;
  status: string;
};

type StaffScheduleResponse = {
  projects?: ScheduleProject[];
  currentProject?: ScheduleProject | null;
  unavailability?: StaffUnavailability[];
  subtasks?: Array<{
    id: string;
    projectId: string;
    title: string;
    scheduledStartDatetime: string | null;
    scheduledEndDatetime: string | null;
    status: string;
  }>;
  error?: string;
};

type UnavailableDaysResponse = {
  unavailableDays?: ScheduleUnavailableDay[];
  error?: string;
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

type CalendarUnavailableItem = {
  id: string;
  date: string;
  label: string;
  source: "blocked" | "holiday" | "personal-approved";
};

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

function enumerateDateRange(startDatetime: string | null, endDatetime: string | null) {
  if (!startDatetime) return [] as string[];

  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : new Date(startDatetime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  while (cursor <= endDay) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getUnavailableBadge(item: CalendarUnavailableItem) {
  if (item.source === "holiday") return "Holiday";
  if (item.source === "personal-approved") return "Approved leave";
  return "Blocked day";
}

function getUnavailableBadgeStyles(item: CalendarUnavailableItem) {
  if (item.source === "holiday") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  if (item.source === "personal-approved") {
    return "border border-violet-200 bg-violet-50 text-violet-800";
  }
  return "border border-red-200 bg-red-50 text-red-700";
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function StaffSchedulePage() {
  const router = useRouter();
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
  const [currentProject, setCurrentProject] = useState<ScheduleProject | null>(
    null,
  );
  const [sharedUnavailableDays, setSharedUnavailableDays] = useState<
    ScheduleUnavailableDay[]
  >([]);
  const [personalUnavailability, setPersonalUnavailability] = useState<
    StaffUnavailability[]
  >([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Toggle between the month-grid "calendar" view and the time-axis
  // "timeline" view (mirrors how the project-schedule page in
  // /admin/job-creation/project-schedule presents the schedule).
  const [scheduleViewMode, setScheduleViewMode] = useState<
    "calendar" | "timeline"
  >("calendar");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated.");
      }

      const [scheduleResponse, unavailableResponse] = await Promise.all([
        fetch("/api/schedule/getStaffSchedule", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }),
        fetch("/api/schedule/unavailable-days", {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      const scheduleData =
        (await scheduleResponse.json()) as StaffScheduleResponse;
      const unavailableData =
        (await unavailableResponse.json()) as UnavailableDaysResponse;

      if (!scheduleResponse.ok) {
        throw new Error(
          scheduleData?.error || "Failed to load staff schedule.",
        );
      }

      if (!unavailableResponse.ok) {
        throw new Error(
          unavailableData?.error || "Failed to load unavailable days.",
        );
      }

      const nextProjects = Array.isArray(scheduleData?.projects)
        ? scheduleData.projects
        : [];

      setProjects(nextProjects);
      setCurrentProject(scheduleData?.currentProject ?? null);
      setSubtasks(
        Array.isArray(scheduleData?.subtasks)
          ? (scheduleData.subtasks as Array<Record<string, unknown>>).map(
              (raw): ScheduleSubtask => ({
                id: String(raw.id ?? ""),
                projectId: String(raw.projectId ?? ""),
                title: String(raw.title ?? ""),
                scheduledStartDatetime:
                  typeof raw.scheduledStartDatetime === "string"
                    ? raw.scheduledStartDatetime
                    : null,
                scheduledEndDatetime:
                  typeof raw.scheduledEndDatetime === "string"
                    ? raw.scheduledEndDatetime
                    : null,
                status: String(raw.status ?? ""),
                estimatedHours:
                  typeof raw.estimatedHours === "number" &&
                  Number.isFinite(raw.estimatedHours) &&
                  raw.estimatedHours > 0
                    ? raw.estimatedHours
                    : null,
              }),
            )
          : [],
      );
      setSharedUnavailableDays(
        Array.isArray(unavailableData?.unavailableDays)
          ? unavailableData.unavailableDays
          : [],
      );
      setPersonalUnavailability(
        Array.isArray(scheduleData?.unavailability)
          ? scheduleData.unavailability
          : [],
      );
    } catch (error) {
      console.error("Failed to load staff schedule:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load schedule.",
      );
      setProjects([]);
      setCurrentProject(null);
      setSubtasks([]);
      setSharedUnavailableDays([]);
      setPersonalUnavailability([]);
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
    } catch {
      // toast already shown in loadData
    } finally {
      setRefreshing(false);
    }
  }

  // Timeline-mode events: one block per assigned SUBTASK at its real
  // start/end times. The calendar-mode events are date-only segments which
  // timeGridWeek hides (allDaySlot=false), so we'd see nothing without
  // these.
  // Date-only set of full-day blocks the segment renderer should skip
  // past so a subtask spanning a holiday paints as two pieces with the
  // blocked column empty between them. Only full-day blocks go in here
  // — partial-time blocks split visually via background events
  // elsewhere on the page, not via segment splitting.
  const timelineUnavailableDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const day of sharedUnavailableDays) {
      if (day.isFullDay && typeof day.blockedDate === "string") {
        set.add(day.blockedDate);
      }
    }
    return set;
  }, [sharedUnavailableDays]);

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

  const approvedLeaveItems = useMemo<CalendarUnavailableItem[]>(() => {
    return personalUnavailability
      .filter((entry) => entry.status === "approved")
      .flatMap((entry) =>
        enumerateDateRange(entry.startDatetime, entry.endDatetime).map((date) => ({
          id: `${entry.id}-${date}`,
          date,
          label: entry.reason?.trim() || "Approved leave",
          source: "personal-approved" as const,
        })),
      );
  }, [personalUnavailability]);

  const sharedUnavailableItems = useMemo<CalendarUnavailableItem[]>(() => {
    return sharedUnavailableDays.map((day) => ({
      id: day.id,
      date: day.blockedDate,
      label: day.reason,
      source: day.source === "holiday" ? "holiday" : "blocked",
    }));
  }, [sharedUnavailableDays]);

  const allUnavailableItems = useMemo(() => {
    return [...sharedUnavailableItems, ...approvedLeaveItems].sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return left.label.localeCompare(right.label);
    });
  }, [approvedLeaveItems, sharedUnavailableItems]);

  // (Project-tinted backgrounds removed — they painted a soft green
  // wash behind every project's run of subtasks. Each subtask chip
  // already carries the project's status color.)

  const unavailableEvents = useMemo<EventInput[]>(() => {
    // Timeline mode renders blocks as bg events at the actual
    // start/end datetimes so partial-time blocks (e.g. Tue 1-3pm)
    // paint a striped band over just those hours, while full-day
    // blocks naturally span the entire 00:00-24:00 column. Calendar
    // mode keeps the original all-day rendering since timeGridWeek
    // hides the all-day row but dayGridMonth uses it.
    const sharedEvents: EventInput[] = sharedUnavailableDays.map((day) => {
      const isHoliday = day.source === "holiday";
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
              ? "fc-staff-holiday-event"
              : "fc-staff-unavailable-event",
          ],
          extendedProps: {
            type: isHoliday ? "holiday-bg" : "unavailable-day-bg",
          },
        } satisfies EventInput;
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
          classNames: ["fc-staff-holiday-event"],
          extendedProps: {
            type: "holiday",
          },
        } satisfies EventInput;
      }
      return {
        id: day.id,
        title: day.reason,
        start: day.blockedDate,
        allDay: true,
        display: "background",
        backgroundColor: "#fee2e2",
        borderColor: "#fecaca",
        classNames: ["fc-staff-unavailable-event"],
        extendedProps: {
          type: "blocked-day",
        },
      } satisfies EventInput;
    });

    const leaveEvents: EventInput[] = approvedLeaveItems.map((item) => ({
      id: item.id,
      title: item.label,
      start: item.date,
      allDay: true,
      display: "background",
      backgroundColor: "#ede9fe",
      borderColor: "#c4b5fd",
      classNames: ["fc-staff-leave-event"],
      extendedProps: {
        type: "approved-leave",
      },
    }));

    return [...sharedEvents, ...leaveEvents];
  }, [approvedLeaveItems, sharedUnavailableDays, scheduleViewMode]);

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
    const map = new Map<string, CalendarUnavailableItem[]>();

    for (const item of allUnavailableItems) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }

    return map;
  }, [allUnavailableItems]);

  const selectedDayProjects = selectedDate
    ? (projectsByDate.get(selectedDate) ?? [])
    : [];
  const selectedDayUnavailableItems = selectedDate
    ? (unavailableByDate.get(selectedDate) ?? [])
    : [];

  const upcomingUnavailableItems = useMemo(() => {
    return allUnavailableItems.filter((item) => item.date >= todayKey).slice(0, 8);
  }, [allUnavailableItems, todayKey]);

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
        .fc {
          --fc-border-color: #f3f4f6;
          --fc-today-bg-color: #f9fafb;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f9fafb;
          font-family: inherit;
          height: 100%;
        }

        .fc .fc-toolbar-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #111827;
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
          transition: background 0.15s !important;
        }

        .fc .fc-button:hover {
          background: #f9fafb !important;
        }

        .fc .fc-button:focus {
          box-shadow: none !important;
        }

        .fc .fc-col-header-cell {
          padding: 6px 0;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #9ca3af;
          text-transform: uppercase;
          border-color: #f3f4f6;
          background: #ffffff;
        }

        .fc .fc-daygrid-day-number {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          padding: 6px 8px;
        }

        .fc .fc-day-other .fc-daygrid-day-number {
          color: #d1d5db;
        }

        .fc .fc-daygrid-day.fc-day-today {
          background-color: #f9fafb !important;
        }

        .fc .fc-event {
          border-radius: 6px !important;
          cursor: pointer;
        }

        .fc .fc-event:hover {
          filter: brightness(0.95);
        }

        /* Multi-segment chips: see admin/schedule for full notes. */
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

        /* Sunday + manual unavailable days — red striped column wash
           in timeline view, mirroring the project-schedule wizard. */
        .fc .fc-day.fc-day-unavailable {
          background-color: rgba(239, 68, 68, 0.1) !important;
        }
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

        .fc .fc-daygrid-event-harness {
          margin-top: 2px;
        }

        .fc .fc-toolbar.fc-header-toolbar {
          margin-bottom: 12px;
        }

        .fc .fc-scrollgrid,
        .fc .fc-scrollgrid table {
          border-radius: 0.75rem;
          overflow: hidden;
        }

        .fc .fc-event.fc-staff-holiday-event {
          border-radius: 6px !important;
          border: 1px solid #fde68a !important;
        }

        /* Timeline-mode unavailable + holiday bg events: red / amber
           diagonal-stripe band that matches the project-schedule
           wizard. Full-day rows produce a column-wide striped wash;
           partial-time rows produce a horizontal striped band over
           just the affected hours. The 3px left accent makes the band
           read as "blocked time"; the title rides on top via
           renderEventContent. */
        .fc-timeGridWeek-view .fc-bg-event.fc-staff-unavailable-event {
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
        .fc-timeGridWeek-view .fc-bg-event.fc-staff-holiday-event {
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
        .dark .fc-timeGridWeek-view .fc-bg-event.fc-staff-unavailable-event {
          background-color: rgba(239, 68, 68, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(239, 68, 68, 0.32) 6px,
            rgba(239, 68, 68, 0.32) 10px
          ) !important;
        }
        .dark .fc-timeGridWeek-view .fc-bg-event.fc-staff-holiday-event {
          background-color: rgba(245, 158, 11, 0.18) !important;
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(245, 158, 11, 0.34) 6px,
            rgba(245, 158, 11, 0.34) 10px
          ) !important;
        }

        .fc .fc-daygrid-day-frame {
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .fc .fc-daygrid-day-frame:hover {
          background: #f9fafb;
        }
      `}</style>

      <div className="flex min-h-screen flex-col bg-gray-50 px-3 py-3 sm:px-4 sm:py-4 lg:grid lg:h-screen lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden lg:px-[1.4%] lg:py-[1.2%]">
        <h1 className="shrink-0 text-xl font-semibold leading-8 text-gray-900 sm:text-2xl">
          Schedule
        </h1>

        <div className="mt-3 lg:min-h-0">
          <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
            <div className="flex-1 p-2 lg:min-h-0 lg:overflow-hidden">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">
                      Loading schedule...
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2 lg:h-full lg:min-h-0">
                  <div className="col-span-12 flex flex-col rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:col-span-9 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      {/* Left: view toggle */}
                      <div className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
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
                                  : "text-gray-600 hover:text-gray-900"
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
                          { label: "Approved leave", color: "#c4b5fd" },
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
                            <span className="text-[11px] font-medium text-gray-600">
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
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                          />
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div
                      className={`mt-2 h-[60vh] rounded-xl border ${BORDER} bg-white p-1.5 sm:h-[70vh] lg:mt-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:overflow-hidden`}
                    >
                      <div className="h-full min-h-0">
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
                          dayMaxEvents={2}
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

                  <div className="col-span-12 flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
                    <div className="flex flex-col p-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
                      <section className="flex flex-col pb-4 lg:basis-[20%]">
                        <div className="mb-3 flex items-center gap-2">
                          <p className="text-xs font-semibold text-gray-900">
                            Current Project Status
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: currentProject
                                  ? STATUS_COLORS[currentProject.status].bg
                                  : "#9ca3af",
                              }}
                            />
                            <span>
                              Status:{" "}
                              {currentProject?.status ?? "No active project"}
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="text-sm font-bold text-gray-900">
                              {currentProject?.projectCode ?? "-"}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                              {currentProject?.title ?? "No project selected"}
                            </div>
                          </div>
                        </div>
                      </section>

                      <div className="border-t border-gray-200" />

                      <section className="flex flex-col py-4 lg:min-h-0 lg:basis-[34%]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-gray-900">
                            Unavailable Days
                          </p>

                          <button
                            type="button"
                            onClick={() => router.push("/staff/schedule/requests")}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-[#00c065] px-3 text-[11px] font-semibold text-white transition hover:bg-[#00a054]"
                          >
                            Request leave
                          </button>
                        </div>

                        <div className="max-h-[260px] divide-y divide-gray-200 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                          {upcomingUnavailableItems.length > 0 ? (
                            upcomingUnavailableItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedDate(item.date)}
                                className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-3 text-left transition hover:bg-gray-50"
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-medium text-gray-500">
                                    {formatShortDate(item.date)}
                                  </p>
                                  <p className="mt-0.5 truncate text-xs font-semibold text-gray-900">
                                    {item.label}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${getUnavailableBadgeStyles(
                                    item,
                                  )}`}
                                >
                                  {getUnavailableBadge(item)}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-20 items-center justify-center rounded-lg text-center text-xs text-gray-500">
                              No unavailable days yet.
                            </div>
                          )}
                        </div>
                      </section>

                      <div className="border-t border-gray-200" />

                      <section className="flex flex-col pt-4 lg:min-h-0 lg:basis-[46%]">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-900">
                            Projects
                          </p>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            {projects.length}
                          </span>
                        </div>

                        <div className="max-h-80 divide-y divide-gray-200 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="w-full rounded-lg px-2 py-3 text-left transition hover:bg-gray-50"
                                onClick={() => {
                                  const startKey = project.scheduledStartDatetime
                                    ? project.scheduledStartDatetime.slice(0, 10)
                                    : "";
                                  if (startKey) setSelectedDate(startKey);
                                }}
                              >
                                <div className="text-[11px] font-medium text-gray-500">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-gray-800">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-[100px] items-center justify-center rounded-lg text-center text-xs text-gray-500">
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

        {selectedDate ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-[92%] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      Day Details
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-gray-900">
                      {formatLongDate(selectedDate)}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                    aria-label="Close"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                <div className="grid gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Projects
                    </div>

                    <div className="mt-2 grid gap-2">
                      {selectedDayProjects.length === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed ${BORDER} bg-gray-50 px-3 py-4 text-center text-sm text-gray-500`}
                        >
                          No projects scheduled.
                        </div>
                      ) : (
                        selectedDayProjects.map((project) => {
                          const colors = STATUS_COLORS[project.status];
                          return (
                            <div
                              key={project.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border ${BORDER} bg-white px-3 py-3 text-left shadow-sm`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: colors.bg }}
                                  />
                                  <p className="truncate text-sm font-semibold text-gray-900">
                                    {project.title}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {project.projectCode ?? "-"} · {project.dateLabel}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-medium text-gray-700 capitalize">
                                {project.status}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <CalendarDays className="h-4 w-4" />
                      Unavailable Days
                    </div>

                    <div className="grid gap-2">
                      {selectedDayUnavailableItems.length === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed ${BORDER} bg-gray-50 px-3 py-4 text-center text-sm text-gray-500`}
                        >
                          No unavailable days recorded.
                        </div>
                      ) : (
                        selectedDayUnavailableItems.map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border px-3 py-3 ${
                              item.source === "holiday"
                                ? "border-amber-200 bg-amber-50"
                                : item.source === "personal-approved"
                                  ? "border-violet-200 bg-violet-50"
                                  : "border-red-200 bg-red-50/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {item.label}
                                  </p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getUnavailableBadgeStyles(
                                      item,
                                    )}`}
                                  >
                                    {getUnavailableBadge(item)}
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

              <div className="flex justify-end border-t border-gray-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
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
