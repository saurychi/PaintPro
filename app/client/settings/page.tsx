"use client"

import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useClientProject } from "../ClientShellClient"

const ACCENT = "var(--cp-brand)"
const ACCENT_HOVER = "var(--cp-brand-hover)"

function ClientSettings() {
  const router = useRouter()
  const { projectId } = useClientProject()
  const isClientAccess = Boolean(projectId)
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const [profile, setProfile] = useState({
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "0X XXXX XXXX",
  })

  const [toggles, setToggles] = useState({
    jobUpdates: false,
    messages: true,
    autoDownload: true,
    assignEmployees: true,
  })

  const [pw, setPw] = useState({ next: "", confirm: "" })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // Cookie-based clients don't have a Supabase account — always hide password section
  const [hidePasswordSection, setHidePasswordSection] = useState(isClientAccess)

  const [showPwNext, setShowPwNext] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)

  useEffect(() => {
    // Cookie-based client: no Supabase session needed, skip the check entirely
    if (isClientAccess) return

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      const session = data.session

      if (error) {
        console.error(error)
      }

      if (!session) {
        router.replace("/auth/signin")
        return
      }

      // If Google is linked, hide the change password section.
      const providers = (session.user.app_metadata as any)?.providers as string[] | undefined
      const provider = (session.user.app_metadata as any)?.provider as string | undefined

      const hasGoogle = (providers?.includes("google") ?? false) || provider === "google"

      setHidePasswordSection(hasGoogle)

      if (hasGoogle) {
        setPw({ next: "", confirm: "" })
        setPwErr(null)
        setPwMsg(null)
        setShowPwNext(false)
        setShowPwConfirm(false)
      }
    }

    checkSession()
  }, [router, isClientAccess])

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setProfile((prev) => ({ ...prev, [name]: value }))
  }

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleChangePassword = async () => {
    setPwErr(null)
    setPwMsg(null)

    const next = pw.next.trim()
    const confirm = pw.confirm.trim()

    if (!next || next.length < 8) {
      setPwErr("Password must be at least 8 characters.")
      return
    }
    if (next !== confirm) {
      setPwErr("Passwords do not match.")
      return
    }

    try {
      setPwBusy(true)
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) {
        setPwErr(error.message || "Failed to change password.")
        return
      }

      setPw({ next: "", confirm: "" })
      setPwMsg("Password updated successfully.")
      setShowPwNext(false)
      setShowPwConfirm(false)
    } catch (e: any) {
      console.error(e)
      setPwErr(e?.message || "Failed to change password.")
    } finally {
      setPwBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      if (isClientAccess) {
        // Clear the project-code cookie and any local storage
        await fetch("/api/auth/client-access", { method: "DELETE" })
        try {
          localStorage.removeItem("paintpro_client_access")
          sessionStorage.removeItem("paintpro_client_access")
        } catch {}
      } else {
        await supabase.auth.signOut()
      }
      router.replace("/auth/signin?choose=1")
    } catch (error) {
      console.error("Error signing out:", error)
      router.replace("/auth/signin?choose=1")
    }
  }

  return (
    <div
      className="h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden p-6"
      style={{ color: "var(--cp-text)" }}
    >
      <h1 className="text-2xl font-semibold" style={{ color: "var(--cp-text)" }}>
        Settings
      </h1>

      <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        <div className="h-full overflow-y-auto pr-1">
          <div className="w-full space-y-8">
            {/* Profile */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Profile</h2>
              </div>

              <Card>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="First name">
                    <TextInput
                      name="firstName"
                      value={profile.firstName}
                      onChange={handleProfileChange}
                      placeholder="First name"
                    />
                  </Field>

                  <Field label="Last name">
                    <TextInput
                      name="lastName"
                      value={profile.lastName}
                      onChange={handleProfileChange}
                      placeholder="Last name"
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <div className="my-1 h-px w-full bg-gray-200" />
                  </div>

                  <Field className="md:col-span-2" label="Email">
                    <IconInput
                      icon={
                        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      }
                    >
                      <TextInput
                        type="email"
                        name="email"
                        value={profile.email}
                        onChange={handleProfileChange}
                        placeholder="Email"
                        className="pl-10"
                      />
                    </IconInput>
                  </Field>

                  <Field className="md:col-span-2" label="Phone number">
                    <IconInput
                      icon={
                        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                      }
                    >
                      <TextInput
                        type="tel"
                        name="phone"
                        value={profile.phone}
                        onChange={handleProfileChange}
                        placeholder="Phone number"
                        className="pl-10"
                      />
                    </IconInput>
                  </Field>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <PrimaryButton>Save</PrimaryButton>

                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 ease-out active:scale-[0.98]"
                    style={{
                      border: "1px solid var(--cp-border)",
                      background: "var(--cp-surface)",
                      color: "var(--cp-text)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </Card>
            </div>

            {/* Appearance */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Appearance</h2>
              </div>
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Dark mode</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--cp-text-muted)" }}>Switch between light and dark interface.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98]"
                    style={{
                      border: "1px solid var(--cp-border-2)",
                      background: isDark ? "var(--cp-brand-light-2)" : "var(--cp-surface)",
                      color: "var(--cp-text-2)",
                    }}
                  >
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              </Card>
            </div>

            {/* Preferences */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Preferences</h2>
              </div>

              <Card>
                <div className="space-y-3">
                  <ToggleRow
                    label="Receive notifications from job updates"
                    description="Get notified when job status, schedule, or tasks are updated."
                    active={toggles.jobUpdates}
                    onClick={() => handleToggle("jobUpdates")}
                  />
                  <ToggleRow
                    label="Receive notifications from messages"
                    description="Get notified when clients or staff send new messages."
                    active={toggles.messages}
                    onClick={() => handleToggle("messages")}
                  />
                  <ToggleRow
                    label="Auto download documents (quotes, invoice, etc.)"
                    description="Automatically download generated documents to this device."
                    active={toggles.autoDownload}
                    onClick={() => handleToggle("autoDownload")}
                  />
                  <ToggleRow
                    label="Automatically assign employees"
                    description="Let the system auto-assign employees based on availability."
                    active={toggles.assignEmployees}
                    onClick={() => handleToggle("assignEmployees")}
                  />
                </div>
              </Card>
            </div>

            {/* Authentication */}
            <div className="pb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Authentication</h2>
              </div>

              <Card>
                {!hidePasswordSection ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Change password</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--cp-text-muted)" }}>Update your account password.</p>

                      <div className="mt-4 grid grid-cols-1 gap-4">
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="block text-sm font-semibold" style={{ color: "var(--cp-text)" }}>New password</label>
                            <button
                              type="button"
                              onClick={() => setShowPwNext((v) => !v)}
                              className="text-sm font-semibold transition active:scale-[0.98]"
                              style={{ color: "var(--cp-brand)" }}
                            >
                              {showPwNext ? "Hide" : "Show"}
                            </button>
                          </div>
                          <TextInput
                            type={showPwNext ? "text" : "password"}
                            value={pw.next}
                            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                            placeholder="At least 8 characters"
                          />
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="block text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Confirm new password</label>
                            <button
                              type="button"
                              onClick={() => setShowPwConfirm((v) => !v)}
                              className="text-sm font-semibold transition active:scale-[0.98]"
                              style={{ color: "var(--cp-brand)" }}
                            >
                              {showPwConfirm ? "Hide" : "Show"}
                            </button>
                          </div>
                          <TextInput
                            type={showPwConfirm ? "text" : "password"}
                            value={pw.confirm}
                            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                            placeholder="Repeat password"
                          />
                        </div>
                      </div>

                      {pwErr ? (
                        <p className="mt-3 text-sm font-semibold" style={{ color: "var(--cp-danger)" }}>{pwErr}</p>
                      ) : null}
                      {pwMsg ? (
                        <p className="mt-3 text-sm font-semibold" style={{ color: "var(--cp-success)" }}>{pwMsg}</p>
                      ) : null}

                      <div className="mt-4 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={pwBusy}
                          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: "var(--cp-brand)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cp-brand-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--cp-brand)")}
                        >
                          {pwBusy ? "Updating..." : "Update password"}
                        </button>
                      </div>
                    </div>

                    <div className="my-6 h-px w-full" style={{ background: "var(--cp-border)" }} />
                  </>
                ) : null}

                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Log out of this PC</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--cp-text-muted)" }}>You will be redirected to the sign-in page after logging out.</p>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 ease-out hover:shadow-md active:scale-[0.98]"
                      style={{
                        border: "1px solid var(--cp-danger)",
                        background: "var(--cp-surface)",
                        color: "var(--cp-danger)",
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full rounded-lg p-4 shadow-sm"
      style={{ border: "1px solid var(--cp-border)", background: "var(--cp-surface)" }}
    >
      {children}
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{label}</label>
      {children}
    </div>
  )
}

