"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
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
  notes: string | null;
};

const BORDER = "border border-gray-200";

const STATUS_COLORS: Record<
  EventStatus,
  { bg: string; border: string; text: string }
> = {
  current: { bg: "#00c065", border: "#00a054", text: "#ffffff" },
  behind: { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  done: { bg: "#9ca3af", border: "#6b7280", text: "#ffffff" },
  pending: { bg: "#facc15", border: "#eab308", text: "#1f2937" },
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
          notes: null,
        })),
      );
  }, [personalUnavailability]);

  const sharedUnavailableItems = useMemo<CalendarUnavailableItem[]>(() => {
    return sharedUnavailableDays.map((day) => ({
      id: day.id,
      date: day.blockedDate,
      label: day.reason,
      source: day.source === "holiday" ? "holiday" : "blocked",
      notes: day.notes,
    }));
  }, [sharedUnavailableDays]);

  const allUnavailableItems = useMemo(() => {
    return [...sharedUnavailableItems, ...approvedLeaveItems].sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return left.label.localeCompare(right.label);
    });
  }, [approvedLeaveItems, sharedUnavailableItems]);

  const unavailableEvents = useMemo<EventInput[]>(() => {
    const sharedEvents = sharedUnavailableDays.map((day) => {
      if (day.source === "holiday") {
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

    const leaveEvents = approvedLeaveItems.map((item) => ({
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
    })) satisfies EventInput[];

    return [...sharedEvents, ...leaveEvents];
  }, [approvedLeaveItems, sharedUnavailableDays]);

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
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-900">
                          Monthly Schedule
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Calendar view of your scheduled projects, blocked days,
                          and approved leave.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
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
                          key={todayKey}
                          plugins={[dayGridPlugin, interactionPlugin]}
                          initialView="dayGridMonth"
                          initialDate={projectNow}
                          events={[...fcEvents, ...unavailableEvents]}
                          eventClick={handleEventClick}
                          dateClick={handleDateClick}
                          eventContent={renderEventContent}
                          headerToolbar={{
                            left: "prev",
                            center: "title",
                            right: "next",
                          }}
                          firstDay={1}
                          height="100%"
                          contentHeight="100%"
                          expandRows={true}
                          dayMaxEvents={2}
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
                                {item.notes ? (
                                  <p className="mt-1 text-xs text-gray-600">
                                    {item.notes}
                                  </p>
                                ) : null}
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
