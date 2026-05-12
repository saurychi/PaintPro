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
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Hammer,
  Info,
  Loader2,
  MapPin,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react"

import {
  getReportProjects,
  type ReportProjectRow,
  type ReportSummary,
  type ReportView as RepoReportView,
} from "@/lib/data/reports.repo"

type ReportView = RepoReportView

const cardShell =
  "overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader =
  "border-b border-gray-100 px-3 py-2 dark:border-slate-700/70"

const actionBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"

const toolbarShell =
  "rounded-md border border-gray-200 bg-white p-1.5 shadow-sm dark:border-slate-700/70 dark:bg-slate-800"

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

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function currency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
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

function formatShortDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

function relativeFromNow(value: string | null | undefined, now: Date) {
  if (!value) return null
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return null

  const diffMs = then.getTime() - now.getTime()
  const absMs = Math.abs(diffMs)
  const minutes = Math.round(absMs / 60_000)
  const hours = Math.round(absMs / 3_600_000)
  const days = Math.round(absMs / 86_400_000)
  const past = diffMs < 0

  let label: string
  if (minutes < 1) label = "just now"
  else if (minutes < 60) label = `${minutes}m`
  else if (hours < 24) label = `${hours}h`
  else if (days < 30) label = `${days}d`
  else if (days < 365) label = `${Math.round(days / 30)}mo`
  else label = `${Math.round(days / 365)}y`

  if (label === "just now") return label
  return past ? `${label} ago` : `in ${label}`
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

type StatusBucket =
  | "in_progress"
  | "awaiting_invoice"
  | "awaiting_payment"
  | "wrap_up"
  | "completed"
  | "cancelled"
  | "other"

const STATUS_BUCKET_LABEL: Record<StatusBucket, string> = {
  in_progress: "In progress",
  awaiting_invoice: "Awaiting invoice",
  awaiting_payment: "Awaiting payment",
  wrap_up: "Wrapping up",
  completed: "Completed",
  cancelled: "Cancelled",
  other: "Other",
}

const STATUS_BUCKET_COLOR: Record<StatusBucket, string> = {
  in_progress: "#00c065",
  awaiting_invoice: "#3b82f6",
  awaiting_payment: "#f59e0b",
  wrap_up: "#8b5cf6",
  completed: "#10b981",
  cancelled: "#ef4444",
  other: "#94a3b8",
}

function bucketForStatus(status: string): StatusBucket {
  switch (status) {
    case "in_progress":
    case "ready_to_start":
    case "downpayment_pending":
      return "in_progress"
    case "review_pending":
    case "invoice_pending":
    case "invoice_agreement_pending":
    case "invoice_signed":
      return "awaiting_invoice"
    case "payment_pending":
      return "awaiting_payment"
    case "employee_management_pending":
    case "conclude_job_pending":
      return "wrap_up"
    case "completed":
      return "completed"
    case "cancelled":
      return "cancelled"
    default:
      return "other"
  }
}

function prettyStatusLabel(status: string) {
  if (!status) return "—"
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  loading,
}: {
  title: string
  value: string
  hint: string
  icon: ReactNode
  loading?: boolean
}) {
  return (
    <div className="flex min-h-[110px] overflow-hidden rounded-md border border-gray-200 bg-gray-50/70 transition-colors dark:border-slate-700 dark:bg-slate-900/35">
      <div className="flex h-full w-full min-w-0 items-start justify-between gap-3 p-4">
        <div className="flex min-h-20 min-w-0 flex-1 flex-col justify-between gap-2">
          <div className={`truncate text-xs font-semibold ${mutedText}`}>
            {title}
          </div>

          <div>
            <div
              className={`whitespace-nowrap text-xl font-semibold leading-7 tracking-tight ${strongText}`}>
              {loading ? "—" : value}
            </div>

            <div className={`mt-1 line-clamp-1 text-xs ${mutedText}`}>
              {hint}
            </div>
          </div>
        </div>

        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-500 dark:text-slate-400" />
          ) : (
            icon
          )}
        </div>
      </div>
    </div>
  )
}