function TextInput({ className = "", style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={["w-full rounded-lg px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2", className].join(" ")}
      style={{
        border: "1px solid var(--cp-border)",
        background: "var(--cp-surface)",
        color: "var(--cp-text)",
        // @ts-expect-error CSS var ring
        "--tw-ring-color": "var(--cp-brand-light)",
        ...style,
      }}
    />
  )
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{icon}</div>
      {children}
    </div>
  )
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out active:scale-[0.98]"
      style={{ backgroundColor: ACCENT }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
    >
      {children}
    </button>
  )
}

function ToggleRow({
  label,
  description,
  active,
  onClick,
}: {
  label: string
  description?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg p-4 text-left shadow-sm transition-all duration-200 ease-out active:scale-[0.99]"
      style={{ border: "1px solid var(--cp-border)", background: "var(--cp-surface)" }}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{label}</p>
          {description ? (
            <p className="mt-1 text-sm" style={{ color: "var(--cp-text-muted)" }}>{description}</p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col items-end">
          <div
            className="relative h-8 w-16 rounded-lg p-1 shadow-sm"
            style={{ border: "1px solid var(--cp-border)", background: "var(--cp-surface)" }}
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 rounded-lg transition-opacity"
              style={{ backgroundColor: ACCENT, opacity: active ? 0.12 : 0 }}
            />
            <div
              className="relative h-6 w-1/2 rounded-md shadow-sm transition-transform"
              style={{
                transform: active ? "translateX(100%)" : "translateX(0%)",
                border: active ? `1px solid ${ACCENT}` : "1px solid var(--cp-border)",
                background: "var(--cp-surface)",
              }}
            />
          </div>
          <p className="mt-1 text-[10px]" style={{ color: "var(--cp-text-faint)" }}>
            {active ? "On" : "Off"}
          </p>
        </div>
      </div>
    </button>
  )
}

export default ClientSettings
