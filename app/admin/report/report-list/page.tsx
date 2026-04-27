"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  PhilippinePeso,
  Search,
  SlidersHorizontal,
} from "lucide-react"

type ReportView = "weekly" | "monthly" | "yearly"
type StatusFilter =
  | "all"
  | "main_task_pending"
  | "quotation_pending"
  | "ready_to_start"
  | "in_progress"
  | "completed"
  | "cancelled"
type SortKey =
  | "updated_desc"
  | "updated_asc"
  | "title_asc"
  | "title_desc"
  | "budget_desc"
  | "profit_desc"

type ProjectStatus = Exclude<StatusFilter, "all">

type ProjectReportRow = {
  projectId: string
  projectCode: string
  title: string
  clientName: string
  siteAddress: string
  status: ProjectStatus
  priority: "low" | "medium" | "high"
  startDatetime: string | null
  endDatetime: string | null
  estimatedBudget: number
  estimatedCost: number
  estimatedProfit: number
  markupRate: number
  createdAt: string
  updatedAt: string
}

const demoProjects: ProjectReportRow[] = [
  {
    projectId: "p1",
    projectCode: "PP-94VS-MXUI",
    title: "Testing Project",
    clientName: "Daniel Foster",
    siteAddress: "71 Wellington Street Perth WA 6000 Australia",
    status: "quotation_pending",
    priority: "medium",
    startDatetime: "2026-04-27T08:00:00",
    endDatetime: "2026-05-03T17:00:00",
    estimatedBudget: 245300,
    estimatedCost: 176400,
    estimatedProfit: 68900,
    markupRate: 30,
    createdAt: "2026-04-25T09:30:00",
    updatedAt: "2026-04-27T14:01:00",
  },
  {
    projectId: "p2",
    projectCode: "PP-GE99-T2ZH",
    title: "Turner Residence Refresh",
    clientName: "Sophie Turner",
    siteAddress: "Royal Street",
    status: "in_progress",
    priority: "high",
    startDatetime: "2026-04-24T08:00:00",
    endDatetime: "2026-04-30T17:00:00",
    estimatedBudget: 188500,
    estimatedCost: 133200,
    estimatedProfit: 55300,
    markupRate: 28,
    createdAt: "2026-04-21T11:12:00",
    updatedAt: "2026-04-26T15:45:00",
  },
  {
    projectId: "p3",
    projectCode: "PP-YCQT-9KR2",
    title: "Living Room Repaint",
    clientName: "Amelia Grant",
    siteAddress: "Cebu City",
    status: "completed",
    priority: "low",
    startDatetime: "2026-04-15T09:00:00",
    endDatetime: "2026-04-18T16:30:00",
    estimatedBudget: 82500,
    estimatedCost: 57100,
    estimatedProfit: 25400,
    markupRate: 25,
    createdAt: "2026-04-10T10:00:00",
    updatedAt: "2026-04-18T16:50:00",
  },
]

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader =
  "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

const inputBase =
  "h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100"

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

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

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function formatDateTime(value: string | null) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function currency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value)
}

function statusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    main_task_pending: "Main Task Pending",
    quotation_pending: "Quotation Pending",
    ready_to_start: "Ready to Start",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  }

  return labels[status] ?? status
}

function statusBadgeClass(status: ProjectStatus) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300"
  }

  if (status === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300"
  }

  if (status === "ready_to_start") {
    return "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300"
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
}

function priorityBadgeClass(priority: ProjectReportRow["priority"]) {
  if (priority === "high") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }

  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
  }

  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

function parseDateOrNull(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return startOfDay(date)
}

function isWithinRange(date: Date, start: Date, end: Date) {
  const t = date.getTime()

  return t >= start.getTime() && t <= end.getTime()
}

