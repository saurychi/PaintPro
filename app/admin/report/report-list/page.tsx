"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PhilippinePeso,
  Search,
  SlidersHorizontal,
} from "lucide-react"

import {
  getReportProjects,
  type ReportProjectRow,
} from "@/lib/data/reports.repo"

type ReportView = "weekly" | "monthly" | "yearly"
type SortKey =
  | "updated_desc"
  | "updated_asc"
  | "title_asc"
  | "title_desc"
  | "budget_desc"
  | "profit_desc"

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

function formatDate(value: string | null) {
  if (!value) return "—"

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

function titleCaseStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    main_task_pending: "Main Task Pending",
    sub_task_pending: "Sub Task Pending",
    materials_pending: "Materials Pending",
    equipment_pending: "Equipment Pending",
    schedule_pending: "Schedule Pending",
    employee_assignment_pending: "Employee Assignment Pending",
    cost_estimation_pending: "Cost Estimation Pending",
    overview_pending: "Overview Pending",
    quotation_pending: "Quotation Pending",
    invoice_agreement_pending: "Invoice Agreement Pending",
    invoice_pending: "Invoice Pending",
    payment_pending: "Payment Pending",
    ready_to_start: "Ready to Start",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  }

  return labels[status] ?? titleCaseStatus(status)
}

function statusBadgeClass(status: string) {
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

  if (
    status.includes("pending") ||
    status.includes("quotation") ||
    status.includes("invoice") ||
    status.includes("payment")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
  }

  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

function priorityBadgeClass(priority: ReportProjectRow["priority"]) {
  if (priority === "high") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }

  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
  }

  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

export default function ReportListPage() {
  const [view, setView] = useState<ReportView>("monthly")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc")
  const [projects, setProjects] = useState<ReportProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  useEffect(() => {
    let cancelled = false

    async function loadProjects() {
      setLoading(true)
      setLoadError(null)

      try {
        const rows = await getReportProjects({
          rangeStartISO: range.start.toISOString(),
          rangeEndISO: range.end.toISOString(),
          status: statusFilter,
          sort: sortKey,
        })

        if (!cancelled) {
          setProjects(rows)
        }
      } catch (error: any) {
        if (!cancelled) {
          setProjects([])
          setLoadError(error?.message ?? "Failed to load project reports")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProjects()

    return () => {
      cancelled = true
    }
  }, [range.start, range.end, statusFilter, sortKey])

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) return projects

    return projects.filter((project) => {
      return `${project.projectCode} ${project.title} ${project.clientName} ${project.siteAddress} ${project.status}`
        .toLowerCase()
        .includes(q)
    })
  }, [projects, query])

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
              {loading ? "—" : filteredProjects.length}
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
              {loading ? "—" : currency(totals.budget)}
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
              {loading ? "—" : currency(totals.profit)}
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
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-[230px]"
                >
                  <option value="all">All statuses</option>
                  <option value="main_task_pending">Main Task Pending</option>
                  <option value="sub_task_pending">Sub Task Pending</option>
                  <option value="materials_pending">Materials Pending</option>
                  <option value="equipment_pending">Equipment Pending</option>
                  <option value="schedule_pending">Schedule Pending</option>
                  <option value="employee_assignment_pending">Employee Assignment Pending</option>
                  <option value="cost_estimation_pending">Cost Estimation Pending</option>
                  <option value="overview_pending">Overview Pending</option>
                  <option value="quotation_pending">Quotation Pending</option>
                  <option value="invoice_agreement_pending">Invoice Agreement Pending</option>
                  <option value="invoice_pending">Invoice Pending</option>
                  <option value="payment_pending">Payment Pending</option>
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
                    <div
                      className="truncate text-gray-700 dark:text-slate-300"
                      title={project.clientName}
                    >
                      {project.clientName}
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div
                      className="line-clamp-2 break-words text-sm leading-5 text-gray-700 dark:text-slate-300"
                      title={project.siteAddress}
                    >
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

          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-semibold text-gray-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading project reports...
            </div>
          )}

          {!loading && loadError && (
            <div className="px-4 py-12 text-center">
              <div className="text-sm font-semibold text-red-600 dark:text-red-300">
                Failed to load project reports
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                {loadError}
              </div>
            </div>
          )}

          {!loading && !loadError && filteredProjects.length === 0 && (
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