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
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react"

type InviteRole = "staff" | "client"

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

  const [createOpen, setCreateOpen] = useState(false)

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

      const payload =
        tab === "staff"
          ? { role: "staff", email: e, password: generatedPassword }
          : { role: "client", email: e }

      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(json?.error || "Failed to create invite.")
        return
      }

      if (tab === "staff") {
        setSuccess("Staff invite created. Copy the password and send it to the staff member.")
        setEmail("")
        setGeneratedPassword(generatePassword())
      } else {
        setSuccess("Client invite created.")
        setEmail("")
      }

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

  return (
    <div className="p-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Link
          href="/admin/staff"
          className="rounded-md px-1.5 py-1 text-[#00c065] hover:bg-gray-50 hover:text-[#00a054]"
        >
          Staff
        </Link>

        <ChevronRight className="h-4 w-4 text-gray-400" />

        <span className="text-gray-900">Invites</span>
      </div>

      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Invites</h1>

      <div className="mt-6 space-y-6">
        {/* Create */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Create an invite</div>
              <div className="mt-1 text-sm text-gray-600">
                Make sure to save the password as it will only appear one time
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Icon-only collapse button */}
              <button
                type="button"
                onClick={() => setCreateOpen((v) => !v)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                aria-label={createOpen ? "Collapse create invite" : "Expand create invite"}
                title={createOpen ? "Collapse" : "Expand"}
              >
                {createOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>
            </div>
          </div>

          {createOpen && (
            <div className="mt-4 grid grid-cols-1 gap-4">
              {/* Tabs only visible when expanded */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetAlerts()
                    setTab("staff")
                  }}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition",
                    tab === "staff"
                      ? "border-[#00c065] bg-[#00c065]/10 text-gray-900"
                      : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                  ].join(" ")}
                >
                  Staff
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetAlerts()
                    setTab("client")
                  }}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition",
                    tab === "client"
                      ? "border-[#00c065] bg-[#00c065]/10 text-gray-900"
                      : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                  ].join(" ")}
                >
                  Client
                </button>
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="name@example.com"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>
                <p className="text-[12px] text-gray-500">This should match the email you invited.</p>
              </div>

              {tab === "staff" && (
                <div className="grid gap-1.5">
                  <label className="text-sm text-gray-700">Generated password</label>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={generatedPassword}
                      readOnly
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-900 shadow-sm outline-none"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setGeneratedPassword(generatePassword())}
                        className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                      >
                        <RefreshCw className="h-4 w-4 text-gray-500" />
                        Regenerate
                      </button>

                      <button
                        type="button"
                        onClick={copyPassword}
                        className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <p className="text-[12px] text-gray-500">
                    Send this password to the staff member. They will change it later in your setup profile page.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  {success}
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#00c065] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" />
                  {busy ? "Creating..." : tab === "staff" ? "Create staff invite" : "Create client invite"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">All invites</div>
              <div className="mt-1 text-sm text-gray-600">Admins and managers can manage invites here.</div>
            </div>

            <button
              type="button"
              onClick={loadInvites}
              disabled={listLoading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4 text-gray-500" />
              {listLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {listError && <div className="mt-3 text-sm font-semibold text-red-600">{listError}</div>}

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            {listLoading ? (
              <div className="p-4 text-sm text-gray-600">Loading invites...</div>
            ) : invites.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No invites found.</div>
            ) : (
              invites.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 border-b border-gray-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{row.email}</div>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          rolePill(row.role),
                        ].join(" ")}
                      >
                        {row.role.toUpperCase()}
                      </span>

                      <span
                        className={[
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          statusPill(row.status),
                        ].join(" ")}
                      >
                        {row.status.toUpperCase()}
                      </span>

                      <span className="text-xs text-gray-500">Created: {fmtDate(row.created_at)}</span>

                      {row.used_at && <span className="text-xs text-gray-500">Used: {fmtDate(row.used_at)}</span>}
                    </div>
                  </div>

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => requestDelete(row)}
                            disabled={deleteBusyId === row.id}
                            className={[
                            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm",
                            "bg-red-700 text-white border border-red-800/20",
                            "transition-all duration-200 ease-out",
                            "hover:bg-red-600 hover:shadow-md hover:opacity-95",
                            "active:scale-95",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            ].join(" ")}
                        >
                            <Trash2 className="h-4 w-4 text-white/90" />
                            Delete
                        </button>
                    </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
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
                className="grid h-9 w-9 place-items-center rounded-lg border border-transparent hover:bg-gray-50"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusyId === confirmDelete.id}
                className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={doDelete}
                disabled={deleteBusyId === confirmDelete.id}
                className="inline-flex h-10 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-60"
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
