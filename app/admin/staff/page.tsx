"use client"

import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Search, Pencil, MessageSquare, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkTimelineEntry = {
  projectName: string
  startDate: string | null
  estimatedHours: number | null
  taskDescription: string | null
  taskStatus: string | null
  assignmentStatus: string | null
}

type Employee = {
  id: string
  name: string
  email: string
  phone: string | null
  photoUrl: string | null
  metrics: number[]
  workTimeline: WorkTimelineEntry[] | null // null = not yet loaded
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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function statusLabel(status: string | null) {
  if (!status) return null
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Staff() {
  const router = useRouter()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [loadingTimelineId, setLoadingTimelineId] = useState<string | null>(null)
  const [showReport, setShowReport] = useState<WorkTimelineEntry | null>(null)

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState("")

  // Current logged-in user (for messaging)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messagingId, setMessagingId] = useState<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  // ── Fetch staff from DB ───────────────────────────────────────────────────

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
            metrics: [60, 50, 45, 55, 65, 40],
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

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  // ── Filtered list (real-time search) ─────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) => e.name.toLowerCase().includes(q))
  }, [employees, searchQuery])

  // ── Toggle expand + lazy-load timeline (max 5 entries) ───────────────────

  const toggleEmployee = async (idx: number) => {
    const emp = filteredEmployees[idx]
    if (openIndex === idx) {
      setOpenIndex(null)
      return
    }
    setOpenIndex(idx)

    if (emp.workTimeline === null) {
      setLoadingTimelineId(emp.id)
      try {
        const res = await fetch(`/api/staff/timeline?userId=${emp.id}`)
        const json = await res.json()
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === emp.id ? { ...e, workTimeline: json.timeline ?? [] } : e,
          ),
        )
      } catch {
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, workTimeline: [] } : e)),
        )
      } finally {
        setLoadingTimelineId(null)
      }
    }
  }

  // ── Add employee ──────────────────────────────────────────────────────────

  const handleAdd = useCallback(async (payload: EmployeeInput) => {
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, email: payload.email, phone: payload.phone }),
      })
      const json = await res.json()
      if (json.staff) {
        setEmployees((prev) => [
          {
            id: json.staff.id,
            name: json.staff.username || payload.name,
            email: json.staff.email || payload.email,
            phone: json.staff.phone ?? payload.phone,
            photoUrl: json.staff.profile_image_url ?? null,
            metrics: [60, 50, 45, 55, 65, 40],
            workTimeline: null,
          },
          ...prev,
        ])
      }
    } catch (e) {
      console.error("Failed to add staff:", e)
    }
    setIsAddModalOpen(false)
  }, [])

  // ── Edit employee (UPDATE in DB) ──────────────────────────────────────────

  const handleEdit = useCallback(async (payload: EmployeeInput) => {
    if (!editTarget) return
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget.id,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
        }),
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

  // ── Message quick action ──────────────────────────────────────────────────

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

  const handleCloseAddModal = useCallback(() => setIsAddModalOpen(false), [])
  const handleCloseEditModal = useCallback(() => setEditTarget(null), [])

  const editModalData = useMemo(() => {
    if (!editTarget) return undefined
    return {
      name: editTarget.name,
      email: editTarget.email,
      phone: editTarget.phone || "",
      photoUrl: editTarget.photoUrl || "/paint_pro_logo.png",
    }
  }, [editTarget])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>

      <div className="mt-6">
        {/* Header Row */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-700">Employees</div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/staff/staff-invite"
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm",
                "bg-white text-gray-900 border-gray-200",
                "transition-all duration-200 ease-out hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md active:scale-[0.98]",
              ].join(" ")}
            >
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              Invites
            </Link>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm",
                "bg-white text-gray-900 border-[#00c065]/25",
                "transition-all duration-200 ease-out hover:bg-emerald-50 hover:border-[#00c065]/40 hover:shadow-md active:scale-[0.98]",
              ].join(" ")}
            >
              <Plus className="h-4 w-4 text-[#00c065]" />
              Add user
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff by name…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors focus:border-[#00c065]"
          />
        </div>

        {/* Employee List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading staff…</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-500">
              {searchQuery.trim() ? "No staff found." : "No staff members yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEmployees.map((emp, idx) => {
              const isOpen = openIndex === idx
              const timelineData = employees.find((e) => e.id === emp.id)?.workTimeline ?? null

              return (
                <div
                  key={emp.id}
                  className={[
                    "rounded-lg border bg-white shadow-sm transition-colors",
                    isOpen ? "border-[#00c065]" : "border-gray-200",
                  ].join(" ")}
                >
                  {/* Card row */}
                  <div className="flex items-center gap-3 px-6 py-4">
                    <button
                      onClick={() => toggleEmployee(idx)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <img
                        src={emp.photoUrl || "/paint_pro_logo.png"}
                        alt={emp.name}
                        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">{emp.name}</div>
                        <div className="truncate text-xs text-gray-500">{emp.email}</div>
                      </div>
                    </button>

                    {/* Quick Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleMessage(emp)}
                        disabled={!currentUserId || messagingId === emp.id}
                        title="Message staff member"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {messagingId === emp.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5" />
                        )}
                        Message
                      </button>

                      <button
                        onClick={() => setEditTarget(emp)}
                        title="Edit staff member"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-emerald-50 hover:border-[#00c065]/40 hover:text-[#00a054]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>

                      <button
                        onClick={() => toggleEmployee(idx)}
                        className="rounded-lg p-1 text-[#00c065] transition-colors hover:bg-gray-50"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
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
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Profile
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                            <img
                              src={emp.photoUrl || "/paint_pro_logo.png"}
                              alt={emp.name}
                              className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                            />
                            <div className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-10">
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">ID#:</span>
                                <span className="font-medium text-gray-900">{emp.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-gray-500">Phone:</span>
                                <span className="font-medium text-gray-900">{emp.phone || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:col-span-2 sm:justify-start">
                                <span className="text-gray-500">Email:</span>
                                <span className="font-medium text-gray-900">{emp.email}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Work */}
                      <div className="px-6 pb-6">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Work
                        </div>
                        <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-2">
                          {/* Radar Chart */}
                          <div className="flex items-center justify-center rounded-lg bg-white p-2">
                            <RadarChart values={emp.metrics} />
                          </div>

                          {/* Work Timeline */}
                          <div className="rounded-lg bg-white p-2">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-800">Work Timeline</span>
                            </div>

                            {loadingTimelineId === emp.id ? (
                              <div className="flex items-center justify-center py-8 text-gray-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span className="text-xs">Loading timeline…</span>
                              </div>
                            ) : !timelineData || timelineData.length === 0 ? (
                              <p className="py-4 text-center text-xs text-gray-400">No work timeline entries.</p>
                            ) : (
                              <div className="space-y-3">
                                {timelineData.map((entry, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-gray-700">
                                          {entry.projectName}
                                        </span>
                                        {entry.taskDescription && (
                                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            {entry.taskDescription}
                                          </span>
                                        )}
                                      </div>
                                      {entry.startDate && (
                                        <div className="mt-0.5 text-[11px] text-gray-400">
                                          {formatDate(entry.startDate)}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => setShowReport(entry)}
                                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
                                    >
                                      See report
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add User Modal ─────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <StaffModal
          mode="add"
          onClose={handleCloseAddModal}
          onSave={handleAdd}
        />
      )}

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {editTarget && (
        <StaffModal
          mode="edit"
          initialData={editModalData}
          onClose={handleCloseEditModal}
          onSave={handleEdit}
        />
      )}

      {/* ── Work Report Modal ──────────────────────────────────────────────── */}
      {showReport && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                Job Report: {showReport.projectName}
              </h3>
              <button
                onClick={() => setShowReport(null)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Date</label>
                  <p className="text-sm font-medium text-gray-900">{formatDate(showReport.startDate)}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Estimated Hours</label>
                  <p className="text-sm font-medium text-gray-900">
                    {showReport.estimatedHours != null ? `${showReport.estimatedHours} hrs` : "—"}
                  </p>
                </div>
              </div>

              {showReport.taskDescription && (
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Task</label>
                  <p className="text-sm text-gray-600">{showReport.taskDescription}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Task Status</label>
                  <p className="text-sm font-medium text-gray-900">{statusLabel(showReport.taskStatus) || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Assignment</label>
                  <p className="text-sm font-medium text-gray-900">
                    {statusLabel(showReport.assignmentStatus) || "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowReport(null)}
                className="rounded-lg bg-[#00c065] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Staff Modal (shared for Add & Edit) ─────────────────────────────────────

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
    if (!canSubmit) {
      setError("Name and email are required.")
      return
    }
    setIsSaving(true)
    await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim(), photoUrl })
    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[92%] max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {mode === "edit" ? "Edit user" : "Add user"}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {mode === "edit"
                ? "Update this staff member's details."
                : "Create a new employee profile."}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={photoUrl}
              alt="Preview"
              className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
            />
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Picture</label>
              <input
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-900 hover:file:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">Preview only — photo upload not yet supported.</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marco Dela Cruz"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., marco@email.com"
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone number</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g., 09xx xxx xxxx"
            />
          </div>

          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            onClick={submit}
            disabled={!canSubmit || isSaving}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              canSubmit && !isSaving ? "bg-[#00c065] hover:bg-[#00a054]" : "cursor-not-allowed bg-gray-300",
            ].join(" ")}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save changes" : "Add user"}
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Radar Chart (labels split onto 2 lines to prevent clipping) ─────────────

const RadarChart = memo(function RadarChart({ values }: { values: number[] }) {
  const size = 280
  const center = size / 2
  const radius = 88
  const labelOffset = radius + 28

  const axes = [
    "Work Quality",
    "Time Efficiency",
    "Teamwork",
    "Work Ethic",
    "Tool Handling",
    "Compliance",
  ]

  const angleFor = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2

  const dataPoints = values
    .map((v, i) => {
      const a = angleFor(i)
      const r = (v / 100) * radius
      return `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`
    })
    .join(" ")

  const gridRings = Array.from({ length: 4 }, (_, k) => (k + 1) * (radius / 4))

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto block"
      aria-label="Performance radar chart"
    >
      {axes.map((_, i) => {
        const a = angleFor(i)
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(a)}
            y2={center + radius * Math.sin(a)}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        )
      })}

      {gridRings.map((r, gi) => {
        const pts = axes
          .map((_, i) => {
            const a = angleFor(i)
            return `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`
          })
          .join(" ")
        return <polygon key={gi} points={pts} fill="none" stroke="#e5e7eb" strokeWidth={1} />
      })}

      <polygon points={dataPoints} fill="#93c5fd55" stroke="#60a5fa" strokeWidth={1.5} />

      {axes.map((label, i) => {
        const a = angleFor(i)
        const lx = center + labelOffset * Math.cos(a)
        const ly = center + labelOffset * Math.sin(a)
        const words = label.split(" ")
        const lineH = 11

        return (
          <text
            key={label}
            x={lx}
            y={ly}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
            fontFamily="sans-serif"
          >
            {words.length === 1 ? (
              <tspan x={lx} dy="0.35em">
                {words[0]}
              </tspan>
            ) : (
              <>
                <tspan x={lx} dy={`-${lineH / 2}px`}>
                  {words[0]}
                </tspan>
                <tspan x={lx} dy={`${lineH}px`}>
                  {words[1]}
                </tspan>
              </>
            )}
          </text>
        )
      })}
    </svg>
  )
})
