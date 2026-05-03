"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { BriefcaseBusiness, CalendarDays, Loader2 } from "lucide-react";

import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";

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
  { bg: string; border: string; text: string }
> = {
  current: { bg: "#00c065", border: "#00a054", text: "#ffffff" },
  behind: { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  done: { bg: "#9ca3af", border: "#6b7280", text: "#ffffff" },
  pending: { bg: "#facc15", border: "#eab308", text: "#1f2937" },
};

function toFCEvent(project: ScheduleProject): FCEvent | null {
  if (!project.scheduledStartDatetime) return null;

  const start = new Date(project.scheduledStartDatetime);
  if (Number.isNaN(start.getTime())) return null;

  const colors = STATUS_COLORS[project.status];
  const startDateStr = project.scheduledStartDatetime.slice(0, 10);

  const event: FCEvent = {
    id: project.id,
    title: project.title,
    start: startDateStr,
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
  };

  if (project.scheduledEndDatetime) {
    const end = new Date(project.scheduledEndDatetime);
    if (!Number.isNaN(end.getTime())) {
      const inclusiveEnd = new Date(end);
      inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
      event.end = inclusiveEnd.toISOString().slice(0, 10);
    }
  }

  return event;
}

function isFCEvent(event: FCEvent | null): event is FCEvent {
  return Boolean(event);
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

function getUnavailableTypeLabel(day: ScheduleUnavailableDay) {
  return day.source === "holiday" ? "Holiday" : "Blocked day";
}

export default function ClientSchedule() {
  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  const [fcEvents, setFcEvents] = useState<FCEvent[]>([]);
  const [unavailableDays, setUnavailableDays] = useState<
    ScheduleUnavailableDay[]
  >([]);
  const [currentProject, setCurrentProject] = useState<ScheduleProject | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
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

        if (cancelled) return;

        const nextProjects: ScheduleProject[] = Array.isArray(projectsData?.projects)
          ? projectsData.projects
          : [];

        setProjects(nextProjects);
        setCurrentProject(projectsData?.currentProject ?? null);
        setUnavailableDays(
          Array.isArray(unavailableData?.unavailableDays)
            ? unavailableData.unavailableDays
            : [],
        );
        setFcEvents(nextProjects.map((project) => toFCEvent(project)).filter(isFCEvent));
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load client schedule:", error);
        setProjects([]);
        setCurrentProject(null);
        setUnavailableDays([]);
        setFcEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const unavailableEvents = useMemo<EventInput[]>(() => {
    return unavailableDays.map((day) => {
      if (day.source === "holiday") {
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
        classNames: ["fc-client-unavailable-event"],
        extendedProps: {
          type: "unavailable-day",
        },
      } satisfies EventInput;
    });
  }, [unavailableDays]);

  const projectsByDate = useMemo(() => {
    const map = new Map<string, ScheduleProject[]>();

    for (const project of projects) {
      if (!project.scheduledStartDatetime) continue;
      const startKey = project.scheduledStartDatetime.slice(0, 10);
      const endKey = project.scheduledEndDatetime
        ? project.scheduledEndDatetime.slice(0, 10)
        : startKey;

      const cursor = new Date(`${startKey}T00:00:00`);
      const end = new Date(`${endKey}T00:00:00`);
      if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) continue;

      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        const list = map.get(key) ?? [];
        list.push(project);
        map.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
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
    const today = new Date().toISOString().slice(0, 10);
    return unavailableDays.filter((day) => day.blockedDate >= today).slice(0, 8);
  }, [unavailableDays]);

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
          --fc-today-bg-color: #f0fdf4;
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

        .fc .fc-day_other .fc-daygrid-day-number {
          color: #d1d5db;
        }

        .fc .fc-daygrid-day.fc-day-today {
          background-color: #f0fdf4 !important;
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

        .fc .fc-event.fc-client-holiday-event {
          border-radius: 6px !important;
          border: 1px solid #fde68a !important;
        }
      `}</style>

      <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 overflow-hidden">
        <h1 className="text-xl font-semibold text-gray-900">Schedule</h1>

        <div className="mt-4 min-h-0 h-[calc(100%-2.75rem)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-hidden p-4">
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
                <div className="grid h-full min-h-0 grid-cols-12 gap-3">
                  <div className="col-span-12 flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-9">
                    <div className="mb-4 flex items-start justify-between gap-4 border-b border-gray-200 pb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Monthly Schedule
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Calendar view of your scheduled projects, holidays,
                          and blocked dates.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
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
                            <span className="text-[11px] font-medium text-gray-600">
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white p-2.5">
                      <div className="h-full min-h-0">
                        <FullCalendar
                          plugins={[dayGridPlugin, interactionPlugin]}
                          initialView="dayGridMonth"
                          initialDate={new Date()}
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

                  <aside className="col-span-12 flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-3">
                    <section className="shrink-0 pb-5">
                      <p className="text-sm font-semibold text-gray-900">
                        Current Project Status
                      </p>

                      <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                          <span>
                            Status:{" "}
                            {currentProject?.status ?? "No active project"}
                          </span>
                        </div>

                        <div>
                          <div className="text-base font-bold text-gray-900">
                            {currentProject?.projectCode ?? "â€”"}
                          </div>
                          <div className="mt-1 text-sm leading-5 text-gray-600">
                            {currentProject?.title ?? "No project selected"}
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="border-t border-gray-200" />

                    <section className="flex min-h-0 basis-[34%] flex-col pt-5">
                      <p className="text-sm font-semibold text-gray-900">
                        Unavailable Days
                      </p>

                      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="divide-y divide-gray-200">
                          {upcomingUnavailableDays.length ? (
                            upcomingUnavailableDays.map((day) => (
                              <button
                                key={day.id}
                                type="button"
                                className="block w-full px-1 py-3 text-left transition hover:bg-gray-50"
                                onClick={() => setSelectedDate(day.blockedDate)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-gray-500">
                                      {formatShortDate(day.blockedDate)}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold leading-5 text-gray-900">
                                      {day.reason}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                      day.source === "holiday"
                                        ? "border border-amber-200 bg-amber-50 text-amber-800"
                                        : "border border-red-200 bg-red-50 text-red-700",
                                    ].join(" ")}
                                  >
                                    {getUnavailableTypeLabel(day)}
                                  </span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-[110px] items-center justify-center text-center text-sm text-gray-500">
                              No unavailable days yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    <div className="border-t border-gray-200" />

                    <section className="flex min-h-0 flex-1 flex-col pt-5">
                      <p className="text-sm font-semibold text-gray-900">
                        Projects
                      </p>

                      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="divide-y divide-gray-200">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="block w-full px-1 py-3 text-left transition hover:bg-gray-50"
                                onClick={() => {
                                  const startKey = project.scheduledStartDatetime
                                    ? project.scheduledStartDatetime.slice(0, 10)
                                    : "";
                                  if (startKey) setSelectedDate(startKey);
                                }}
                              >
                                <div className="text-xs font-medium text-gray-500">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-1 text-sm font-semibold leading-5 text-gray-900">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="flex h-full min-h-[140px] items-center justify-center text-center text-sm text-gray-500">
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
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                          No projects scheduled.
                        </div>
                      ) : (
                        selectedDayProjects.map((project) => {
                          const colors = STATUS_COLORS[project.status];
                          return (
                            <div
                              key={project.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm"
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
                                  {project.projectCode ?? "â€”"} · {project.dateLabel}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-medium capitalize text-gray-700">
                                {project.status}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <CalendarDays className="h-4 w-4" />
                      Unavailable Days
                    </div>

                    <div className="mt-2 grid gap-2">
                      {selectedDayUnavailableDays.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                          No unavailable days recorded.
                        </div>
                      ) : (
                        selectedDayUnavailableDays.map((day) => (
                          <div
                            key={day.id}
                            className={[
                              "rounded-xl border px-3 py-3",
                              day.source === "holiday"
                                ? "border-amber-200 bg-amber-50"
                                : "border-red-200 bg-red-50/60",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900">
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
                                {day.notes ? (
                                  <p className="mt-1 text-xs text-gray-600">
                                    {day.notes}
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

              <div className="border-t border-gray-200 px-5 py-4 flex justify-end gap-3">
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
        ) : null}
      </div>
    </>
  );
}
