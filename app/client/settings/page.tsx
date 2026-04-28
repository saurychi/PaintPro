"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

const ACCENT = "#00c065"

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2"
const btnNeutral =
  `${btnBase} border border-gray-200 bg-white px-3 h-9 text-gray-700 hover:bg-gray-50 hover:shadow-md`
const btnDanger =
  `${btnBase} border border-red-200 bg-white px-4 py-2 text-red-600 hover:bg-red-50 hover:shadow-md`

export default function ClientSettings() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/client-access", { method: "DELETE" })
    } catch {}

    try {
      localStorage.removeItem("paintpro_client_access")
      sessionStorage.removeItem("paintpro_client_access")
      document.cookie = "paintpro_client_access=; path=/; max-age=0; SameSite=Lax"
    } catch {}

    router.replace("/auth/signin")
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="mt-6">
        <Card>
          <div className="grid gap-6">
            {/* Appearance */}
            <div>
              <div className="mt-5 grid gap-3">
                <SectionTitle
                  title="Appearance"
                  subtitle="Control the look and feel of the interface."
                />
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Dark mode</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Switch between light and dark interface.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    className={btnNeutral}>
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              </div>
            </div>

            {/* Session */}
            <div>
              <div className="h-px w-full bg-gray-200" />
              <div className="mt-5 grid gap-3">
                <SectionTitle
                  title="Session"
                  subtitle="Sign out of your client session on this device."
                />
                <div>
                  <button type="button" onClick={handleLogout} className={btnDanger}>
                    Log Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
      <div className="p-4">{children}</div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: ACCENT }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-gray-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}
