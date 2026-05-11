"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronDown, ChevronLeft, Loader2, MessageSquare } from "lucide-react"

import { supabase } from "@/lib/supabaseClient"

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
  totalSalary: number
  hourlyWage: number
}

type StaffApiUser = {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  profile_image_url: string | null
  status: string | null
  specialty: string | null
}

type Staff = {
  id: string
  name: string
  email: string
  phone: string | null
  photoUrl: string | null
  status: string
  specialty: string | null
}

// Mirror of the constants in the list page. Kept local so this file
// renders with no list-page dependency, but the keys/TTL must stay
// in sync so the cache is shared correctly.
const STAFF_CACHE_KEY = "paintpro:admin-staff-cache"
const STAFF_CACHE_TTL_MS = 5 * 60_000

type StaffCachePayload = {
  fetchedAt: number
  staff: StaffApiUser[]
}

function readCachedStaffList(): StaffApiUser[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(STAFF_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as StaffCachePayload | null
    if (!cached?.staff || !Array.isArray(cached.staff)) return null
    if (Date.now() - (cached.fetchedAt ?? 0) > STAFF_CACHE_TTL_MS) return null
    return cached.staff
  } catch {
    return null
  }
}

function mapStaff(u: StaffApiUser): Staff {
  return {
    id: u.id,
    name: u.username || "",
    email: u.email || "",
    phone: u.phone ?? null,
    photoUrl: u.profile_image_url ?? null,
    status: u.status ?? "active",
    specialty: u.specialty ?? null,
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "-"
  if (!end) return formatDate(start)
  return `${formatDate(start)} to ${formatDate(end)}`
}

function statusLabel(s: string | null) {
  if (!s) return "-"
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

// Format an amount as Philippine pesos. Matches the EmployeeManagement
// modal's currency display so the same number reads consistently
// across the app.
function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

type StaffViewRange = "daily" | "weekly" | "yearly"

const STAFF_VIEW_LABEL: Record<StaffViewRange, string> = {
  daily: "Daily",
  weekly: "Weekly",
  yearly: "Yearly",
}

// Calendar-period boundaries for the date filter. Daily is the
// current calendar day, weekly is Monday through Sunday of the
// current week, yearly is January 1 through December 31 of the
// current year. All returned as ISO strings so we can pass them
// straight into the API query params.
function getStaffViewRange(view: StaffViewRange, today = new Date()): {
  start: string
  end: string
} {
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(today)
  endOfToday.setHours(23, 59, 59, 999)

  if (view === "daily") {
    return { start: startOfToday.toISOString(), end: endOfToday.toISOString() }
  }

  if (view === "weekly") {
    const dayOfWeek = startOfToday.getDay() // 0 = Sun, 1 = Mon, ...
    const daysSinceMonday = (dayOfWeek + 6) % 7
    const monday = new Date(startOfToday)
    monday.setDate(startOfToday.getDate() - daysSinceMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { start: monday.toISOString(), end: sunday.toISOString() }
  }

  // yearly
  const jan1 = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0)
  const dec31 = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999)
  return { start: jan1.toISOString(), end: dec31.toISOString() }
}

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-lime-100 text-lime-700",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
]

