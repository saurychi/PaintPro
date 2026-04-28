"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Download,
  Loader2,
  PhilippinePeso,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

type ReportView = "weekly" | "monthly" | "yearly"

type ProjectReportRow = {
  projectId: string
  projectCode: string
  title: string
  description?: string | null
  clientId?: string | null
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  clientAddress?: string | null
  siteAddress?: string | null
  status?: string | null
  priority?: string | null
  startDatetime?: string | null
  endDatetime?: string | null
  estimatedBudget?: number | string | null
  estimatedCost?: number | string | null
  estimatedProfit?: number | string | null
  markupRate?: number | string | null
  dimensions?: unknown
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  createdBy?: string | null
}

type ApiResponse = {
  projects?: ProjectReportRow[]
  error?: string
}

type TrendPoint = {
  period: string
  revenue: number
  cost: number
  profit: number
}

type MixPoint = {
  name: string
  value: number
  percent: number
}

type StatusPoint = {
  key: string
  label: string
  count: number
  revenue: number
  cost: number
  profit: number
  percent: number
}

type PriorityPoint = {
  key: string
  label: string
  projects: number
  revenue: number
  cost: number
  profit: number
  percent: number
}

type TooltipPayloadItem = {
  name?: string
  value?: number | string
  payload?: any
}

type BasicTooltipProps = {
  active?: boolean
  label?: string
  payload?: TooltipPayloadItem[]
}

const REPORTS_PROJECTS_API = "/api/reports/projects"

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader = "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

const actionBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"

const inputBase =
  "h-9 min-w-[125px] appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 pr-8 text-sm font-semibold text-gray-900 transition-colors hover:border-[#00c065]/40 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:border-[#00c065]/40"

const CHART_COLORS = {
  revenue: "#00c065",
  cost: "#f59e0b",
  profit: "#00c065",
  lineProfit: "#3b82f6",
  neutral: "#94a3b8",
}

const MIX_COLORS: Record<string, string> = {
  "Estimated Cost": "#f59e0b",
  "Estimated Profit": "#00c065",
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#00c065",
  in_progress: "#3b82f6",
  ready_to_start: "#10b981",
  quotation_pending: "#f59e0b",
  employee_management_pending: "#f59e0b",
  invoice_pending: "#8b5cf6",
  payment_pending: "#8b5cf6",
  cancelled: "#ef4444",
  unknown: "#94a3b8",
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300",
  in_progress:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300",
  ready_to_start:
    "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  cancelled:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
  default:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300",
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
  medium:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300",
  low: "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
  normal:
    "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
}

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

function viewLabel(view: ReportView) {
  if (view === "weekly") return "Weekly"
  if (view === "yearly") return "Yearly"
  return "Monthly"
}

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function formatCurrencyPHP(n: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatCompactCurrency(n: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n)
}

function formatPercent(n: number) {
  if (!Number.isFinite(n)) return "0%"
  return `${Math.round(n)}%`
}

function safeNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function parseDate(value: string | null | undefined) {
  if (!value) return null

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null

  return d
}

function isWithinRange(value: string | null | undefined, start: Date, end: Date) {
  const d = parseDate(value)
  if (!d) return false

  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "unknown")
    .trim()
    .toLowerCase()
}

function normalizePriority(priority: string | null | undefined) {
  return String(priority ?? "normal")
    .trim()
    .toLowerCase()
}

function labelize(value: string | null | undefined) {
  const raw = String(value ?? "Unknown").trim()
  if (!raw) return "Unknown"

  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function priorityMeaning(priority: string | null | undefined) {
  const key = normalizePriority(priority)

  if (key === "high") return "Urgent projects that may need closer monitoring."
  if (key === "medium") return "Standard priority projects currently active in the selected range."
  if (key === "low") return "Lower urgency projects with less immediate attention required."

  return "Projects without a specific priority level."
}

function periodKeyForDate(date: Date, view: ReportView) {
  if (view === "weekly") {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)
  }

  if (view === "monthly") {
    const day = date.getDate()
    const week = Math.min(5, Math.ceil(day / 7))
    return `Week ${week}`
  }

  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date)
}

