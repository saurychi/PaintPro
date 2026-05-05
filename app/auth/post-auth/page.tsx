"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

type DbUser = {
  id: string
  role: "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
}

export default function PostAuthPage() {
  const router = useRouter()
  const [err, setErr] = useState("")

  useEffect(() => {
    const run = async () => {
      setErr("")

      try {
        const { data, error: sessErr } = await supabase.auth.getSession()
        if (sessErr) throw sessErr

        const session = data.session
        if (!session) {
          router.replace("/auth/signin")
          return
        }

        const userId = session.user.id
        const email = (session.user.email || "").trim().toLowerCase()

        const { data: profile, error: profErr } = await supabase
          .from("users")
          .select("id, role, status")
          .eq("id", userId)
          .maybeSingle<DbUser>()

        if (profErr) throw profErr

        if (!profile) {
          try {
            await fetch("/api/auth/purge-uninvited", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            })
          } catch (e) {
            console.error("Purge failed:", e)
          } finally {
            await supabase.auth.signOut()
            router.replace("/auth/invite?reason=not_invited")
          }
          return
        }

        // Normalize so a stray capital letter / trailing whitespace in the DB
        // doesn't wedge the user between this page and /admin (the admin
        // layout uses strict === "active" checks; if we redirect to /admin
        // for a user whose status doesn't strictly match, the layout boots
        // them right back here → infinite loop).
        const status = String(profile.status ?? "").trim().toLowerCase()
        const role = String(profile.role ?? "").trim().toLowerCase()

        if (status === "inactive") {
          await supabase.auth.signOut()
          router.replace("/auth/signin?reason=inactive")
          return
        }

        if (status === "pending") {
          router.replace("/auth/setup-profile")
          return
        }

        if (email) {
          const { data: hasPending, error: invErr } = await supabase.rpc("has_pending_invite", {
            p_email: email,
          })

          if (invErr) throw invErr

          if (hasPending) {
            router.replace("/auth/setup-profile")
            return
          }
        }

        // Only let users into /admin or /staff if their status is the exact
        // shape the destination layouts expect. Anything else (null, an
        // unrecognized string, etc.) is treated as a bad account and bounced
        // back to sign-in instead of being looped back here.
        if (status !== "active") {
          console.error(
            "[post-auth] unexpected profile status, signing out:",
            JSON.stringify(profile.status),
          )
          await supabase.auth.signOut()
          router.replace("/auth/signin?reason=invalid_status")
          return
        }

        if (role === "admin" || role === "manager") {
          router.replace("/admin")
          return
        }

        if (role === "staff") {
          router.replace("/staff")
          return
        }

        await supabase.auth.signOut()
        router.replace("/auth/signin?reason=invalid_role")
        return
      } catch (e: any) {
        console.error(e)
        setErr(e?.message || "Failed to route your account.")
      }
    }

    run()
  }, [router])

  return (
    <div className="min-h-svh flex items-center justify-center bg-white px-6 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin dark:border-x-slate-700 dark:border-b-slate-700" />
        <p className="text-sm text-gray-600 dark:text-slate-400">Setting up your session...</p>
        {err ? <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p> : null}
      </div>
    </div>
  )
}
