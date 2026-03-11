"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronRight,
  CalendarDays,
  Briefcase,
  PhilippinePeso,
  TrendingDown,
  TrendingUp,
  Info,
  RefreshCw,
  Download,
  Printer,
  FileText,
  BarChart3,
} from "lucide-react"

type ReportView = "weekly" | "monthly" | "yearly"

const BORDER = "border border-gray-200"
const CARD = `rounded-lg bg-white shadow-sm ${BORDER}`
const SOFT = "bg-gray-50/60"

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function formatTime(d: Date) {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${pad2(m)} ${ampm}`
}

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Week starts on Monday
function getWeekRange(today: Date) {
  const d = startOfDay(today)
  const day = d.getDay()
  const diffToMonday = (day + 6) % 7

  const start = new Date(d)
  start.setDate(d.getDate() - diffToMonday)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return { start, end }
}

function getMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
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

function KpiCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <div className={["rounded-lg", BORDER, SOFT, "p-4"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-500">{title}</div>
          <div className="mt-1 truncate text-xl font-semibold text-gray-900">{value}</div>
          <div className="mt-1 text-xs text-gray-500">{hint}</div>
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white shadow-sm border border-gray-200">
          {icon}
        </div>
      </div>
    </div>
  )
}

function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsvRow(cells: (string | number)[]) {
  return cells
    .map((c) => {
      const s = String(c)
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`
      return s
    })
    .join(",")
}

