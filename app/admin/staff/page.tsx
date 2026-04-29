"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, Filter, Loader2, MessageSquare, MoreVertical, Search } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskEntry = {
  taskDescription: string | null
  mainTaskName: string | null
  taskStatus: string | null
  assignmentStatus: string | null
  startDate: string | null
  endDate: string | null
  estimatedHours: number | null
}

type ProjectTimelineEntry = {
  projectId: string
  projectName: string
  siteAddress: string | null
  projectStatus: string | null
  tasks: TaskEntry[]
}

type PerformanceCard = {
  key: string
  metric: string
  rating: string | null
  score: number
}

type PerformanceData = {
  hasData: boolean
  cards: PerformanceCard[]
  projectCount: number
  totalHours: number
}

type Employee = {
  id: string
  name: string
  email: string
  phone: string | null
  photoUrl: string | null
  status: string
  specialty: string | null
  performance: PerformanceData | null   // null = not yet loaded
  workTimeline: ProjectTimelineEntry[] | null  // null = not yet loaded
}

type EmployeeInput = {
  name: string
  email: string
  phone: string
  photoUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "—"
  if (!end) return formatDate(start)
  return `${formatDate(start)} → ${formatDate(end)}`
}

function statusLabel(s: string | null) {
  if (!s) return "—"
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const TASK_STATUS_PILL: Record<string, string> = {
  completed:   "border-green-200 bg-green-50 text-green-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  upcoming:    "border-sky-200 bg-sky-50 text-sky-700",
  assigned:    "border-gray-200 bg-gray-100 text-gray-700",
}
function taskStatusPill(s: string | null) {
  if (!s) return "border-gray-200 bg-gray-100 text-gray-500"
  return TASK_STATUS_PILL[s.toLowerCase()] ?? "border-gray-200 bg-gray-100 text-gray-700"
}

const RATING_STYLE: Record<string, { text: string; bar: string; bg: string; border: string }> = {
  great: { text: "text-emerald-700", bar: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200" },
  good:  { text: "text-blue-700",    bar: "bg-blue-500",    bg: "bg-blue-50",     border: "border-blue-200"    },
  bad:   { text: "text-amber-700",   bar: "bg-amber-500",   bg: "bg-amber-50",    border: "border-amber-200"   },
  awful: { text: "text-red-700",     bar: "bg-red-500",     bg: "bg-red-50",      border: "border-red-200"     },
}
function ratingStyle(r: string | null) {
  if (!r) return { text: "text-gray-400", bar: "bg-gray-200", bg: "bg-gray-50", border: "border-gray-200" }
  return RATING_STYLE[r.toLowerCase()] ?? { text: "text-gray-600", bar: "bg-gray-300", bg: "bg-gray-50", border: "border-gray-200" }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Staff() {
  const router = useRouter()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openEmpId, setOpenEmpId] = useState<string | null>(null)
  const [loadingExpandId, setLoadingExpandId] = useState<string | null>(null)

  // Modals / dialogs
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [reportProject, setReportProject] = useState<ProjectTimelineEntry | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveBlockedMsg, setArchiveBlockedMsg] = useState<string | null>(null)
  const [archiveCheckingId, setArchiveCheckingId] = useState<string | null>(null)

  // Kebab + filter UI
  const [openKebabId, setOpenKebabId] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  // Search + filters
  const [searchQuery, setSearchQuery] = useState("")
  const [specialtyFilter, setSpecialtyFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Messaging
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messagingId, setMessagingId] = useState<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  // ── Fetch staff ───────────────────────────────────────────────────────────

  const fetchStaff = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/admin/staff")
      const json = await res.json()
      if (json.staff) {
        setEmployees(
          json.staff.map((u: any) => ({
            id: u.id,
            name: u.username || "",
            email: u.email || "",
            phone: u.phone ?? null,
            photoUrl: u.profile_image_url ?? null,
            status: u.status ?? "active",
            specialty: u.specialty ?? null,
            performance: null,
            workTimeline: null,
          })),
        )
      }
    } catch (e) {
      console.error("Failed to fetch staff:", e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  // ── Derived filter options (from DB-fetched employees) ────────────────────

  const uniqueSpecialties = useMemo(
    () => [...new Set(employees.map((e) => e.specialty).filter(Boolean) as string[])].sort(),
    [employees],
  )

  const uniqueStatuses = useMemo(
    () => [...new Set(employees.map((e) => e.status).filter((s) => s !== "archived"))].sort(),
    [employees],
  )

  const activeFilterCount =
    (specialtyFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (showArchived ? 1 : 0)

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    let list = showArchived
      ? employees
      : employees.filter((e) => e.status !== "archived")

    if (statusFilter)   list = list.filter((e) => e.status === statusFilter)
    if (specialtyFilter) list = list.filter((e) => e.specialty === specialtyFilter)

    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))

    return list
  }, [employees, searchQuery, statusFilter, specialtyFilter, showArchived])

  // ── Expand card — lazy load performance + timeline in parallel ────────────

  const toggleEmployee = async (empId: string) => {
    if (openEmpId === empId) { setOpenEmpId(null); return }
    setOpenEmpId(empId)

    const emp = employees.find((e) => e.id === empId)
    if (!emp || (emp.performance !== null && emp.workTimeline !== null)) return

    setLoadingExpandId(empId)
    try {
      const [perfJson, timelineJson] = await Promise.all([
        emp.performance === null
          ? fetch(`/api/admin/staff/performance?userId=${empId}`).then((r) => r.json())
          : Promise.resolve(null),
        emp.workTimeline === null
          ? fetch(`/api/staff/timeline?userId=${empId}`).then((r) => r.json())
          : Promise.resolve(null),
      ])

      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== empId) return e
          return {
            ...e,
            performance: perfJson ?? e.performance,
            workTimeline: timelineJson?.projects ?? e.workTimeline ?? [],
          }
        }),
      )
    } catch {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === empId
            ? { ...e, performance: e.performance ?? { hasData: false, cards: [], projectCount: 0, totalHours: 0 }, workTimeline: e.workTimeline ?? [] }
            : e,
        ),
      )
    } finally {
      setLoadingExpandId(null)
    }
  }

  // ── Edit employee ─────────────────────────────────────────────────────────

  const handleEdit = async (payload: EmployeeInput) => {
    if (!editTarget) return
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTarget.id, name: payload.name, email: payload.email, phone: payload.phone }),
      })
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === editTarget.id
              ? { ...e, name: payload.name, email: payload.email, phone: payload.phone || null }
              : e,
          ),
        )
      }
    } catch (e) {
      console.error("Failed to update staff:", e)
    }
    setEditTarget(null)
  }

  // ── Archive — pre-check for active assignments ────────────────────────────

  const initiateArchive = async (emp: Employee) => {
    setOpenKebabId(null)
    setArchiveCheckingId(emp.id)
    try {
      const res = await fetch(`/api/admin/staff/check-active?userId=${emp.id}`)
      const json = await res.json()
      if (json.hasActiveAssignments) {
        setArchiveBlockedMsg(
          `${emp.name} cannot be archived because they still have active projects or tasks assigned to them.`,
        )
      } else {
        setArchiveTarget(emp)
      }
    } catch {
      setArchiveBlockedMsg("Could not verify active assignments. Please try again.")
    } finally {
      setArchiveCheckingId(null)
    }
  }

  const handleArchive = async (emp: Employee) => {
    setArchiveBusy(true)
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emp.id, status: "archived" }),
      })
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, status: "archived" } : e)),
        )
        if (openEmpId === emp.id) setOpenEmpId(null)
      }
    } catch (e) {
      console.error("Failed to archive staff:", e)
    } finally {
      setArchiveBusy(false)
      setArchiveTarget(null)
    }
  }

  // ── Message ───────────────────────────────────────────────────────────────

  const handleMessage = async (emp: Employee) => {
    if (!currentUserId) return
    setMessagingId(emp.id)
    try {
      const res = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: emp.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to open conversation.")
      localStorage.setItem("pendingConvId", json.conversationId)
      router.push("/admin/messages")
    } catch (e) {
      console.error("Failed to open conversation:", e)
    } finally {
      setMessagingId(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>

      <div className="mt-6">
        {/* Header Row — no Add User button */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-700">Employees</div>
          <Link
            href="/admin/staff/staff-invite"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-all duration-200 hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
          >
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Invites
          </Link>
        </div>

        {/* Search + Filter icon — same row */}
        <div className="relative mb-4 flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name or email…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors focus:border-[#00c065]"
            />
          </div>

          {/* Filter icon — compact, expandable panel */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((p) => !p)}
              title="Filter staff"
              className={[
                "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition-all duration-200",
                activeFilterCount > 0
                  ? "border-[#00c065]/40 bg-emerald-50 text-[#00c065]"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700",
              ].join(" ")}
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#00c065] text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <>
                {/* Click-outside overlay */}
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />

                {/* Filter panel */}
                <div className="absolute right-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  <div className="p-3">
                    {/* Specialty */}
                    {uniqueSpecialties.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Specialty
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {uniqueSpecialties.map((sp) => (
                            <button
                              key={sp}
                              onClick={() => setSpecialtyFilter(specialtyFilter === sp ? null : sp)}
                              className={[
                                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                specialtyFilter === sp
                                  ? "border-[#00c065]/40 bg-emerald-50 text-[#00c065]"
                                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                              ].join(" ")}
                            >
                              {sp}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Status
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {uniqueStatuses.map((st) => (
                          <button
                            key={st}
                            onClick={() => setStatusFilter(statusFilter === st ? null : st)}
                            className={[
                              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors capitalize",
                              statusFilter === st
                                ? "border-[#00c065]/40 bg-emerald-50 text-[#00c065]"
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                            ].join(" ")}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Show Archived toggle — bottom strip */}
                  <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5">
                    <button
                      onClick={() => setShowArchived((p) => !p)}
                      className="flex w-full items-center justify-between text-sm text-gray-700"
                    >
                      <span className="font-medium">Archived</span>
                      <div
                        className={[
                          "relative h-5 w-9 rounded-full transition-colors duration-200",
                          showArchived ? "bg-[#00c065]" : "bg-gray-300",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                            showArchived ? "translate-x-4" : "translate-x-0.5",
                          ].join(" ")}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Global overlays */}
        {openKebabId && <div className="fixed inset-0 z-10" onClick={() => setOpenKebabId(null)} />}

        {/* Employee List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading staff…</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-500">
              {searchQuery.trim() || activeFilterCount > 0
                ? "No staff match your search or filters."
                : "No staff members yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEmployees.map((emp) => {
              const isOpen = openEmpId === emp.id
              const isArchived = emp.status === "archived"
              const empData = employees.find((e) => e.id === emp.id)
              const timelineData = empData?.workTimeline ?? null
              const perfData = empData?.performance ?? null

              return (
                <div
                  key={emp.id}
                  className={[
                    "rounded-lg border bg-white shadow-sm transition-colors",
                    isOpen ? "border-[#00c065]" : "border-gray-200",
                    isArchived ? "opacity-60" : "",
                  ].join(" ")}
                >
                  {/* Card row */}
                  <div className="flex items-center gap-3 px-6 py-4">
                    <button
                      onClick={() => toggleEmployee(emp.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <img
                        src={emp.photoUrl || "/paint_pro_logo.png"}
                        alt={emp.name}
                        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-gray-900">{emp.name}</span>
                          {isArchived && (
                            <span className="shrink-0 rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">{emp.email}</div>
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleMessage(emp)}
                        disabled={!currentUserId || messagingId === emp.id || isArchived}
                        title="Message"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {messagingId === emp.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <MessageSquare className="h-3.5 w-3.5" />}
                        Message
                      </button>

                      {/* ⋮ Kebab */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenKebabId(openKebabId === emp.id ? null : emp.id)
                          }}
                          disabled={archiveCheckingId === emp.id}
                          title="More actions"
                          className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                        >
                          {archiveCheckingId === emp.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <MoreVertical className="h-4 w-4" />}
                        </button>

                        {openKebabId === emp.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              onClick={() => { setEditTarget(emp); setOpenKebabId(null) }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Edit
                            </button>
                            {!isArchived && (
                              <button
                                onClick={() => initiateArchive(emp)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                Archive
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expand chevron */}
                      <button
                        onClick={() => toggleEmployee(emp.id)}
                        className="rounded-lg p-1 text-[#00c065] transition-colors hover:bg-gray-50"
                      >
                        <svg
                          width="20" height="20" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                          className={["shrink-0 transition-transform duration-200", isOpen ? "rotate-180" : ""].join(" ")}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      {/* Profile */}
                      <div className="px-6 py-5">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Profile</div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                            <img src={emp.photoUrl || "/paint_pro_logo.png"} alt={emp.name}
                              className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                            <div className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-10">
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">ID#:</span>
                                <span className="font-medium text-gray-900">{emp.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">Status:</span>
                                <span className={[
                                  "rounded-md px-2 py-0.5 text-xs font-semibold",
                                  emp.status === "active" ? "bg-emerald-50 text-emerald-700"
                                    : emp.status === "archived" ? "bg-gray-100 text-gray-500"
                                    : "bg-amber-50 text-amber-700",
                                ].join(" ")}>
                                  {statusLabel(emp.status)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">Phone:</span>
                                <span className="font-medium text-gray-900">{emp.phone || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">Email:</span>
                                <span className="font-medium text-gray-900">{emp.email}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Work */}
                      <div className="px-6 pb-6">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Work</div>

                        {loadingExpandId === emp.id ? (
                          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-10 shadow-sm">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-400">Loading work data…</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-2">
                            {/* Performance Score Cards */}
                            <div>
                              <div className="mb-3">
                                <span className="text-sm font-semibold text-gray-800">Performance</span>
                                <p className="mt-0.5 text-xs text-gray-400">Aggregated across all reviewed projects</p>
                              </div>
                              <PerformanceCards data={perfData} />
                            </div>

                            {/* Work Timeline */}
                            <div>
                              <div className="mb-3">
                                <span className="text-sm font-semibold text-gray-800">Work Timeline</span>
                                <p className="mt-0.5 text-xs text-gray-400">Projects assigned to this employee</p>
                              </div>
                              {!timelineData || timelineData.length === 0 ? (
                                <p className="py-4 text-center text-xs text-gray-400">No project assignments yet.</p>
                              ) : (
                                <div className="space-y-2">
                                  {timelineData.map((proj, i) => (
                                    <div key={proj.projectId || i}
                                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-gray-800">{proj.projectName}</div>
                                        {proj.siteAddress && (
                                          <div className="mt-0.5 truncate text-[11px] text-gray-400">{proj.siteAddress}</div>
                                        )}
                                        <div className="mt-1 text-[11px] text-[#00c065]">
                                          {proj.tasks.length} task{proj.tasks.length !== 1 ? "s" : ""}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setReportProject(proj)}
                                        className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                                      >
                                        See report
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      {editTarget && (
        <StaffModal
          mode="edit"
          initialData={{ name: editTarget.name, email: editTarget.email, phone: editTarget.phone || "", photoUrl: editTarget.photoUrl || "/paint_pro_logo.png" }}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {/* ── Archive — cannot archive (has active assignments) ─────────────── */}
      {archiveBlockedMsg && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
                <Archive className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Cannot Archive</h3>
            </div>
            <p className="mb-5 mt-2 text-sm text-gray-600">{archiveBlockedMsg}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setArchiveBlockedMsg(null)}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Confirmation ───────────────────────────────────────────── */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <Archive className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Archive employee?</h3>
            </div>
            <p className="mb-5 mt-2 text-sm text-gray-600">
              <strong>{archiveTarget.name}</strong> will be removed from the active staff list. You can view them
              by enabling "Archived" in the filter.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={archiveBusy}
                className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                No
              </button>
              <button
                onClick={() => handleArchive(archiveTarget)}
                disabled={archiveBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {archiveBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Project Report Modal ───────────────────────────────────────────── */}
      {reportProject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-[92%] max-w-lg flex-col rounded-lg bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-gray-900">{reportProject.projectName}</h3>
                {reportProject.siteAddress && (
                  <p className="mt-0.5 text-sm text-gray-500">{reportProject.siteAddress}</p>
                )}
                {reportProject.projectStatus && (
                  <span className="mt-1 inline-block rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {statusLabel(reportProject.projectStatus)}
                  </span>
                )}
              </div>
              <button onClick={() => setReportProject(null)}
                className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Tasks ({reportProject.tasks.length})
              </p>
              <div className="space-y-3">
                {reportProject.tasks.map((task, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {task.mainTaskName && (
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {task.mainTaskName}
                          </p>
                        )}
                        <p className="text-sm font-semibold text-gray-800">
                          {task.taskDescription || "Sub-task"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {task.taskStatus && (
                          <span className={["rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", taskStatusPill(task.taskStatus)].join(" ")}>
                            {statusLabel(task.taskStatus)}
                          </span>
                        )}
                        {task.assignmentStatus && (
                          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                            {statusLabel(task.assignmentStatus)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Date range — no emoji */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{formatDateRange(task.startDate, task.endDate)}</span>
                      {task.estimatedHours != null && (
                        <span>{task.estimatedHours}h estimated</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-100 px-6 py-4">
              <button onClick={() => setReportProject(null)}
                className="rounded-lg bg-[#00c065] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Performance Score Cards ──────────────────────────────────────────────────

function PerformanceCards({ data }: { data: PerformanceData | null }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 py-8">
        <span className="text-xs text-gray-400">Loading…</span>
      </div>
    )
  }

  if (!data.hasData) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 py-8">
        <span className="text-xs text-gray-400">No performance reviews yet.</span>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {data.cards.map((card) => {
          const s = ratingStyle(card.rating)
          return (
            <div key={card.key} className={["rounded-lg border p-3", s.bg, s.border].join(" ")}>
              <div className="text-[11px] font-medium text-gray-500">{card.metric}</div>
              <div className={["mt-1 text-sm font-bold capitalize", s.text].join(" ")}>
                {card.rating || "—"}
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-white/70">
                <div className={["h-1.5 rounded-full transition-all", s.bar].join(" ")} style={{ width: `${card.score}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-2 flex gap-2">
        <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
          <div className="text-[10px] text-gray-400">Projects Reviewed</div>
          <div className="text-sm font-bold text-gray-900">{data.projectCount}</div>
        </div>
        {data.totalHours > 0 && (
          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
            <div className="text-[10px] text-gray-400">Est. Hours</div>
            <div className="text-sm font-bold text-gray-900">{data.totalHours}h</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Staff Modal (Edit only) ──────────────────────────────────────────────────

function StaffModal({
  mode,
  initialData,
  onClose,
  onSave,
}: {
  mode: "add" | "edit"
  initialData?: EmployeeInput
  onClose: () => void
  onSave: (payload: EmployeeInput) => void
}) {
  const [name, setName] = useState(initialData?.name ?? "")
  const [email, setEmail] = useState(initialData?.email ?? "")
  const [phone, setPhone] = useState(initialData?.phone ?? "")
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl ?? "/paint_pro_logo.png")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const canSubmit = name.trim().length > 0 && email.trim().length > 0

  const onPickPhoto: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUrl(URL.createObjectURL(file))
  }

  const submit = async () => {
    setError("")
    if (!canSubmit) { setError("Name and email are required."); return }
    setIsSaving(true)
    await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim(), photoUrl })
    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[92%] max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{mode === "edit" ? "Edit user" : "Add user"}</h3>
            <p className="mt-1 text-sm text-gray-600">
              {mode === "edit" ? "Update this staff member's details." : "Create a new employee profile."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <img src={photoUrl} alt="Preview" className="h-14 w-14 rounded-lg border border-gray-200 object-cover" />
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Picture</label>
              <input type="file" accept="image/*" onChange={onPickPhoto}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-900 hover:file:bg-gray-50" />
              <p className="mt-1 text-xs text-gray-500">Preview only — photo upload not yet supported.</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Marco Dela Cruz" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g., marco@email.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone number</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g., 09xx xxx xxxx" />
          </div>
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={submit} disabled={!canSubmit || isSaving}
            className={["inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              canSubmit && !isSaving ? "bg-[#00c065] hover:bg-[#00a054]" : "cursor-not-allowed bg-gray-300"].join(" ")}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
