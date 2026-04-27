"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"

type StaffMember = {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  specialty: string | string[] | null
  status: "active" | "inactive" | "pending" | null
  role: "staff" | "manager" | null
}

function parseSpecialties(value: string | string[] | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function statusPill(status: StaffMember["status"]) {
  if (status === "active") return "border-emerald-200 bg-emerald-500/10 text-emerald-700"
  if (status === "pending") return "border-amber-200 bg-amber-500/10 text-amber-800"
  return "border-gray-200 bg-gray-100 text-gray-600"
}

function rolePill(role: StaffMember["role"]) {
  if (role === "manager") return "border-purple-200 bg-purple-500/10 text-purple-700"
  return "border-blue-200 bg-blue-500/10 text-blue-700"
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/admin/staff")
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json?.error ?? "Failed to load staff.")
          return
        }
        setStaff(json.staff ?? [])
      } catch {
        setError("Failed to load staff.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleOpen = (i: number) => setOpenIndex(openIndex === i ? null : i)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>

      <div className="mt-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-700">
            {loading
              ? "Loading…"
              : `${staff.length} member${staff.length !== 1 ? "s" : ""}`}
          </div>

          <Link
            href="/admin/staff/staff-invite"
            className={[
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm",
              "bg-white text-gray-900 border-gray-200",
              "transition-all duration-200 ease-out",
              "hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md",
              "active:scale-[0.98]",
            ].join(" ")}
          >
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Invites
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-700">No staff members yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Use{" "}
              <Link href="/admin/staff/staff-invite" className="text-indigo-600 underline-offset-2 hover:underline">
                Invites
              </Link>{" "}
              to add staff to the team.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map((member, idx) => {
              const isOpen = openIndex === idx
              const displayName = member.username || "Unnamed"
              const specialties = parseSpecialties(member.specialty)

              return (
                <div
                  key={member.id}
                  className={[
                    "rounded-lg border bg-white shadow-sm transition-colors",
                    isOpen ? "border-[#00c065]" : "border-gray-200",
                  ].join(" ")}
                >
                  {/* Row */}
                  <button
                    onClick={() => toggleOpen(idx)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-6 py-4 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-sm font-bold text-gray-600">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">{displayName}</div>
                        <div className="truncate text-xs text-gray-500">{member.email ?? "No email"}</div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {member.role && (
                        <span
                          className={[
                            "hidden sm:inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            rolePill(member.role),
                          ].join(" ")}
                        >
                          {member.role.toUpperCase()}
                        </span>
                      )}
                      {member.status && (
                        <span
                          className={[
                            "hidden sm:inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            statusPill(member.status),
                          ].join(" ")}
                        >
                          {member.status.toUpperCase()}
                        </span>
                      )}
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={[
                          "text-[#00c065] transition-transform duration-200",
                          isOpen ? "rotate-180" : "",
                        ].join(" ")}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-6 py-5">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Details
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-500">ID</span>
                            <span className="truncate font-medium text-gray-900">{member.id}</span>
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-500">Phone</span>
                            <span className="font-medium text-gray-900">{member.phone ?? "—"}</span>
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-500">Email</span>
                            <span className="truncate font-medium text-gray-900">{member.email ?? "—"}</span>
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-500">Status</span>
                            {member.status ? (
                              <span
                                className={[
                                  "inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                                  statusPill(member.status),
                                ].join(" ")}
                              >
                                {member.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>

                          {specialties.length > 0 && (
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <span className="text-gray-500">Specialties</span>
                              <div className="flex flex-wrap gap-1.5">
                                {specialties.map((s) => (
                                  <span
                                    key={s}
                                    className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
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
    </div>
  )
}
