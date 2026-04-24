"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import rawCountries from "@/lib/data/country-by-calling-code.json"

type CountryRaw = {
  country: string
  calling_code: number
}

type CountryOption = {
  label: string
  code: string
}

type ProfileRow = {
  username: string | null
  phone: string | null
  status: "active" | "inactive" | "pending" | null
}

function isPhoneNumber(value: string) {
  if (!value) return true
  return /^[0-9\s-]{5,20}$/.test(value)
}

export default function SetupProfilePage() {
  const router = useRouter()

  const countries: CountryOption[] = useMemo(() => {
    const codes = Array.from(
      new Set(
        (rawCountries as CountryRaw[])
          .filter((c) => c?.calling_code)
          .map((c) => `+${c.calling_code}`)
      )
    ).sort((a, b) => a.localeCompare(b))
    return codes.map((code) => ({ label: code, code }))
  }, [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [err, setErr] = useState("")
  const [isPendingUser, setIsPendingUser] = useState(false)

  const [showPw1, setShowPw1] = useState(false)
  const [showPw2, setShowPw2] = useState(false)

  const [form, setForm] = useState({
    username: "",
    countryCode: "+63",
    phoneLocal: "",
    newPassword: "",
    confirmPassword: "",
  })

  const canSave = useMemo(() => {
    const u = form.username.trim()
    if (u.length < 2) return false
    if (!isPhoneNumber(form.phoneLocal.trim())) return false

    const pw = form.newPassword.trim()
    const pw2 = form.confirmPassword.trim()

    if (isPendingUser) {
      if (pw.length < 8) return false
      if (pw !== pw2) return false
    } else if (pw || pw2) {
      if (pw.length < 8) return false
      if (pw !== pw2) return false
    }

    return !saving
  }, [form, saving, isPendingUser])

  useEffect(() => {
    const boot = async () => {
      setErr("")
      setLoading(true)

      try {
        const { data, error: sErr } = await supabase.auth.getSession()
        if (sErr) throw sErr

        const session = data.session
        if (!session) {
          router.replace("/auth/signin")
          return
        }

        const { data: profile, error: pErr } = await supabase
          .from("users")
          .select("username, phone, status")
          .eq("id", session.user.id)
          .maybeSingle<ProfileRow>()

        if (pErr) throw pErr

        const currentStatus = profile?.status ?? null
        setIsPendingUser(currentStatus === "pending")

        let countryCode = "+63"
        let phoneLocal = ""

        if (profile?.phone) {
          const raw = String(profile.phone)
          const match = raw.match(/^(\+\d+)\s*(.*)$/)
          if (match) {
            countryCode = match[1]
            phoneLocal = match[2] || ""
          } else {
            phoneLocal = raw
          }
        }

        setForm((p) => ({
          ...p,
          username: profile?.username || "",
          countryCode,
          phoneLocal,
        }))
      } catch (e: any) {
        console.error(e)
        setErr(e?.message || "Failed to load setup.")
      } finally {
        setLoading(false)
      }
    }

    boot()
  }, [router])

  const chooseAnotherAccount = async () => {
    if (switching) return
    setErr("")

    try {
      setSwitching(true)
      await supabase.auth.signOut()
      router.replace("/auth/signin?choose=1")
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || "Failed to sign out.")
    } finally {
      setSwitching(false)
    }
  }

  const submit = async () => {
    setErr("")

    const username = form.username.trim()
    const phoneLocal = form.phoneLocal.trim()
    const countryCode = form.countryCode.trim()

    if (username.length < 2) {
      setErr("Please enter a valid username.")
      return
    }

    if (!isPhoneNumber(phoneLocal)) {
      setErr("Please enter a valid phone number.")
      return
    }

    const pw = form.newPassword.trim()
    const pw2 = form.confirmPassword.trim()

    if (isPendingUser) {
      if (pw.length < 8) {
        setErr("Please create a new password with at least 8 characters.")
        return
      }
      if (pw !== pw2) {
        setErr("Passwords do not match.")
        return
      }
    } else if (pw || pw2) {
      if (pw.length < 8) {
        setErr("Password must be at least 8 characters.")
        return
      }
      if (pw !== pw2) {
        setErr("Passwords do not match.")
        return
      }
    }

    try {
      setSaving(true)

      const { data, error: sErr } = await supabase.auth.getSession()
      if (sErr) throw sErr

      const session = data.session
      if (!session) {
        router.replace("/auth/signin")
        return
      }

      const phoneFull = phoneLocal ? `${countryCode} ${phoneLocal}` : ""

      if (pw) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: pw })
        if (pwErr) throw pwErr
      }

      const { error: finErr } = await supabase.rpc("finalize_onboarding", {
        p_username: username,
        p_phone: phoneFull,
      })

      if (finErr) throw finErr

      router.replace("/auth/post-auth")
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || "Failed to complete setup.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin" />
          <p className="text-sm text-gray-600">Loading setup...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/paint_pro_logo.png" alt="PaintPro logo" width={44} height={44} priority />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-gray-900">Complete your profile</h1>
              <p className="mt-1 text-sm text-gray-600">
                {isPendingUser
                  ? "This is required on your first login. Please update your details and create a new password."
                  : "Finish setting up your account details."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={chooseAnotherAccount}
            disabled={switching || saving}
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {switching ? "Signing out..." : "Choose another account"}
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold text-gray-900">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                placeholder="e.g. Walter"
              />
            </div>

            <div className="h-px w-full bg-gray-200" />

            <div className="grid gap-1.5">
              <label className="text-sm font-semibold text-gray-900">Phone number</label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_1fr]">
                <select
                  value={form.countryCode}
                  onChange={(e) => setForm((p) => ({ ...p, countryCode: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <input
                  value={form.phoneLocal}
                  onChange={(e) => setForm((p) => ({ ...p, phoneLocal: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  placeholder="9xx xxx xxxx"
                />
              </div>

              <p className="text-[12px] text-gray-500">
                We will save it as {form.countryCode} plus your number.
              </p>
            </div>

            <div className="h-px w-full bg-gray-200" />

            <div className="grid gap-1.5">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {isPendingUser ? "Create a new password" : "Set a password (optional)"}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {isPendingUser
                    ? "This is required before you can continue to your account."
                    : "If you signed in with Google, adding a password lets you also sign in using email and password."}
                </p>
              </div>

              <div className="mt-2 grid gap-3">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-gray-900">New password</label>
                    <button
                      type="button"
                      onClick={() => setShowPw1((v) => !v)}
                      className="text-sm font-semibold text-[#00c065] transition hover:text-[#00a054] active:scale-[0.98]"
                    >
                      {showPw1 ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    type={showPw1 ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                    placeholder="New password"
                  />
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-gray-900">Confirm password</label>
                    <button
                      type="button"
                      onClick={() => setShowPw2((v) => !v)}
                      className="text-sm font-semibold text-[#00c065] transition hover:text-[#00a054] active:scale-[0.98]"
                    >
                      {showPw2 ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    type={showPw2 ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                    placeholder="Confirm password"
                  />
                </div>
              </div>
            </div>

            {err ? <p className="text-sm font-semibold text-red-600">{err}</p> : null}

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={submit}
                disabled={!canSave}
                className="inline-flex items-center gap-2 rounded-lg bg-[#00c065] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Finish setup"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
