"use client";

import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg } from "@fullcalendar/core";
import { Loader2, CalendarDays, BriefcaseBusiness, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import StaffPageShell from "@/components/staff/StaffPageShell";

type EventStatus = "current" | "behind" | "done" | "pending";

type ScheduleProject = {
  id: string;
  projectCode: string | null;
  title: string;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  status: EventStatus;
  rawStatus: string;
  dateLabel: string;
};

type Unavailability = {
  id: string;
  startDatetime: string | null;
  endDatetime: string | null;
  reason: string | null;
};

type FCEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  display?: "background";
  backgroundColor: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: {
    type: "project" | "unavailability";
    status?: EventStatus;
    projectCode?: string | null;
    rawStatus?: string;
    scheduledStartDatetime?: string | null;
    scheduledEndDatetime?: string | null;
    reason?: string | null;
  };
};

const ACCENT = "#00c065";
const BORDER = "border border-gray-200";

const STATUS_COLORS: Record<EventStatus, { bg: string; border: string; text: string }> = {
  current: { bg: "#00c065", border: "#00a054", text: "#ffffff" },
  behind: { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  done: { bg: "#9ca3af", border: "#6b7280", text: "#ffffff" },
  pending: { bg: "#facc15", border: "#eab308", text: "#1f2937" },
};

function toProjectEvent(project: ScheduleProject): FCEvent | null {
  if (!project.scheduledStartDatetime) return null;
  const start = new Date(project.scheduledStartDatetime);
  if (Number.isNaN(start.getTime())) return null;

  const colors = STATUS_COLORS[project.status];
  const event: FCEvent = {
    id: project.id,
    title: project.title,
    start: project.scheduledStartDatetime.slice(0, 10),
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    extendedProps: {
      type: "project",
      status: project.status,
      projectCode: project.projectCode,
      rawStatus: project.rawStatus,
      scheduledStartDatetime: project.scheduledStartDatetime,
      scheduledEndDatetime: project.scheduledEndDatetime,
    },
  };

  if (project.scheduledEndDatetime) {
    const end = new Date(project.scheduledEndDatetime);
    if (!Number.isNaN(end.getTime())) {
      const inclusive = new Date(end);
      inclusive.setDate(inclusive.getDate() + 1);
      event.end = inclusive.toISOString().slice(0, 10);
    }
  }

  return event;
}

function toUnavailEvent(u: Unavailability): FCEvent | null {
  if (!u.startDatetime) return null;
  const start = new Date(u.startDatetime);
  if (Number.isNaN(start.getTime())) return null;

  const endStr = u.endDatetime
    ? (() => {
        const d = new Date(u.endDatetime);
        if (Number.isNaN(d.getTime())) return undefined;
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })()
    : (() => {
        const d = new Date(start);
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })();

  return {
    id: `unavail-${u.id}`,
    title: u.reason || "Unavailable",
    start: u.startDatetime.slice(0, 10),
    end: endStr,
    display: "background",
    backgroundColor: "#fecaca",
    extendedProps: {
      type: "unavailability",
      reason: u.reason,
    },
  };
}

function isFCEvent(e: FCEvent | null): e is FCEvent {
  return Boolean(e);
}

function renderEventContent(info: EventContentArg) {
  if (info.event.display === "background") return null;
  return (
    <div className="flex w-full items-center overflow-hidden px-1.5 py-0.5">
      <span className="truncate text-[11px] font-semibold leading-tight">
        {info.event.title}
      </span>
    </div>
  );
}

function formatDatetime(dt: string | null | undefined) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StaffSchedule() {
  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  const [unavailability, setUnavailability] = useState<Unavailability[]>([]);
  const [fcEvents, setFcEvents] = useState<FCEvent[]>([]);
  const [currentProject, setCurrentProject] = useState<ScheduleProject | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FCEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch("/api/schedule/getStaffSchedule", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load schedule.");
        }

        const nextProjects: ScheduleProject[] = Array.isArray(data?.projects)
          ? data.projects
          : [];
        const nextUnavail: Unavailability[] = Array.isArray(data?.unavailability)
          ? data.unavailability
          : [];

        setProjects(nextProjects);
        setUnavailability(nextUnavail);
        setCurrentProject(data?.currentProject ?? null);

        const projectEvents = nextProjects.map(toProjectEvent).filter(isFCEvent);
        const unavailEvents = nextUnavail.map(toUnavailEvent).filter(isFCEvent);

        setFcEvents([...unavailEvents, ...projectEvents]);
      } catch (err) {
        console.error("Failed to load staff schedule:", err);
        setProjects([]);
        setUnavailability([]);
        setCurrentProject(null);
        setFcEvents([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.display === "background") return;
    const found = fcEvents.find((e) => e.id === info.event.id);
    if (found) setSelectedEvent(found);
  };

  return (
    <StaffPageShell
      title="Schedule"
      subtitle="View your assigned projects and mark unavailability on your personal calendar."
      bodyClassName="overflow-hidden"
    >
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

        .fc .fc-day-other .fc-daygrid-day-number {
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

        .fc .fc-bg-event {
          opacity: 0.35 !important;
        }
      `}</style>

      <div className="h-full min-h-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
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
                  {/* Calendar */}
                  <div className="col-span-12 lg:col-span-9 min-h-0 h-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm flex flex-col">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: ACCENT }}
                            aria-hidden="true"
                          />
                          <p className="text-sm font-semibold text-gray-900">
                            Monthly Schedule
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Your assigned jobs and marked unavailable days.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {[
                          { label: "Current", color: "#00c065" },
                          { label: "Behind", color: "#ef4444" },
                          { label: "Done", color: "#9ca3af" },
                          { label: "Pending", color: "#facc15" },
                          { label: "Unavailable", color: "#fca5a5" },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-1.5">
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

                    <div
                      className={`min-h-0 flex-1 overflow-hidden rounded-2xl border ${BORDER} bg-gray-50 p-2.5`}>
                      <div className="h-full min-h-0">
                        <FullCalendar
                          plugins={[dayGridPlugin, interactionPlugin]}
                          initialView="dayGridMonth"
                          initialDate={new Date()}
                          events={fcEvents}
                          eventClick={handleEventClick}
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

                  {/* Right sidebar */}
                  <div className="col-span-12 lg:col-span-3 min-h-0 h-full flex flex-col gap-3">
                    {/* Current job */}
                    <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-gray-900">
                          Current Job Status
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <span>
                            Status:{" "}
                            {currentProject?.status ?? "No active project"}
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="text-base font-bold text-gray-900">
                            {currentProject?.projectCode ?? "—"}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            {currentProject?.title ?? "No project selected"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unavailability */}
                    <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />
                        <p className="text-sm font-semibold text-gray-900">
                          My Unavailability
                        </p>
                      </div>

                      {unavailability.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                          No unavailability recorded.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-0.5">
                          {unavailability.map((u) => (
                            <div
                              key={u.id}
                              className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
                                <span className="text-[11px] font-semibold text-red-700 truncate">
                                  {u.reason || "Unavailable"}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] text-red-500">
                                {formatDatetime(u.startDatetime)}
                                {u.endDatetime && u.endDatetime !== u.startDatetime
                                  ? ` → ${formatDatetime(u.endDatetime)}`
                                  : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assigned projects */}
                    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col">
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-gray-900">
                          Assigned Projects
                        </p>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="space-y-2">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-emerald-200 hover:bg-white"
                                onClick={() => {
                                  const colors = STATUS_COLORS[project.status];
                                  const fake: FCEvent = {
                                    id: project.id,
                                    title: project.title,
                                    start: project.scheduledStartDatetime
                                      ? project.scheduledStartDatetime.slice(0, 10)
                                      : "",
                                    backgroundColor: colors.bg,
                                    borderColor: colors.border,
                                    textColor: colors.text,
                                    extendedProps: {
                                      type: "project",
                                      status: project.status,
                                      projectCode: project.projectCode,
                                      rawStatus: project.rawStatus,
                                      scheduledStartDatetime: project.scheduledStartDatetime,
                                      scheduledEndDatetime: project.scheduledEndDatetime,
                                    },
                                  };
                                  setSelectedEvent(fake);
                                }}>
                                <div className="text-xs font-semibold text-gray-500">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-1 text-sm font-medium text-gray-800">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                              No assigned projects.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Event detail modal */}
        {selectedEvent && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedEvent(null)}>
            <div
              className="w-[92%] max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div
                className="h-1 w-full rounded-t-2xl"
                style={{ backgroundColor: ACCENT }}
              />

              <div className="px-5 py-4 border-b border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ACCENT }}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-semibold text-gray-900">
                        Schedule Details
                      </p>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-gray-900">
                      {selectedEvent.title}
                    </h3>
                  </div>

                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                    aria-label="Close">
                    ✕
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="grid gap-3">
                  <div className={`rounded-xl border ${BORDER} bg-gray-50 p-3`}>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <CalendarDays className="h-4 w-4" />
                      Date
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-800">
                      {selectedEvent.extendedProps.scheduledStartDatetime
                        ? `${new Date(
                            selectedEvent.extendedProps.scheduledStartDatetime,
                          ).toLocaleString()}${
                            selectedEvent.extendedProps.scheduledEndDatetime
                              ? ` to ${new Date(
                                  selectedEvent.extendedProps.scheduledEndDatetime,
                                ).toLocaleString()}`
                              : ""
                          }`
                        : "—"}
                    </p>
                  </div>

                  <div className={`rounded-xl border ${BORDER} bg-gray-50 p-3`}>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Project Code
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      {selectedEvent.extendedProps.projectCode ?? "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-4 flex justify-end">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
    </StaffPageShell>
  );
}
