"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Check, X, SlidersHorizontal, ChevronDown, ChevronRight } from "lucide-react"

type DummyUser = {
  id: string
  username: string
  email: string
  phone: string
  role: "staff" | "manager"
  createdAt: string
  profile_image_url?: string
}

const dummyPendingUsers: DummyUser[] = [
  {
    id: "u1",
    username: "John Rivera",
    email: "johnrivera@gmail.com",
    phone: "09661234567",
    role: "staff",
    createdAt: "June 20, 2026",
  },
  {
    id: "u2",
    username: "Angela Santos",
    email: "angelasantos@gmail.com",
    phone: "09171234567",
    role: "manager",
    createdAt: "June 21, 2026",
  },
  {
    id: "u3",
    username: "Michael Cruz",
    email: "michaelcruz@gmail.com",
    phone: "09981234567",
    role: "manager",
    createdAt: "June 22, 2026",
  },
]

function firstLetter(value: string) {
  return value.charAt(0).toUpperCase()
}

function roleBadgeClass(role: "staff" | "manager") {
  if (role === "manager") return "bg-emerald-500/10 text-emerald-700 border-emerald-200"
  return "bg-blue-500/10 text-blue-700 border-blue-200"
}

export default function PendingRequestsPage() {
  const [roleFilter, setRoleFilter] = useState<"all" | "staff" | "manager">("all")

  const filteredUsers = useMemo(() => {
    if (roleFilter === "all") return dummyPendingUsers
    return dummyPendingUsers.filter((u) => u.role === roleFilter)
  }, [roleFilter])

  const btnBase =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"

  return (
    <div className="p-6">
      {/* breadcrumb title like your Reports page */}
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Link
          href="/admin/staff"
          className="rounded-md px-1.5 py-1 text-[#00c065] hover:bg-gray-50 hover:text-[#00a054]"
        >
          Staff
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <span className="text-gray-900">Pending</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Pending requests</h1>

        {/* Filter dropdown (traditional) */}
        <div className="relative">
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="h-9 w-[220px] appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-10 text-sm font-semibold text-gray-900 shadow-sm outline-none hover:bg-gray-50 focus:border-[#00c065]"
          >
            <option value="all">All roles</option>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-semibold text-gray-900">Approvals</div>
            <div className="mt-1 text-sm text-gray-600">
              Review new staff and manager accounts waiting for approval.
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No pending users found.</div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-4 border-b border-gray-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-9 w-9 overflow-hidden rounded-full border border-gray-200">
                      {user.profile_image_url ? (
                        <Image
                          src={user.profile_image_url}
                          alt="Profile"
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[#00BF63]/10 text-sm font-semibold text-[#00BF63]">
                          {firstLetter(user.username)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">{user.username}</div>

                        <span
                          className={[
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            roleBadgeClass(user.role),
                          ].join(" ")}
                        >
                          {user.role.toUpperCase()}
                        </span>

                        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          PENDING
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-gray-500">{user.email}</div>
                      <div className="text-xs text-gray-500">{user.phone}</div>
                      <div className="text-xs text-gray-400">Requested: {user.createdAt}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button className={btnBase}>
                      <X className="h-4 w-4 text-gray-500" />
                      Reject
                    </button>

                    <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054]">
                      <Check className="h-4 w-4" />
                      Approve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
