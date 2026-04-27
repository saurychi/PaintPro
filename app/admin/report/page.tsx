"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  PhilippinePeso,
  Printer,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import {
  getReportSummary,
  type ReportSummary,
  type ReportView as RepoReportView,
} from "@/lib/data/reports.repo"

type ReportView = RepoReportView

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader = "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

const actionBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"

const toolbarShell =
  "rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-800"

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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function getWeekRange(today: Date) {
  const d = startOfDay(today)
  const day = d.getDay()
  const diffToMonday = (day + 6) % 7

  const start = new Date(d)
  start.setDate(d.getDate() - diffToMonday)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return { start, end: endOfDay(end) }
}

function getMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  return { start, end: endOfDay(end) }
}

function getYearRange(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1)
  const end = new Date(today.getFullYear(), 11, 31)

  return { start, end: endOfDay(end) }
}

function getRange(view: ReportView, today: Date) {
  if (view === "weekly") return getWeekRange(today)
  if (view === "yearly") return getYearRange(today)

  return getMonthRange(today)
}

function getPreviousRange(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime()
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - duration)

  return {
    start: previousStart,
    end: previousEnd,
  }
}

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function currency(n: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n)
}

function percent(n: number) {
  if (!Number.isFinite(n)) return "0%"
  return `${Math.round(n)}%`
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function deltaPercent(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return 0
  if (previous <= 0) return 100

  return Math.round(((current - previous) / previous) * 100)
}

function comparisonLabel(current: number, previous: number) {
  if (previous <= 0 && current > 0) return "New activity"
  if (previous <= 0 && current <= 0) return "No activity"

  const delta = deltaPercent(current, previous)

  if (delta === 0) return "No change"
  return `${delta > 0 ? "+" : ""}${delta}%`
}

function comparisonClass(current: number, previous: number) {
  if (previous <= 0 && current > 0) {
    return "border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300"
  }

  if (previous <= 0 && current <= 0) {
    return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
  }

  const delta = deltaPercent(current, previous)

  if (delta > 0) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300"
  }

  if (delta < 0) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }

  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

function toCsvRow(cells: (string | number)[]) {
  return cells
    .map((cell) => {
      const value = String(cell)

      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replaceAll('"', '""')}"`
      }

      return value
    })
    .join(",")
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

function SmartBadge({
  current,
  previous,
}: {
  current: number
  previous: number
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        comparisonClass(current, previous),
      ].join(" ")}
    >
      {comparisonLabel(current, previous)}
    </span>
  )
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  loading,
  current,
  previous,
}: {
  title: string
  value: string
  hint: string
  icon: ReactNode
  loading?: boolean
  current?: number
  previous?: number
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 transition-colors dark:border-slate-700 dark:bg-slate-900/35">
      <div className="flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className={`text-xs font-semibold ${mutedText}`}>{title}</div>

          <div className={`mt-1 truncate text-xl font-semibold ${strongText}`}>
            {loading ? "—" : value}
          </div>

          <div className={`mt-1 text-xs ${mutedText}`}>{hint}</div>

          {!loading && typeof current === "number" && typeof previous === "number" && (
            <div className="mt-2">
              <SmartBadge current={current} previous={previous} />
            </div>
          )}
        </div>

        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-slate-400" />
          ) : (
            icon
          )}
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className={`text-xs font-semibold ${mutedText}`}>{label}</div>
      <div className={`mt-1 text-lg font-semibold ${strongText}`}>{value}</div>
      <div className={`mt-1 text-xs ${mutedText}`}>{subtext}</div>
    </div>
  )
}

function ProgressLine({
  label,
  value,
  amount,
  note,
}: {
  label: string
  value: number
  amount: string
  note: string
}) {
  const width = clampPercent(value)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-gray-950 dark:text-slate-100">{label}</span>
        <span className="font-semibold text-gray-600 dark:text-slate-300">{amount}</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-[#00c065] transition-all duration-300"
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="mt-2 text-xs leading-5 text-gray-500 dark:text-slate-400">
        {note}
      </div>
    </div>
  )
}

function ActionLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string
  icon: ReactNode
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[72px] w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all duration-200 hover:border-[#00c065]/35 hover:bg-[#00c065]/5 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10"
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 group-hover:text-[#047857] dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400 dark:group-hover:text-emerald-300">
          {icon}
        </span>

        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-950 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-gray-500 dark:text-slate-400">
            {desc}
          </span>
        </span>
      </span>

      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00a054] dark:text-slate-500 dark:group-hover:text-emerald-300" />
    </Link>
  )
}

function ActionButton({
  icon,
  title,
  desc,
  onClick,
  disabled,
}: {
  icon: ReactNode
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-[72px] w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all duration-200 hover:border-[#00c065]/35 hover:bg-[#00c065]/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10"
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 group-hover:text-[#047857] dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400 dark:group-hover:text-emerald-300">
          {icon}
        </span>

        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-950 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-gray-500 dark:text-slate-400">
            {desc}
          </span>
        </span>
      </span>

      <Download className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-y-0.5 group-hover:text-[#00a054] dark:text-slate-500 dark:group-hover:text-emerald-300" />
    </button>
  )
}

function ComparisonRow({
  icon,
  title,
  desc,
  current,
  previous,
  currentLabel,
  previousLabel,
}: {
  icon: ReactNode
  title: string
  desc: string
  current: number
  previous: number
  currentLabel: string
  previousLabel: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-[#047857] dark:border-slate-600 dark:bg-slate-900/50 dark:text-emerald-300">
            {icon}
          </div>

          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
              {title}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-slate-400">
              {desc}
            </div>
          </div>
        </div>

        <span
          className={[
            "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
            comparisonClass(current, previous),
          ].join(" ")}
        >
          {comparisonLabel(current, previous)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-slate-900/45">
          <div className="text-gray-500 dark:text-slate-400">Current</div>
          <div className="mt-0.5 font-semibold text-gray-950 dark:text-slate-100">
            {currentLabel}
          </div>
        </div>

        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-slate-900/45">
          <div className="text-gray-500 dark:text-slate-400">Previous</div>
          <div className="mt-0.5 font-semibold text-gray-950 dark:text-slate-100">
            {previousLabel}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryInsight({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/35">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
          {icon}
        </div>

        <div>
          <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function ManagementNote({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div className="flex h-full flex-col justify-center rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
        {title}
      </div>
      <div className="mt-1 text-base font-semibold text-gray-950 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
        {description}
      </div>
    </div>
  )
}

export default function AdminReportPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date())

  const today = useMemo(() => new Date(), [])

  const range = useMemo(() => getRange(view, today), [view, today])
  const previousRange = useMemo(
    () => getPreviousRange(range.start, range.end),
    [range.start, range.end]
  )

  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  const previousRangeText = useMemo(
    () => formatRangeLabel(previousRange.start, previousRange.end),
    [previousRange.start, previousRange.end]
  )

  const [kpi, setKpi] = useState<ReportSummary>({
    totalJobs: 0,
    totalRevenue: 0,
    totalCost: 0,
    netProfit: 0,
  })

  const [previousKpi, setPreviousKpi] = useState<ReportSummary>({
    totalJobs: 0,
    totalRevenue: 0,
    totalCost: 0,
    netProfit: 0,
  })

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const viewText =
    view === "weekly" ? "Weekly" : view === "yearly" ? "Yearly" : "Monthly"

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

  const profitShare = useMemo(() => {
    if (kpi.totalRevenue <= 0) return 0
    return (kpi.netProfit / kpi.totalRevenue) * 100
  }, [kpi])

  const revenueCoverage = kpi.totalRevenue > 0 ? 100 : 0
  const dataStatus = loadError ? "Needs attention" : loading ? "Refreshing" : "Ready"

  const profitStatus =
    kpi.netProfit > 0 ? "Profitable" : kpi.netProfit < 0 ? "Loss" : "Break-even"

  const costStatus =
    costRatio >= 85
      ? "High cost usage"
      : costRatio >= 65
        ? "Moderate cost usage"
        : "Healthy cost usage"

  const activityStatus = comparisonLabel(kpi.totalJobs, previousKpi.totalJobs)

  async function refreshSummary() {
    setLoading(true)
    setLoadError(null)

    try {
      const [currentSummary, previousSummary] = await Promise.all([
        getReportSummary({
          view,
          rangeStartISO: range.start.toISOString(),
          rangeEndISO: range.end.toISOString(),
        }),
        getReportSummary({
          view,
          rangeStartISO: previousRange.start.toISOString(),
          rangeEndISO: previousRange.end.toISOString(),
        }),
      ])

      setKpi(currentSummary)
      setPreviousKpi(previousSummary)
      setLastUpdated(new Date())
    } catch (error: any) {
      setLoadError(error?.message ?? "Failed to load report summary")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function handleExportCsv() {
    const generatedAt = new Date().toLocaleString()

    const rows = [
      ["PaintPro"],
      ["Report Cost Summary"],
      [],
      ["Report Information"],
      ["Report Range", rangeText],
      ["Report View", viewText],
      ["Previous Range", previousRangeText],
      ["Last Updated", formatTime(lastUpdated)],
      ["Generated At", generatedAt],
      [],
      ["Financial Summary"],
      ["Metric", "Current Value", "Previous Value", "Movement"],
      [
        "Total Jobs",
        kpi.totalJobs,
        previousKpi.totalJobs,
        comparisonLabel(kpi.totalJobs, previousKpi.totalJobs),
      ],
      [
        "Estimated Revenue",
        kpi.totalRevenue,
        previousKpi.totalRevenue,
        comparisonLabel(kpi.totalRevenue, previousKpi.totalRevenue),
      ],
      [
        "Estimated Cost",
        kpi.totalCost,
        previousKpi.totalCost,
        comparisonLabel(kpi.totalCost, previousKpi.totalCost),
      ],
      [
        "Estimated Profit",
        kpi.netProfit,
        previousKpi.netProfit,
        comparisonLabel(kpi.netProfit, previousKpi.netProfit),
      ],
      [],
      ["Performance Indicators"],
      ["Metric", "Value", "Notes"],
      ["Profit Margin", `${profitMargin}%`, "Estimated profit compared to estimated revenue"],
      [
        "Average Revenue per Job",
        avgRevenuePerJob,
        "Estimated revenue divided by total jobs",
      ],
      ["Cost Ratio", `${costRatio}%`, "Estimated cost compared to estimated revenue"],
      [],
      ["Management Interpretation"],
      ["Item", "Status", "Details"],
      [
        "Overall Standing",
        profitStatus,
        kpi.netProfit >= 0
          ? "The selected period is estimated to produce a positive return."
          : "The selected period is showing a possible loss based on stored estimates.",
      ],
      [
        "Cost Control",
        costStatus,
        costRatio >= 85
          ? "Costs are taking most of the estimated revenue. Review labor and material estimates."
          : costRatio >= 65
            ? "Costs are within a moderate range but should still be monitored."
            : "Costs are low compared with revenue, leaving stronger room for profit.",
      ],
      [
        "Recommended Action",
        "Review project list",
        "Inspect which projects contribute most to revenue, cost, and profit.",
      ],
    ]

    const csv = rows.map((row) => toCsvRow(row)).join("\n")

    downloadTextFile(
      `paintpro_report_cost_summary_${view}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv"
    )
  }

  function handlePrint() {
    const printWindow = window.open("", "_blank", "width=900,height=700")

    if (!printWindow) return

    const reportRows = [
      ["Total Jobs", formatNumber(kpi.totalJobs)],
      ["Estimated Revenue", currency(kpi.totalRevenue)],
      ["Estimated Cost", currency(kpi.totalCost)],
      ["Estimated Profit", currency(kpi.netProfit)],
      ["Profit Margin", percent(profitMargin)],
      ["Average Revenue per Job", currency(avgRevenuePerJob)],
      ["Cost Ratio", percent(costRatio)],
    ]

    const html = `
      <!doctype html>
      <html>
        <head>
          <title>PaintPro Report Cost Summary</title>
          <style>
            @page {
              size: A4;
              margin: 18mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #111827;
              background: white;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12px;
              line-height: 1.5;
            }

            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #111827;
              padding-bottom: 18px;
              margin-bottom: 18px;
            }

            .brand {
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.03em;
            }

            .subtitle {
              margin-top: 2px;
              color: #6b7280;
              font-size: 12px;
            }

            .doc-title {
              text-align: right;
            }

            .doc-title h1 {
              margin: 0;
              font-size: 24px;
              line-height: 1.1;
            }

            .doc-title div {
              margin-top: 6px;
              color: #6b7280;
              font-size: 12px;
            }

            .meta-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              margin-bottom: 16px;
            }

            .meta-card {
              border: 1px solid #e5e7eb;
              border-radius: 10px;
              padding: 10px;
              background: #ffffff;
            }

            .label {
              color: #6b7280;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .value {
              margin-top: 4px;
              font-size: 13px;
              font-weight: 700;
            }

            .section {
              margin-top: 14px;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              overflow: hidden;
            }

            .section-header {
              padding: 10px 14px;
              border-bottom: 1px solid #e5e7eb;
              background: #f9fafb;
              font-weight: 700;
            }

            .section-body {
              padding: 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th {
              text-align: left;
              color: #6b7280;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              border-bottom: 1px solid #e5e7eb;
              padding: 10px 14px;
              background: #ffffff;
            }

            td {
              border-bottom: 1px solid #f3f4f6;
              padding: 12px 14px;
              vertical-align: top;
            }

            tr:last-child td {
              border-bottom: 0;
            }

            .metric {
              font-weight: 700;
            }

            .amount {
              text-align: right;
              font-weight: 700;
            }

            .footer {
              margin-top: 18px;
              padding-top: 12px;
              border-top: 1px solid #e5e7eb;
              color: #6b7280;
              font-size: 11px;
              display: flex;
              justify-content: space-between;
            }

            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <div>
              <div class="brand">PaintPro</div>
              <div class="subtitle">Field Service Management and Business Intelligence Suite</div>
            </div>

            <div class="doc-title">
              <h1>Report Cost Summary</h1>
              <div>Generated: ${new Date().toLocaleString()}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="label">Range</div>
              <div class="value">${rangeText}</div>
            </div>

            <div class="meta-card">
              <div class="label">View</div>
              <div class="value">${viewText}</div>
            </div>

            <div class="meta-card">
              <div class="label">Last Updated</div>
              <div class="value">${formatTime(lastUpdated)}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">Financial Values</div>
            <div class="section-body">
              <table>
                <thead>
                  <tr>
                    <th>Report Item</th>
                    <th style="text-align:right;">Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportRows
                    .map(
                      ([metric, value]) => `
                        <tr>
                          <td class="metric">${metric}</td>
                          <td class="amount">${value}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>

          <div class="footer">
            <span>PaintPro Report Cost Summary</span>
            <span>Prepared for internal review</span>
          </div>

          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="flex shrink-0 flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Report
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            Monitor project performance, financial estimates, and reporting outputs.
          </p>
        </div>

        <div className={toolbarShell}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={view}
                onChange={(e) => setView(e.target.value as ReportView)}
                className="h-9 min-w-[125px] appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 pr-8 text-sm font-semibold text-gray-900 transition-colors hover:border-[#00c065]/40 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:border-[#00c065]/40"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
            </div>

            <button
              type="button"
              onClick={refreshSummary}
              disabled={loading}
              className={actionBtn}
            >
              <RefreshCw
                className={[
                  "h-4 w-4 text-gray-500 dark:text-slate-400",
                  loading ? "animate-spin" : "",
                ].join(" ")}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading}
              className={actionBtn}
            >
              <Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              Export
            </button>

            <button type="button" onClick={handlePrint} className={actionBtn}>
              <Printer className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 overflow-hidden xl:grid-cols-12">
        <section className={`h-full xl:col-span-8 ${cardShell} ${cardAccent}`}>
          <div className={sectionHeader}>
            <div>
              <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                Business Performance Summary
              </div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                Main project and financial totals for the selected reporting period.
              </div>
            </div>
          </div>

          <div className="flex h-[calc(100%-57px)] flex-col p-4">
            <div className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/35">
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
                <span className="text-gray-500 dark:text-slate-400">Updated:</span>{" "}
                <span className="font-semibold text-gray-950 dark:text-slate-100">
                  {formatTime(lastUpdated)}
                </span>
              </div>

              <div className="ml-auto">
                <span className="inline-flex items-center rounded-full border border-[#00c065]/20 bg-[#00c065]/10 px-2.5 py-1 text-[11px] font-semibold text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
                  {dataStatus}
                </span>
              </div>
            </div>

            {loadError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/25 dark:bg-red-500/15">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  Could not load report summary
                </div>
                <div className="mt-1 text-sm text-red-600 dark:text-red-200">
                  {loadError}
                </div>
              </div>
            )}

            {!loading && !loadError && kpi.totalJobs === 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-400/25 dark:bg-amber-500/15">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <Info className="h-4 w-4" />
                  No projects found in this range
                </div>
                <div className="mt-1 text-sm text-amber-700/80 dark:text-amber-200">
                  Try switching the report view or checking projects updated outside this period.
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <KpiCard
                title="Total Jobs"
                value={formatNumber(kpi.totalJobs)}
                hint="Projects updated in range"
                loading={loading}
                current={kpi.totalJobs}
                previous={previousKpi.totalJobs}
                icon={<Briefcase className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />

              <KpiCard
                title="Estimated Revenue"
                value={currency(kpi.totalRevenue)}
                hint="Combined estimated budget"
                loading={loading}
                current={kpi.totalRevenue}
                previous={previousKpi.totalRevenue}
                icon={<PhilippinePeso className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />

              <KpiCard
                title="Estimated Cost"
                value={currency(kpi.totalCost)}
                hint="Combined project cost"
                loading={loading}
                current={kpi.totalCost}
                previous={previousKpi.totalCost}
                icon={<TrendingDown className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />

              <KpiCard
                title="Estimated Profit"
                value={currency(kpi.netProfit)}
                hint={kpi.netProfit >= 0 ? "Estimated profit" : "Estimated loss"}
                loading={loading}
                current={kpi.netProfit}
                previous={previousKpi.netProfit}
                icon={<TrendingUp className="h-4 w-4 text-gray-600 dark:text-slate-300" />}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <MiniStat
                label="Profit Margin"
                value={percent(profitMargin)}
                subtext="Profit compared to revenue"
              />

              <MiniStat
                label="Average Revenue per Job"
                value={currency(avgRevenuePerJob)}
                subtext="Revenue divided by job count"
              />

              <MiniStat
                label="Cost Ratio"
                value={percent(costRatio)}
                subtext="Cost compared to revenue"
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <SummaryInsight
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Profit/Loss Status"
              >
                {kpi.netProfit >= 0
                  ? `This period is showing an estimated profit of ${currency(kpi.netProfit)}.`
                  : `This period is showing an estimated loss of ${currency(Math.abs(kpi.netProfit))}.`}
              </SummaryInsight>

              <SummaryInsight icon={<Info className="h-4 w-4" />} title="Cost Usage">
                {percent(costRatio)} of estimated revenue is expected to be used for project costs.
              </SummaryInsight>

              <SummaryInsight
                icon={<CalendarDays className="h-4 w-4" />}
                title="Period Activity"
              >
                {activityStatus} compared with the previous report range.
              </SummaryInsight>
            </div>

            <div className="mt-3 flex flex-1 flex-col justify-center rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/35">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[#00a054] dark:text-emerald-300" />
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Management Summary
                </div>
              </div>

              <div className="mt-3 grid flex-1 gap-3 lg:grid-cols-3">
                <ManagementNote
                  title="Overall Standing"
                  value={profitStatus}
                  description={
                    kpi.netProfit >= 0
                      ? "The selected period is currently estimated to produce a positive return."
                      : "The selected period is currently showing a possible loss based on stored estimates."
                  }
                />

                <ManagementNote
                  title="Cost Control"
                  value={costStatus}
                  description={
                    costRatio >= 85
                      ? "Costs are taking most of the estimated revenue. Review labor and material estimates."
                      : costRatio >= 65
                        ? "Costs are within a moderate range but should still be monitored."
                        : "Costs are low compared with revenue, leaving stronger room for profit."
                  }
                />

                <ManagementNote
                  title="Recommended Action"
                  value="Review project list"
                  description="Open the project report list to inspect which projects contribute most to revenue, cost, and profit."
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1 pb-4 xl:col-span-4">
          <div className="space-y-4">
            <section className={`${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Report Actions
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Common report tasks.
                </div>
              </div>

              <div className="grid gap-2 p-4">
                <ActionLink
                  href="/admin/report/report-list"
                  icon={<FileText className="h-4 w-4" />}
                  title="Project Report List"
                  desc="Review individual project records and financial values."
                />

                <ActionLink
                  href="/admin/report/report-overview"
                  icon={<BarChart3 className="h-4 w-4" />}
                  title="Dashboard Charts"
                  desc="Open visual charts for project and financial analysis."
                />

                <ActionButton
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                  title="Download CSV Summary"
                  desc="Export the current KPI summary for documentation."
                  onClick={handleExportCsv}
                  disabled={loading}
                />
              </div>
            </section>

            <section className={`${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Revenue Breakdown
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Shows how much of the estimated revenue is cost and profit.
                </div>
              </div>

              <div className="space-y-3 p-4">
                <ProgressLine
                  label="Estimated Revenue"
                  value={revenueCoverage}
                  amount={currency(kpi.totalRevenue)}
                  note="Total estimated budget from projects in the selected range."
                />

                <ProgressLine
                  label="Estimated Cost"
                  value={costRatio}
                  amount={`${percent(costRatio)} · ${currency(kpi.totalCost)}`}
                  note="Portion of revenue expected to be spent on project costs."
                />

                <ProgressLine
                  label="Estimated Profit"
                  value={profitShare}
                  amount={`${percent(profitShare)} · ${currency(kpi.netProfit)}`}
                  note="Remaining portion after estimated costs are deducted."
                />
              </div>
            </section>

            <section className={`${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Previous Period Check
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Compares this report range with {previousRangeText}.
                </div>
              </div>

              <div className="space-y-2 p-4">
                <ComparisonRow
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="Revenue Movement"
                  desc="Checks if estimated revenue increased, decreased, or started from no previous data."
                  current={kpi.totalRevenue}
                  previous={previousKpi.totalRevenue}
                  currentLabel={currency(kpi.totalRevenue)}
                  previousLabel={currency(previousKpi.totalRevenue)}
                />

                <ComparisonRow
                  icon={<PhilippinePeso className="h-4 w-4" />}
                  title="Profit Movement"
                  desc="Compares estimated profit against the previous report range."
                  current={kpi.netProfit}
                  previous={previousKpi.netProfit}
                  currentLabel={currency(kpi.netProfit)}
                  previousLabel={currency(previousKpi.netProfit)}
                />

                <ComparisonRow
                  icon={<Briefcase className="h-4 w-4" />}
                  title="Project Activity"
                  desc="Shows whether more projects were updated in this report range."
                  current={kpi.totalJobs}
                  previous={previousKpi.totalJobs}
                  currentLabel={`${kpi.totalJobs} project${kpi.totalJobs === 1 ? "" : "s"}`}
                  previousLabel={`${previousKpi.totalJobs} project${
                    previousKpi.totalJobs === 1 ? "" : "s"
                  }`}
                />
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}