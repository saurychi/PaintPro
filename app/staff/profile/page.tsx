"use client"

import React, { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"

type DbUser = {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  specialty: string | string[] | null
  status: string | null
}

function parseSpecialties(value: string | string[] | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const ACCENT = "#00c065"

export default function StaffProfile() {
  const router = useRouter()
  const [profile, setProfile] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) console.error(sessErr)

      const session = data.session
      if (!session) {
        router.replace("/auth/signin")
        return
      }

      try {
        const { data: row, error: dbErr } = await supabase
          .from("users")
          .select("id, username, email, phone, specialty, status")
          .eq("id", session.user.id)
          .maybeSingle()

        if (dbErr) throw dbErr
        if (!row) {
          router.replace("/auth/invite?reason=not_invited")
          return
        }

        setProfile({ ...row, email: row.email ?? session.user.email ?? null })
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile.")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200"
            style={{ borderTopColor: ACCENT }}
          />
          <p className="text-sm text-gray-600">Loading profile…</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error ?? "Profile not found."}
        </div>
      </div>
    )
  }

  const specialties = parseSpecialties(profile.specialty)
  const displayName = profile.username ?? "Unnamed"

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>

      <div className="mt-6 space-y-4">
        {/* Profile card */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} />
              <span className="text-sm font-semibold text-gray-900">Profile</span>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="grid max-w-[560px] grid-cols-[160px_1fr] gap-3">
                  <span className="text-sm text-gray-500">Username</span>
                  <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                </div>
              </div>

              <div className="h-px bg-gray-200" />

              <div className="px-4 py-4">
                <div className="grid max-w-[560px] grid-cols-[160px_1fr] gap-3">
                  <span className="text-sm text-gray-500">Email</span>
                  <span className="text-sm font-semibold text-gray-900">{profile.email ?? "—"}</span>
                </div>
              </div>

              <div className="h-px bg-gray-200" />

              <div className="px-4 py-4">
                <div className="grid max-w-[560px] grid-cols-[160px_1fr] gap-3">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {profile.phone ?? (
                      <span className="text-gray-400">
                        Not set —{" "}
                        <a href="/staff/settings" className="text-[#00c065] hover:underline underline-offset-2">
                          add in Settings
                        </a>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {specialties.length > 0 && (
                <>
                  <div className="h-px bg-gray-200" />
                  <div className="px-4 py-4">
                    <div className="flex max-w-[560px] flex-wrap items-start gap-3">
                      <span className="w-[160px] shrink-0 text-sm text-gray-500">Specialties</span>
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Performance placeholder */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} />
              <span className="text-sm font-semibold text-gray-900">Performance & Work</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">
                Performance data and work history will appear here once reports are submitted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
