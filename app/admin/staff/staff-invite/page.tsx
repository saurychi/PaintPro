"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Mail,
  UserPlus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react"

// Invite creation is staff/manager only — clients are added via the
// project flow, not by inviting them here. The list view below still
// reads any historical client invites in the DB, but the create form
// no longer offers it as a target role.
type InviteRole = "staff" | "manager"

type InviteRow = {
  id: string
  email: string
  role: "client" | "staff" | "manager"
  status: "pending" | "used" | "revoked"
  created_at: string | null
  used_at: string | null
}

function generatePassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
  let out = ""
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function fmtDate(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit" })
}

function rolePill(role: InviteRow["role"]) {
  if (role === "manager") return "border-purple-200 bg-purple-500/10 text-purple-700"
  if (role === "staff") return "border-blue-200 bg-blue-500/10 text-blue-700"
  return "border-emerald-200 bg-emerald-500/10 text-emerald-700"
}

function statusPill(status: InviteRow["status"]) {
  if (status === "used") return "border-gray-200 bg-gray-100 text-gray-700"
  if (status === "revoked") return "border-red-200 bg-red-50 text-red-700"
  return "border-amber-200 bg-amber-500/10 text-amber-800"
}

export default function StaffInvitePage() {
  const [tab, setTab] = useState<InviteRole>("staff")

  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<string | null>(null)

  const [generatedPassword, setGeneratedPassword] = useState(() => generatePassword())
  const [copied, setCopied] = useState(false)

  const [invites, setInvites] = useState<InviteRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState("")
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<InviteRow | null>(null)

  const canSubmit = useMemo(() => {
    const e = email.trim().toLowerCase()
    return isEmail(e) && !busy
  }, [email, busy])

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  const resetAlerts = () => {
    setError("")
    setSuccess(null)
  }

  const loadInvites = async () => {
    setListError("")
    setListLoading(true)
    try {
      const res = await fetch("/api/invites", { method: "GET" })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setInvites([])
        setListError(json?.error || "Failed to load invites.")
        return
      }

      const all = (json?.invites ?? []) as InviteRow[]
      setInvites(all.filter((x) => x.status === "pending"))
    } catch (e) {
      console.error(e)
      setInvites([])
      setListError("Failed to load invites.")
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadInvites()
  }, [])

  const submit = async () => {
    resetAlerts()

    const e = email.trim().toLowerCase()
    if (!isEmail(e)) {
      setError("Enter a valid email.")
      return
    }

    try {
      setBusy(true)

      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: tab,
          email: e,
          password: generatedPassword,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(json?.error || "Failed to create invite.")
        return
      }

      setSuccess(
        tab === "staff"
          ? "Staff invite created. Copy the password and send it to the staff member."
          : "Manager invite created. Copy the password and send it to the manager.",
      )
      setEmail("")
      setGeneratedPassword(generatePassword())

      await loadInvites()
    } catch (e) {
      console.error(e)
      setError("Failed to create invite. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const requestDelete = (row: InviteRow) => {
    setConfirmDelete(row)
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    const row = confirmDelete

    setDeleteBusyId(row.id)
    setListError("")

    try {
      const res = await fetch("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(json?.error || "Failed to delete invite.")
        return
      }

      setInvites((prev) => prev.filter((x) => x.id !== row.id))
      setConfirmDelete(null)
    } catch (e) {
      console.error(e)
      setListError("Failed to delete invite.")
    } finally {
      setDeleteBusyId(null)
    }
  }

  const createBtnLabel =
    tab === "staff" ? "Create staff invite" : "Create manager invite"

  return (
    <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 flex-col p-4">
      {/* Breadcrumbs */}
      <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-gray-900">
        <Link
          href="/admin/staff"
          className="rounded-md px-1.5 py-1 text-[#00c065] hover:bg-gray-50 hover:text-[#00a054]"
        >
          Staff
        </Link>

        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />

        <span className="text-gray-900">Invites</span>
      </div>

      <h1 className="mt-1 shrink-0 text-2xl font-semibold text-gray-900">Invites</h1>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        {/* Create — minimal pane: header, role toggle, then a single row
            with password, email, and the submit button right-aligned. */}
        <div className="flex shrink-0 flex-col gap-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm font-semibold text-gray-900">
              Create an invite
            </div>

            {/* Role toggle — compact segmented control. */}
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {(["staff", "manager"] as const).map((role) => {
                const isActive = tab === role
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      resetAlerts()
                      setTab(role)
                    }}
                    className={[
                      "rounded-sm px-2.5 py-0.5 text-xs font-semibold transition-colors",
                      isActive
                        ? "bg-[#00c065] text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900",
                    ].join(" ")}
                  >
                    {role === "staff" ? "Staff" : "Manager"}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Single-row form: password block, email field, submit button.
              All bottom-aligned so the labels sit at the top and the
              inputs / button share a baseline. Stacks on narrow screens. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Password
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={generatedPassword}
                  readOnly
                  className="h-9 w-[180px] rounded-md border border-gray-200 bg-white px-3 font-mono text-sm font-semibold text-gray-900 shadow-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setGeneratedPassword(generatePassword())}
                  aria-label="Regenerate password"
                  title="Regenerate password"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  aria-label={copied ? "Copied" : "Copy password"}
                  title={copied ? "Copied" : "Copy password"}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98]"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-[#00c065]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@example.com"
                  className="h-9 w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 lg:ml-auto"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {busy ? "Creating..." : createBtnLabel}
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {success}
            </div>
          )}
        </div>

        {/* List — stacked below the create form, fills the remaining
            viewport height so the section hugs the bottom (with the
            page padding still visible). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">Invites</div>
              <div className="mt-0.5 text-xs text-gray-600">Admins and managers can manage invites here.</div>
            </div>

            <button
              type="button"
              onClick={loadInvites}
              disabled={listLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
              {listLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {listError && <div className="mt-2 shrink-0 text-sm font-semibold text-red-600">{listError}</div>}

          <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-md border border-gray-200">
            <div className="h-full overflow-y-auto">
              {listLoading ? (
                <div className="p-3 text-sm text-gray-600">Loading invites...</div>
              ) : invites.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">No invites found.</div>
              ) : (
                invites.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 border-b border-gray-200 p-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{row.email}</div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={[
                            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                            rolePill(row.role),
                          ].join(" ")}
                        >
                          {row.role.toUpperCase()}
                        </span>

                        <span
                          className={[
                            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                            statusPill(row.status),
                          ].join(" ")}
                        >
                          {row.status.toUpperCase()}
                        </span>

                        <span className="text-[11px] text-gray-500">Created: {fmtDate(row.created_at)}</span>

                        {row.used_at && <span className="text-[11px] text-gray-500">Used: {fmtDate(row.used_at)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => requestDelete(row)}
                        disabled={deleteBusyId === row.id}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold shadow-sm",
                          "bg-red-700 text-white border border-red-800/20",
                          "transition-all duration-200 ease-out",
                          "hover:bg-red-600 hover:shadow-md hover:opacity-95",
                          "active:scale-[0.98]",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                        ].join(" ")}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-white/90" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-md rounded-md bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Delete invite?</div>
                <div className="mt-1 text-sm text-gray-600">
                  This will remove the invite for{" "}
                  <span className="font-semibold text-gray-900">{confirmDelete.email}</span>.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="grid h-8 w-8 place-items-center rounded-md border border-transparent transition-all duration-200 hover:bg-gray-50 active:scale-[0.98]"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusyId === confirmDelete.id}
                className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={doDelete}
                disabled={deleteBusyId === confirmDelete.id}
                className="inline-flex h-9 items-center rounded-md bg-gray-900 px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60"
              >
                {deleteBusyId === confirmDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
