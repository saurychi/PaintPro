"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, CalendarDays } from "lucide-react"

type ReportView = "weekly" | "monthly" | "yearly"

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Week starts on Monday
function getWeekRange(today: Date) {
  const d = startOfDay(today)
  const day = d.getDay() // 0 Sun ... 6 Sat
  const diffToMonday = (day + 6) % 7 // Mon -> 0, Sun -> 6
  const start = new Date(d)
  start.setDate(d.getDate() - diffToMonday)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return { start, end }
}

function getMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0) // last day
  return { start, end }
}

function getYearRange(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1)
  const end = new Date(today.getFullYear(), 11, 31)
  return { start, end }
}

function getRange(view: ReportView, today: Date) {
  if (view === "weekly") return getWeekRange(today)
  if (view === "yearly") return getYearRange(today)
  return getMonthRange(today)
}

function viewLabel(view: ReportView) {
  if (view === "weekly") return "Weekly View"
  if (view === "yearly") return "Yearly View"
  return "Monthly View"
}

function useAsOfTime() {
  const [asOf, setAsOf] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setAsOf(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(asOf)
  }, [asOf])
}

export default function AdminReportPage() {
  const [view, setView] = useState<ReportView>("monthly")
  const asOfTime = useAsOfTime()

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(() => formatRangeLabel(range.start, range.end), [range.start, range.end])

  const kpi = useMemo(() => {
    return {
      totalJobs: 128,
      totalRevenue: 245_300,
      totalCost: 176_400,
      netProfit: 68_900,
    }
  }, [])

  const profitMargin = useMemo(() => {
    if (kpi.totalRevenue <= 0) return 0
    return Math.round((kpi.netProfit / kpi.totalRevenue) * 100)
  }, [kpi])

  const currency = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Report</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        <section className="lg:col-span-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Report Overview</div>

              <div className="mt-3 inline-block rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="text-gray-500">Range:</span>{" "}
                    <span className="font-semibold text-gray-900">{rangeText}</span>
                  </div>

                  <div>
                    <span className="text-gray-500">View:</span>{" "}
                    <span className="font-semibold text-gray-900">
                      {view === "weekly"
                        ? "Weekly"
                        : view === "yearly"
                        ? "Yearly"
                        : "Monthly"}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-500">Last Updated:</span>{" "}
                    <span className="font-semibold text-gray-900">{asOfTime}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <label className="sr-only" htmlFor="reportView">
                  Report view
                </label>
                <select
                  id="reportView"
                  value={view}
                  onChange={(e) => setView(e.target.value as ReportView)}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <Link
                href="/admin/report/report-overview"
                className="inline-flex items-center gap-2 rounded-lg bg-[#00c065] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054] active:scale-[0.98]"
              >
                Open Overview
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Jobs</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{kpi.totalJobs}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.totalRevenue)}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Cost</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.totalCost)}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Net Profit</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.netProfit)}</div>
            </div>

            <div className="sm:col-span-2 rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 p-3">
              <div className="text-xs font-medium text-gray-600">Profit Margin</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{profitMargin}%</div>
              <div className="mt-1 text-xs font-medium text-[#166534]">
                Placeholder KPI. Replace with real values from backend later.
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/report/report-list"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]"
            >
              View Reports List
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </Link>

            <Link
              href="/admin/report/report-overview"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]"
            >
              View Dashboard Charts
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </Link>
          </div>
        </section>

        <section className="lg:col-span-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-gray-900">Manual Reports</div>
            <div className="mt-0.5 text-xs text-gray-500">Generate or open report modules</div>
          </div>

          <div className="mt-4 space-y-2">
            <Link
              href="/admin/report/report-list"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99]"
            >
              <span>Report List</span>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                <ChevronRight className="h-4 w-4 text-[#00a054]" />
              </span>
            </Link>

            <Link
              href="/admin/report/report-overview"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99]"
            >
              <span>Report Overview</span>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                <ChevronRight className="h-4 w-4 text-[#00a054]" />
              </span>
            </Link>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <div className="text-xs font-semibold text-gray-900">Backend-ready note</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-600">
              This page uses placeholder KPI data. When your API is ready, filter by the selected date range and view, then update the KPIs.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}