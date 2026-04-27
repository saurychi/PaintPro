"use client"

import { useEffect, useMemo, useState } from "react"
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
  Loader2,
  AlertTriangle,
} from "lucide-react"

import {
  getReportSummary,
  getReportQuickLinks,
  type ReportSummary,
  type ReportView as RepoReportView,
  type QuickLink,
} from "@/lib/data/reports.repo"

type ReportView = RepoReportView

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader =
  "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

const softPanel =
  "rounded-lg border border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-900/35"

const innerPanel =
  "rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"

const actionBtn =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const primaryBtn =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"

const mutedText = "text-gray-500 dark:text-slate-400"
const strongText = "text-gray-950 dark:text-slate-100"

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

// Week starts on Monday.
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

      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replaceAll('"', '""')}"`
      }

      return s
    })
    .join(",")
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
    <div className={softPanel}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className={`text-xs font-semibold ${mutedText}`}>{title}</div>
          <div className={`mt-1 truncate text-xl font-semibold ${strongText}`}>
            {value}
          </div>
          <div className={`mt-1 text-xs ${mutedText}`}>{hint}</div>
        </div>

        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          {icon}
        </div>
      </div>
    </div>
  )
}

function SmallMetric({
  title,
  value,
  hint,
}: {
  title: string
  value: string
  hint: string
}) {
  return (
    <div className={`${innerPanel} p-4`}>
      <div className={`text-xs font-semibold ${mutedText}`}>{title}</div>
      <div className={`mt-1 text-xl font-semibold ${strongText}`}>{value}</div>
      <div className={`mt-2 text-xs ${mutedText}`}>{hint}</div>
    </div>
  )
}

export default function AdminReportPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date())

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  const [kpi, setKpi] = useState<ReportSummary>({
    totalJobs: 0,
    totalRevenue: 0,
    totalCost: 0,
    netProfit: 0,
  })

  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const viewText =
    view === "weekly" ? "Weekly" : view === "yearly" ? "Yearly" : "Monthly"

  async function refreshSummary() {
    setLoading(true)
    setLoadError(null)

    try {
      const summary = await getReportSummary({
        view,
        rangeStartISO: range.start.toISOString(),
        rangeEndISO: range.end.toISOString(),
      })

      setKpi(summary)
      setLastUpdated(new Date())
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load report summary")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadLinks() {
      try {
        const links = await getReportQuickLinks()

        if (!cancelled) setQuickLinks(links)
      } catch {
        // Keep the report page usable even if quick links fail.
      }
    }

    loadLinks()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    refreshSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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

    downloadTextFile(
      `paintpro_report_${view}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv"
    )
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Report
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            Monitor KPIs and open report modules for deeper insights.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ReportView)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <Link href="/admin/report/report-overview" className={primaryBtn}>
            Open Overview
            <ChevronRight className="h-4 w-4" />
          </Link>

          <Link href="/admin/report/report-list" className={actionBtn}>
            Report List
            <ChevronRight className="h-4 w-4 text-gray-500 dark:text-slate-400" />
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <section className={`lg:col-span-8 ${cardShell} ${cardAccent}`}>
          <div className={sectionHeader}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Report Overview
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Current KPI summary for the selected reporting range.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${actionBtn} whitespace-nowrap`}
                  onClick={refreshSummary}
                >
                  <RefreshCw className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Refresh
                </button>

                <button
                  type="button"
                  className={`${actionBtn} whitespace-nowrap`}
                  onClick={handleExportCsv}
                >
                  <Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Export CSV
                </button>

                <button
                  type="button"
                  className={`${actionBtn} whitespace-nowrap`}
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Print
                </button>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="inline-flex w-full flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/35">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                <span className="text-gray-500 dark:text-slate-400">Range:</span>
                <span className="font-semibold text-gray-950 dark:text-slate-100">
                  {rangeText}
                </span>
              </div>

              <div>
                <span className="text-gray-500 dark:text-slate-400">View:</span>{" "}
                <span className="font-semibold text-gray-950 dark:text-slate-100">
                  {viewText}
                </span>
              </div>

              <div>
                <span className="text-gray-500 dark:text-slate-400">
                  Last Updated:
                </span>{" "}
                <span className="font-semibold text-gray-950 dark:text-slate-100">
                  {formatTime(lastUpdated)}
                </span>
              </div>
            </div>

            {(loading || loadError) && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/35">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-slate-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  {loading ? "Loading report summary…" : "Could not load report summary"}
                </div>

                {loadError ? (
                  <div className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                    {loadError}
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <KpiCard
                title="Total Jobs"
                value={`${kpi.totalJobs}`}
                hint="Completed and active jobs"
                icon={<Briefcase className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />
              <KpiCard
                title="Total Revenue"
                value={currency(kpi.totalRevenue)}
                hint="Gross income in range"
                icon={<PhilippinePeso className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />
              <KpiCard
                title="Total Cost"
                value={currency(kpi.totalCost)}
                hint="Expenses in range"
                icon={<TrendingDown className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />
              <KpiCard
                title="Net Profit"
                value={currency(kpi.netProfit)}
                hint="Revenue minus cost"
                icon={<TrendingUp className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <SmallMetric
                title="Profit Margin"
                value={`${profitMargin}%`}
                hint="Net profit vs total revenue"
              />
              <SmallMetric
                title="Avg Revenue per Job"
                value={currency(avgRevenuePerJob)}
                hint="Revenue divided by job count"
              />
              <SmallMetric
                title="Cost Ratio"
                value={`${costRatio}%`}
                hint="Cost vs revenue for the range"
              />
            </div>

            <div className="mt-3 rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 px-4 py-3 dark:border-[#00c065]/25 dark:bg-[#00c065]/15">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 text-[#00a054] dark:text-emerald-300" />
                <div>
                  <div className="text-sm font-semibold text-[#166534] dark:text-emerald-300">
                    Heads up
                  </div>
                  <div className="mt-1 text-xs text-[#166534] dark:text-emerald-200">
                    KPI values will be computed from Supabase project totals based on
                    the selected range and view.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 lg:col-span-4">
          <section className={`${cardShell} ${cardAccent}`}>
            <div className={sectionHeader}>
              <div>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Manual Reports
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Open report modules and exports.
                </div>
              </div>
            </div>

            <div className="space-y-2 p-4">
              <Link
                href="/admin/report/report-list"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Report List
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10 dark:bg-[#00c065]/15">
                  <ChevronRight className="h-4 w-4 text-[#00a054] dark:text-emerald-300" />
                </span>
              </Link>

              <Link
                href="/admin/report/report-overview"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Dashboard Charts
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10 dark:bg-[#00c065]/15">
                  <ChevronRight className="h-4 w-4 text-[#00a054] dark:text-emerald-300" />
                </span>
              </Link>
            </div>
          </section>

          <section className={`${cardShell} ${cardAccent}`}>
            <div className={sectionHeader}>
              <div>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Quick Links
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Most used report actions.
                </div>
              </div>
            </div>

            <div className="space-y-2 p-4">
              {quickLinks.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                      {it.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
                      {it.desc}
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
                </Link>
              ))}

              {quickLinks.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  No quick links available.
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-300">
                Tip: Use{" "}
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  Export CSV
                </span>{" "}
                to save the current summary for sharing.
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}