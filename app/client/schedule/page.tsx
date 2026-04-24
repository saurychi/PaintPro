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

  // State — loaded from schedule.repo.ts (dummy data for now)
  const [events, setEvents]       = useState<ScheduleEvent[]>([])
  const [upcomingJobs, setUpcomingJobs] = useState<UpcomingJob[]>([])
  const [currentJob, setCurrentJob] = useState<CurrentJob | null>(null)

  useEffect(() => {
    // Load all schedule data from the repo (later: real Supabase queries)
    listScheduleEvents().then(setEvents)
    listUpcomingJobs().then(setUpcomingJobs)
    getCurrentJob().then(setCurrentJob)
  }, [])

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const calendarDays = getCalendarDays(year, month)

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  /** Returns the first event that falls on the given calendar day */
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
    <div className="flex flex-col h-full relative">
      {/* ── Event detail modal ─────────────────────────────── */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-[90%] max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-[#1a1a4b]">{selectedJob.title}</h3>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                <p className="text-gray-800 font-medium">
                  {selectedJob.dateLabel ||
                    `${MONTH_NAMES[month]} ${selectedJob.day ?? ""}, ${year}`}
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                <p className="text-gray-600">{selectedJob.description || "No description available."}</p>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="bg-[#00c065] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#00a054] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1a4b] mb-4 sm:mb-6">Schedule</h1>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 h-full">
        {/* ── Calendar ──────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-6">
          {/* Month header */}
          <div className="flex justify-between items-center mb-4 sm:mb-8 px-1">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 className="text-lg sm:text-2xl font-bold text-[#00c065]">{MONTH_NAMES[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
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
                <div key={i} className="text-gray-400 text-[10px] sm:text-sm font-medium uppercase p-1 sm:p-2 border-b border-gray-100 text-center">
                  <span className="sm:hidden">{d.short}</span>
                  <span className="hidden sm:inline">{d.long}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
              {calendarDays.map((dateObj, idx) => {
                const event   = getEventForDay(dateObj.day, dateObj.currentMonth)
                const isGreen = !!event
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
                    className={`
                      min-h-[44px] sm:min-h-[80px] md:min-h-[100px] border border-gray-100 p-1 sm:p-2 relative cursor-pointer hover:bg-gray-50 transition-colors
                      ${!dateObj.currentMonth ? "bg-gray-50/50 text-gray-300" : "text-gray-800"}
                      ${isGreen ? "bg-[#00c065] text-white border-[#00c065] hover:bg-[#00a054]" : ""}
                    `}
                  >
                    <span className="font-semibold text-xs sm:text-sm">{dateObj.day}</span>
                    {isGreen && (
                      <div className="hidden sm:block mt-4 sm:mt-8 text-xs font-medium bg-white/20 backdrop-blur-sm rounded px-1 py-0.5 truncate">
                        {event.title}...
                      </div>
                    )}
                    {isGreen && (
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#00c065]" />
              <span className="text-sm font-medium text-gray-700">Status: {currentJob?.status ?? "—"}</span>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xl font-bold text-gray-900 mb-1">{currentJob?.id ?? "—"}</div>
              <div className="text-sm text-gray-600">{currentJob?.name ?? "—"}</div>
            </div>
          </div>

          {/* Jobs list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1">
            <div className="flex items-center gap-2 mb-6">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <h3 className="font-bold text-gray-900">Jobs</h3>
            </div>
            <div className="space-y-4">
              {upcomingJobs.map((job) => (
                <div
                  key={job.id}
                  className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-[#00c065] transition-colors"
                  onClick={() => setSelectedJob(job)}
                >
                  <div className="text-sm font-bold text-gray-800 mb-1">{job.dateLabel}</div>
                  <div className="text-xs text-gray-500">{job.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
