"use client"

import React, { useEffect, useState } from "react"
import {
  listScheduleEvents,
  listUpcomingJobs,
  getCurrentJob,
  type ScheduleEvent,
  type UpcomingJob,
  type CurrentJob,
} from "@/lib/data/schedule.repo"

// ---------------------------------------------------------------------------
// Helper: generate calendar grid days
// ---------------------------------------------------------------------------

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  let startDayOfWeek = firstDay.getDay() - 1
  if (startDayOfWeek === -1) startDayOfWeek = 6

  const days: { day: number; currentMonth: boolean }[] = []

  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, currentMonth: false })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true })
  }
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, currentMonth: false })
  }
  return days
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Schedule() {
  const [selectedJob, setSelectedJob] = useState<(UpcomingJob & { day?: number }) | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())

  const [events, setEvents]       = useState<ScheduleEvent[]>([])
  const [upcomingJobs, setUpcomingJobs] = useState<UpcomingJob[]>([])
  const [currentJob, setCurrentJob] = useState<CurrentJob | null>(null)

  useEffect(() => {
    listScheduleEvents().then(setEvents)
    listUpcomingJobs().then(setUpcomingJobs)
    getCurrentJob().then(setCurrentJob)
  }, [])

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const calendarDays = getCalendarDays(year, month)

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  function getEventForDay(day: number, isCurrentMonth: boolean): ScheduleEvent | null {
    if (!isCurrentMonth) return null
    return (
      events.find((e) => {
        const d = new Date(e.dateISO)
        return (
          d.getDate()     === day   &&
          d.getMonth()    === month &&
          d.getFullYear() === year
        )
      }) ?? null
    )
  }

  return (
    <div className="flex flex-col h-full relative p-6">
      {/* ── Event detail modal ─────────────────────────────── */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="rounded-xl shadow-2xl p-6 w-[90%] max-w-md"
            style={{ background: "var(--cp-surface)", border: "1px solid var(--cp-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold" style={{ color: "var(--cp-text)" }}>
                {selectedJob.title}
              </h3>
              <button
                onClick={() => setSelectedJob(null)}
                style={{ color: "var(--cp-text-faint)" }}
                className="transition-colors hover:opacity-70"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase" style={{ color: "var(--cp-text-muted)" }}>Date</label>
                <p className="font-medium" style={{ color: "var(--cp-text)" }}>
                  {selectedJob.dateLabel ||
                    `${MONTH_NAMES[month]} ${selectedJob.day ?? ""}, ${year}`}
                </p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase" style={{ color: "var(--cp-text-muted)" }}>Description</label>
                <p style={{ color: "var(--cp-text-muted)" }}>{selectedJob.description || "No description available."}</p>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 rounded-lg font-medium text-white transition-colors"
                  style={{ background: "var(--cp-brand)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cp-brand-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--cp-brand)")}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6" style={{ color: "var(--cp-text)" }}>
        Schedule
      </h1>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 h-full">
        {/* ── Calendar ──────────────────────────────────────── */}
        <div
          className="flex-1 rounded-xl shadow-sm p-3 sm:p-6"
          style={{ background: "var(--cp-surface)", border: "1px solid var(--cp-border)" }}
        >
          {/* Month header */}
          <div className="flex justify-between items-center mb-4 sm:mb-8 px-1">
            <button
              onClick={prevMonth}
              className="p-2 rounded-full transition-colors"
              style={{ color: "var(--cp-text-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cp-brand-light)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 className="text-lg sm:text-2xl font-bold" style={{ color: "var(--cp-brand)" }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 rounded-full transition-colors"
              style={{ color: "var(--cp-text-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cp-brand-light)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Calendar grid */}
          <div className="w-full">
            <div className="grid grid-cols-7 mb-2 sm:mb-4">
              {[
                { short: "M", long: "MON" },
                { short: "T", long: "TUE" },
                { short: "W", long: "WED" },
                { short: "T", long: "THU" },
                { short: "F", long: "FRI" },
                { short: "S", long: "SAT" },
                { short: "S", long: "SUN" },
              ].map((d, i) => (
                <div
                  key={i}
                  className="text-[10px] sm:text-sm font-medium uppercase p-1 sm:p-2 text-center"
                  style={{ color: "var(--cp-text-faint)", borderBottom: "1px solid var(--cp-border)" }}
                >
                  <span className="sm:hidden">{d.short}</span>
                  <span className="hidden sm:inline">{d.long}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
              {calendarDays.map((dateObj, idx) => {
                const event   = getEventForDay(dateObj.day, dateObj.currentMonth)
                const isEvent = !!event
                return (
                  <div
                    key={idx}
                    onClick={() =>
                      event &&
                      setSelectedJob({
                        id:          event.id,
                        dateLabel:   "",
                        title:       event.title,
                        description: "",
                        day:         dateObj.day,
                      })
                    }
                    className="min-h-11 sm:min-h-20 md:min-h-[100px] p-1 sm:p-2 relative cursor-pointer transition-colors"
                    style={{
                      border: "1px solid var(--cp-border)",
                      background: isEvent
                        ? "var(--cp-brand)"
                        : !dateObj.currentMonth
                          ? "var(--cp-brand-light)"
                          : "transparent",
                      color: isEvent
                        ? "#ffffff"
                        : !dateObj.currentMonth
                          ? "var(--cp-text-faint)"
                          : "var(--cp-text)",
                    }}
                  >
                    <span className="font-semibold text-xs sm:text-sm">{dateObj.day}</span>
                    {isEvent && (
                      <div className="hidden sm:block mt-4 sm:mt-8 text-xs font-medium rounded px-1 py-0.5 truncate bg-white/20 backdrop-blur-sm">
                        {event.title}...
                      </div>
                    )}
                    {isEvent && (
                      <div className="sm:hidden mt-1 w-full h-1 rounded-full bg-white/60" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Sidebar ───────────────────────────────────────── */}
        <div className="w-full lg:w-80 flex flex-col gap-4 sm:gap-6">
          {/* Status card */}
          <div
            className="rounded-xl shadow-sm p-6"
            style={{ background: "var(--cp-surface)", border: "1px solid var(--cp-border)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--cp-brand)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--cp-text-2)" }}>
                Status: {currentJob?.status ?? "—"}
              </span>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ border: "1px solid var(--cp-border-2)" }}
            >
              <div className="text-xl font-bold mb-1" style={{ color: "var(--cp-text)" }}>
                {currentJob?.id ?? "—"}
              </div>
              <div className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
                {currentJob?.name ?? "—"}
              </div>
            </div>
          </div>

          {/* Jobs list */}
          <div
            className="rounded-xl shadow-sm p-6 flex-1"
            style={{ background: "var(--cp-surface)", border: "1px solid var(--cp-border)" }}
          >
            <div className="flex items-center gap-2 mb-6">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--cp-text)" }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <h3 className="font-bold" style={{ color: "var(--cp-text)" }}>Jobs</h3>
            </div>
            <div className="space-y-4">
              {upcomingJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg p-3 cursor-pointer transition-colors"
                  style={{ border: "1px solid var(--cp-border)" }}
                  onClick={() => setSelectedJob(job)}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--cp-brand)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--cp-border)")}
                >
                  <div className="text-sm font-bold mb-1" style={{ color: "var(--cp-text)" }}>
                    {job.dateLabel}
                  </div>
                  <div className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
                    {job.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
