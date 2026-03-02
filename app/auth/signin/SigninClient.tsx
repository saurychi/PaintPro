"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { FcGoogle } from "react-icons/fc"

type DbUser = {
  id: string
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function SigninClient() {
  const router = useRouter()
  const params = useSearchParams()
  const choose = params.get("choose") === "1"

  const [identity, setIdentity] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [checkingSession, setCheckingSession] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const e = params.get("email")
    if (e) setIdentity(e)
  }, [params])

  const checkInvite = async (email: string) => {
    const e = email.trim().toLowerCase()
    if (!e || !isEmail(e)) {
      setError("Please enter your invited email first.")
      return false
    }

    const { data: invited, error: rpcErr } = await supabase.rpc("is_invited", {
      p_email: e,
    })

    if (rpcErr) {
      setError(rpcErr.message || "Failed to verify invite.")
      return false
    }

    if (!invited) {
      setError("This email is not invited yet.")
      router.replace(`/auth/invite?email=${encodeURIComponent(e)}`)
      return false
    }

    return true
  }

  const routeByProfileFromUserId = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, role, status")
      .eq("id", userId)
      .maybeSingle<DbUser>()

    if (profileError) throw profileError

    if (!profile) {
      await supabase.auth.signOut()
      router.replace("/auth/invite?reason=not_invited")
      return
    }

    if (profile.status === "pending") {
      router.replace("/auth/post-auth")
      return
    }

    if (profile.status === "inactive") {
      setError("Your account has been deactivated.")
      return
    }

    if (profile.role === "admin" || profile.role === "manager") {
      router.replace("/admin")
      return
    }

    if (profile.role === "staff") {
      router.replace("/staff")
      return
    }

    router.replace("/client")
  }

  useEffect(() => {
    const auto = async () => {
      setError("")
      try {
        if (choose) {
          await supabase.auth.signOut()
          return
        }

        const { data, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) throw sessionErr

        const session = data.session
        if (!session) return

        await routeByProfileFromUserId(session.user.id)
      } catch (e) {
        console.error(e)
        setError("Failed to verify your account. Try again.")
      } finally {
        setCheckingSession(false)
      }
    }

    auto()
  }, [router, choose])

  const handleSignin = async () => {
    setError("")

    if (!identity || !password) {
      setError("Please enter your email and password.")
      return
    }

    try {
      setLoading(true)

      const emailToUse = identity.trim().toLowerCase()

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      })

      if (signInError || !signInData.session) {
        setError(signInError?.message || "Failed to sign in.")
        return
      }

      await routeByProfileFromUserId(signInData.session.user.id)
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
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin" />
          <p className="text-sm text-gray-600">Checking your account…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh w-full flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[32px] font-semibold text-gray-900 mb-6 text-left">Sign-in</h1>

        <div className="flex items-center gap-4 mb-8">
          <Image src="/paint_pro_logo.png" alt="PaintPro logo" width={100} height={100} priority />
          <span className="text-[34px] font-semibold text-[#00c065]">PaintPro</span>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-700">Email</label>
            <input
              type="email"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-3 pr-16 text-sm text-gray-700 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSignin}
            disabled={loading}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white bg-[#00c065] shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-[12px] text-gray-500">
            No invite? Go to{" "}
            <Link href="/auth/invite" className="font-semibold text-[#00c065] hover:underline">
              Invite check
            </Link>
            .
          </p>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500">OR</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignin}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-sm transition border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FcGoogle className="h-5 w-5" />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  )
}
