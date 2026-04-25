"use client";

import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg } from "@fullcalendar/core";
import { Loader2, CalendarDays, BriefcaseBusiness } from "lucide-react";
import { useRouter } from "next/navigation";

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

function toFCEvent(project: ScheduleProject): FCEvent | null {
  if (!project.scheduledStartDatetime) return null;

  const start = new Date(project.scheduledStartDatetime);
  if (Number.isNaN(start.getTime())) return null;

  const status: EventStatus = project.status;
  const colors = STATUS_COLORS[status];
  const startDateStr = project.scheduledStartDatetime.slice(0, 10);

  const event: any = {
    id: project.id,
    title: project.title,
    start: startDateStr,
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

function renderEventContent(info: EventContentArg) {
  return (
    <div className="flex w-full items-center overflow-hidden px-1.5 py-0.5">
      <span className="truncate text-[11px] font-semibold leading-tight">
        {info.event.title}
      </span>
    </div>
  );
}

export default function AdminSchedule() {
  const router = useRouter();

  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  const [fcEvents, setFcEvents] = useState<FCEvent[]>([]);
  const [currentProject, setCurrentProject] = useState<ScheduleProject | null>(
    null,
  );
  const [selectedEvent, setSelectedEvent] = useState<FCEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        const response = await fetch("/api/schedule/getProjects", {
          method: "GET",
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
        setFcEvents(
          nextProjects
            .map((project) => toFCEvent(project))
            .filter(Boolean) as FCEvent[],
        );
      } catch (error) {
        console.error("Failed to load schedule projects:", error);
        setProjects([]);
        setCurrentProject(null);
        setFcEvents([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    const found = fcEvents.find((e) => e.id === info.event.id);
    if (found) setSelectedEvent(found);
  };

  function getProjectRoute(projectId: string, rawStatus: string) {
    const status = String(rawStatus || "")
      .trim()
      .toLowerCase();

    if (
      status === "main_task_pending" ||
      status === "draft" ||
      status === "pending"
    ) {
      return `/admin/job-creation/main-task-assignment?projectId=${projectId}`;
    }

    if (status === "sub_task_pending") {
      return `/admin/job-creation/sub-task-assignment?projectId=${projectId}`;
    }

    if (status === "materials_pending") {
      return `/admin/job-creation/materials-assignment?projectId=${projectId}`;
    }

    if (status === "equipment_pending") {
      return `/admin/job-creation/equipment-assignment?projectId=${projectId}`;
    }

    if (status === "schedule_pending") {
      return `/admin/job-creation/project-schedule?projectId=${projectId}`;
    }

    if (status === "employee_assignment_pending") {
      return `/admin/job-creation/employee-assignment?projectId=${projectId}`;
    }

    if (status === "cost_estimation_pending") {
      return `/admin/job-creation/cost-estimation?projectId=${projectId}`;
    }

    if (status === "overview_pending") {
      return `/admin/job-creation/overview?projectId=${projectId}`;
    }

    if (status === "quotation_pending") {
      return `/admin/job-creation/quotation-generation?projectId=${projectId}`;
    }

    if (
      status === "ready_to_start" ||
      status === "in_progress" ||
      status === "ongoing" ||
      status === "active"
    ) {
      return `/admin/projects`
    }

    if (status === "completed" || status === "done") {
      return `/admin/report`
    }

    if (status === "cancelled") {
      return `/admin/projects`
    }

    if (status === "cancelled") {
      return `/admin/schedule`;
    }

    return `/admin/job-creation/main-task-assignment?projectId=${projectId}`;
  }

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
      `}</style>

      <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 overflow-hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Schedule</h1>

        <div className="mt-6 min-h-0 h-[calc(100%-3rem)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

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
                          Calendar view of scheduled jobs and activity.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {[
                          { label: "Current", color: "#00c065" },
                          { label: "Behind", color: "#ef4444" },
                          { label: "Done", color: "#9ca3af" },
                          { label: "Pending", color: "#facc15" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-1.5">
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

                  <div className="col-span-12 lg:col-span-3 min-h-0 h-full flex flex-col gap-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
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

                    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col">
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-gray-900">
                          Projects
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
                                  const fake: FCEvent = {
                                    id: project.id,
                                    title: project.title,
                                    start: project.scheduledStartDatetime
                                      ? project.scheduledStartDatetime.slice(
                                          0,
                                          10,
                                        )
                                      : "",
                                    end: project.scheduledEndDatetime
                                      ? (() => {
                                          const d = new Date(
                                            project.scheduledEndDatetime,
                                          );
                                          d.setDate(d.getDate() + 1);
                                          return d.toISOString().slice(0, 10);
                                        })()
                                      : undefined,
                                    backgroundColor:
                                      STATUS_COLORS[project.status].bg,
                                    borderColor:
                                      STATUS_COLORS[project.status].border,
                                    textColor:
                                      STATUS_COLORS[project.status].text,
                                    extendedProps: {
                                      status: project.status,
                                      type: "project",
                                      projectCode: project.projectCode,
                                      rawStatus: project.rawStatus,
                                      scheduledStartDatetime:
                                        project.scheduledStartDatetime,
                                      scheduledEndDatetime:
                                        project.scheduledEndDatetime,
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
                              No projects yet.
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
                        ? `${new Date(selectedEvent.extendedProps.scheduledStartDatetime).toLocaleString()}${
                            selectedEvent.extendedProps.scheduledEndDatetime
                              ? ` to ${new Date(selectedEvent.extendedProps.scheduledEndDatetime).toLocaleString()}`
                              : ""
                          }`
                        : "—"}
                    </p>
                  </div>

                  <div className={`rounded-xl border ${BORDER} bg-gray-50 p-3`}>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Description
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      Project Code:{" "}
                      {selectedEvent.extendedProps.projectCode ?? "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-4 flex justify-end gap-3">
                <button
                  onClick={() => {
                    router.push(
                      getProjectRoute(
                        selectedEvent.id,
                        selectedEvent.extendedProps.rawStatus,
                      ),
                    );
                    setSelectedEvent(null);
                  }}
                  className={`rounded-lg ${BORDER} bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50`}>
                  Go to Project
                </button>

                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT;
                  }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
