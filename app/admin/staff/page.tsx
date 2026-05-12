"use client"

import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ChevronRight, Filter, Loader2, MessageSquare, MoreVertical, Search } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabaseClient"

type Employee = {
  id: string
  name: string
  email: string
  phone: string | null
  photoUrl: string | null
  status: string
  specialty: string | null
}

type EmployeeInput = {
  name: string
  email: string
  phone: string
  photoUrl: string
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

// sessionStorage cache. Set when the list page fetches, read by the
// detail page so navigation feels instant. Cleared on the same
// session boundary as everything else in sessionStorage.
const STAFF_CACHE_KEY = "paintpro:admin-staff-cache"
const STAFF_CACHE_TTL_MS = 5 * 60_000

type StaffCachePayload = {
  fetchedAt: number
  staff: StaffApiUser[]
}

function writeStaffCache(staff: StaffApiUser[]) {
  if (typeof window === "undefined") return
  try {
    const payload: StaffCachePayload = { fetchedAt: Date.now(), staff }
    window.sessionStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage may be unavailable in restricted contexts. Silent.
  }
}

function statusLabel(s: string | null) {
  if (!s) return "-"
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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

export default function Staff() {
  const router = useRouter()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveBlockedMsg, setArchiveBlockedMsg] = useState<string | null>(null)
  const [archiveCheckingId, setArchiveCheckingId] = useState<string | null>(null)

  const [openKebabId, setOpenKebabId] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [specialtyFilter, setSpecialtyFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messagingId, setMessagingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  // Hydrate from sessionStorage on first mount so a return-trip from
  // the detail page renders instantly while the network refetch runs
  // in the background.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.sessionStorage.getItem(STAFF_CACHE_KEY)
      if (!raw) return
      const cached = JSON.parse(raw) as StaffCachePayload | null
      if (!cached?.staff || !Array.isArray(cached.staff)) return
      if (Date.now() - (cached.fetchedAt ?? 0) > STAFF_CACHE_TTL_MS) return
      setEmployees(
        cached.staff.map((u) => ({
          id: u.id,
          name: u.username || "",
          email: u.email || "",
          phone: u.phone ?? null,
          photoUrl: u.profile_image_url ?? null,
          status: u.status ?? "active",
          specialty: u.specialty ?? null,
        })),
      )
      setIsLoading(false)
    } catch {
      // Bad cache shape. Ignore and let the network fetch take over.
    }
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" })
      const json = (await res.json()) as { staff?: StaffApiUser[] }
      if (json.staff) {
        writeStaffCache(json.staff)
        setEmployees(
          json.staff.map((u) => ({
            id: u.id,
            name: u.username || "",
            email: u.email || "",
            phone: u.phone ?? null,
            photoUrl: u.profile_image_url ?? null,
            status: u.status ?? "active",
            specialty: u.specialty ?? null,
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

  // Prefetch the detail route during idle time so the destination
  // page's bundle is warm by the time the admin clicks See more.
  useEffect(() => {
    router.prefetch("/admin/staff/[id]")
  }, [router])

  const uniqueSpecialties = useMemo(
    () =>
      [
        ...new Set(
          employees.flatMap((e) =>
            e.specialty
              ? e.specialty.split(",").map((s) => s.trim()).filter(Boolean)
              : []
          )
        ),
      ].sort(),
    [employees],
  )

  const uniqueStatuses = useMemo(
    () => [...new Set(employees.map((e) => e.status).filter((s) => s !== "inactive"))].sort(),
    [employees],
  )

  const activeFilterCount =
    (specialtyFilter ? 1 : 0) + (statusFilter ? 1 : 0)

  const filteredEmployees = useMemo(() => {
    let list = showArchived
      ? employees
      : employees.filter((e) => e.status !== "inactive")

    if (statusFilter)   list = list.filter((e) => e.status === statusFilter)
    if (specialtyFilter) list = list.filter((e) =>
      e.specialty?.split(",").map((s) => s.trim()).includes(specialtyFilter)
    )

    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))

    return list
  }, [employees, searchQuery, statusFilter, specialtyFilter, showArchived])

  const handleEdit = useCallback(async (payload: EmployeeInput) => {
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
  }, [editTarget])

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
        body: JSON.stringify({ id: emp.id, status: "inactive" }),
      })
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, status: "inactive" } : e)),
        )
      }
    } catch (e) {
      console.error("Failed to archive staff:", e)
    } finally {
      setArchiveBusy(false)
      setArchiveTarget(null)
    }
  }

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

  return (
    <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col overflow-hidden p-4">
      <h1 className="shrink-0 text-xl font-semibold text-gray-900">Staff</h1>

      <div className="mt-4 shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-gray-700">Employees</div>
        <Link
          href="/admin/staff/staff-invite"
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-all duration-200 hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
        >
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Invites
        </Link>
      </div>

      <div className="mt-3 shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff by name or email"
            className="h-9 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors focus:border-[#00c065]"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] outline-none focus:outline-none focus:ring-0">
              <Filter className="h-4 w-4" /> Filters
              {activeFilterCount > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-[#00c065]" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
            {uniqueSpecialties.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Specialty</div>
                <DropdownMenuCheckboxItem checked={specialtyFilter === null} onCheckedChange={() => setSpecialtyFilter(null)}>All Specialties</DropdownMenuCheckboxItem>
                {uniqueSpecialties.map((sp) => (
                  <DropdownMenuCheckboxItem key={sp} checked={specialtyFilter === sp} onCheckedChange={() => setSpecialtyFilter(specialtyFilter === sp ? null : sp)}>
                    {sp}
                  </DropdownMenuCheckboxItem>
                ))}
                <div className="h-px bg-gray-100 my-1" />
              </>
            )}

            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Status</div>
            <DropdownMenuCheckboxItem checked={statusFilter === null} onCheckedChange={() => setStatusFilter(null)}>All Statuses</DropdownMenuCheckboxItem>
            {uniqueStatuses.map((st) => (
              <DropdownMenuCheckboxItem key={st} checked={statusFilter === st} onCheckedChange={() => setStatusFilter(statusFilter === st ? null : st)} className="capitalize">
                {st}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-gray-300 text-[#00c065] focus:ring-[#00c065] w-4 h-4"
          />
          Show Archived
        </label>
      </div>

      {openKebabId && <div className="fixed inset-0 z-10" onClick={() => setOpenKebabId(null)} />}

      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm">Loading staff</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-gray-500">
              {searchQuery.trim() || activeFilterCount > 0
                ? "No staff match your search or filters."
                : "No staff members yet."}
            </p>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500 shadow-[0_1px_0_#e5e7eb]">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="px-4 py-2.5">Specialty</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmployees.map((emp) => {
                  const isArchived = emp.status === "inactive"

                  return (
                    <tr
                      key={emp.id}
                      className={[
                        "transition-colors hover:bg-gray-50",
                        isArchived ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={[
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-xs font-bold",
                              avatarColorClass(emp.id || emp.name),
                            ].join(" ")}
                          >
                            {nameInitial(emp.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-gray-900">{emp.name}</span>
                              {isArchived && (
                                <span className="shrink-0 rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                                  Archived
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[11px] text-gray-400">
                              {emp.id.slice(0, 8).toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        <span className="truncate">{emp.email || "-"}</span>
                      </td>

                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        <span className="truncate">{emp.phone || "-"}</span>
                      </td>

                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {emp.specialty ? (
                          <div className="flex flex-wrap gap-1">
                            {emp.specialty
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((s) => (
                                <span
                                  key={s}
                                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                                >
                                  {s}
                                </span>
                              ))}
                            {emp.specialty.split(",").filter((s) => s.trim()).length > 2 ? (
                              <span className="text-[11px] text-gray-400">+more</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5">
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            emp.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : emp.status === "inactive"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-amber-50 text-amber-700",
                          ].join(" ")}
                        >
                          {statusLabel(emp.status)}
                        </span>
                      </td>

                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleMessage(emp)}
                            disabled={!currentUserId || messagingId === emp.id || isArchived}
                            title="Message"
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {messagingId === emp.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <MessageSquare className="h-3 w-3" />}
                            Message
                          </button>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenKebabId(openKebabId === emp.id ? null : emp.id)
                              }}
                              disabled={archiveCheckingId === emp.id}
                              title="More actions"
                              className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:text-gray-700 active:scale-95 disabled:opacity-50"
                            >
                              {archiveCheckingId === emp.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <MoreVertical className="h-3.5 w-3.5" />}
                            </button>

                            {openKebabId === emp.id && (
                              <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                <button
                                  onClick={() => { setEditTarget(emp); setOpenKebabId(null) }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
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
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                                  >
                                    <Archive className="h-3.5 w-3.5" />
                                    Archive
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              // Push the route immediately so the
                              // destination page mounts and shows
                              // its own loading state. No client-side
                              // wait state here, the detail page
                              // hydrates from sessionStorage instantly.
                              router.push(`/admin/staff/${encodeURIComponent(emp.id)}`)
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[#00c065]/25 bg-[#00c065]/10 px-2.5 py-1 text-[11px] font-semibold text-[#047857] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00c065]/40 hover:bg-[#00c065]/15 hover:shadow-sm active:translate-y-0 active:scale-[0.97]"
                          >
                            See more
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editTarget && (
        <StaffModal
          mode="edit"
          initialData={{ name: editTarget.name, email: editTarget.email, phone: editTarget.phone || "", photoUrl: editTarget.photoUrl || "/paint_pro_logo.png" }}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {archiveBlockedMsg && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-sm rounded-md bg-white p-6 shadow-xl">
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
                className="rounded-md bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-sm rounded-md bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <Archive className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Archive employee?</h3>
            </div>
            <p className="mb-5 mt-2 text-sm text-gray-600">
              <strong>{archiveTarget.name}</strong> will be removed from the active staff list. You can view them
              by enabling &quot;Archived&quot; in the filter.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={archiveBusy}
                className="rounded-md border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                No
              </button>
              <button
                onClick={() => handleArchive(archiveTarget)}
                disabled={archiveBusy}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {archiveBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const StaffModal = memo(function StaffModal({
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
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const canSubmit = name.trim().length > 0 && email.trim().length > 0

  const submit = async () => {
    setError("")
    if (!canSubmit) { setError("Name and email are required."); return }
    setIsSaving(true)
    await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim(), photoUrl: "" })
    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[92%] max-w-md rounded-md bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{mode === "edit" ? "Edit user" : "Add user"}</h3>
            <p className="mt-1 text-sm text-gray-600">
              {mode === "edit" ? "Update this staff member's details." : "Create a new employee profile."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div
              className={[
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-gray-200 text-xl font-bold",
                avatarColorClass((initialData?.name ?? "") || "user"),
              ].join(" ")}
            >
              {nameInitial(name || initialData?.name || "?")}
            </div>
            <p className="text-sm text-gray-500">Avatar uses the first initial of the staff member&apos;s name.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Marco Dela Cruz" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g., marco@email.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone number</label>
            <input className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g., 09xx xxx xxxx" />
          </div>
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={submit} disabled={!canSubmit || isSaving}
            className={["inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors",
              canSubmit && !isSaving ? "bg-[#00c065] hover:bg-[#00a054]" : "cursor-not-allowed bg-gray-300"].join(" ")}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
})
