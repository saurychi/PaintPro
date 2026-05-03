"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
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
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import UnavailableDayModal, {
  type UnavailableDayFormValue,
} from "@/components/schedule/UnavailableDayModal";
import type { ScheduleUnavailableDay } from "@/lib/schedule/unavailableDayTypes";
import { useHolidaySettings } from "@/lib/settings/useHolidaySettings";

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

  const event: FCEvent = {
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

function toUnavailableModalValue(
  day?: Partial<ScheduleUnavailableDay> | null,
  dateOverride?: string | null,
): UnavailableDayFormValue {
  const resolvedDate = dateOverride ?? day?.blockedDate ?? "";
  return {
    blockedDate: resolvedDate,
    startDate: resolvedDate,
    endDate: resolvedDate,
    reason: day?.reason ?? "",
    blockType:
      day?.blockType && day.blockType !== "holiday"
        ? day.blockType
        : "manual_block",
    notes: day?.notes ?? "",
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
  const [unavailableLoading, setUnavailableLoading] = useState(true);
  const [savingUnavailableDay, setSavingUnavailableDay] = useState(false);
  const [deletingUnavailableDayId, setDeletingUnavailableDayId] = useState<
    string | null
  >(null);
  const [isUnavailableModalOpen, setIsUnavailableModalOpen] = useState(false);
  const [editingUnavailableDay, setEditingUnavailableDay] =
    useState<ScheduleUnavailableDay | null>(null);
  const [modalDateOverride, setModalDateOverride] = useState<string | null>(
    null,
  );
  const [calendarContextMenu, setCalendarContextMenu] = useState<{
    date: string;
    x: number;
    y: number;
  } | null>(null);

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
          nextProjects.map((project) => toFCEvent(project)).filter(isFCEvent),
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

  useEffect(() => {
    let cancelled = false;

    async function loadUnavailableDays() {
      try {
        setUnavailableLoading(true);

        const response = await fetch("/api/schedule/unavailable-days", {
          method: "GET",
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load unavailable days.");
        }

        if (cancelled) return;
        setUnavailableDays(
          Array.isArray(data?.unavailableDays) ? data.unavailableDays : [],
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load unavailable days:", error);
        setUnavailableDays([]);
      } finally {
        if (!cancelled) setUnavailableLoading(false);
      }
    }

    loadUnavailableDays();

    return () => {
      cancelled = true;
    };
  }, [holidaySettings.enabled, holidaySettings.countryCode]);

  const unavailableDayEvents = useMemo<EventInput[]>(() => {
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
          classNames: ["fc-admin-holiday-event"],
          extendedProps: {
            type: "holiday",
            unavailableDayId: day.id,
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
        classNames: ["fc-admin-unavailable-event"],
        extendedProps: {
          type: "unavailable-day",
          unavailableDayId: day.id,
        },
      };
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
      if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()))
        continue;

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
  const upcomingUnavailableDays = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return unavailableDays
      .filter((day) => day.blockedDate >= today)
      .slice(0, 8);
  }, [unavailableDays]);

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

  async function refreshUnavailableDays() {
    const response = await fetch("/api/schedule/unavailable-days", {
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
  }

  async function handleSaveUnavailableDay(value: UnavailableDayFormValue) {
    setSavingUnavailableDay(true);

    try {
      const response = await fetch("/api/schedule/unavailable-days", {
        method: editingUnavailableDay ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unavailableDayId: editingUnavailableDay?.id,
          blockedDate: value.blockedDate,
          startDate: value.startDate,
          endDate: value.endDate,
          reason: value.reason,
          blockType: value.blockType,
          notes: value.notes,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Failed to ${editingUnavailableDay ? "update" : "create"} unavailable day.`,
        );
      }

      await refreshUnavailableDays();
      setIsUnavailableModalOpen(false);
      setEditingUnavailableDay(null);
      setModalDateOverride(null);
      toast.success(
        editingUnavailableDay
          ? "Unavailable day updated."
          : `${Math.max(1, Number(data?.createdCount ?? 1))} unavailable day${
              Number(data?.createdCount ?? 1) === 1 ? "" : "s"
            } created.`,
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

  async function handleDeleteUnavailableDay(day: ScheduleUnavailableDay) {
    const confirmed = window.confirm(
      `Delete unavailable day on ${formatLongDate(day.blockedDate)}?`,
    );
    if (!confirmed) return;

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

      await refreshUnavailableDays();
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
      status === "review_pending" ||
      status === "invoice_pending" ||
      status === "payment_pending" ||
      status === "employee_management_pending" ||
      status === "conclude_job_pending" ||
      status === "ongoing" ||
      status === "active"
    ) {
      return `/admin/projects`;
    }

    if (status === "completed" || status === "done") {
      return `/admin/report`;
    }

    if (status === "cancelled") {
      return `/admin/projects`;
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

        .fc .fc-event.fc-admin-holiday-event {
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

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="flex flex-wrap items-center gap-3">
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
                              <span className="text-[11px] font-medium text-gray-600">
                                {item.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => openCreateUnavailableDay()}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-semibold text-white transition hover:bg-[#00a054] active:scale-[0.99]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Unavailable day
                        </button>
                      </div>
                    </div>

                    <div
                      className={`min-h-0 flex-1 overflow-hidden rounded-2xl border ${BORDER} bg-gray-50 p-2.5`}
                    >
                      <div className="h-full min-h-0">
                        <FullCalendar
                          plugins={[dayGridPlugin, interactionPlugin]}
                          initialView="dayGridMonth"
                          initialDate={new Date()}
                          events={[...fcEvents, ...unavailableDayEvents]}
                          dayCellDidMount={handleCalendarDayMount}
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

                  <div className="col-span-12 lg:col-span-3 min-h-0 h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col">
                    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                      <section className="shrink-0 pb-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: ACCENT }}
                            aria-hidden="true"
                          />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                            Status
                          </p>
                        </div>

                        <div className="pl-3">
                          <div className="flex items-center gap-2 text-[12px] font-medium text-gray-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="truncate">
                              {currentProject?.status ?? "No active project"}
                            </span>
                          </div>

                          <div className="mt-2 min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {currentProject?.projectCode ?? "—"}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-gray-600">
                              {currentProject?.title ?? "No project selected"}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="shrink-0 border-t border-gray-200 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: ACCENT }}
                              aria-hidden="true"
                            />
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              Unavailable Days
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => openCreateUnavailableDay()}
                            className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 transition hover:bg-gray-50"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </button>
                        </div>

                        <div className="max-h-[210px] divide-y divide-gray-200 overflow-y-auto pr-1">
                          {unavailableLoading ? (
                            <div className="flex items-center justify-center py-4 text-[12px] text-gray-500">
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              Loading blocked days...
                            </div>
                          ) : upcomingUnavailableDays.length > 0 ? (
                            upcomingUnavailableDays.map((day) => (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => setSelectedDate(day.blockedDate)}
                                className="w-full px-0 py-2 text-left transition hover:bg-gray-50"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-gray-500">
                                      {formatShortDate(day.blockedDate)}
                                    </p>
                                    <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-gray-900">
                                      {day.reason}
                                    </p>
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
                            <div className="py-4 text-center text-[12px] text-gray-500">
                              No blocked days yet.
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="flex min-h-0 flex-1 flex-col border-t border-gray-200 pt-3">
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: ACCENT }}
                              aria-hidden="true"
                            />
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              Projects
                            </p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            {projects.length}
                          </span>
                        </div>

                        <div className="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto pr-1">
                          {projects.length ? (
                            projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="w-full px-0 py-2 text-left transition hover:bg-gray-50"
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
                                <div className="text-[11px] font-semibold text-gray-500">
                                  {project.dateLabel}
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-gray-800">
                                  {project.title}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="py-5 text-center text-[12px] text-gray-500">
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
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-[92%] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
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
                        Day Details
                      </p>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-gray-900">
                      {formatLongDate(selectedDate)}
                    </h3>
                  </div>

                  <button
                    onClick={() => setSelectedDate(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                    aria-label="Close"
                  >
                    ✕
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
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                router.push(
                                  getProjectRoute(
                                    project.id,
                                    project.rawStatus,
                                  ),
                                );
                                setSelectedDate(null);
                              }}
                              className={`flex items-center justify-between gap-3 rounded-xl border ${BORDER} bg-white px-3 py-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: colors.bg }}
                                  />
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {project.title}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {project.projectCode ?? "—"} ·{" "}
                                  {project.dateLabel}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-emerald-700 shrink-0">
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
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <CalendarDays className="h-4 w-4" />
                        Unavailable Days
                      </div>

                      <button
                        type="button"
                        onClick={() => openCreateUnavailableDay(selectedDate)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>

                    <div className="grid gap-2">
                      {selectedDayUnavailableDays.length === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed ${BORDER} bg-gray-50 px-3 py-4 text-center text-sm text-gray-500`}
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

                              {day.isEditable ? (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditUnavailableDay(day)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50"
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
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                                <span className="shrink-0 text-[11px] font-medium text-amber-800">
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

              <div className="border-t border-gray-200 px-5 py-4 flex justify-end">
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
              className="absolute min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl"
              style={{
                left: calendarContextMenu.x,
                top: calendarContextMenu.y,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {formatLongDate(calendarContextMenu.date)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openCreateUnavailableDay(calendarContextMenu.date)}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50"
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
    </>
  );
}
