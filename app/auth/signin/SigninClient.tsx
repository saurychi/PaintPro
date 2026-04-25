"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { FcGoogle } from "react-icons/fc"

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

type SigninMode = "internal" | "client"

export default function SigninClient() {
  const router = useRouter()
  const params = useSearchParams()
  const choose = params.get("choose") === "1"

  const [mode, setMode] = useState<SigninMode>("internal")

  const [identity, setIdentity] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [projectCode, setProjectCode] = useState("")
  const [showProjectCode, setShowProjectCode] = useState(false)
  const [rememberClientAccess, setRememberClientAccess] = useState(true)

  const [error, setError] = useState("")
  const [checkingSession, setCheckingSession] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const e = params.get("email")
    if (e) {
      setIdentity(e)
      setMode("internal")
    }
  }, [params])

  useEffect(() => {
    const auto = async () => {
      setError("")

      try {
        if (choose) {
          await supabase.auth.signOut()
          setCheckingSession(false)
          return
        }

        const { data, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) throw sessionErr

        const session = data.session
        if (session) {
          router.replace("/auth/post-auth")
          return
        }

        try {
          const saved =
            localStorage.getItem("paintpro_client_access") ||
            sessionStorage.getItem("paintpro_client_access")

          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed?.project_id && parsed?.project_code) {
              router.replace("/client")
              return
            }
          }
        } catch (storageErr) {
          console.error("Failed to read client access storage:", storageErr)
        }
      } catch (e) {
        console.error(e)
        setError("Failed to verify your account. Try again.")
      } finally {
        setCheckingSession(false)
      }
    }

    auto()
  }, [router, choose])

  const handleInternalSignin = async () => {
    setError("")

    const emailToUse = identity.trim().toLowerCase()
    if (!emailToUse || !password) {
      setError("Please enter your email and password.")
      return
    }

    if (!isEmail(emailToUse)) {
      setError("Please enter a valid email.")
      return
    }

    try {
      setLoading(true)

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      })

      if (signInError || !signInData.session) {
        setError(signInError?.message || "Failed to sign in.")
        return
      }

      router.replace("/auth/post-auth")
    } catch (err) {
      console.error(err)
      setError("Failed to sign in. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignin = async () => {
    setError("")

    try {
      setLoading(true)

      const origin = typeof window !== "undefined" ? window.location.origin : ""

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })

      if (oauthError) {
        setError(oauthError.message || "Google sign in failed. Try again.")
      }
    } catch (err) {
      console.error(err)
      setError("Google sign in failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleClientAccess = async () => {
    setError("")

    const code = projectCode.trim()
    if (!code) {
      setError("Please enter your client code.")
      return
    }

    try {
      setLoading(true)

      const res = await fetch("/api/auth/client-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectCode: code, remember: rememberClientAccess }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || "Failed to verify client code.")
        return
      }

      // Keep in storage so the auto-redirect check on next visit still works
      const payload = JSON.stringify({
        project_id: data.projectId,
        project_code: data.projectCode,
      })

      try {
        localStorage.removeItem("paintpro_client_access")
        sessionStorage.removeItem("paintpro_client_access")

        if (rememberClientAccess) {
          localStorage.setItem("paintpro_client_access", payload)
        } else {
          sessionStorage.setItem("paintpro_client_access", payload)
        }
      } catch {}

      router.replace("/client")
    } catch (err) {
      console.error(err)
      setError("Failed to access project. Try again.")
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/paint_pro_logo.png"
              alt="PaintPro Logo"
              width={90}
              height={90}
              priority
              className="object-contain"
            />
            <span className="text-3xl font-semibold text-gray-900">PaintPro</span>
          </div>
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#00c065]" />
          <p className="text-sm text-gray-600">Checking your account...</p>
        </div>
      </div>
    )
  }

return (
  <div className="min-h-svh w-full bg-white">
    <div className="grid min-h-svh w-full grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <Image
          src="/signup_bg.jpg"
          alt="Sign in background"
          fill
          priority
          className="object-cover"
        />
      </div>

      <div className="flex w-full justify-center px-6 py-10 lg:items-start lg:pt-16">
        <div className="w-full max-w-[460px]">
          <div className="mb-8 flex items-center gap-4">
            <Image
              src="/paint_pro_logo.png"
              alt="PaintPro Logo"
              width={90}
              height={90}
              priority
              className="object-contain"
            />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#00c065]">
                Welcome back
              </p>
              <h1 className="mt-1 text-[32px] font-semibold leading-tight text-gray-900">
                Sign in to your account
              </h1>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("internal")
                setError("")
              }}
              className={[
                "rounded-md px-4 py-2 text-sm font-semibold transition-all",
                mode === "internal"
                  ? "bg-[#00c065] text-white shadow-sm"
                  : "text-gray-700 hover:bg-white",
              ].join(" ")}
            >
              Staff
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("client")
                setError("")
              }}
              className={[
                "rounded-md px-4 py-2 text-sm font-semibold transition-all",
                mode === "client"
                  ? "bg-[#00c065] text-white shadow-sm"
                  : "text-gray-700 hover:bg-white",
              ].join(" ")}
            >
              Client
            </button>
          </div>

          {mode === "internal" ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <label className="text-sm text-gray-700">Email</label>
                  <input
                    type="email"
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>

                <div className="grid gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>

                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) {
                        void handleInternalSignin()
                      }
                    }}
                    placeholder="Enter your password"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>

                <div className="min-h-[20px]">
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>

                <button
                  type="button"
                  onClick={handleInternalSignin}
                  disabled={loading}
                  className="w-full rounded-lg bg-[#00c065] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleSignin}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FcGoogle className="h-5 w-5" />
                  <span>Continue with Google</span>
                </button>

                <p className="text-center text-[12px] text-gray-700">
                  Need an invite first?{" "}
                  <Link
                    href="/auth/invite"
                    className="font-semibold text-[#00c065] hover:underline"
                  >
                    Go to invite check
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Client Code</label>
                    <button
                      type="button"
                      onClick={() => setShowProjectCode((v) => !v)}
                      className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
                    >
                      {showProjectCode ? "Hide" : "Show"}
                    </button>
                  </div>

                  <input
                    type={showProjectCode ? "text" : "password"}
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) {
                        void handleClientAccess()
                      }
                    }}
                    placeholder="Enter your project code"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={rememberClientAccess}
                    onChange={(e) => setRememberClientAccess(e.target.checked)}
                    className="h-4 w-4 rounded border border-gray-300"
                  />
                  <span>Remember access on this device</span>
                </label>

                <div className="min-h-[20px]">
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>

                <button
                  type="button"
                  onClick={handleClientAccess}
                  disabled={loading}
                  className="w-full rounded-lg bg-[#00c065] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Checking..." : "Access project"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)
}
