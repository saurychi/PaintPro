"use client"

import React, { useEffect, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventContentArg } from "@fullcalendar/core"
import {
  listScheduleEvents,
  listUpcomingJobs,
  getCurrentJob,
  type ScheduleEvent,
  type UpcomingJob,
  type CurrentJob,
} from "@/lib/data/schedule.repo"

// ---------------------------------------------------------------------------
// Local types for FullCalendar
// ---------------------------------------------------------------------------

type EventStatus = "current" | "behind" | "done" | "pending"

type FCEvent = {
  id: string
  title: string
  date: string
  backgroundColor: string
  borderColor: string
  textColor: string
  extendedProps: {
    status: EventStatus
    type: ScheduleEvent["type"]
  }
}

// ---------------------------------------------------------------------------
// Status → color mapping
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<EventStatus, { bg: string; border: string; text: string }> = {
  current: { bg: "#00c065", border: "#00a054", text: "#ffffff" },
  behind:  { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  done:    { bg: "#9ca3af", border: "#6b7280", text: "#ffffff" },
  pending: { bg: "#facc15", border: "#eab308", text: "#1f2937" },
}

// ---------------------------------------------------------------------------
// Helper: convert ScheduleEvent → FullCalendar event object
// ---------------------------------------------------------------------------

function toFCEvent(e: ScheduleEvent): FCEvent {
  // All events from the repo are "pending" by default until the DB has status
  const status: EventStatus = "pending"
  const colors = STATUS_COLORS[status]
  // dateISO is already "YYYY-MM-DDTHH:mm:ss.sssZ" — FullCalendar accepts this
  const dateStr = e.dateISO.slice(0, 10)
  return {
    id: e.id,
    title: e.title,
    date: dateStr,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    extendedProps: { status, type: e.type },
  }
}

function renderEventContent(info: EventContentArg) {
  return (
    <div className="flex items-center w-full px-1.5 py-0.5 overflow-hidden">
      <span className="text-[11px] font-semibold truncate leading-tight">{info.event.title}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSchedule() {
  // State — loaded from schedule.repo.ts (dummy data for now)
  const [fcEvents, setFcEvents]       = useState<FCEvent[]>([])
  const [upcomingJobs, setUpcomingJobs] = useState<UpcomingJob[]>([])
  const [currentJob, setCurrentJob]   = useState<CurrentJob | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<FCEvent | null>(null)

  useEffect(() => {
    // Load all schedule data from the repo (later: real Supabase queries)
    listScheduleEvents().then((events) => setFcEvents(events.map(toFCEvent)))
    listUpcomingJobs().then(setUpcomingJobs)
    getCurrentJob().then(setCurrentJob)
  }, [])

  const handleEventClick = (info: EventClickArg) => {
    const found = fcEvents.find((e) => e.id === info.event.id)
    if (found) setSelectedEvent(found)
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
          font-size: 1.1rem;
          font-weight: 600;
          color: #00c065;
        }
        .fc .fc-button {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #374151 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
          border-radius: 0.5rem !important;
          padding: 0.4rem 0.65rem !important;
          font-size: 0.8rem !important;
          font-weight: 500 !important;
          transition: background 0.15s !important;
        }
        .fc .fc-button:hover { background: #f9fafb !important; }
        .fc .fc-button:focus { box-shadow: none !important; }
        .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: #00c065 !important;
          border-color: #00a054 !important;
          color: #fff !important;
        }
        .fc .fc-col-header-cell {
          padding: 6px 0;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #9ca3af;
          text-transform: uppercase;
          border-color: #f3f4f6;
        }
        .fc .fc-daygrid-day-number {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          padding: 4px 6px;
        }
        .fc .fc-day-other .fc-daygrid-day-number { color: #d1d5db; }
        .fc .fc-daygrid-day.fc-day-today { background-color: #f0fdf4 !important; }
        .fc .fc-event { border-radius: 5px !important; cursor: pointer; }
        .fc .fc-event:hover { filter: brightness(0.92); }
        .fc .fc-daygrid-event-harness { margin-top: 2px; }
        .fc .fc-toolbar.fc-header-toolbar { margin-bottom: 12px; }
      `}</style>

      <main className="min-h-screen bg-white">
        <div className="p-4 sm:p-6 flex flex-col">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Schedule</h1>

          <div className="mt-4 sm:mt-6 flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* FullCalendar Card */}
            <section className="rounded-lg border border-gray-200 bg-white shadow-sm p-3 sm:p-4 flex flex-col" style={{ minHeight: '420px' }}>
              {/* Legend */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {[
                  { label: "Current", color: "#00c065" },
                  { label: "Behind",  color: "#ef4444" },
                  { label: "Done",    color: "#9ca3af" },
                  { label: "Pending", color: "#facc15" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded" style={{ backgroundColor: l.color }} />
                    <span className="text-[11px] text-gray-600">{l.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-hidden" style={{ minHeight: '360px' }}>
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  initialDate="2025-06-01"
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
                  dayMaxEvents={2}
                />
              </div>
            </section>

            {/* Right Panel */}
            <aside className="w-full lg:w-80 flex flex-col sm:flex-row lg:flex-col gap-4">
              {/* Status Card */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00c065]" />
                  <span className="text-sm font-medium text-gray-700">
                    Status: {currentJob?.status ?? "—"}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <div className="text-lg font-bold text-gray-900 mb-1">{currentJob?.id ?? "—"}</div>
                  <div className="text-sm font-medium text-gray-600">{currentJob?.name ?? "—"}</div>
                </div>
              </div>

              {/* Jobs List */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 flex-1 flex flex-col overflow-hidden">
                <div className="mb-3 shrink-0">
                  <h3 className="text-sm font-semibold text-gray-900">Jobs</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                  {upcomingJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 hover:border-[#00c065]"
                      onClick={() => {
                        const fake: FCEvent = {
                          id: job.id,
                          title: job.title,
                          date: "",
                          backgroundColor: STATUS_COLORS.pending.bg,
                          borderColor: STATUS_COLORS.pending.border,
                          textColor: STATUS_COLORS.pending.text,
                          extendedProps: { status: "pending", type: "secondary" },
                        }
                        setSelectedEvent(fake)
                      }}
                    >
                      <div className="text-xs font-semibold text-gray-500 mb-1">{job.dateLabel}</div>
                      <div className="text-xs font-medium text-gray-700">{job.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Modal */}
        {selectedEvent && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="bg-white rounded-lg shadow-2xl p-6 w-[90%] max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">{selectedEvent.title}</h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Date</label>
                  <p className="text-gray-800 font-medium">
                    {selectedEvent.date
                      ? new Date(selectedEvent.date).toDateString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Description</label>
                  <p className="text-gray-600">This is a placeholder description for the selected event.</p>
                </div>
                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="rounded-lg bg-[#00c065] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}