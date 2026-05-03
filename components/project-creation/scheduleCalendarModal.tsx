"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { CalendarDays, Circle, X } from "lucide-react";

type CalendarBackgroundEvent = {
  title: string;
  date: string;
  display: "background";
  className: string;
};

type ScheduleCalendarModalProps = {
  open: boolean;
  selectedDate: string;
  availableDateEvents: CalendarBackgroundEvent[];
  onClose: () => void;
  onSelectDate: (date: string) => void;
};

function formatSelectedDate(date: string) {
  if (!date) return "No date selected";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "No date selected";

  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ScheduleCalendarModal({
  open,
  selectedDate,
  availableDateEvents,
  onClose,
  onSelectDate,
}: ScheduleCalendarModalProps) {
  if (!open) return null;

  const availableCount = availableDateEvents.filter(
    (event) => event.className === "fc-available-day",
  ).length;

  const unavailableCount = availableDateEvents.filter(
    (event) => event.className === "fc-unavailable-day",
  ).length;

  const holidayCount = availableDateEvents.filter(
    (event) => event.className === "fc-holiday-day",
  ).length;

  return (
    <>
      <style>{`
        .schedule-calendar-modal .fc {
          --fc-border-color: #e5e7eb;
          --fc-today-bg-color: #ecfdf5;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f9fafb;
          font-family: inherit;
          height: 100%;
        }

        .schedule-calendar-modal .fc .fc-toolbar.fc-header-toolbar {
          margin-bottom: 0.55rem;
          padding: 0;
        }

        .schedule-calendar-modal .fc .fc-toolbar-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.01em;
        }

        .schedule-calendar-modal .fc .fc-button {
          height: 34px !important;
          min-width: 34px !important;
          border-radius: 0.5rem !important;
          border: 1px solid #e5e7eb !important;
          background: #ffffff !important;
          color: #374151 !important;
          box-shadow: none !important;
          padding: 0 0.65rem !important;
          font-size: 0.72rem !important;
          font-weight: 600 !important;
          transition: all 0.15s ease !important;
        }

        .schedule-calendar-modal .fc .fc-prev-button,
        .schedule-calendar-modal .fc .fc-next-button {
          width: 34px !important;
          padding: 0 !important;
        }

        .schedule-calendar-modal .fc .fc-prev-button .fc-icon,
        .schedule-calendar-modal .fc .fc-next-button .fc-icon {
          font-size: 0.88rem !important;
        }

        .schedule-calendar-modal .fc .fc-button:hover {
          background: #f9fafb !important;
          border-color: #d1d5db !important;
        }

        .schedule-calendar-modal .fc .fc-button:focus {
          box-shadow: 0 0 0 2px rgba(0, 192, 101, 0.12) !important;
        }

        .schedule-calendar-modal .fc .fc-col-header-cell {
          background: #f9fafb;
          padding: 5px 0;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #6b7280;
          text-transform: uppercase;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day-number {
          position: relative;
          z-index: 3;
          padding: 5px 7px;
          font-size: 11px;
          font-weight: 600;
          color: #374151;
        }

        .schedule-calendar-modal .fc .fc-day-other .fc-daygrid-day-number {
          color: #cbd5e1;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day-frame {
          min-height: clamp(38px, 5vh, 56px);
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day.fc-day-today {
          background-color: #ecfdf5 !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:hover {
          background: #fafafa;
        }

        .schedule-calendar-modal .fc .fc-bg-event {
          display: none !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-unavailable-day) .fc-daygrid-day-frame,
        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-holiday-day) .fc-daygrid-day-frame {
          cursor: not-allowed;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-available-day) {
          background: #f0fdf4 !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-unavailable-day) {
          background: #fef2f2 !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-holiday-day) {
          background: #fef9c3 !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-selected-day) {
          background: #dcfce7 !important;
          box-shadow: inset 0 0 0 1px rgba(0, 192, 101, 0.45);
        }

        .schedule-calendar-modal .fc .fc-scrollgrid,
        .schedule-calendar-modal .fc .fc-scrollgrid table {
          border-radius: 0.5rem;
          overflow: hidden;
        }

        .schedule-calendar-modal .fc .fc-view-harness {
          background: #ffffff;
          border-radius: 0.5rem;
        }

        .schedule-calendar-modal .fc .fc-daygrid-body-unbalanced .fc-daygrid-day-events {
          min-height: 0 !important;
        }

        @media (max-width: 640px) {
          .schedule-calendar-modal .fc .fc-toolbar-title {
            font-size: 0.8rem;
          }

          .schedule-calendar-modal .fc .fc-daygrid-day-frame {
            min-height: 34px;
          }

          .schedule-calendar-modal .fc .fc-daygrid-day-number {
            font-size: 10px;
            padding: 4px 5px;
          }

          .schedule-calendar-modal .fc .fc-col-header-cell {
            font-size: 8px;
            padding: 4px 0;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
        onClick={onClose}
      >
        <div
          className="schedule-calendar-modal flex h-[88vh] w-full max-w-[980px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0 bg-[#00c065]" />

          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-[#00c065]">
                    <CalendarDays className="h-4 w-4" />
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      Select Scheduled Start Date
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Choose an available date based on the current schedule.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-h-0 border-b border-gray-200 p-3 lg:border-b-0 lg:border-r">
              <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white p-2">
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  height="100%"
                  contentHeight="100%"
                  expandRows
                  fixedWeekCount={false}
                  headerToolbar={{
                    left: "prev",
                    center: "title",
                    right: "next",
                  }}
                  events={[
                    ...availableDateEvents,
                    ...(selectedDate
                      ? [
                          {
                            title: "Selected",
                            date: selectedDate,
                            display: "background" as const,
                            className: "fc-selected-day",
                          },
                        ]
                      : []),
                  ]}
                  dateClick={(info) => {
                    const clickedDate = info.dateStr;

                    const dayEvents = availableDateEvents.filter(
                      (event) => event.date === clickedDate,
                    );

                    const isUnavailable = dayEvents.some(
                      (event) => event.className === "fc-unavailable-day",
                    );

                    const isHoliday = dayEvents.some(
                      (event) => event.className === "fc-holiday-day",
                    );

                    const isAvailable = dayEvents.some(
                      (event) => event.className === "fc-available-day",
                    );

                    if (isUnavailable || isHoliday || !isAvailable) return;

                    onSelectDate(clickedDate);
                  }}
                />
              </div>
            </div>

            <aside className="flex min-h-0 flex-col bg-gray-50 p-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Selected Date
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-900">
                  {formatSelectedDate(selectedDate)}
                </p>
              </div>

              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Legend
                </p>

                <div className="mt-3 space-y-2">
                  <LegendItem
                    colorClass="fill-emerald-400 text-emerald-400"
                    label="Available"
                  />
                  <LegendItem
                    colorClass="fill-rose-400 text-rose-400"
                    label="Unavailable"
                  />
                  {holidayCount > 0 ? (
                    <LegendItem
                      colorClass="fill-amber-400 text-amber-400"
                      label="Holiday"
                    />
                  ) : null}
                  <LegendItem
                    colorClass="fill-emerald-600 text-emerald-600"
                    label="Selected"
                  />
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Summary
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-green-100 bg-green-50 p-2">
                    <p className="text-[10px] font-medium text-green-700">
                      Available
                    </p>
                    <p className="mt-0.5 text-lg font-semibold text-green-800">
                      {availableCount}
                    </p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-rose-50 p-2">
                    <p className="text-[10px] font-medium text-rose-700">
                      Unavailable
                    </p>
                    <p className="mt-0.5 text-lg font-semibold text-rose-800">
                      {unavailableCount}
                    </p>
                  </div>

                  {holidayCount > 0 ? (
                    <div className="col-span-2 rounded-lg border border-amber-100 bg-amber-50 p-2">
                      <p className="text-[10px] font-medium text-amber-700">
                        Holidays
                      </p>
                      <p className="mt-0.5 text-lg font-semibold text-amber-800">
                        {holidayCount}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1" />

              <button
                type="button"
                onClick={onClose}
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white shadow-sm transition hover:bg-[#00a054]"
              >
                Done
              </button>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

function LegendItem({
  colorClass,
  label,
}: {
  colorClass: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Circle className={`h-3 w-3 ${colorClass}`} />
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </div>
  );
}