function avatarColorClass(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function nameInitial(name: string) {
  const v = (name ?? "").trim()
  return v ? v[0]!.toUpperCase() : "?"
}

export default function StaffDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const staffId = decodeURIComponent(params.id ?? "")

  // Hydrate synchronously from sessionStorage if the list page just
  // populated the cache. This gives an instant first paint with the
  // staff record already filled in. We refetch in the background to
  // catch any DB changes that happened since the cache was written.
  const cachedStaff = useMemo<Staff | null>(() => {
    if (!staffId) return null
    const cached = readCachedStaffList()
    if (!cached) return null
    const match = cached.find((u) => u.id === staffId)
    return match ? mapStaff(match) : null
  }, [staffId])

  const [staff, setStaff] = useState<Staff | null>(cachedStaff)
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[] | null>(null)
  // Only show the full-page spinner when we have no cached data and
  // are waiting on the first network response. If we already have
  // cached data we render immediately and refresh silently.
  const [loadingStaff, setLoadingStaff] = useState(!cachedStaff)
  const [loadingWork, setLoadingWork] = useState(true)
  const [staffError, setStaffError] = useState<string | null>(null)

  const [reportProject, setReportProject] = useState<ProjectTimelineEntry | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messaging, setMessaging] = useState(false)
  // Flipped true the moment "Back to staff" is clicked so the link
  // can show a spinner during the route transition. Cleared
  // automatically when this page unmounts on navigation.
  const [navigatingBack, setNavigatingBack] = useState(false)

  // Date-range filter applied to performance and timeline. Defaults
  // to weekly so the page lands with a useful slice instead of all
  // of an employee's history at once.
  const [view, setView] = useState<StaffViewRange>("weekly")
  const viewRange = useMemo(() => getStaffViewRange(view), [view])

  function handleBack() {
    if (navigatingBack) return
    setNavigatingBack(true)
    router.push("/admin/staff")
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  const fetchStaff = useCallback(async () => {
    if (!staffId) return
    setStaffError(null)
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" })
      const json = (await res.json()) as { staff?: StaffApiUser[] }
      const match = (json.staff ?? []).find((u) => u.id === staffId)
      // Refresh the cache so a quick back-and-forth doesn't refetch.
      if (json.staff && typeof window !== "undefined") {
        try {
          const payload: StaffCachePayload = {
            fetchedAt: Date.now(),
            staff: json.staff,
          }
          window.sessionStorage.setItem(
            STAFF_CACHE_KEY,
            JSON.stringify(payload),
          )
        } catch {
          // sessionStorage unavailable. Ignore.
        }
      }
      if (!match) {
        setStaff(null)
        setStaffError("Staff member not found.")
        return
      }
      setStaff(mapStaff(match))
    } catch (e) {
      console.error("Failed to fetch staff:", e)
      if (!cachedStaff) setStaffError("Failed to load staff details.")
    } finally {
      setLoadingStaff(false)
    }
  }, [staffId, cachedStaff])

  const fetchWork = useCallback(async () => {
    if (!staffId) return
    setLoadingWork(true)
    try {
      const params = new URLSearchParams({
        userId: staffId,
        start: viewRange.start,
        end: viewRange.end,
      })
      const [perfJson, timelineJson] = await Promise.all([
        fetch(`/api/admin/staff/performance?${params.toString()}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/staff/timeline?${params.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      ])
      setPerformance(perfJson ?? { hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 })
      setTimeline(timelineJson?.projects ?? [])
    } catch (e) {
      console.error("Failed to fetch work data:", e)
      setPerformance({ hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 })
      setTimeline([])
    } finally {
      setLoadingWork(false)
    }
  }, [staffId, viewRange.start, viewRange.end])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchWork() }, [fetchWork])

  const specialties = useMemo(
    () =>
      staff?.specialty
        ? staff.specialty
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    [staff?.specialty],
  )

  const handleMessage = async () => {
    if (!staff || !currentUserId) return
    setMessaging(true)
    try {
      const res = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: staff.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to open conversation.")
      localStorage.setItem("pendingConvId", json.conversationId)
      router.push("/admin/messages")
    } catch (e) {
      console.error("Failed to open conversation:", e)
    } finally {
      setMessaging(false)
    }
  }

  if (loadingStaff && !staff) {
    return (
      <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col items-center justify-center text-gray-400">
        <Loader2 className="mb-2 h-5 w-5 animate-spin" />
        <span className="text-xs">Loading staff member...</span>
      </div>
    )
  }

  if (staffError || !staff) {
    return (
      <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col p-4">
        <button
          type="button"
          onClick={handleBack}
          disabled={navigatingBack}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {navigatingBack ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
          {navigatingBack ? "Loading staff..." : "Back to staff"}
        </button>
        <div className="mt-6 flex flex-1 items-center justify-center rounded-md border border-dashed border-gray-200">
          <p className="text-xs text-gray-500">
            {staffError ?? "We couldn't find that staff member."}
          </p>
        </div>
      </div>
    )
  }

  const isArchived = staff.status === "archived"

  return (
    <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col overflow-hidden p-4">
      <button
        type="button"
        onClick={handleBack}
        disabled={navigatingBack}
        className="shrink-0 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {navigatingBack ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
        {navigatingBack ? "Loading staff..." : "Back to staff"}
      </button>

      <div className="mt-3 shrink-0 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{staff.name}</h1>
        <div className="flex items-center gap-2">
          {/* Date range filter for Performance, Hours, Payroll, and
              Timeline. Re-fetches both /performance and /timeline
              when changed. Defaults to weekly. */}
          <div className="relative">
            <select
              value={view}
              onChange={(e) => setView(e.target.value as StaffViewRange)}
              className="h-9 appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-colors hover:border-[#00c065]/40 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
            >
              {(Object.keys(STAFF_VIEW_LABEL) as StaffViewRange[]).map((option) => (
                <option key={option} value={option}>
                  {STAFF_VIEW_LABEL[option]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </div>
          <button
            onClick={handleMessage}
            disabled={!currentUserId || messaging || isArchived}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {messaging ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            Message
          </button>
        </div>
      </div>

      {/* Profile card. Shrinks to its content height; not part of the
          scrollable area. */}
      <section className="mt-3 shrink-0 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Profile</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div
            className={[
              "flex h-16 w-16 items-center justify-center rounded-md border border-gray-200 text-xl font-bold",
              avatarColorClass(staff.id || staff.name),
            ].join(" ")}
          >
            {nameInitial(staff.name)}
          </div>

          <div className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-10">
            <div className="flex items-start justify-between gap-3 sm:justify-start">
              <span className="text-gray-500">ID:</span>
              <span className="font-medium text-gray-900">{staff.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex items-start justify-between gap-3 sm:justify-start">
              <span className="text-gray-500">Status:</span>
              <span
                className={[
                  "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                  staff.status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : staff.status === "archived"
                      ? "bg-gray-100 text-gray-500"
                      : "bg-amber-50 text-amber-700",
                ].join(" ")}
              >
                {statusLabel(staff.status)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 sm:justify-start">
              <span className="text-gray-500">Phone:</span>
              <span className="font-medium text-gray-900">{staff.phone || "-"}</span>
            </div>
            <div className="flex items-start justify-between gap-3 sm:justify-start">
              <span className="text-gray-500">Email:</span>
              <span className="font-medium text-gray-900">{staff.email}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">Specialty:</span>{" "}
              {specialties.length > 0 ? (
                <span className="inline-flex flex-wrap gap-1.5">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                    >
                      {s}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Performance + Timeline. Side-by-side grid that takes the
          remaining height; each section scrolls internally. */}
      <section className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
        {/* Left column: three horizontal stat panels (Performance,
            Hours, Payroll). Performance gets the bar chart visual;
            Hours and Payroll are compact KPI cards. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Performance</div>
              <p className="mt-0.5 text-xs text-gray-400">Average rating per metric.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingWork ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading performance...</span>
                </div>
              ) : (
                <PerformanceBarChart data={performance} />
              )}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3">
            <div className="flex flex-col rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Hours</div>
              {loadingWork ? (
                <div className="mt-2 flex items-center text-gray-400">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {performance?.totalHours ?? 0}
                    <span className="ml-1 text-sm font-semibold text-gray-500">h</span>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Across {performance?.projectCount ?? 0} reviewed{" "}
                    {(performance?.projectCount ?? 0) === 1 ? "project" : "projects"}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Payroll</div>
              {loadingWork ? (
                <div className="mt-2 flex items-center text-gray-400">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatPHP(performance?.totalSalary ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {(performance?.hourlyWage ?? 0) > 0
                      ? `${formatPHP(performance?.hourlyWage ?? 0)} / hour`
                      : "No hourly rate set"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Work Timeline with internal scroll. */}
        <div className="flex min-h-0 flex-col rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Work Timeline</div>
            <p className="mt-0.5 text-xs text-gray-400">Projects assigned to this employee.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadingWork ? (
              <div className="flex h-full items-center justify-center text-gray-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="text-xs">Loading timeline...</span>
              </div>
            ) : !timeline || timeline.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">No project assignments yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {timeline.map((proj, i) => (
                  <div
                    key={proj.projectId || i}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3"
                  >
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
                      className="shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97]"
                    >
                      See report
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {reportProject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-[92%] max-w-lg flex-col rounded-md bg-white shadow-xl">
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
              <button
                onClick={() => setReportProject(null)}
                className="shrink-0 rounded-md p-2 text-gray-400 transition-all duration-200 hover:rotate-90 hover:bg-gray-50 hover:text-gray-600 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Tasks ({reportProject.tasks.length})
              </p>
              <div className="space-y-3">
                {reportProject.tasks.map((task, i) => (
                  <div key={i} className="rounded-md border border-gray-100 bg-gray-50 p-3">
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
              <button
                onClick={() => setReportProject(null)}
                className="rounded-md bg-[#00c065] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Vertical bar chart for performance metrics. Each metric is a
// fixed-width column whose bar height is the score (0 to 100). Bar
// color follows the rating tint so a glance tells you which metrics
// are strong vs weak. Y-axis gridlines at 25/50/75/100 give a sense
// of scale without hand-rendering an axis.
function PerformanceBarChart({ data }: { data: PerformanceData | null }) {
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-gray-200">
        <span className="text-xs text-gray-400">Loading...</span>
      </div>
    )
  }

  if (!data.hasData) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-gray-200">
        <span className="text-xs text-gray-400">No performance reviews yet.</span>
      </div>
    )
  }

  const gridLines = [25, 50, 75, 100]

  return (
    <div className="flex h-full min-h-[180px] flex-col">
      {/* Chart body. Bars sit inside a relative container so the
          horizontal gridlines can absolutely-position behind them. */}
      <div className="relative flex flex-1 items-end gap-3 border-b border-gray-200 pb-1 pl-7">
        {/* Gridlines + axis labels */}
        {gridLines.map((line) => (
          <div
            key={line}
            className="pointer-events-none absolute inset-x-0 flex items-center text-[9px] text-gray-300"
            style={{ bottom: `${line}%` }}
          >
            <span className="w-6 pr-1 text-right">{line}</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
        ))}

        {data.cards.map((card) => {
          const s = ratingStyle(card.rating)
          const height = Math.max(0, Math.min(100, card.score))
          return (
            <div
              key={card.key}
              className="relative z-1 flex flex-1 flex-col items-center justify-end"
            >
              <span className={["mb-1 text-[10px] font-bold capitalize", s.text].join(" ")}>
                {card.rating || "-"}
              </span>
              <div
                className={["w-full rounded-t-md transition-all", s.bar].join(" ")}
                style={{ height: `${height}%`, minHeight: "2px" }}
                title={`${card.metric}: ${card.rating ?? "no rating"} (${card.score}%)`}
              />
            </div>
          )
        })}
      </div>

      {/* Metric labels under each bar. Mirrors the bar layout above
          so labels and bars line up. */}
      <div className="flex gap-3 pl-7 pt-1.5">
        {data.cards.map((card) => (
          <div
            key={card.key}
            className="flex-1 text-center text-[10px] font-medium text-gray-500"
          >
            {card.metric}
          </div>
        ))}
      </div>
    </div>
  )
}
