"use client"

import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import { CalendarDays, Circle, X } from "lucide-react"

const ACCENT = "#00c065"
const ACCENT_HOVER = "#00a054"

type CalendarBackgroundEvent = {
  title: string
  date: string
  display: "background"
  className: string
}

type ScheduleCalendarModalProps = {
  open: boolean
  selectedDate: string
  availableDateEvents: CalendarBackgroundEvent[]
  onClose: () => void
  onSelectDate: (date: string) => void
}

function formatSelectedDate(date: string) {
  if (!date) return "No date selected"

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return "No date selected"

  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function ScheduleCalendarModal({
  open,
  selectedDate,
  availableDateEvents,
  onClose,
  onSelectDate,
}: ScheduleCalendarModalProps) {
  if (!open) return null

  const availableCount = availableDateEvents.filter(
    (event) => event.className === "fc-available-day"
  ).length

  const unavailableCount = availableDateEvents.filter(
    (event) => event.className === "fc-unavailable-day"
  ).length

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
          margin-bottom: 0.75rem;
          padding: 0.15rem 0;
        }

        .schedule-calendar-modal .fc .fc-toolbar-title {
          font-size: clamp(1rem, 1.8vw, 1.35rem);
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
        }

        .schedule-calendar-modal .fc .fc-button {
          background: #ffffff !important;
          border: 1px solid #d1d5db !important;
          color: #374151 !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06) !important;
          border-radius: 1rem !important;
          height: 44px !important;
          min-width: 44px !important;
          padding: 0 0.9rem !important;
          font-size: 0.82rem !important;
          font-weight: 600 !important;
          transition: all 0.15s ease !important;
        }

        .schedule-calendar-modal .fc .fc-prev-button,
        .schedule-calendar-modal .fc .fc-next-button {
          width: 48px !important;
          padding: 0 !important;
          border-radius: 1rem !important;
        }

        .schedule-calendar-modal .fc .fc-prev-button .fc-icon,
        .schedule-calendar-modal .fc .fc-next-button .fc-icon {
          font-size: 1rem !important;
        }

        .schedule-calendar-modal .fc .fc-toolbar {
          align-items: center !important;
        }

        .schedule-calendar-modal .fc .fc-toolbar-chunk {
          display: flex;
          align-items: center;
        }

        .schedule-calendar-modal .fc .fc-button:hover {
          background: #f9fafb !important;
          border-color: #cbd5e1 !important;
        }

        .schedule-calendar-modal .fc .fc-button:focus {
          box-shadow: none !important;
        }

        .schedule-calendar-modal .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: #ffffff !important;
          border-color: #d1d5db !important;
          color: #374151 !important;
        }

        .schedule-calendar-modal .fc .fc-col-header-cell {
          background: #f9fafb;
          padding: 6px 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #6b7280;
          text-transform: uppercase;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day-number {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          padding: 6px 8px;
          position: relative;
          z-index: 3;
        }

        .schedule-calendar-modal .fc .fc-day-other .fc-daygrid-day-number {
          color: #d1d5db;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day-frame {
          min-height: clamp(42px, 5.2vh, 62px);
          cursor: pointer;
          transition: background 0.15s ease;
          position: relative;
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

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-unavailable-day) .fc-daygrid-day-frame {
          cursor: not-allowed;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-available-day) {
          background: #edf9f1 !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-unavailable-day) {
          background: #faeeee !important;
        }

        .schedule-calendar-modal .fc .fc-daygrid-day:has(.fc-selected-day) {
          background: #dff4e7 !important;
          box-shadow: inset 0 0 0 1px rgba(0, 192, 101, 0.35);
        }

        .schedule-calendar-modal .fc .fc-scrollgrid,
        .schedule-calendar-modal .fc .fc-scrollgrid table {
          border-radius: 0.4rem;
          overflow: hidden;
        }

        .schedule-calendar-modal .fc .fc-view-harness {
          background: #fff;
          border-radius: 0.4rem;
        }

        .schedule-calendar-modal .fc .fc-daygrid-body-unbalanced .fc-daygrid-day-events {
          min-height: 0 !important;
        }

        @media (max-width: 1024px) {
          .schedule-calendar-modal .fc .fc-toolbar.fc-header-toolbar {
            gap: 0.4rem;
          }

          .schedule-calendar-modal .fc .fc-toolbar-title {
            text-align: center;
          }
        }

        @media (max-width: 640px) {
          .schedule-calendar-modal .fc .fc-daygrid-day-frame {
            min-height: 38px;
          }

          .schedule-calendar-modal .fc .fc-daygrid-day-number {
            font-size: 11px;
            padding: 5px 6px;
          }

          .schedule-calendar-modal .fc .fc-col-header-cell {
            font-size: 9px;
            padding: 5px 0;
          }

          .schedule-calendar-modal .fc .fc-button {
            height: 40px !important;
            min-width: 40px !important;
            padding: 0 0.7rem !important;
            font-size: 0.72rem !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="schedule-calendar-modal flex h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-gray-900">
                    Select Scheduled Start Date
                  </p>
                </div>
                <p className="mt-1.5 text-sm text-gray-500">
                  Choose an available project date based on the current schedule.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-h-0 border-b border-gray-200 p-3 lg:border-b-0 lg:border-r">
              <div className="h-full overflow-hidden">
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  height="100%"
                  contentHeight="100%"
                  expandRows={true}
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
                    const clickedDate = info.dateStr

                    const dayEvents = availableDateEvents.filter(
                      (event) => event.date === clickedDate
                    )

                    const isUnavailable = dayEvents.some(
                      (event) => event.className === "fc-unavailable-day"
                    )

                    const isAvailable = dayEvents.some(
                      (event) => event.className === "fc-available-day"
                    )

                    if (isUnavailable || !isAvailable) return

                    onSelectDate(clickedDate)
                  }}
                />
              </div>
            </div>

            <div className="min-h-0 overflow-hidden bg-gray-50/60 p-3">
              <div className="grid h-full grid-rows-[auto_auto_auto_1fr_auto] gap-0">
                <div className="pb-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <CalendarDays className="h-4 w-4" />
                    Selected Date
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {formatSelectedDate(selectedDate)}
                  </p>
                </div>

                <div className="border-t border-gray-200 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Legend
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <Circle className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
                      <span className="text-sm text-gray-700">Available</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Circle className="h-3.5 w-3.5 fill-red-400 text-red-400" />
                      <span className="text-sm text-gray-700">Unavailable</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Circle className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                      <span className="text-sm text-gray-700">Selected</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Summary
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="py-1">
                      <div className="text-[11px] font-medium text-gray-500">
                        Available
                      </div>
                      <div className="mt-1 text-base font-bold text-gray-900">
                        {availableCount}
                      </div>
                    </div>

                    <div className="py-1">
                      <div className="text-[11px] font-medium text-gray-500">
                        Unavailable
                      </div>
                      <div className="mt-1 text-base font-bold text-gray-900">
                        {unavailableCount}
                      </div>
                    </div>
                  </div>
                </div>

                <div />

                <div className="flex justify-end border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200"
                    style={{ backgroundColor: ACCENT }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = ACCENT_HOVER
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = ACCENT
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