function ProjectRowCard({
  project,
  trailing,
  now,
}: {
  project: ReportProjectRow
  trailing: ReactNode
  now: Date
}) {
  const updatedRel = relativeFromNow(project.updatedAt, now)

  return (
    <Link
      href={`/admin/projects?projectId=${encodeURIComponent(project.projectId)}`}
      className="group flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 transition-all duration-150 hover:border-[#00c065]/35 hover:bg-[#00c065]/5 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-200 bg-gray-50 text-[#047857] dark:border-slate-600 dark:bg-slate-900/45 dark:text-emerald-300">
          <Briefcase className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-gray-950 dark:text-slate-100">
              {project.title}
            </span>
            <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600 dark:bg-slate-900/45 dark:text-slate-300">
              {project.projectCode}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-slate-400">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{project.clientName}</span>
            </span>
            {project.siteAddress && project.siteAddress !== "—" ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{project.siteAddress}</span>
              </span>
            ) : null}
            {updatedRel ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock className="h-3 w-3" />
                {updatedRel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00a054] dark:text-slate-500 dark:group-hover:text-emerald-300" />
      </div>
    </Link>
  )
}

function PipelineBar({
  buckets,
  total,
}: {
  buckets: { bucket: StatusBucket; count: number }[]
  total: number
}) {
  if (total <= 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
        No projects in the selected range yet.
      </div>
    )
  }

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
        {buckets.map(({ bucket, count }) =>
          count > 0 ? (
            <div
              key={bucket}
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: STATUS_BUCKET_COLOR[bucket],
              }}
              title={`${STATUS_BUCKET_LABEL[bucket]}: ${count}`}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {buckets.map(({ bucket, count }) => (
          <li
            key={bucket}
            className="flex items-center justify-between gap-2 rounded-sm px-1 py-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_BUCKET_COLOR[bucket] }}
              />
              <span className="truncate text-gray-700 dark:text-slate-300">
                {STATUS_BUCKET_LABEL[bucket]}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-gray-950 dark:text-slate-100">
              {count}
            </span>
          </li>
        ))}
      </ul>
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
      className="group flex min-h-[54px] w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white p-2.5 text-left transition-all duration-200 hover:border-[#00c065]/35 hover:bg-[#00c065]/5 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10">
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 group-hover:text-[#047857] dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400 dark:group-hover:text-emerald-300">
          {icon}
        </span>

        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-950 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-1 line-clamp-1 block text-xs leading-4 text-gray-500 dark:text-slate-400">
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
      className="group flex min-h-[54px] w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white p-2.5 text-left transition-all duration-200 hover:border-[#00c065]/35 hover:bg-[#00c065]/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10">
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 group-hover:text-[#047857] dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400 dark:group-hover:text-emerald-300">
          {icon}
        </span>

        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-950 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-1 line-clamp-1 block text-xs leading-4 text-gray-500 dark:text-slate-400">
            {desc}
          </span>
        </span>
      </span>

      <Download className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-y-0.5 group-hover:text-[#00a054] dark:text-slate-500 dark:group-hover:text-emerald-300" />
    </button>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
      {message}
    </div>
  )
}

export default function AdminReportPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date())
  const [now, setNow] = useState<Date>(() => new Date())

  const today = useMemo(() => new Date(), [])

  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end],
  )

  const [projects, setProjects] = useState<ReportProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const viewText =
    view === "weekly" ? "Weekly" : view === "yearly" ? "Yearly" : "Monthly"

  const summary: ReportSummary = useMemo(
    () =>
      projects.reduce(
        (acc, project) => {
          acc.totalJobs += 1
          acc.totalRevenue += project.estimatedBudget
          acc.totalCost += project.estimatedCost
          acc.netProfit += project.estimatedProfit
          return acc
        },
        { totalJobs: 0, totalRevenue: 0, totalCost: 0, netProfit: 0 },
      ),
    [projects],
  )

  const profitMargin = useMemo(() => {
    if (summary.totalRevenue <= 0) return 0
    return Math.round((summary.netProfit / summary.totalRevenue) * 100)
  }, [summary])

  const recentlyCompleted = useMemo(() => {
    return projects
      .filter((project) => project.status === "completed")
      .slice()
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 6)
  }, [projects])

  const activeProjects = useMemo(() => {
    return projects
      .filter((project) =>
        ["in_progress", "ready_to_start", "review_pending"].includes(
          project.status,
        ),
      )
      .slice()
      .sort((a, b) => {
        const aTime = a.startDatetime ? new Date(a.startDatetime).getTime() : 0
        const bTime = b.startDatetime ? new Date(b.startDatetime).getTime() : 0
        return aTime - bTime
      })
      .slice(0, 6)
  }, [projects])

  const cashWaiting = useMemo(() => {
    return projects
      .filter((project) =>
        [
          "invoice_pending",
          "invoice_agreement_pending",
          "invoice_signed",
          "payment_pending",
        ].includes(project.status),
      )
      .slice()
      .sort((a, b) => b.estimatedBudget - a.estimatedBudget)
      .slice(0, 5)
  }, [projects])

  const cashWaitingTotal = useMemo(
    () =>
      projects
        .filter((project) =>
          [
            "invoice_pending",
            "invoice_agreement_pending",
            "invoice_signed",
            "payment_pending",
          ].includes(project.status),
        )
        .reduce((sum, project) => sum + project.estimatedBudget, 0),
    [projects],
  )

  const pipelineBuckets = useMemo(() => {
    const counts = new Map<StatusBucket, number>()
    for (const project of projects) {
      const bucket = bucketForStatus(project.status)
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }

    const order: StatusBucket[] = [
      "in_progress",
      "awaiting_invoice",
      "awaiting_payment",
      "wrap_up",
      "completed",
      "cancelled",
      "other",
    ]

    return order
      .map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }))
      .filter((entry) => entry.count > 0 || entry.bucket === "in_progress")
  }, [projects])

  const topClients = useMemo(() => {
    const map = new Map<
      string,
      {
        clientId: string
        name: string
        revenue: number
        profit: number
        jobs: number
      }
    >()

    for (const project of projects) {
      const key = project.clientId ?? `__none__:${project.clientName}`
      const existing = map.get(key)

      if (existing) {
        existing.revenue += project.estimatedBudget
        existing.profit += project.estimatedProfit
        existing.jobs += 1
      } else {
        map.set(key, {
          clientId: project.clientId ?? "",
          name: project.clientName,
          revenue: project.estimatedBudget,
          profit: project.estimatedProfit,
          jobs: 1,
        })
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }, [projects])

  const dataStatus = loadError
    ? "Needs attention"
    : loading
      ? "Refreshing"
      : "Ready"

  async function refreshData() {
    setLoading(true)
    setLoadError(null)

    try {
      const data = await getReportProjects({
        rangeStartISO: range.start.toISOString(),
        rangeEndISO: range.end.toISOString(),
      })

      setProjects(data)
      setLastUpdated(new Date())
      setNow(new Date())
    } catch (error: any) {
      setLoadError(error?.message ?? "Failed to load report data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function handleExportCsv() {
    const generatedAt = new Date().toLocaleString()

    const rows: (string | number)[][] = [
      ["PaintPro"],
      ["Report Cost Summary"],
      [],
      ["Report Information"],
      ["Report Range", rangeText],
      ["Report View", viewText],
      ["Last Updated", formatTime(lastUpdated)],
      ["Generated At", generatedAt],
      [],
      ["Financial Summary"],
      ["Metric", "Value"],
      ["Total Jobs", summary.totalJobs],
      ["Estimated Revenue", summary.totalRevenue],
      ["Estimated Cost", summary.totalCost],
      ["Estimated Profit", summary.netProfit],
      ["Profit Margin", `${profitMargin}%`],
      [],
      ["Recently Completed Projects"],
      ["Project Code", "Title", "Client", "Revenue", "Profit", "Completed"],
      ...recentlyCompleted.map((project) => [
        project.projectCode,
        project.title,
        project.clientName,
        project.estimatedBudget,
        project.estimatedProfit,
        formatShortDate(project.updatedAt),
      ]),
      [],
      ["Top Clients by Revenue"],
      ["Client", "Jobs", "Revenue", "Profit"],
      ...topClients.map((client) => [
        client.name,
        client.jobs,
        client.revenue,
        client.profit,
      ]),
    ]

    const csv = rows.map((row) => toCsvRow(row)).join("\n")

    downloadTextFile(
      `paintpro_report_${view}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv",
    )
  }

  return (
    <div className="flex min-w-0 flex-col overflow-y-auto bg-[#f7f8fa] px-3 py-2 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-3 xl:h-[calc(100dvh-0.75rem)] xl:max-h-[calc(100dvh-0.75rem)] xl:min-h-[560px] xl:overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="ml-5 text-[20px] font-semibold leading-tight tracking-tight text-gray-950 dark:text-slate-100">
            Report
          </h1>
        </div>

        <div className={toolbarShell}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick-jump nav buttons — same destinations as the
                Report Actions cards on the right, surfaced in the
                header toolbar for one-click access. Green hover tint
                + lift/shadow on hover, scale-down on press. */}
            <Link
              href="/admin/report/report-list"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"
            >
              <FileText className="h-4 w-4" />
              Project Report List
            </Link>

            <Link
              href="/admin/report/report-overview"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard Charts
            </Link>

            <div className="relative">
              <select
                value={view}
                onChange={(e) => setView(e.target.value as ReportView)}
                className="h-9 min-w-[125px] appearance-none rounded-md border border-gray-200 bg-gray-50 px-2.5 pr-8 text-xs font-semibold text-gray-900 transition-colors hover:border-[#00c065]/40 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:border-[#00c065]/40">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
            </div>

            <button
              type="button"
              onClick={refreshData}
              disabled={loading}
              className={actionBtn}>
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
              className={actionBtn}>
              <Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 items-stretch gap-3 xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:grid-cols-12">
        <section
          className={`flex flex-col xl:h-full xl:min-h-0 xl:col-span-8 ${cardShell} ${cardAccent}`}>
          <div className={sectionHeader}>
            <div>
              <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                Project Snapshot
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Headline numbers and the projects driving them.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <div className="flex w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-gray-200 bg-gray-50/70 px-3 py-2 text-[10px] dark:border-slate-700 dark:bg-slate-900/35">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                <span className="text-gray-500 dark:text-slate-400">
                  Range:
                </span>
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
                  Updated:
                </span>{" "}
                <span className="font-semibold text-gray-950 dark:text-slate-100">
                  {formatTime(lastUpdated)}
                </span>
              </div>

              <div className="ml-auto hidden sm:block">
                <span className="inline-flex items-center rounded-full border border-[#00c065]/20 bg-[#00c065]/10 px-3 py-1 text-xs font-semibold text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
                  {dataStatus}
                </span>
              </div>
            </div>

            {loadError && (
              <div className="shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/25 dark:bg-red-500/15">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  Could not load report data
                </div>
                <div className="mt-1 text-xs text-red-600 dark:text-red-200">
                  {loadError}
                </div>
              </div>
            )}

            {!loading && !loadError && projects.length === 0 && (
              <div className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-400/25 dark:bg-amber-500/15">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Info className="h-4 w-4" />
                  No projects found in this range
                </div>
                <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-200">
                  Switch the report view or check projects updated outside
                  this period.
                </div>
              </div>
            )}

            <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                title="Total Jobs"
                value={formatNumber(summary.totalJobs)}
                hint="Projects active in range"
                loading={loading}
                icon={
                  <Briefcase className="h-4 w-4 text-gray-600 dark:text-slate-300" />
                }
              />
              <KpiCard
                title="Revenue"
                value={currency(summary.totalRevenue)}
                hint="Total estimated budget"
                loading={loading}
                icon={
                  <DollarSign className="h-4 w-4 text-gray-600 dark:text-slate-300" />
                }
              />
              <KpiCard
                title="Profit"
                value={currency(summary.netProfit)}
                hint={`Margin ${percent(profitMargin)}`}
                loading={loading}
                icon={
                  <TrendingUp className="h-4 w-4 text-gray-600 dark:text-slate-300" />
                }
              />
              <KpiCard
                title="Cash Waiting"
                value={currency(cashWaitingTotal)}
                hint="Awaiting invoice or payment"
                loading={loading}
                icon={
                  <Clock className="h-4 w-4 text-gray-600 dark:text-slate-300" />
                }
              />
            </div>

            <div className="rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-slate-700/70">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#047857] dark:text-emerald-300" />
                  <div>
                    <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                      Recently Completed
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      Newest concluded projects in this period.
                    </div>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {recentlyCompleted.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 p-3">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
                  </div>
                ) : recentlyCompleted.length === 0 ? (
                  <EmptyHint message="No projects have been concluded in this period yet." />
                ) : (
                  recentlyCompleted.map((project) => (
                    <ProjectRowCard
                      key={project.projectId}
                      project={project}
                      now={now}
                      trailing={
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                            {currency(project.estimatedBudget)}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              project.estimatedProfit >= 0
                                ? "text-[#047857] dark:text-emerald-300"
                                : "text-red-600 dark:text-red-300"
                            }`}>
                            {project.estimatedProfit >= 0 ? "+" : ""}
                            {currency(project.estimatedProfit)} profit
                          </span>
                        </div>
                      }
                    />
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-slate-700/70">
                  <div className="flex items-center gap-2">
                    <Hammer className="h-4 w-4 text-[#047857] dark:text-emerald-300" />
                    <div>
                      <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                        Active Projects
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Currently in progress or queued to start.
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#00c065]/25 bg-[#00c065]/10 px-2.5 py-0.5 text-xs font-semibold text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
                    {activeProjects.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
                    </div>
                  ) : activeProjects.length === 0 ? (
                    <EmptyHint message="No projects are running in this period." />
                  ) : (
                    activeProjects.map((project) => (
                      <ProjectRowCard
                        key={project.projectId}
                        project={project}
                        now={now}
                        trailing={
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                              {currency(project.estimatedBudget)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              {prettyStatusLabel(project.status)}
                            </span>
                          </div>
                        }
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-slate-700/70">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                    <div>
                      <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                        Cash Awaiting
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Largest invoices not yet paid.
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300">
                    {currency(cashWaitingTotal)}
                  </span>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
                    </div>
                  ) : cashWaiting.length === 0 ? (
                    <EmptyHint message="Nothing is awaiting invoice or payment right now." />
                  ) : (
                    cashWaiting.map((project) => (
                      <ProjectRowCard
                        key={project.projectId}
                        project={project}
                        now={now}
                        trailing={
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                              {currency(project.estimatedBudget)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              {prettyStatusLabel(project.status)}
                            </span>
                          </div>
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="xl:h-full xl:min-h-0 xl:overflow-hidden xl:col-span-4">
          <div className="flex flex-col gap-3 xl:h-full xl:min-h-0 xl:overflow-y-auto">
            <section
              className={`flex shrink-0 flex-col ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                  Project Pipeline
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Where projects sit in the workflow.
                </div>
              </div>

              <div className="p-3">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <PipelineBar
                    buckets={pipelineBuckets}
                    total={pipelineBuckets.reduce(
                      (sum, b) => sum + b.count,
                      0,
                    )}
                  />
                )}
              </div>
            </section>

            <section
              className={`flex shrink-0 flex-col ${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                  Top Clients
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Highest revenue contributors in this period.
                </div>
              </div>

              <div className="flex flex-col gap-2 p-3">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
                  </div>
                ) : topClients.length === 0 ? (
                  <EmptyHint message="No client revenue data for this period." />
                ) : (
                  topClients.map((client) => (
                    <div
                      key={
                        client.clientId
                          ? `client-${client.clientId}`
                          : `name-${client.name}`
                      }
                      className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/35">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-[#047857] dark:border-slate-600 dark:bg-slate-800 dark:text-emerald-300">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-gray-950 dark:text-slate-100">
                            {client.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            {client.jobs} job{client.jobs === 1 ? "" : "s"}
                            {" · "}
                            {client.profit >= 0 ? "+" : ""}
                            {currency(client.profit)} profit
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-gray-950 dark:text-slate-100">
                        {currency(client.revenue)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Report Actions sits last in the aside; `xl:flex-1`
                lets it absorb whatever vertical space is left over so
                the column bottom-aligns with the taller left column.
                Content stays at the top of the card; only the border
                extends to fill. `shrink-0` stays in place for smaller
                breakpoints where each section stacks naturally. */}
            <section
              className={`flex shrink-0 flex-col ${cardShell} ${cardAccent} xl:shrink xl:flex-1`}>
              <div className={sectionHeader}>
                <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                  Report Actions
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Drill in or export the data.
                </div>
              </div>

              <div className="flex flex-col gap-2 p-3">
                <ActionLink
                  href="/admin/report/report-list"
                  icon={<FileText className="h-4 w-4" />}
                  title="Project Report List"
                  desc="Browse every project record and its financials."
                />

                <ActionLink
                  href="/admin/report/report-overview"
                  icon={<BarChart3 className="h-4 w-4" />}
                  title="Dashboard Charts"
                  desc="Visual charts for trend analysis."
                />

                <ActionButton
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                  title="Download CSV"
                  desc="Export the current view as a spreadsheet."
                  onClick={handleExportCsv}
                  disabled={loading}
                />
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}