export default function AdminReportPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date())

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(() => formatRangeLabel(range.start, range.end), [range.start, range.end])

  // Placeholder KPIs (front-end only)
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

  const avgRevenuePerJob = useMemo(() => {
    if (kpi.totalJobs <= 0) return 0
    return Math.round(kpi.totalRevenue / kpi.totalJobs)
  }, [kpi])

  const costRatio = useMemo(() => {
    if (kpi.totalRevenue <= 0) return 0
    return Math.round((kpi.totalCost / kpi.totalRevenue) * 100)
  }, [kpi])

  const currency = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n)

  const viewText = view === "weekly" ? "Weekly" : view === "yearly" ? "Yearly" : "Monthly"

  const recentItems = useMemo(
    () => [
      {
        id: "r1",
        title: "Revenue Summary",
        desc: "Line chart overview and KPIs",
        href: "/admin/report/report-overview",
      },
      {
        id: "r2",
        title: "Report List",
        desc: "View generated reports and history",
        href: "/admin/report/report-list",
      },
    ],
    []
  )

  function handleRefresh() {
    setLastUpdated(new Date())
  }

  function handleExportCsv() {
    const rows = [
      ["Range", rangeText],
      ["View", viewText],
      ["Last Updated", formatTime(lastUpdated)],
      [],
      ["Metric", "Value"],
      ["Total Jobs", kpi.totalJobs],
      ["Total Revenue", kpi.totalRevenue],
      ["Total Cost", kpi.totalCost],
      ["Net Profit", kpi.netProfit],
      ["Profit Margin (%)", profitMargin],
      ["Avg Revenue per Job", avgRevenuePerJob],
      ["Cost Ratio (%)", costRatio],
    ]

    const csv = rows.map((r) => toCsvRow(r as any)).join("\n")
    downloadTextFile(`paintpro_report_${view}_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv")
  }

  function handlePrint() {
    window.print()
  }

  const actionBtn =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25"

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Report</h1>
          <div className="mt-1 text-sm text-gray-500">Monitor KPIs and open report modules for deeper insights.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ReportView)}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <Link
            href="/admin/report/report-overview"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054] active:scale-[0.98]"
          >
            Open Overview
            <ChevronRight className="h-4 w-4" />
          </Link>

          <Link
            href="/admin/report/report-list"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]"
          >
            Report List
            <ChevronRight className="h-4 w-4 text-gray-500" />
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* Main column */}
        <section className={["lg:col-span-8", CARD, "p-4"].join(" ")}>
          {/* Alignment fix: two-row header inside the card */}
          <div className="flex flex-col gap-3">
            {/* Row 1: title + actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">Report Overview</div>

              <div className="flex items-center gap-2">
                <button type="button" className={`${actionBtn} whitespace-nowrap`} onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 text-gray-500" />
                  Refresh
                </button>

                <button type="button" className={`${actionBtn} whitespace-nowrap`} onClick={handleExportCsv}>
                  <Download className="h-4 w-4 text-gray-500" />
                  Export CSV
                </button>

                <button type="button" className={`${actionBtn} whitespace-nowrap`} onClick={handlePrint}>
                  <Printer className="h-4 w-4 text-gray-500" />
                  Print
                </button>
              </div>
            </div>

            {/* Row 2: date summary full width */}
            <div className="inline-flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gray-500" />
                <span className="text-gray-500">Range:</span>
                <span className="font-semibold text-gray-900">{rangeText}</span>
              </div>

              <div>
                <span className="text-gray-500">View:</span>{" "}
                <span className="font-semibold text-gray-900">{viewText}</span>
              </div>

              <div>
                <span className="text-gray-500">Last Updated:</span>{" "}
                <span className="font-semibold text-gray-900">{formatTime(lastUpdated)}</span>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KpiCard
              title="Total Jobs"
              value={`${kpi.totalJobs}`}
              hint="Completed and active jobs"
              icon={<Briefcase className="h-4 w-4 text-gray-600" />}
            />
            <KpiCard
              title="Total Revenue"
              value={currency(kpi.totalRevenue)}
              hint="Gross income in range"
              icon={<PhilippinePeso className="h-4 w-4 text-gray-600" />}
            />
            <KpiCard
              title="Total Cost"
              value={currency(kpi.totalCost)}
              hint="Expenses in range"
              icon={<TrendingDown className="h-4 w-4 text-gray-600" />}
            />
            <KpiCard
              title="Net Profit"
              value={currency(kpi.netProfit)}
              hint="Revenue minus cost"
              icon={<TrendingUp className="h-4 w-4 text-gray-600" />}
            />
          </div>

          {/* Summary blocks */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className={["rounded-lg", BORDER, "bg-white", "p-4"].join(" ")}>
              <div className="text-xs font-semibold text-gray-500">Profit Margin</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{profitMargin}%</div>
              <div className="mt-2 text-xs text-gray-500">Net profit vs total revenue</div>
            </div>

            <div className={["rounded-lg", BORDER, "bg-white", "p-4"].join(" ")}>
              <div className="text-xs font-semibold text-gray-500">Avg Revenue per Job</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{currency(avgRevenuePerJob)}</div>
              <div className="mt-2 text-xs text-gray-500">Revenue divided by job count</div>
            </div>

            <div className={["rounded-lg", BORDER, "bg-white", "p-4"].join(" ")}>
              <div className="text-xs font-semibold text-gray-500">Cost Ratio</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{costRatio}%</div>
              <div className="mt-2 text-xs text-gray-500">Cost vs revenue for the range</div>
            </div>
          </div>

          {/* Tightened note */}
          <div className="mt-3 rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 text-[#00a054]" />
              <div>
                <div className="text-sm font-semibold text-[#166534]">Heads up</div>
                <div className="mt-1 text-xs text-[#166534]">
                  KPI values are currently placeholders. When the backend is ready, compute totals based on the selected range and view.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right column */}
        <aside className={["lg:col-span-4", "space-y-4"].join(" ")}>
          <section className={[CARD, "p-4"].join(" ")}>
            <div>
              <div className="text-sm font-semibold text-gray-900">Manual Reports</div>
              <div className="mt-0.5 text-xs text-gray-500">Open report modules and exports</div>
            </div>

            <div className="mt-4 space-y-2">
              <Link
                href="/admin/report/report-list"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  Report List
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                  <ChevronRight className="h-4 w-4 text-[#00a054]" />
                </span>
              </Link>

              <Link
                href="/admin/report/report-overview"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-500" />
                  Dashboard Charts
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                  <ChevronRight className="h-4 w-4 text-[#00a054]" />
                </span>
              </Link>
            </div>
          </section>

          <section className={[CARD, "p-4"].join(" ")}>
            <div>
              <div className="text-sm font-semibold text-gray-900">Quick Links</div>
              <div className="mt-0.5 text-xs text-gray-500">Most used report actions</div>
            </div>

            <div className="mt-3 space-y-2">
              {recentItems.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{it.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-gray-500">{it.desc}</div>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 text-gray-400" />
                </Link>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
              Tip: Use <span className="font-semibold text-gray-900">Export CSV</span> to save the current summary for sharing.
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}