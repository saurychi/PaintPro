"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  StickyNote,
  User,
  Users,
  Wrench,
} from "lucide-react"

type ProjectDetail = {
  projectId: string
  projectCode: string | null
  title: string | null
  description: string | null
  siteAddress: string | null
  status: string | null
  priority: string | null
  scheduledStartDatetime: string | null
  scheduledEndDatetime: string | null
  estimatedBudget: number
  estimatedCost: number
  estimatedProfit: number
  materialsCost: number
  laborCost: number
  markupRate: number
  downpayment: number
  notes: string | null
  dimensions: unknown
  createdAt: string | null
  updatedAt: string | null
}

type ClientDetail = {
  clientId: string
  fullName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

type CreatorDetail = {
  id: string
  username: string | null
  email: string | null
  role: string | null
}

type DetailResponse = {
  project: ProjectDetail
  client: ClientDetail | null
  creator: CreatorDetail | null
}

type OverviewMaterial = {
  project_task_material_id: string
  material_id: string
  name: string
  unit: string | null
  unit_cost: number | null
  estimated_quantity: number | null
  estimated_cost: number | null
}

type OverviewEquipment = {
  name: string
  notes: string | null
}

type OverviewStaff = {
  project_sub_task_staff_id: string
  user_id: string
  user: {
    id: string
    username: string | null
    email: string | null
    specialty?: unknown
  } | null
}

type OverviewSubTask = {
  project_sub_task_id: string
  description: string
  estimated_hours: number | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
  actual_start_datetime: string | null
  actual_end_datetime: string | null
  status: string | null
  sort_order: number | null
  equipments_used: OverviewEquipment[]
  assigned_staff: OverviewStaff[]
}

type OverviewMainTask = {
  project_task_id: string
  main_task_id: string
  title: string
  sort_order: number | null
  materials: OverviewMaterial[]
  subtasks: OverviewSubTask[]
}

type OverviewResponse = {
  project: {
    project_id: string
    status: string | null
  }
  mainTasks: OverviewMainTask[]
}

const cardShell =
  "overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader =
  "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

function currency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value)
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

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

function titleCaseStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function statusLabel(status: string | null | undefined) {
  return titleCaseStatus(normalizeStatus(status))
}

function statusBadgeClass(status: string | null | undefined) {
  const normalized = normalizeStatus(status)

  if (normalized === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300"
  }
  if (normalized === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300"
  }
  if (normalized === "ready_to_start") {
    return "border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300"
  }
  if (normalized === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("quotation") ||
    normalized.includes("invoice") ||
    normalized.includes("payment")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
  }
  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

function priorityBadgeClass(priority: string | null | undefined) {
  const normalized = String(priority ?? "").toLowerCase()
  if (normalized === "high") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }
  if (normalized === "low") {
    return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300"
}

function specialtyList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function staffDisplayName(staff: OverviewStaff) {
  return staff.user?.username || staff.user?.email || "Assigned staff"
}

type ScheduleVarianceVariant = "early" | "late" | "ontime"

type ScheduleVariance = {
  variant: ScheduleVarianceVariant
  label: string
}

// Diff the subtask's actual finish against its scheduled finish. Within
// an hour either way reads as "On time" since the live timer rarely
// lines up with the planned ISO down to the minute. Returns null when
// either timestamp is missing, so callers can skip the badge entirely
// for unfinished or schedule-less subtasks.
function getScheduleVariance(
  actualEnd: string | null | undefined,
  scheduledEnd: string | null | undefined,
): ScheduleVariance | null {
  if (!actualEnd || !scheduledEnd) return null

  const actualMs = new Date(actualEnd).getTime()
  const scheduledMs = new Date(scheduledEnd).getTime()
  if (!Number.isFinite(actualMs) || !Number.isFinite(scheduledMs)) return null

  const diffMs = actualMs - scheduledMs
  const ONE_HOUR = 60 * 60 * 1000
  if (Math.abs(diffMs) <= ONE_HOUR) {
    return { variant: "ontime", label: "On time" }
  }

  const abs = Math.abs(diffMs)
  const days = Math.floor(abs / (24 * ONE_HOUR))
  const hours = Math.floor((abs % (24 * ONE_HOUR)) / ONE_HOUR)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (parts.length === 0) parts.push("<1h")

  const prefix = diffMs > 0 ? "Late" : "Early"
  return {
    variant: diffMs > 0 ? "late" : "early",
    label: `${prefix} by ${parts.join(" ")}`,
  }
}

function scheduleVarianceBadgeClass(variant: ScheduleVarianceVariant) {
  if (variant === "late") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
  }
  if (variant === "early") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300"
  }
  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/35">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {label}
        </div>
        <div className="wrap-break-word text-[11px] font-semibold leading-tight text-gray-950 dark:text-slate-100">
          {value}
        </div>
      </div>
    </div>
  )
}