function periodOrder(view: ReportView) {
  if (view === "weekly") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  if (view === "monthly") return ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]

  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
}

function calculatePercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
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

function statusBadgeClass(status: string | null | undefined) {
  const key = normalizeStatus(status)
  return STATUS_BADGE_CLASSES[key] ?? STATUS_BADGE_CLASSES.default
}

function priorityBadgeClass(priority: string | null | undefined) {
  const key = normalizePriority(priority)
  return PRIORITY_STYLES[key] ?? PRIORITY_STYLES.normal
}

function chartStatusColor(status: string | null | undefined) {
  const key = normalizeStatus(status)
  return STATUS_COLORS[key] ?? STATUS_COLORS.unknown
}

function TooltipShell({
  title,
  rows,
}: {
  title: string
  rows: { name: string; value: string }[]
}) {
  return (
    <div className="min-w-[190px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 text-xs font-semibold text-gray-950 dark:text-slate-100">
        {title}
      </div>

      <div className="grid gap-1.5">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              {row.name}
            </span>
            <span className="text-xs font-semibold text-gray-950 dark:text-slate-100">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendTooltip(props: BasicTooltipProps) {
  const active = props.active
  const label = props.label
  const payload = props.payload ?? []

  if (!active || payload.length === 0) return null

  return (
    <TooltipShell
      title={label ?? "Period"}
      rows={payload.map((item) => ({
        name: item.name ?? "Value",
        value: formatCurrencyPHP(Number(item.value ?? 0)),
      }))}
    />
  )
}

function PieTooltip(props: BasicTooltipProps) {
  const active = props.active
  const payload = props.payload ?? []

  if (!active || payload.length === 0) return null

  const first = payload[0]
  const row = first.payload as MixPoint | undefined

  return (
    <TooltipShell
      title={row?.name ?? first.name ?? "Value"}
      rows={[
        {
          name: "Amount",
          value: formatCurrencyPHP(Number(row?.value ?? first.value ?? 0)),
        },
        {
          name: "Share",
          value: `${row?.percent ?? 0}%`,
        },
      ]}
    />
  )
}

function PriorityTooltip(props: BasicTooltipProps) {
  const active = props.active
  const payload = props.payload ?? []

  if (!active || payload.length === 0) return null

  const row = payload[0].payload as PriorityPoint

  return (
    <TooltipShell
      title={`${row.label} Priority`}
      rows={[
        {
          name: "Projects",
          value: formatNumber(row.projects),
        },
        {
          name: "Revenue",
          value: formatCurrencyPHP(row.revenue),
        },
        {
          name: "Cost",
          value: formatCurrencyPHP(row.cost),
        },
        {
          name: "Profit",
          value: formatCurrencyPHP(row.profit),
        },
        {
          name: "Profit Margin",
          value: formatPercent(row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0),
        },
      ]}
    />
  )
}

function KpiCard({
  label,
  value,
  note,
  icon,
  loading,
}: {
  label: string
  value: string
  note: string
  icon: ReactNode
  loading?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
            {label}
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-gray-950 dark:text-slate-100">
            {loading ? "—" : value}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {note}
          </div>
        </div>

        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </div>
      </div>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-950 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{note}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-[220px] place-items-center rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-900/35">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-white text-gray-400 dark:bg-slate-800 dark:text-slate-500">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="mt-3 text-sm font-semibold text-gray-950 dark:text-slate-100">
          No chart data
        </div>
        <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          {message}
        </div>
      </div>
    </div>
  )
}

export default function ReportOverviewPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const [projects, setProjects] = useState<ProjectReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(() => new Date())

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const dateSource = project.updatedAt ?? project.createdAt ?? project.startDatetime
      return isWithinRange(dateSource, range.start, range.end)
    })
  }, [projects, range.start, range.end])

  const reportData = useMemo(() => {
    const periods = periodOrder(view)

    const trendMap = new Map<string, TrendPoint>(
      periods.map((period) => [
        period,
        {
          period,
          revenue: 0,
          cost: 0,
          profit: 0,
        },
      ])
    )

    const statusMap = new Map<string, StatusPoint>()
    const priorityMap = new Map<string, PriorityPoint>()

    let totalRevenue = 0
    let totalCost = 0
    let totalProfit = 0

    for (const project of filteredProjects) {
      const revenue = safeNumber(project.estimatedBudget)
      const cost = safeNumber(project.estimatedCost)
      const profit = safeNumber(project.estimatedProfit)

      totalRevenue += revenue
      totalCost += cost
      totalProfit += profit

      const date = parseDate(project.updatedAt ?? project.createdAt ?? project.startDatetime)
      if (date) {
        const period = periodKeyForDate(date, view)
        const trend = trendMap.get(period)

        if (trend) {
          trend.revenue += revenue
          trend.cost += cost
          trend.profit += profit
        }
      }

      const statusKey = normalizeStatus(project.status)
      const currentStatus = statusMap.get(statusKey) ?? {
        key: statusKey,
        label: labelize(statusKey),
        count: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        percent: 0,
      }

      currentStatus.count += 1
      currentStatus.revenue += revenue
      currentStatus.cost += cost
      currentStatus.profit += profit
      statusMap.set(statusKey, currentStatus)

      const priorityKey = normalizePriority(project.priority)
      const currentPriority = priorityMap.get(priorityKey) ?? {
        key: priorityKey,
        label: labelize(priorityKey),
        projects: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        percent: 0,
      }

      currentPriority.projects += 1
      currentPriority.revenue += revenue
      currentPriority.cost += cost
      currentPriority.profit += profit
      priorityMap.set(priorityKey, currentPriority)
    }

    const totalJobs = filteredProjects.length
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
    const costRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0
    const avgRevenue = totalJobs > 0 ? totalRevenue / totalJobs : 0
    const avgProfit = totalJobs > 0 ? totalProfit / totalJobs : 0

    const revenueMix: MixPoint[] = [
      {
        name: "Estimated Cost",
        value: totalCost,
        percent: calculatePercent(totalCost, totalRevenue),
      },
      {
        name: "Estimated Profit",
        value: Math.max(totalProfit, 0),
        percent: calculatePercent(Math.max(totalProfit, 0), totalRevenue),
      },
    ]

    const statusBreakdown = Array.from(statusMap.values())
      .map((status) => ({
        ...status,
        percent: calculatePercent(status.count, totalJobs),
      }))
      .sort((a, b) => b.count - a.count)

    const priorityBreakdown = Array.from(priorityMap.values())
      .map((priority) => ({
        ...priority,
        percent: calculatePercent(priority.projects, totalJobs),
      }))
      .sort((a, b) => {
        const order = ["high", "medium", "low", "normal"]
        const aIndex = order.indexOf(a.key)
        const bIndex = order.indexOf(b.key)

        if (aIndex === -1 && bIndex === -1) return b.revenue - a.revenue
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })

    const topProjects = [...filteredProjects]
      .sort((a, b) => safeNumber(b.estimatedProfit) - safeNumber(a.estimatedProfit))
      .slice(0, 5)

    return {
      trendSeries: Array.from(trendMap.values()),
      revenueMix,
      statusBreakdown,
      priorityBreakdown,
      topProjects,
      summary: {
        totalJobs,
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin,
        costRatio,
        avgRevenue,
        avgProfit,
      },
    }
  }, [filteredProjects, view])

  async function loadProjects() {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await fetch(REPORTS_PROJECTS_API, {
        method: "GET",
        cache: "no-store",
      })

      const result = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok) {
        throw new Error(result?.error ?? "Failed to load report projects")
      }

      setProjects(result?.projects ?? [])
      setLastUpdated(new Date())
    } catch (error: any) {
      setLoadError(error?.message ?? "Failed to load report projects")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  function handleExportCsv() {
    const rows = [
      ["PaintPro"],
      ["Dashboard Charts Summary"],
      [],
      ["Report Information"],
      ["Range", rangeText],
      ["View", viewLabel(view)],
      ["Last Updated", formatTime(lastUpdated)],
      [],
      ["Financial Summary"],
      ["Metric", "Value"],
      ["Total Projects", reportData.summary.totalJobs],
      ["Estimated Revenue", reportData.summary.totalRevenue],
      ["Estimated Cost", reportData.summary.totalCost],
      ["Estimated Profit", reportData.summary.totalProfit],
      ["Profit Margin", `${Math.round(reportData.summary.profitMargin)}%`],
      ["Cost Ratio", `${Math.round(reportData.summary.costRatio)}%`],
      ["Average Revenue per Project", Math.round(reportData.summary.avgRevenue)],
      ["Average Profit per Project", Math.round(reportData.summary.avgProfit)],
      [],
      ["Revenue Mix"],
      ["Item", "Amount", "Share"],
      ...reportData.revenueMix.map((item) => [item.name, item.value, `${item.percent}%`]),
      [],
      ["Project Status"],
      ["Status", "Projects", "Revenue", "Profit"],
      ...reportData.statusBreakdown.map((status) => [
        status.label,
        status.count,
        status.revenue,
        status.profit,
      ]),
      [],
      ["Priority Revenue Breakdown"],
      ["Priority Level", "Projects", "Revenue", "Cost", "Profit"],
      ...reportData.priorityBreakdown.map((priority) => [
        priority.label,
        priority.projects,
        priority.revenue,
        priority.cost,
        priority.profit,
      ]),
      [],
      ["Top Projects by Estimated Profit"],
      [
        "Project Code",
        "Project Title",
        "Client",
        "Status",
        "Estimated Revenue",
        "Estimated Cost",
        "Estimated Profit",
      ],
      ...reportData.topProjects.map((project) => [
        project.projectCode,
        project.title,
        project.clientName ?? "Unassigned",
        labelize(project.status),
        safeNumber(project.estimatedBudget),
        safeNumber(project.estimatedCost),
        safeNumber(project.estimatedProfit),
      ]),
    ]

    const csv = rows.map((row) => toCsvRow(row)).join("\n")

    downloadTextFile(
      `paintpro_dashboard_charts_${view}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv"
    )
  }

  const hasProjects = reportData.summary.totalJobs > 0
  const onlyOnePriority = reportData.priorityBreakdown.length === 1
  const onlyPriorityLabel = reportData.priorityBreakdown[0]?.label ?? "one"

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Link
              href="/admin/report"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
            >
              <ArrowLeft className="h-4 w-4" />
              Report
            </Link>
            <span className="text-gray-400 dark:text-slate-500">/</span>
            <span className="text-gray-900 dark:text-slate-100">Dashboard Charts</span>
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Dashboard Charts
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            Visual report of financial trends, revenue mix, project status, and project priority.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={view}
                onChange={(e) => setView(e.target.value as ReportView)}
                className={inputBase}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
            </div>

            <button
              type="button"
              onClick={loadProjects}
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
          </div>
        </div>
      </div>

      <div className="mt-5 grid shrink-0 grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard
          label="Projects"
          value={formatNumber(reportData.summary.totalJobs)}
          note="Projects updated in range"
          loading={loading}
          icon={<Briefcase className="h-4 w-4" />}
        />

        <KpiCard
          label="Estimated Revenue"
          value={formatCurrencyPHP(reportData.summary.totalRevenue)}
          note="Combined estimated budget"
          loading={loading}
          icon={<PhilippinePeso className="h-4 w-4" />}
        />

        <KpiCard
          label="Estimated Cost"
          value={formatCurrencyPHP(reportData.summary.totalCost)}
          note={`${formatPercent(reportData.summary.costRatio)} of revenue`}
          loading={loading}
          icon={<TrendingDown className="h-4 w-4" />}
        />

        <KpiCard
          label="Estimated Profit"
          value={formatCurrencyPHP(reportData.summary.totalProfit)}
          note={`${formatPercent(reportData.summary.profitMargin)} profit margin`}
          loading={loading}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
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
              {viewLabel(view)}
            </span>
          </div>

          <div>
            <span className="text-gray-500 dark:text-slate-400">Updated:</span>{" "}
            <span className="font-semibold text-gray-950 dark:text-slate-100">
              {formatTime(lastUpdated)}
            </span>
          </div>

          <div className="ml-auto">
            <span
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                loadError
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
                  : "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
              ].join(" ")}
            >
              {loadError ? "Needs attention" : "Supabase Connected"}
            </span>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/25 dark:bg-red-500/15">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Could not load dashboard chart data
            </div>
            <div className="mt-1 text-sm text-red-600 dark:text-red-200">
              {loadError}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <section className={`xl:col-span-8 ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                      Financial Trend
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                      Revenue, cost, and profit movement across the selected period.
                    </div>
                  </div>

                  {loading && (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-slate-500" />
                  )}
                </div>
              </div>

              <div className="p-4">
                {!hasProjects && !loading ? (
                  <EmptyState message="No projects were updated within the selected report range." />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={reportData.trendSeries}
                        margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          className="text-gray-200 dark:text-slate-700"
                        />
                        <XAxis
                          dataKey="period"
                          tick={{ fontSize: 12, fill: "currentColor" }}
                          axisLine={false}
                          tickLine={false}
                          className="text-gray-500 dark:text-slate-400"
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: "currentColor" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => formatCompactCurrency(Number(value))}
                          className="text-gray-500 dark:text-slate-400"
                        />
                        <Tooltip content={<TrendTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name="Revenue"
                          stroke={CHART_COLORS.revenue}
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          name="Cost"
                          stroke={CHART_COLORS.cost}
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="profit"
                          name="Profit"
                          stroke={CHART_COLORS.lineProfit}
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Profit Margin"
                    value={formatPercent(reportData.summary.profitMargin)}
                    note="Profit compared to revenue"
                  />

                  <MiniMetric
                    label="Average Revenue"
                    value={formatCurrencyPHP(reportData.summary.avgRevenue)}
                    note="Revenue per project"
                  />

                  <MiniMetric
                    label="Average Profit"
                    value={formatCurrencyPHP(reportData.summary.avgProfit)}
                    note="Profit per project"
                  />
                </div>
              </div>
            </section>

            <section className={`xl:col-span-4 ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Revenue Mix
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Cost and profit share from the selected project revenue.
                </div>
              </div>

              <div className="p-4">
                {!hasProjects && !loading ? (
                  <EmptyState message="No revenue values found for this range." />
                ) : (
                  <div className="grid gap-4">
                    <div className="h-[210px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<PieTooltip />} />
                          <Pie
                            data={reportData.revenueMix}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={82}
                            paddingAngle={3}
                            stroke="transparent"
                          >
                            {reportData.revenueMix.map((item) => (
                              <Cell
                                key={item.name}
                                fill={MIX_COLORS[item.name] ?? CHART_COLORS.revenue}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid gap-2">
                      {reportData.revenueMix.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  MIX_COLORS[item.name] ?? CHART_COLORS.revenue,
                              }}
                            />
                            <span className="truncate text-xs font-semibold text-gray-950 dark:text-slate-100">
                              {item.name}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                              {item.percent}%
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-slate-400">
                              {formatCurrencyPHP(item.value)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={`xl:col-span-5 ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Project Status Chart
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Shows project count by current status.
                </div>
              </div>

              <div className="p-4">
                {reportData.statusBreakdown.length === 0 && !loading ? (
                  <EmptyState message="No status data available in this selected range." />
                ) : (
                  <div className="grid gap-4">
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={reportData.statusBreakdown}
                          layout="vertical"
                          margin={{ top: 8, right: 18, left: 20, bottom: 8 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="currentColor"
                            className="text-gray-200 dark:text-slate-700"
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fontSize: 12, fill: "currentColor" }}
                            axisLine={false}
                            tickLine={false}
                            className="text-gray-500 dark:text-slate-400"
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={110}
                            tick={{ fontSize: 12, fill: "currentColor" }}
                            axisLine={false}
                            tickLine={false}
                            className="text-gray-500 dark:text-slate-400"
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null

                              const row = payload[0].payload as StatusPoint

                              return (
                                <TooltipShell
                                  title={row.label}
                                  rows={[
                                    {
                                      name: "Projects",
                                      value: formatNumber(row.count),
                                    },
                                    {
                                      name: "Revenue",
                                      value: formatCurrencyPHP(row.revenue),
                                    },
                                    {
                                      name: "Profit",
                                      value: formatCurrencyPHP(row.profit),
                                    },
                                  ]}
                                />
                              )
                            }}
                          />
                          <Bar dataKey="count" name="Projects" radius={[0, 6, 6, 0]}>
                            {reportData.statusBreakdown.map((item) => (
                              <Cell key={item.key} fill={chartStatusColor(item.key)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid gap-2">
                      {reportData.statusBreakdown.map((status) => (
                        <div
                          key={status.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35"
                        >
                          <span
                            className={[
                              "inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                              statusBadgeClass(status.key),
                            ].join(" ")}
                          >
                            <span className="truncate">{status.label}</span>
                          </span>

                          <div className="text-right">
                            <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                              {status.count} project{status.count === 1 ? "" : "s"}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-slate-400">
                              {formatCurrencyPHP(status.revenue)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={`xl:col-span-7 ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Priority Revenue Breakdown
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Shows how estimated revenue is divided into cost and profit for each priority level.
                </div>
              </div>

              <div className="p-4">
                {reportData.priorityBreakdown.length === 0 && !loading ? (
                  <EmptyState message="No priority values found in this selected range." />
                ) : (
                  <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/35">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        Estimated Cost
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#00c065]" />
                        Estimated Profit
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Cost + profit = estimated revenue
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
                      <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
                        <div className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={reportData.priorityBreakdown}
                              layout="vertical"
                              margin={{ top: 10, right: 22, left: 12, bottom: 10 }}
                              barCategoryGap="35%"
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                horizontal={false}
                                stroke="currentColor"
                                className="text-gray-200 dark:text-slate-700"
                              />
                              <XAxis
                                type="number"
                                tick={{ fontSize: 12, fill: "currentColor" }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => formatCompactCurrency(Number(value))}
                                className="text-gray-500 dark:text-slate-400"
                              />
                              <YAxis
                                type="category"
                                dataKey="label"
                                width={82}
                                tick={{ fontSize: 12, fill: "currentColor" }}
                                axisLine={false}
                                tickLine={false}
                                className="text-gray-500 dark:text-slate-400"
                              />
                              <Tooltip content={<PriorityTooltip />} />
                              <Bar
                                dataKey="cost"
                                stackId="priorityRevenue"
                                name="Estimated Cost"
                                fill={CHART_COLORS.cost}
                                radius={[6, 0, 0, 6]}
                                maxBarSize={30}
                              />
                              <Bar
                                dataKey="profit"
                                stackId="priorityRevenue"
                                name="Estimated Profit"
                                fill={CHART_COLORS.profit}
                                radius={[0, 6, 6, 0]}
                                maxBarSize={30}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="grid content-start gap-3">
                        {reportData.priorityBreakdown.map((priority) => {
                          const profitMargin =
                            priority.revenue > 0 ? (priority.profit / priority.revenue) * 100 : 0

                          return (
                            <div
                              key={priority.key}
                              className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/35"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span
                                  className={[
                                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                                    priorityBadgeClass(priority.key),
                                  ].join(" ")}
                                >
                                  {priority.label} Priority
                                </span>

                                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                                  {priority.projects} project
                                  {priority.projects === 1 ? "" : "s"}
                                </span>
                              </div>

                              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-slate-400">
                                {priorityMeaning(priority.key)}
                              </p>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                                  <div className="text-gray-500 dark:text-slate-400">
                                    Revenue
                                  </div>
                                  <div className="font-semibold text-gray-950 dark:text-slate-100">
                                    {formatCompactCurrency(priority.revenue)}
                                  </div>
                                </div>

                                <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                                  <div className="text-gray-500 dark:text-slate-400">
                                    Margin
                                  </div>
                                  <div className="font-semibold text-[#047857] dark:text-emerald-300">
                                    {formatPercent(profitMargin)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {onlyOnePriority && (
                          <div className="rounded-lg border border-[#00c065]/20 bg-[#00c065]/10 p-3 text-xs leading-5 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
                            Only {onlyPriorityLabel} priority projects are found in this range.
                            Once High or Low priority projects exist, this chart will compare their
                            revenue, cost, and profit.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={`xl:col-span-12 ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  Top Projects by Estimated Profit
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Projects contributing the highest expected profit in the selected period.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-slate-700/70 dark:bg-slate-900/35 dark:text-slate-400">
                      <th className="px-4 py-2.5 text-left">Project Code</th>
                      <th className="px-3 py-2.5 text-left">Project</th>
                      <th className="px-3 py-2.5 text-left">Client</th>
                      <th className="px-3 py-2.5 text-left">Status</th>
                      <th className="px-3 py-2.5 text-right">Revenue</th>
                      <th className="px-3 py-2.5 text-right">Cost</th>
                      <th className="px-4 py-2.5 text-right">Profit</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                    {reportData.topProjects.map((project) => (
                      <tr
                        key={project.projectId}
                        className="text-sm transition hover:bg-gray-50 dark:hover:bg-slate-700/60"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="font-semibold text-gray-950 dark:text-slate-100">
                            {project.projectCode}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            Updated {formatDate(project.updatedAt)}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-middle">
                          <div
                            className="max-w-[280px] truncate font-semibold text-gray-950 dark:text-slate-100"
                            title={project.title}
                          >
                            {project.title}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-middle text-gray-700 dark:text-slate-300">
                          <div
                            className="max-w-[180px] truncate"
                            title={project.clientName ?? "Unassigned"}
                          >
                            {project.clientName ?? "Unassigned"}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-middle">
                          <span
                            className={[
                              "inline-flex max-w-[150px] items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                              statusBadgeClass(project.status),
                            ].join(" ")}
                          >
                            <span className="truncate">{labelize(project.status)}</span>
                          </span>
                        </td>

                        <td className="px-3 py-3 text-right align-middle font-semibold text-gray-950 dark:text-slate-100">
                          {formatCurrencyPHP(safeNumber(project.estimatedBudget))}
                        </td>

                        <td className="px-3 py-3 text-right align-middle text-gray-700 dark:text-slate-300">
                          {formatCurrencyPHP(safeNumber(project.estimatedCost))}
                        </td>

                        <td className="px-4 py-3 text-right align-middle font-semibold text-[#047857] dark:text-emerald-300">
                          {formatCurrencyPHP(safeNumber(project.estimatedProfit))}
                        </td>
                      </tr>
                    ))}

                    {reportData.topProjects.length === 0 && !loading && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10">
                          <EmptyState message="No projects found for this selected range." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}