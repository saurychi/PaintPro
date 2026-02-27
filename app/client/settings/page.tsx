"use client"

import React, { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"

const ACCENT = "#00c065"
const ACCENT_HOVER = "#00a054"

function ClientSettings() {
  const router = useRouter()

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

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.replace("/auth/signin")
      }
    }

    checkSession()
  }, [router])

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setProfile((prev) => ({ ...prev, [name]: value }))
  }

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ✅ Supabase logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.replace("/auth/signin")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        <div className="h-full overflow-y-auto pr-1">
          <div className="w-full">
            {/* Profile Details */}
            <SectionHeader title="Profile Details" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <Field className="md:col-span-2" label="Phone Number">
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
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </Card>

            {/* Actions */}
            <div className="mt-8">
              <SectionHeader title="Actions" />
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
            <div className="mt-8 pb-6">
              <SectionHeader title="Authentication" />
              <Card>
                <p className="text-sm font-semibold text-gray-900">Log out of this PC</p>
                <p className="mt-1 text-sm text-gray-600">
                  You will be redirected to the sign-in page after logging out.
                </p>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-gray-50"
                  >
                    Logout
                  </button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-sm font-semibold text-gray-900 whitespace-nowrap">{title}</h2>
      <div className="h-px bg-gray-200 w-full" />
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">{children}</div>
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
      <label className="block text-sm font-semibold text-gray-900 mb-2">{label}</label>
      {children}
    </div>
  )
}

function TextInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm",
        "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00c065]/20 focus:border-[#00c065]",
        className,
      ].join(" ")}
    />
  )
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">{icon}</div>
      {children}
    </div>
  )
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors"
      style={{ backgroundColor: ACCENT }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
    >
      {children}
    </button>
  )
}

/**
 * Toggle Row
 * - whole row is clickable
 * - switch uses rounded-lg / rounded-md (no rounded-full)
 */
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
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition-colors"
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
        </div>

        <div className="shrink-0 flex flex-col items-end">
          <div
            className="relative h-8 w-16 rounded-lg border border-gray-200 bg-white shadow-sm p-1"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 rounded-lg transition-opacity"
              style={{
                backgroundColor: ACCENT,
                opacity: active ? 0.12 : 0,
              }}
            />
            <div
              className="relative h-6 w-1/2 rounded-md border border-gray-200 bg-white shadow-sm transition-transform"
              style={{
                transform: active ? "translateX(100%)" : "translateX(0%)",
                borderColor: active ? ACCENT : undefined,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-500">{active ? "On" : "Off"}</p>
        </div>
      </div>
    </button>
  )
}

export default ClientSettings