export default function ReportListPage() {
  const [view, setView] = useState<ReportView>("monthly")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc")

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()

    let rows = demoProjects.filter((project) => {
      const updated = parseDateOrNull(project.updatedAt)
      const matchesRange = updated ? isWithinRange(updated, range.start, range.end) : true

      const matchesSearch =
        !q ||
        `${project.projectCode} ${project.title} ${project.clientName} ${project.siteAddress}`
          .toLowerCase()
          .includes(q)

      const matchesStatus = statusFilter === "all" || project.status === statusFilter

      return matchesRange && matchesSearch && matchesStatus
    })

    rows = rows.slice().sort((a, b) => {
      if (sortKey === "updated_asc") return Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
      if (sortKey === "title_asc") return a.title.localeCompare(b.title)
      if (sortKey === "title_desc") return b.title.localeCompare(a.title)
      if (sortKey === "budget_desc") return b.estimatedBudget - a.estimatedBudget
      if (sortKey === "profit_desc") return b.estimatedProfit - a.estimatedProfit

      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })

    return rows
  }, [query, range.start, range.end, statusFilter, sortKey])

  const totals = useMemo(() => {
    return filteredProjects.reduce(
      (sum, project) => {
        sum.budget += project.estimatedBudget
        sum.cost += project.estimatedCost
        sum.profit += project.estimatedProfit

        return sum
      },
      {
        budget: 0,
        cost: 0,
        profit: 0,
      }
    )
  }, [filteredProjects])

  return (
    <div className="min-h-full bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Link
              href="/admin/report"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
            >
              <ChevronLeft className="h-4 w-4" />
              Report
            </Link>
            <span className="text-gray-400 dark:text-slate-500">/</span>
            <span className="text-gray-900 dark:text-slate-100">Project List</span>
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Project Report List
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            Review project records, financial estimates, schedules, and progress status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ReportView)}
            className={inputBase}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <Link
            href="/admin/report"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"
          >
            Overview
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Projects
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-slate-100">
              {filteredProjects.length}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Matching projects in selected range
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <PhilippinePeso className="h-4 w-4" />
              Total Budget
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-slate-100">
              {currency(totals.budget)}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Combined estimated project budget
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <PhilippinePeso className="h-4 w-4" />
              Estimated Profit
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-slate-100">
              {currency(totals.profit)}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Revenue estimate less estimated cost
            </div>
          </div>
        </div>
      </div>

      <div className={`mt-4 ${cardShell} ${cardAccent}`}>
        <div className={sectionHeader}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                Projects Table
              </div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                Range: <span className="font-semibold">{rangeText}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects, clients, locations"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400 sm:w-[300px]"
                />
              </div>

              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-[210px]"
                >
                  <option value="all">All statuses</option>
                  <option value="main_task_pending">Main Task Pending</option>
                  <option value="quotation_pending">Quotation Pending</option>
                  <option value="ready_to_start">Ready to Start</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
              </div>

              <div className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-[185px]"
                >
                  <option value="updated_desc">Latest Updated</option>
                  <option value="updated_asc">Oldest Updated</option>
                  <option value="title_asc">Title A-Z</option>
                  <option value="title_desc">Title Z-A</option>
                  <option value="budget_desc">Highest Budget</option>
                  <option value="profit_desc">Highest Profit</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>

            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-slate-700/70 dark:bg-slate-900/35 dark:text-slate-400">
                <th className="px-4 py-2.5 text-left align-middle">Project Code</th>
                <th className="px-3 py-2.5 text-left align-middle">Project</th>
                <th className="px-3 py-2.5 text-left align-middle">Client</th>
                <th className="px-3 py-2.5 text-left align-middle">Site Address</th>
                <th className="px-3 py-2.5 text-left align-middle">Status</th>
                <th className="px-3 py-2.5 text-left align-middle">Priority</th>
                <th className="px-3 py-2.5 text-left align-middle">Start</th>
                <th className="px-3 py-2.5 text-left align-middle">End</th>
                <th className="px-3 py-2.5 text-right align-middle">Budget</th>
                <th className="px-4 py-2.5 text-right align-middle">Profit</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {filteredProjects.map((project) => (
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
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-950 dark:text-slate-100">
                        {project.title}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        Created {formatDate(project.createdAt)}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div className="truncate text-gray-700 dark:text-slate-300" title={project.clientName}>
                      {project.clientName}
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div className="line-clamp-2 break-words text-sm leading-5 text-gray-700 dark:text-slate-300" title={project.siteAddress}>
                      {project.siteAddress}
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <span
                      className={[
                        "inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                        statusBadgeClass(project.status),
                      ].join(" ")}
                    >
                      <span className="truncate">{statusLabel(project.status)}</span>
                    </span>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <span
                      className={[
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize",
                        priorityBadgeClass(project.priority),
                      ].join(" ")}
                    >
                      {project.priority}
                    </span>
                  </td>

                  <td className="px-3 py-3 align-middle text-xs leading-5 text-gray-700 dark:text-slate-300">
                    {formatDateTime(project.startDatetime)}
                  </td>

                  <td className="px-3 py-3 align-middle text-xs leading-5 text-gray-700 dark:text-slate-300">
                    {formatDateTime(project.endDatetime)}
                  </td>

                  <td className="px-3 py-3 text-right align-middle">
                    <div className="font-semibold text-gray-950 dark:text-slate-100">
                      {currency(project.estimatedBudget)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      Cost {currency(project.estimatedCost)}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right align-middle">
                    <div className="font-semibold text-[#047857] dark:text-emerald-300">
                      {currency(project.estimatedProfit)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      {project.markupRate}% markup
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProjects.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gray-50 dark:bg-slate-700">
                <CalendarDays className="h-5 w-5 text-gray-400 dark:text-slate-400" />
              </div>
              <div className="mt-3 text-sm font-semibold text-gray-950 dark:text-slate-100">
                No matching projects
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Try changing the search, status filter, sort option, or report range.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}