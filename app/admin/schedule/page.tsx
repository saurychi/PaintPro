"use client"

import React, { useMemo, useState } from "react"

// Types
type CalendarDay = {
  day: number
  currentMonth: boolean
}

type Event = {
  id: string
  title: string
  date: Date
  type: "primary" | "secondary" // primary = solid green background (selected), secondary = light green pill
}

// Mock Data (edit freely)
const EVENTS: Event[] = [
  { id: "1", title: "Interior & Ext...", date: new Date(2025, 5, 1), type: "secondary" },
  { id: "2", title: "Roof Painting", date: new Date(2025, 5, 2), type: "primary" },
  { id: "3", title: "High-Pressure...", date: new Date(2025, 5, 6), type: "secondary" },
  { id: "4", title: "Interior & Ext...", date: new Date(2025, 5, 8), type: "secondary" },
  { id: "5", title: "Interior & Ext...", date: new Date(2025, 5, 12), type: "secondary" },
  { id: "6", title: "Industrial Co...", date: new Date(2025, 5, 15), type: "secondary" },
  { id: "7", title: "Interior & Ext...", date: new Date(2025, 5, 18), type: "secondary" },
  { id: "8", title: "Wallpapering", date: new Date(2025, 5, 21), type: "secondary" },
  { id: "9", title: "Plaster & Pa...", date: new Date(2025, 5, 28), type: "secondary" },
  { id: "10", title: "Interior & Ext...", date: new Date(2025, 5, 30), type: "secondary" },
]

const UPCOMING_JOBS = [
  { date: "June 6", title: "High-Pressure Cleaning" },
  { date: "June 8", title: "Interior & Exterior Painting" },
  { date: "June 12", title: "Interior & Exterior Painting" },
  { date: "June 15", title: "Industrial Coating" },
  { date: "June 18", title: "Interior & Exterior Painting" },
  { date: "June 21", title: "Wallpapering" },
  { date: "June 28", title: "Plaster & Patching" },
  { date: "June 30", title: "Interior & Exterior Painting" },
  { date: "July 3", title: "Epoxy Floor Coating" },
]

const CURRENT_JOB = {
  id: "#0000005D-2025",
  name: "Lee House",
  status: "Job on-going",
}

// Helper to generate calendar days
const getCalendarDays = (year: number, month: number): CalendarDay[] => {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Monday = 0
  let startDayOfWeek = firstDay.getDay() - 1
  if (startDayOfWeek === -1) startDayOfWeek = 6

  const days: CalendarDay[] = []

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, currentMonth: false })
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true })
  }

  // Next month padding to fill 42 cells
  const remainingCells = 42 - days.length
  for (let i = 1; i <= remainingCells; i++) {
    days.push({ day: i, currentMonth: false })
  }

  return days
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export default function AdminSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 5, 1))
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month])

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const getEventForDay = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return null
    return EVENTS.find(
      (e) => e.date.getDate() === day && e.date.getMonth() === month && e.date.getFullYear() === year
    )
  }

  return (
    <main className="h-screen bg-white overflow-hidden">
      {/* Dashboard shell style */}
      <div className="p-6 h-full flex flex-col overflow-hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Schedule</h1>

        <div className="mt-6 flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
          {/* Calendar Card */}
          <section className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm p-4 flex flex-col overflow-hidden">
            {/* Calendar Header */}
            <div className="relative flex items-center justify-center shrink-0 mb-4">
              <button
                onClick={prevMonth}
                className="absolute left-2 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50"
                aria-label="Previous month"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <h2 className="text-lg font-semibold text-[#00c065]">
                {monthNames[month]} {year}
              </h2>

              <button
                onClick={nextMonth}
                className="absolute right-2 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50"
                aria-label="Next month"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 border-b border-gray-100 shrink-0">
              {["MON", "TUE", "WED", "THUR", "FRI", "SAT", "SUN"].map((d) => (
                <div key={d} className="p-2 text-center text-gray-400 text-xs font-semibold uppercase">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6 border-l border-t border-gray-100">
              {calendarDays.map((dateObj, index) => {
                const event = getEventForDay(dateObj.day, dateObj.currentMonth)
                const isPrimary = event?.type === "primary"

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => event && setSelectedEvent(event)}
                    className={[
                      "border-r border-b border-gray-100 p-2 text-left",
                      "flex flex-col justify-between",
                      "transition-colors",
                      "min-w-0",
                      !dateObj.currentMonth
                        ? "text-gray-300 bg-gray-50/40 cursor-default"
                        : event
                        ? "hover:bg-gray-50"
                        : "hover:bg-gray-50 cursor-default",
                      isPrimary ? "!bg-[#00c065] !text-white hover:!bg-[#00a054]" : "",
                    ].join(" ")}
                  >
                    <span className="font-semibold text-sm leading-none">{dateObj.day}</span>

                    {event && (
                      <span
                        className={[
                          "mt-2 text-[10px] font-semibold px-2 py-1 rounded-md truncate w-full",
                          isPrimary ? "bg-white/20 text-white" : "bg-[#dcfce7] text-[#166534]",
                        ].join(" ")}
                      >
                        {event.title}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Right Panel */}
          <aside className="w-full lg:w-80 flex flex-col gap-4 overflow-hidden">
            {/* Status Card */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00c065]" />
                <span className="text-sm font-medium text-gray-700">Status: {CURRENT_JOB.status}</span>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <div className="text-lg font-bold text-gray-900 mb-1">{CURRENT_JOB.id}</div>
                <div className="text-sm font-medium text-gray-600">{CURRENT_JOB.name}</div>
              </div>
            </div>

            {/* Jobs List */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 flex-1 flex flex-col overflow-hidden">
              <div className="mb-3 shrink-0">
                <h3 className="text-sm font-semibold text-gray-900">Jobs</h3>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {UPCOMING_JOBS.map((job, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 hover:border-[#00c065]"
                    onClick={() =>
                      setSelectedEvent({
                        id: `mock-${idx}`,
                        title: job.title,
                        date: new Date(year, month, 1),
                        type: "secondary",
                      })
                    }
                  >
                    <div className="text-xs font-semibold text-gray-500 mb-1">{job.date}</div>
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
                <p className="text-gray-800 font-medium">{selectedEvent.date.toDateString()}</p>
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
  )
}