function FinancialBlock({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: "profit" | "loss" | null
}) {
  const valueClass =
    emphasis === "profit"
      ? "text-[#047857] dark:text-emerald-300"
      : emphasis === "loss"
        ? "text-red-600 dark:text-red-300"
        : "text-gray-950 dark:text-slate-100"

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/35">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold leading-tight ${valueClass}`}>
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 line-clamp-1 text-[10px] text-gray-500 dark:text-slate-400">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export default function ProjectReportDetailPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId

  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(
    new Set(),
  )
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(
    new Set(),
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [detailRes, overviewRes] = await Promise.all([
          fetch(
            `/api/reports/project-detail?projectId=${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/planning/getProjectOverview?projectId=${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          ),
        ])

        const detailData = await detailRes.json().catch(() => null)
        const overviewData = await overviewRes.json().catch(() => null)

        if (!detailRes.ok) {
          throw new Error(
            [detailData?.error, detailData?.details].filter(Boolean).join(": ") ||
              "Failed to load project detail.",
          )
        }
        if (!overviewRes.ok) {
          throw new Error(
            [overviewData?.error, overviewData?.details]
              .filter(Boolean)
              .join(": ") || "Failed to load project overview.",
          )
        }

        if (!cancelled) {
          setDetail(detailData as DetailResponse)
          setOverview({
            project: overviewData.project,
            mainTasks: Array.isArray(overviewData.mainTasks)
              ? overviewData.mainTasks
              : [],
          })
          setExpandedTasks(new Set())
          setExpandedSubtasks(new Set())
          setExpandedMaterials(new Set())
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load project.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (projectId) load()

    return () => {
      cancelled = true
    }
  }, [projectId])

  const project = detail?.project ?? null
  const client = detail?.client ?? null
  const creator = detail?.creator ?? null
  const mainTasks = useMemo(() => overview?.mainTasks ?? [], [overview])

  const totals = useMemo(() => {
    const allSubtasks = mainTasks.flatMap((task) => task.subtasks)
    const allMaterials = mainTasks.flatMap((task) => task.materials)
    const totalHours = allSubtasks.reduce(
      (sum, st) => sum + Number(st.estimated_hours ?? 0),
      0,
    )
    const totalStaff = new Set(
      allSubtasks.flatMap((st) =>
        st.assigned_staff.map((s) => s.user_id).filter(Boolean),
      ),
    ).size

    return {
      mainTasks: mainTasks.length,
      subtasks: allSubtasks.length,
      materials: allMaterials.length,
      hours: totalHours,
      staff: totalStaff,
    }
  }, [mainTasks])

  function toggleTask(id: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSubtask(id: string) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMaterials(id: string) {
    setExpandedMaterials((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function openPrintPdfWindow() {
    if (!project?.projectId) return

    const pdfUrl = `/api/reports/project-detail/pdf?projectId=${encodeURIComponent(
      project.projectId,
    )}`

    const printWindow = window.open(
      pdfUrl,
      `project-report-${project.projectId}`,
      [
        "popup=yes",
        "width=1100",
        "height=800",
        "left=120",
        "top=80",
        "resizable=yes",
        "scrollbars=yes",
        "toolbar=no",
        "menubar=no",
        "location=no",
        "status=no",
      ].join(","),
    )

    if (printWindow) {
      printWindow.focus()
    } else {
      window.location.href = pdfUrl
    }
  }

  return (
    <div className="flex h-[calc(100dvh-0.75rem)] min-h-[520px] flex-col overflow-hidden bg-[#f7f8fa] px-4 py-3 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <div className="mb-2 flex shrink-0 items-center gap-2 text-xs font-semibold">
        <Link
          href="/admin/report"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15">
          Report
        </Link>
        <span className="text-gray-400 dark:text-slate-500">/</span>
        <Link
          href="/admin/report/report-list"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15">
          Project List
        </Link>
        <span className="text-gray-400 dark:text-slate-500">/</span>
        <span className="text-gray-900 dark:text-slate-100">
          {project?.projectCode || "Project"}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading project details...
        </div>
      ) : error ? (
        <div className="shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs dark:border-red-400/25 dark:bg-red-500/15">
          <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            Could not load project
          </div>
          <div className="mt-1 text-red-600 dark:text-red-200">{error}</div>
        </div>
      ) : !project ? (
        <div className="shrink-0 rounded-md border border-gray-200 bg-white p-6 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Project not found.
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
                  {project.title || "Untitled Project"}
                </h1>
                <span className="rounded-sm bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-300">
                  {project.projectCode || "—"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                    statusBadgeClass(project.status),
                  ].join(" ")}>
                  {statusLabel(project.status)}
                </span>
                {project.priority ? (
                  <span
                    className={[
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                      priorityBadgeClass(project.priority),
                    ].join(" ")}>
                    {titleCaseStatus(project.priority)} priority
                  </span>
                ) : null}
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  Updated {formatDate(project.updatedAt)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openPrintPdfWindow}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#00c065]/30 bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] dark:border-[#00c065]/40 dark:bg-[#00c065] dark:hover:bg-[#00a054]">
                <Printer className="h-4 w-4" />
                Print PDF
              </button>
              <a
                href={`/api/reports/project-detail/pdf?projectId=${encodeURIComponent(
                  project.projectId,
                )}&download=1`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300">
                <FileText className="h-4 w-4" />
                Save PDF
              </a>
              <a
                href={`/api/reports/project-detail/csv?projectId=${encodeURIComponent(
                  project.projectId,
                )}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300">
                <Download className="h-4 w-4" />
                CSV
              </a>
              <Link
                href="/admin/report/report-list"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300">
                <ChevronLeft className="h-4 w-4" />
                Back to list
              </Link>
            </div>
          </div>

          <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:auto-rows-fr lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-7 lg:order-2">
              <section className={`${cardShell} ${cardAccent} flex min-h-0 flex-1 flex-col`}>
                <div className={`${sectionHeader} shrink-0`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                        Tasks &amp; Workflow
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        {totals.mainTasks} main task
                        {totals.mainTasks === 1 ? "" : "s"} ·{" "}
                        {totals.subtasks} subtask
                        {totals.subtasks === 1 ? "" : "s"} ·{" "}
                        {totals.materials} material entr
                        {totals.materials === 1 ? "y" : "ies"} ·{" "}
                        {totals.hours} estimated hour
                        {totals.hours === 1 ? "" : "s"} · {totals.staff} staff
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto thin-scrollbar p-4">
                  {mainTasks.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
                      No main tasks have been generated for this project.
                    </div>
                  ) : (
                    mainTasks.map((task) => {
                      const isOpen = expandedTasks.has(task.project_task_id)
                      return (
                        <div
                          key={task.project_task_id}
                          className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <button
                            type="button"
                            onClick={() => toggleTask(task.project_task_id)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                              isOpen
                                ? "bg-emerald-50/40 dark:bg-emerald-500/10"
                                : "bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                            }`}>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                                {task.title}
                              </div>
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                                {task.subtasks.length} subtask
                                {task.subtasks.length === 1 ? "" : "s"} ·{" "}
                                {task.materials.length} material
                                {task.materials.length === 1 ? "" : "s"}
                              </div>
                            </div>
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            />
                          </button>

                          {isOpen ? (
                            <div className="border-t border-gray-200 bg-gray-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/30">
                              <div className="space-y-3">
                                {(() => {
                                  const isMatOpen = expandedMaterials.has(
                                    task.project_task_id,
                                  )
                                  return (
                                    <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/70">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleMaterials(
                                            task.project_task_id,
                                          )
                                        }
                                        className={`flex w-full items-center justify-between gap-3 p-3 text-left transition ${
                                          isMatOpen
                                            ? "bg-emerald-50/40 dark:bg-emerald-500/10"
                                            : "hover:bg-gray-50 dark:hover:bg-slate-800/60"
                                        }`}>
                                        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                          <Package className="h-3.5 w-3.5" />
                                          Materials
                                          <span className="text-gray-400 dark:text-slate-500">
                                            ({task.materials.length})
                                          </span>
                                        </div>
                                        <ChevronRight
                                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${
                                            isMatOpen ? "rotate-90" : ""
                                          }`}
                                        />
                                      </button>

                                      {isMatOpen ? (
                                        <div className="border-t border-gray-200 bg-gray-50/60 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                                          {task.materials.length === 0 ? (
                                            <div className="text-xs text-gray-500 dark:text-slate-400">
                                              No materials assigned.
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              {task.materials.map(
                                                (material) => (
                                                  <div
                                                    key={
                                                      material.project_task_material_id
                                                    }
                                                    className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                                    <div className="flex items-start justify-between gap-3">
                                                      <div className="min-w-0">
                                                        <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">
                                                          {material.name}
                                                        </div>
                                                        <div className="mt-0.5 text-[10px] text-gray-500 dark:text-slate-400">
                                                          {Number(
                                                            material.estimated_quantity ??
                                                              0,
                                                          )}{" "}
                                                          {material.unit ??
                                                            "unit"}
                                                          {material.unit_cost !=
                                                          null
                                                            ? ` · @ ${currency(Number(material.unit_cost))}`
                                                            : ""}
                                                        </div>
                                                      </div>
                                                      <div className="shrink-0 text-right text-xs font-semibold text-gray-900 dark:text-slate-100">
                                                        {currency(
                                                          Number(
                                                            material.estimated_cost ??
                                                              0,
                                                          ),
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })()}

                                <div className="space-y-3">
                                  {task.subtasks.length === 0 ? (
                                    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                                      No subtasks assigned.
                                    </div>
                                  ) : (
                                    task.subtasks.map((subtask) => {
                                      const isSubOpen = expandedSubtasks.has(
                                        subtask.project_sub_task_id,
                                      )
                                      const variance = getScheduleVariance(
                                        subtask.actual_end_datetime,
                                        subtask.scheduled_end_datetime,
                                      )
                                      return (
                                        <div
                                          key={subtask.project_sub_task_id}
                                          className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/70">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              toggleSubtask(
                                                subtask.project_sub_task_id,
                                              )
                                            }
                                            className={`flex w-full items-start justify-between gap-3 p-3 text-left transition ${
                                              isSubOpen
                                                ? "bg-emerald-50/40 dark:bg-emerald-500/10"
                                                : "hover:bg-gray-50 dark:hover:bg-slate-800/60"
                                            }`}>
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                                                {subtask.description}
                                              </div>
                                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-slate-400">
                                                <span>
                                                  {Number(
                                                    subtask.estimated_hours ??
                                                      0,
                                                  )}{" "}
                                                  est. h
                                                </span>
                                                <span>•</span>
                                                <span>
                                                  {statusLabel(subtask.status)}
                                                </span>
                                                {variance ? (
                                                  <>
                                                    <span>•</span>
                                                    <span
                                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scheduleVarianceBadgeClass(variance.variant)}`}
                                                    >
                                                      {variance.label}
                                                    </span>
                                                  </>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="flex shrink-0 items-start gap-2">
                                              <div className="text-right text-[10px] leading-5 text-gray-500 dark:text-slate-400">
                                                <div>
                                                  {formatDateTime(
                                                    subtask.scheduled_start_datetime,
                                                  )}
                                                </div>
                                                <div>
                                                  {formatDateTime(
                                                    subtask.scheduled_end_datetime,
                                                  )}
                                                </div>
                                              </div>
                                              <ChevronRight
                                                className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${
                                                  isSubOpen ? "rotate-90" : ""
                                                }`}
                                              />
                                            </div>
                                          </button>

                                          {isSubOpen ? (
                                            <div className="space-y-2 border-t border-gray-200 bg-gray-50/60 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/30">
                                              <div className="rounded-md border border-gray-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/70">
                                                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                                  <Users className="h-3.5 w-3.5" />
                                                  Assigned Staff
                                                </div>
                                                {subtask.assigned_staff.length ===
                                                0 ? (
                                                  <div className="text-xs text-gray-500 dark:text-slate-400">
                                                    No staff assigned.
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-wrap gap-2">
                                                    {subtask.assigned_staff.map(
                                                      (staff) => {
                                                        const specialties =
                                                          specialtyList(
                                                            staff.user
                                                              ?.specialty ??
                                                              null,
                                                          )
                                                        return (
                                                          <div
                                                            key={
                                                              staff.project_sub_task_staff_id
                                                            }
                                                            className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-950/30">
                                                            <div className="text-xs font-semibold text-gray-900 dark:text-slate-100">
                                                              {staffDisplayName(
                                                                staff,
                                                              )}
                                                            </div>
                                                            {specialties.length >
                                                            0 ? (
                                                              <div className="mt-1 flex flex-wrap gap-1">
                                                                {specialties.map(
                                                                  (
                                                                    specialty,
                                                                  ) => (
                                                                    <span
                                                                      key={`${staff.project_sub_task_staff_id}-${specialty}`}
                                                                      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300">
                                                                      {specialty}
                                                                    </span>
                                                                  ),
                                                                )}
                                                              </div>
                                                            ) : null}
                                                          </div>
                                                        )
                                                      },
                                                    )}
                                                  </div>
                                                )}
                                              </div>

                                              <div className="rounded-md border border-gray-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/70">
                                                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                                  <Wrench className="h-3.5 w-3.5" />
                                                  Equipment
                                                </div>
                                                {subtask.equipments_used
                                                  .length === 0 ? (
                                                  <div className="text-xs text-gray-500 dark:text-slate-400">
                                                    No equipment listed.
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {subtask.equipments_used.map(
                                                      (equipment, index) => (
                                                        <span
                                                          key={`${subtask.project_sub_task_id}-${equipment.name}-${index}`}
                                                          className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                          {equipment.name}
                                                        </span>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            </div>

            <aside className="grid min-h-0 grid-cols-1 gap-3 lg:col-span-5 lg:order-1 lg:auto-rows-fr lg:grid-cols-2 lg:overflow-hidden">
              <section className={`${cardShell} ${cardAccent} flex min-h-0 flex-col`}>
                <div className={`${sectionHeader} shrink-0`}>
                  <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                    Client
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto thin-scrollbar p-3">
                  {client ? (
                    <>
                      <MetaRow
                        icon={<User className="h-3.5 w-3.5" />}
                        label="Name"
                        value={client.fullName || "—"}
                      />
                      {client.phone ? (
                        <MetaRow
                          icon={<Phone className="h-3.5 w-3.5" />}
                          label="Phone"
                          value={
                            <a
                              href={`tel:${client.phone}`}
                              className="text-[#047857] hover:underline dark:text-emerald-300">
                              {client.phone}
                            </a>
                          }
                        />
                      ) : null}
                      {client.email ? (
                        <MetaRow
                          icon={<Mail className="h-3.5 w-3.5" />}
                          label="Email"
                          value={
                            <a
                              href={`mailto:${client.email}`}
                              className="truncate text-[#047857] hover:underline dark:text-emerald-300">
                              {client.email}
                            </a>
                          }
                        />
                      ) : null}
                      {client.address ? (
                        <MetaRow
                          icon={<MapPin className="h-3.5 w-3.5" />}
                          label="Address"
                          value={client.address}
                        />
                      ) : null}
                      {client.notes ? (
                        <MetaRow
                          icon={<StickyNote className="h-3.5 w-3.5" />}
                          label="Notes"
                          value={
                            <span className="block whitespace-pre-wrap text-[11px] font-normal text-gray-700 dark:text-slate-300">
                              {client.notes}
                            </span>
                          }
                        />
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
                      No client linked to this project.
                    </div>
                  )}
                </div>
              </section>

              <section className={`${cardShell} ${cardAccent} flex min-h-0 flex-col`}>
                <div className={`${sectionHeader} shrink-0`}>
                  <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                    Financials
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto thin-scrollbar p-3">
                  <FinancialBlock
                    label="Budget"
                    value={currency(project.estimatedBudget)}
                    hint={`${project.markupRate}% markup`}
                  />
                  <FinancialBlock
                    label="Cost"
                    value={currency(project.estimatedCost)}
                    hint={`Mat ${currency(project.materialsCost)}`}
                  />
                  <FinancialBlock
                    label="Profit"
                    value={currency(project.estimatedProfit)}
                    hint="Budget less cost"
                    emphasis={
                      project.estimatedProfit >= 0 ? "profit" : "loss"
                    }
                  />
                  <FinancialBlock
                    label="Downpayment"
                    value={currency(project.downpayment)}
                    hint="Upfront"
                  />
                </div>
              </section>

              <section className={`${cardShell} ${cardAccent} flex min-h-0 flex-col`}>
                <div className={`${sectionHeader} shrink-0`}>
                  <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                    Schedule
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto thin-scrollbar p-3">
                  <MetaRow
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Start"
                    value={formatDateTime(project.scheduledStartDatetime)}
                  />
                  <MetaRow
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="End"
                    value={formatDateTime(project.scheduledEndDatetime)}
                  />
                  <MetaRow
                    icon={<MapPin className="h-3.5 w-3.5" />}
                    label="Site Address"
                    value={project.siteAddress || "—"}
                  />
                </div>
              </section>

              <section className={`${cardShell} ${cardAccent} flex min-h-0 flex-col`}>
                <div className={`${sectionHeader} shrink-0`}>
                  <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">
                    Record Info
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto thin-scrollbar p-3">
                  <MetaRow
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Created"
                    value={formatDateTime(project.createdAt)}
                  />
                  <MetaRow
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Last Updated"
                    value={formatDateTime(project.updatedAt)}
                  />
                  <MetaRow
                    icon={<User className="h-3.5 w-3.5" />}
                    label="Created By"
                    value={
                      creator
                        ? creator.username || creator.email || "—"
                        : "—"
                    }
                  />
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      <style jsx global>{`
        .thin-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
        }
        .thin-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .thin-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.55);
          border-radius: 9999px;
        }
        .thin-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(100, 116, 139, 0.75);
        }
      `}</style>
    </div>
  )
}
