"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react"
import { toast } from "sonner"

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
  count: number
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
  hourly_wage: number | null
}

type Staff = {
  id: string
  name: string
  email: string
  phone: string | null
  photoUrl: string | null
  status: string
  specialty: string | null
  hourlyWage: number | null
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
    hourlyWage:
      typeof u.hourly_wage === "number" && Number.isFinite(u.hourly_wage)
        ? u.hourly_wage
        : null,
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

// Format an amount as Australian dollars. Matches the EmployeeManagement
// modal's currency display so the same number reads consistently
// across the app.
function formatAUD(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

type StaffViewRange = "daily" | "weekly" | "monthly" | "yearly"

const STAFF_VIEW_LABEL: Record<StaffViewRange, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

// Year picker starts at 2025 (project go-live) and grows with the
// calendar so older years stay selectable as time passes.
const YEAR_PICKER_START = 2025

function getYearOptions(today = new Date()): number[] {
  const end = Math.max(today.getFullYear(), YEAR_PICKER_START)
  const years: number[] = []
  for (let y = end; y >= YEAR_PICKER_START; y--) years.push(y)
  return years
}

// Calendar-period boundaries for the date filter. Daily is the
// current calendar day, weekly is Monday through Sunday of the
// current week, monthly is the 1st through the last day of the
// selected month/year, and yearly is January 1 through December 31
// of the selected year. All returned as ISO strings so we can pass
// them straight into the API query params.
function getStaffViewRange(
  view: StaffViewRange,
  month: number,
  year: number,
  today = new Date(),
): { start: string; end: string } {
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

  if (view === "monthly") {
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0)
    // Day 0 of the next month = last day of this month.
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)
    return { start: monthStart.toISOString(), end: monthEnd.toISOString() }
  }

  // yearly
  const jan1 = new Date(year, 0, 1, 0, 0, 0, 0)
  const dec31 = new Date(year, 11, 31, 23, 59, 59, 999)
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
  // Performance, Hours, and Payroll all read the same /performance
  // payload but each filters by its own date range, so they're held
  // in separate state slots and fetched independently.
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [hours, setHours] = useState<PerformanceData | null>(null)
  const [payroll, setPayroll] = useState<PerformanceData | null>(null)
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[] | null>(null)
  // Only show the full-page spinner when we have no cached data and
  // are waiting on the first network response. If we already have
  // cached data we render immediately and refresh silently.
  const [loadingStaff, setLoadingStaff] = useState(!cachedStaff)
  // Independent loading flags so changing one section's range doesn't
  // flash a spinner in the other section.
  const [loadingPerformance, setLoadingPerformance] = useState(true)
  const [loadingHours, setLoadingHours] = useState(true)
  const [loadingPayroll, setLoadingPayroll] = useState(true)
  const [loadingTimeline, setLoadingTimeline] = useState(true)
  const [staffError, setStaffError] = useState<string | null>(null)

  const [reportProject, setReportProject] = useState<ProjectTimelineEntry | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messaging, setMessaging] = useState(false)

  // Specialty management modal. Working state lives here so the chips +
  // dropdown can update locally before the admin hits Save and the
  // PATCH lands. `teamSpecialties` is the union of every existing
  // specialty across staff/manager records — populates the dropdown so
  // adding an existing tag is one click.
  const [specialtyModalOpen, setSpecialtyModalOpen] = useState(false)
  const [pendingSpecialties, setPendingSpecialties] = useState<string[]>([])
  const [selectedToAdd, setSelectedToAdd] = useState("")
  const [customSpecialty, setCustomSpecialty] = useState("")
  const [savingSpecialty, setSavingSpecialty] = useState(false)
  const [teamSpecialties, setTeamSpecialties] = useState<string[]>([])

  // Hourly wage editor (gated, lives in the Payroll card). The input
  // is only mounted while `editingWage` is true so the regular Payroll
  // view stays read-only by default. Empty string clears the wage
  // (stored as null on the server).
  const [editingWage, setEditingWage] = useState(false)
  const [wageInput, setWageInput] = useState("")
  const [savingWage, setSavingWage] = useState(false)

  // Archive flow state. `archiveChecking` covers the assignment
  // lookup (mirrors the list page's check-active → confirm → patch
  // sequence); `archiveConfirmOpen` gates the final yes/no modal; the
  // blocked-by-active-projects reason is surfaced via a sonner toast
  // rather than persisted in state.
  const [archiveChecking, setArchiveChecking] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  // Restore flow state. No pre-check is needed (reactivating an
  // inactive member can't violate any constraints), so this is just
  // a confirm-modal gate before the PATCH.
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  // Flipped true the moment "Back to staff" is clicked so the link
  // can show a spinner during the route transition. Cleared
  // automatically when this page unmounts on navigation.
  const [navigatingBack, setNavigatingBack] = useState(false)

  // Date-range filters scoped per section so the admin can compare
  // (eg weekly performance vs yearly payroll). Each card filters
  // independently. The month/year picks only matter when view is
  // "monthly" or "yearly" respectively, but we keep them in state
  // regardless so the secondary dropdown remembers the user's last
  // selection between view switches.
  const now = useMemo(() => new Date(), [])
  const yearOptions = useMemo(() => getYearOptions(now), [now])

  const [performanceView, setPerformanceView] = useState<StaffViewRange>("weekly")
  const [performanceMonth, setPerformanceMonth] = useState(() => now.getMonth())
  const [performanceYear, setPerformanceYear] = useState(() => now.getFullYear())

  const [hoursView, setHoursView] = useState<StaffViewRange>("weekly")
  const [hoursMonth, setHoursMonth] = useState(() => now.getMonth())
  const [hoursYear, setHoursYear] = useState(() => now.getFullYear())

  const [payrollView, setPayrollView] = useState<StaffViewRange>("weekly")
  const [payrollMonth, setPayrollMonth] = useState(() => now.getMonth())
  const [payrollYear, setPayrollYear] = useState(() => now.getFullYear())

  const [timelineView, setTimelineView] = useState<StaffViewRange>("weekly")
  const [timelineMonth, setTimelineMonth] = useState(() => now.getMonth())
  const [timelineYear, setTimelineYear] = useState(() => now.getFullYear())

  const performanceRange = useMemo(
    () => getStaffViewRange(performanceView, performanceMonth, performanceYear),
    [performanceView, performanceMonth, performanceYear],
  )
  const hoursRange = useMemo(
    () => getStaffViewRange(hoursView, hoursMonth, hoursYear),
    [hoursView, hoursMonth, hoursYear],
  )
  const payrollRange = useMemo(
    () => getStaffViewRange(payrollView, payrollMonth, payrollYear),
    [payrollView, payrollMonth, payrollYear],
  )
  const timelineRange = useMemo(
    () => getStaffViewRange(timelineView, timelineMonth, timelineYear),
    [timelineView, timelineMonth, timelineYear],
  )

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

  // Performance, Hours, and Payroll each call /performance with
  // their own range. The endpoint is cheap (one filtered query +
  // a single user row), so issuing three parallel calls is fine
  // and lets each card filter independently.
  const fetchPerformance = useCallback(async () => {
    if (!staffId) return
    setLoadingPerformance(true)
    try {
      const params = new URLSearchParams({
        userId: staffId,
        start: performanceRange.start,
        end: performanceRange.end,
      })
      const res = await fetch(
        `/api/admin/staff/performance?${params.toString()}`,
        { cache: "no-store" },
      )
      const json = await res.json()
      setPerformance(
        json ?? { hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 },
      )
    } catch (e) {
      console.error("Failed to fetch performance:", e)
      setPerformance({ hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 })
    } finally {
      setLoadingPerformance(false)
    }
  }, [staffId, performanceRange.start, performanceRange.end])

  const fetchHours = useCallback(async () => {
    if (!staffId) return
    setLoadingHours(true)
    try {
      const params = new URLSearchParams({
        userId: staffId,
        start: hoursRange.start,
        end: hoursRange.end,
      })
      const res = await fetch(
        `/api/admin/staff/performance?${params.toString()}`,
        { cache: "no-store" },
      )
      const json = await res.json()
      setHours(
        json ?? { hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 },
      )
    } catch (e) {
      console.error("Failed to fetch hours:", e)
      setHours({ hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 })
    } finally {
      setLoadingHours(false)
    }
  }, [staffId, hoursRange.start, hoursRange.end])

  const fetchPayroll = useCallback(async () => {
    if (!staffId) return
    setLoadingPayroll(true)
    try {
      const params = new URLSearchParams({
        userId: staffId,
        start: payrollRange.start,
        end: payrollRange.end,
      })
      const res = await fetch(
        `/api/admin/staff/performance?${params.toString()}`,
        { cache: "no-store" },
      )
      const json = await res.json()
      setPayroll(
        json ?? { hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 },
      )
    } catch (e) {
      console.error("Failed to fetch payroll:", e)
      setPayroll({ hasData: false, cards: [], projectCount: 0, totalHours: 0, totalSalary: 0, hourlyWage: 0 })
    } finally {
      setLoadingPayroll(false)
    }
  }, [staffId, payrollRange.start, payrollRange.end])

  const fetchTimeline = useCallback(async () => {
    if (!staffId) return
    setLoadingTimeline(true)
    try {
      const params = new URLSearchParams({
        userId: staffId,
        start: timelineRange.start,
        end: timelineRange.end,
      })
      const res = await fetch(
        `/api/staff/timeline?${params.toString()}`,
        { cache: "no-store" },
      )
      const json = await res.json()
      setTimeline(json?.projects ?? [])
    } catch (e) {
      console.error("Failed to fetch timeline:", e)
      setTimeline([])
    } finally {
      setLoadingTimeline(false)
    }
  }, [staffId, timelineRange.start, timelineRange.end])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchPerformance() }, [fetchPerformance])
  useEffect(() => { fetchHours() }, [fetchHours])
  useEffect(() => { fetchPayroll() }, [fetchPayroll])
  useEffect(() => { fetchTimeline() }, [fetchTimeline])

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

  // Re-seed the input string whenever the saved wage changes so the
  // visible value reflects the source of truth after fetches/saves.
  useEffect(() => {
    setWageInput(
      staff?.hourlyWage != null && Number.isFinite(staff.hourlyWage)
        ? String(staff.hourlyWage)
        : "",
    )
  }, [staff?.hourlyWage])

  const trimmedWageInput = wageInput.trim()
  const parsedWage = trimmedWageInput === "" ? null : Number(trimmedWageInput)
  const wageInputIsValid =
    parsedWage === null || (Number.isFinite(parsedWage) && parsedWage >= 0)
  const wageIsDirty =
    wageInputIsValid && parsedWage !== (staff?.hourlyWage ?? null)

  async function saveWage() {
    if (!staff || savingWage || !wageIsDirty || !wageInputIsValid) return
    setSavingWage(true)
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: staff.id,
          hourlyWage: parsedWage,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to update hourly wage.")
      }
      setStaff((prev) =>
        prev ? { ...prev, hourlyWage: parsedWage } : prev,
      )
      // Payroll card pulls the wage from /performance, not from the
      // staff row. Re-fetch so the visible "AUD X / hour" line and
      // totalSalary recompute against the new wage immediately.
      void fetchPayroll()
      setEditingWage(false)
      toast.success("Hourly wage updated.")
    } catch (e) {
      console.error(e)
      toast.error(
        e instanceof Error ? e.message : "Failed to update hourly wage.",
      )
    } finally {
      setSavingWage(false)
    }
  }

  function openWageEditor() {
    if (staff?.status === "inactive") return
    setWageInput(
      staff?.hourlyWage != null && Number.isFinite(staff.hourlyWage)
        ? String(staff.hourlyWage)
        : "",
    )
    setEditingWage(true)
  }

  function cancelWageEditor() {
    setWageInput(
      staff?.hourlyWage != null && Number.isFinite(staff.hourlyWage)
        ? String(staff.hourlyWage)
        : "",
    )
    setEditingWage(false)
  }

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

  // Pull the union of every existing specialty across staff/manager
  // so the modal's dropdown can offer common tags as one-click picks.
  // Runs once on mount; if a tag is brand-new the admin can still add
  // it via the custom input.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/admin/staff", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const all = Array.isArray(json?.staff) ? (json.staff as StaffApiUser[]) : []
        const tags = new Set<string>()
        for (const u of all) {
          if (typeof u.specialty !== "string") continue
          for (const piece of u.specialty.split(",")) {
            const trimmed = piece.trim()
            if (trimmed) tags.add(trimmed)
          }
        }
        setTeamSpecialties(Array.from(tags).sort())
      } catch {
        // Silent — the modal still works with just the custom input.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function openSpecialtyModal() {
    setPendingSpecialties(specialties)
    setSelectedToAdd("")
    setCustomSpecialty("")
    setSpecialtyModalOpen(true)
  }

  function closeSpecialtyModal() {
    if (savingSpecialty) return
    setSpecialtyModalOpen(false)
  }

  function addPendingSpecialty(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    setPendingSpecialties((prev) =>
      prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, trimmed],
    )
  }

  function removePendingSpecialty(value: string) {
    setPendingSpecialties((prev) =>
      prev.filter((s) => s.toLowerCase() !== value.toLowerCase()),
    )
  }

  async function saveSpecialty() {
    if (!staff || savingSpecialty) return
    setSavingSpecialty(true)
    try {
      const nextSpecialty = pendingSpecialties.join(", ")
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: staff.id, specialty: nextSpecialty }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to update specialty.")
      }
      setStaff((prev) =>
        prev ? { ...prev, specialty: nextSpecialty || null } : prev,
      )
      // Fold any newly-added tags into the dropdown options.
      setTeamSpecialties((prev) => {
        const merged = new Set(prev)
        for (const s of pendingSpecialties) merged.add(s)
        return Array.from(merged).sort()
      })
      setSpecialtyModalOpen(false)
      toast.success("Specialty updated.")
    } catch (e) {
      console.error(e)
      toast.error(
        e instanceof Error ? e.message : "Failed to update specialty.",
      )
    } finally {
      setSavingSpecialty(false)
    }
  }

  // Dropdown options = team tags minus what's already pending so the
  // admin doesn't accidentally pick a duplicate.
  const availableDropdownOptions = useMemo(() => {
    const have = new Set(pendingSpecialties.map((s) => s.toLowerCase()))
    return teamSpecialties.filter((s) => !have.has(s.toLowerCase()))
  }, [teamSpecialties, pendingSpecialties])

  // Archive flow. Mirrors the list page's behaviour:
  //   1. Check the user's project_sub_task_staff rows for any
  //      non-terminal assignments. If found, block with a clear
  //      explanation toast.
  //   2. Otherwise open the confirm modal so the admin can change
  //      their mind before flipping the status.
  //   3. On confirm, PATCH /api/staff with status="inactive" and
  //      update the local staff record so the page reflects it.
  async function initiateArchive() {
    if (!staff || archiveChecking) return
    setArchiveChecking(true)
    try {
      const res = await fetch(
        `/api/admin/staff/check-active?userId=${encodeURIComponent(staff.id)}`,
      )
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? "Could not verify active assignments.")
      }
      if (json?.hasActiveAssignments) {
        toast.error("Can't archive", {
          description: `${staff.name} cannot be archived because they still have active project assignments.`,
        })
        return
      }
      setArchiveConfirmOpen(true)
    } catch (e) {
      toast.error("Archive check failed", {
        description:
          e instanceof Error
            ? e.message
            : "Could not verify active assignments. Please try again.",
      })
    } finally {
      setArchiveChecking(false)
    }
  }

  async function confirmArchive() {
    if (!staff || archiveBusy) return
    setArchiveBusy(true)
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: staff.id, status: "inactive" }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? "Failed to archive staff.")
      }
      setStaff((prev) => (prev ? { ...prev, status: "inactive" } : prev))
      setArchiveConfirmOpen(false)
      toast.success(`${staff.name} archived.`)
    } catch (e) {
      console.error(e)
      toast.error(
        e instanceof Error ? e.message : "Failed to archive staff.",
      )
    } finally {
      setArchiveBusy(false)
    }
  }

  async function confirmRestore() {
    if (!staff || restoreBusy) return
    setRestoreBusy(true)
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: staff.id, status: "active" }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? "Failed to restore staff.")
      }
      setStaff((prev) => (prev ? { ...prev, status: "active" } : prev))
      setRestoreConfirmOpen(false)
      toast.success(`${staff.name} restored.`)
    } catch (e) {
      console.error(e)
      toast.error(
        e instanceof Error ? e.message : "Failed to restore staff.",
      )
    } finally {
      setRestoreBusy(false)
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

  const isArchived = staff.status === "inactive"

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

          {/* Archive flips the user's status to "inactive" after
              confirming no active project assignments. Hidden once the
              member is already archived — the Restore button takes its
              place there. */}
          {!isArchived ? (
            <button
              type="button"
              onClick={initiateArchive}
              disabled={archiveChecking || archiveBusy}
              title="Archive staff member"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {archiveChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {archiveChecking ? "Checking..." : "Archive"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRestoreConfirmOpen(true)}
              disabled={restoreBusy}
              title="Restore staff member"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-[#00a054] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00c065]/50 hover:bg-emerald-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Restore
            </button>
          )}
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
                    : staff.status === "inactive"
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-500">Specialty:</span>
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
                <button
                  type="button"
                  onClick={openSpecialtyModal}
                  className="inline-flex items-center rounded-full border border-[#00c065]/30 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#00a054] transition-colors hover:border-[#00c065]/50 hover:bg-emerald-100"
                >
                  See more
                </button>
              </div>
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
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Performance</div>
                <p className="mt-0.5 text-xs text-gray-400">Average rating per metric.</p>
              </div>
              <RangeSelect
                view={performanceView}
                onViewChange={setPerformanceView}
                month={performanceMonth}
                onMonthChange={setPerformanceMonth}
                year={performanceYear}
                onYearChange={setPerformanceYear}
                yearOptions={yearOptions}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingPerformance ? (
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Hours</div>
                <RangeSelect
                  view={hoursView}
                  onViewChange={setHoursView}
                  month={hoursMonth}
                  onMonthChange={setHoursMonth}
                  year={hoursYear}
                  onYearChange={setHoursYear}
                  yearOptions={yearOptions}
                />
              </div>
              {loadingHours ? (
                <div className="mt-2 flex items-center text-gray-400">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {hours?.totalHours ?? 0}
                    <span className="ml-1 text-sm font-semibold text-gray-500">h</span>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Across {hours?.projectCount ?? 0} reviewed{" "}
                    {(hours?.projectCount ?? 0) === 1 ? "project" : "projects"}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Payroll</div>
                <RangeSelect
                  view={payrollView}
                  onViewChange={setPayrollView}
                  month={payrollMonth}
                  onMonthChange={setPayrollMonth}
                  year={payrollYear}
                  onYearChange={setPayrollYear}
                  yearOptions={yearOptions}
                />
              </div>
              {loadingPayroll ? (
                <div className="mt-2 flex items-center text-gray-400">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatAUD(payroll?.totalSalary ?? 0)}
                  </p>

                  {editingWage ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-400">AUD</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        autoFocus
                        value={wageInput}
                        onChange={(e) => setWageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            void saveWage()
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            cancelWageEditor()
                          }
                        }}
                        disabled={savingWage}
                        placeholder="Not set"
                        aria-label="Hourly wage"
                        className={[
                          "h-8 w-24 rounded-md border bg-white px-2 text-xs font-medium text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-500/15",
                          wageInputIsValid
                            ? "border-gray-200"
                            : "border-red-300 focus:border-red-400 focus:ring-red-400/20",
                          savingWage ? "cursor-not-allowed bg-gray-50 opacity-70" : "",
                        ].join(" ")}
                      />
                      <span className="text-[11px] text-gray-400">/ hr</span>

                      <button
                        type="button"
                        onClick={() => void saveWage()}
                        disabled={
                          savingWage || !wageInputIsValid || !wageIsDirty
                        }
                        title="Save hourly wage"
                        aria-label="Save hourly wage"
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[#00c065] px-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingWage ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelWageEditor}
                        disabled={savingWage}
                        title="Cancel"
                        aria-label="Cancel editing hourly wage"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {!wageInputIsValid ? (
                        <span className="text-[11px] font-medium text-red-600">
                          Must be 0 or more.
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-gray-500">
                        {(payroll?.hourlyWage ?? 0) > 0
                          ? `${formatAUD(payroll?.hourlyWage ?? 0)} / hour`
                          : "No hourly rate set"}
                      </p>
                      <button
                        type="button"
                        onClick={openWageEditor}
                        disabled={staff.status === "inactive"}
                        title={
                          staff.status === "inactive"
                            ? "Inactive staff cannot be edited"
                            : "Edit hourly wage"
                        }
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-600 transition hover:border-[#00c065]/40 hover:bg-emerald-50 hover:text-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit wage
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Work Timeline with internal scroll. */}
        <div className="flex min-h-0 flex-col rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Work Timeline</div>
              <p className="mt-0.5 text-xs text-gray-400">Projects assigned to this employee.</p>
            </div>
            <RangeSelect
              view={timelineView}
              onViewChange={setTimelineView}
              month={timelineMonth}
              onMonthChange={setTimelineMonth}
              year={timelineYear}
              onYearChange={setTimelineYear}
              yearOptions={yearOptions}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadingTimeline ? (
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

      {archiveConfirmOpen && staff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
          <div className="w-full max-w-sm overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-red-600" aria-hidden />
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900">
                Archive {staff.name}?
              </h3>
              <p className="mt-2 text-xs leading-5 text-gray-600">
                Their account will be marked inactive and hidden from
                future project assignments. Existing records stay on
                file. You can unarchive later if needed.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setArchiveConfirmOpen(false)}
                  disabled={archiveBusy}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmArchive}
                  disabled={archiveBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {archiveBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {archiveBusy ? "Archiving..." : "Yes, archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {restoreConfirmOpen && staff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
          <div className="w-full max-w-sm overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-[#00c065]" aria-hidden />
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900">
                Restore {staff.name}?
              </h3>
              <p className="mt-2 text-xs leading-5 text-gray-600">
                Their account will be marked active again and become
                available for project assignments. Specialties and the
                hourly wage will become editable.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRestoreConfirmOpen(false)}
                  disabled={restoreBusy}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRestore}
                  disabled={restoreBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#00c065] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054] disabled:opacity-50"
                >
                  {restoreBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {restoreBusy ? "Restoring..." : "Yes, restore"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {specialtyModalOpen && staff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
          <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
            <div className="h-1.5 w-full shrink-0 bg-[#00c065]" aria-hidden />

            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-[#00a054]">
                  Specialties
                </div>
                <h2 className="mt-2 text-sm font-semibold text-gray-900">
                  {staff.name}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {isArchived
                    ? `Specialty tags on file for ${staff.name.split(" ")[0] || "this member"}.`
                    : `Add or remove tags that describe what ${staff.name.split(" ")[0] || "this member"} can do.`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSpecialtyModal}
                disabled={savingSpecialty}
                aria-label="Close"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {isArchived ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                  This staff member is inactive. Specialties are read-only
                  until they're reactivated.
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Current
                </p>
                {pendingSpecialties.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pendingSpecialties.map((s) => (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-0.5 text-xs font-medium text-gray-700 ${
                          isArchived ? "px-2.5" : "pl-2.5 pr-1"
                        }`}
                      >
                        {s}
                        {isArchived ? null : (
                          <button
                            type="button"
                            onClick={() => removePendingSpecialty(s)}
                            aria-label={`Remove ${s}`}
                            className="grid h-5 w-5 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    {isArchived
                      ? "No specialties on file."
                      : "No specialties yet. Add one below."}
                  </p>
                )}
              </div>

              {isArchived ? null : (
                <>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Add from team
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={selectedToAdd}
                        onChange={(e) => setSelectedToAdd(e.target.value)}
                        disabled={availableDropdownOptions.length === 0 || savingSpecialty}
                        className="h-9 flex-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">
                          {availableDropdownOptions.length === 0
                            ? "No more team tags to pick"
                            : "Select a specialty..."}
                        </option>
                        {availableDropdownOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedToAdd) return
                          addPendingSpecialty(selectedToAdd)
                          setSelectedToAdd("")
                        }}
                        disabled={!selectedToAdd || savingSpecialty}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Or add a new one
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        value={customSpecialty}
                        onChange={(e) => setCustomSpecialty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customSpecialty.trim()) {
                            e.preventDefault()
                            addPendingSpecialty(customSpecialty)
                            setCustomSpecialty("")
                          }
                        }}
                        placeholder="e.g. Cabinet refinishing"
                        disabled={savingSpecialty}
                        className="h-9 flex-1 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition-colors focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!customSpecialty.trim()) return
                          addPendingSpecialty(customSpecialty)
                          setCustomSpecialty("")
                        }}
                        disabled={!customSpecialty.trim() || savingSpecialty}
                        className="inline-flex h-9 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/50 px-5 py-3">
              {isArchived ? (
                <button
                  type="button"
                  onClick={closeSpecialtyModal}
                  className="inline-flex h-9 items-center rounded-md bg-gray-900 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closeSpecialtyModal}
                    disabled={savingSpecialty}
                    className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveSpecialty}
                    disabled={savingSpecialty}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingSpecialty ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {savingSpecialty ? "Saving..." : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Compact range filter rendered inside a section header (Performance,
// Work Timeline). Smaller than the page-level select so it sits
// comfortably next to a small section title. Picking Monthly reveals
// a month dropdown, picking Yearly reveals a year dropdown.
function RangeSelect({
  view,
  onViewChange,
  month,
  onMonthChange,
  year,
  onYearChange,
  yearOptions,
}: {
  view: StaffViewRange
  onViewChange: (v: StaffViewRange) => void
  month: number
  onMonthChange: (m: number) => void
  year: number
  onYearChange: (y: number) => void
  yearOptions: number[]
}) {
  const selectClass =
    "h-7 appearance-none rounded-md border border-gray-200 bg-white pl-2.5 pr-7 text-xs font-semibold text-gray-700 outline-none transition-colors hover:border-[#00c065]/40 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="relative">
        <select
          value={view}
          onChange={(e) => onViewChange(e.target.value as StaffViewRange)}
          className={selectClass}
        >
          {(Object.keys(STAFF_VIEW_LABEL) as StaffViewRange[]).map((option) => (
            <option key={option} value={option}>
              {STAFF_VIEW_LABEL[option]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
      </div>

      {view === "monthly" && (
        <div className="relative">
          <select
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className={selectClass}
          >
            {MONTH_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        </div>
      )}

      {view === "yearly" && (
        <div className="relative">
          <select
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className={selectClass}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
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

  // Y-axis tiers mirror the score values returned by /performance
  // (awful=20, bad=40, good=70, great=90) so a "Good" bar lands
  // exactly on the "Good" gridline.
  const ratingTiers = [
    { label: "Awful", position: 20, text: "text-red-400" },
    { label: "Bad",   position: 40, text: "text-amber-400" },
    { label: "Good",  position: 70, text: "text-blue-400" },
    { label: "Great", position: 90, text: "text-emerald-400" },
  ]

  return (
    <div className="flex h-full min-h-[180px] flex-col">
      {/* Chart body. Bars sit inside a relative container so the
          horizontal gridlines can absolutely-position behind them.
          Columns use items-stretch (the flex default) so each one
          spans the full chart height; otherwise the percentage-
          based bar height collapses to zero. */}
      <div className="relative flex flex-1 gap-3 border-b border-gray-200 pb-1 pl-12">
        {/* Gridlines + rating-tier labels */}
        {ratingTiers.map((tier) => (
          <div
            key={tier.label}
            className={["pointer-events-none absolute inset-x-0 flex items-center text-[9px] font-semibold", tier.text].join(" ")}
            style={{ bottom: `${tier.position}%` }}
          >
            <span className="w-10 pr-1 text-right">{tier.label}</span>
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
              <span className={["mb-1 text-center text-[10px] font-bold capitalize leading-tight", s.text].join(" ")}>
                {card.rating || "-"}
                {card.rating ? (
                  <span className="ml-1 font-semibold normal-case opacity-80">
                    ({card.count} {card.count === 1 ? "review" : "reviews"})
                  </span>
                ) : null}
              </span>
              <div
                className={["w-full rounded-t-md transition-all", s.bar].join(" ")}
                style={{ height: `${height}%`, minHeight: "2px" }}
                title={`${card.metric}: ${card.rating ?? "no rating"} (${card.count} ${card.count === 1 ? "review" : "reviews"})`}
              />
            </div>
          )
        })}
      </div>

      {/* Metric labels under each bar. Mirrors the bar layout above
          so labels and bars line up. */}
      <div className="flex gap-3 pl-12 pt-1.5">
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
