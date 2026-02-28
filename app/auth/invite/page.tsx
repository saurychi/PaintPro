"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Mail } from "lucide-react"

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function InvitePage() {
  const router = useRouter()
  const params = useSearchParams()

  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const reason = params.get("reason")
    if (!reason) return

    if (reason === "not_invited") {
      setError("This account is not invited. Please contact the admin for access.")
    } else if (reason === "inactive") {
      setError("Your account is inactive. Please contact the admin.")
    } else {
      setError("You cannot access PaintPro with this account.")
    }
  }, [params])

  const checkInvite = async () => {
    setError("")
    const e = email.trim().toLowerCase()

    if (!e || !isEmail(e)) {
      setError("Please enter a valid email.")
      return
    }

    try {
      setLoading(true)

      const { data: invited, error: rpcErr } = await supabase.rpc("is_invited", {
        p_email: e,
      })

      if (rpcErr) throw rpcErr

      if (!invited) {
        setError("This email is not invited yet. Please contact the admin.")
        return
      }

      router.replace(`/auth/signin?email=${encodeURIComponent(e)}`)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "Failed to check invite. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh w-full bg-white">
      <div className="grid min-h-svh w-full grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden lg:block">
          <Image src="/signup_bg.jpg" alt="Invite background" fill priority className="object-cover" />
        </div>

        <div className="flex w-full items-center justify-center px-6 py-10">
          <div className="w-full max-w-[520px]">
            <h1 className="mb-2 text-left text-[30px] font-semibold text-gray-900">Invite check</h1>
            <p className="mb-6 text-sm text-gray-600">
              Enter your invited email to continue.
            </p>

            <div className="grid gap-3">
              <div className="grid gap-1">
                <label className="text-sm text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>
              </div>

              {error ? <p className="text-xs text-red-600">{error}</p> : null}

              <button
                type="button"
                onClick={checkInvite}
                disabled={loading}
                className={[
                  "w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                  "bg-[#00c065] hover:bg-[#00a054]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                ].join(" ")}
              >
                {loading ? "Checking..." : "Continue"}
              </button>

              <p className="text-center text-[12px] text-gray-700">
                Already signed in?{" "}
                <Link href="/auth/signin" className="font-semibold text-[#00c065] hover:underline">
                  Go to sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
