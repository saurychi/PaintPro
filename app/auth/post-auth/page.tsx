"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

type DbUser = {
  id: string
  role: "client" | "staff" | "manager" | "admin"
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

        const { data: profile, error: profErr } = await supabase
          .from("users")
          .select("id, role, status")
          .eq("id", userId)
          .maybeSingle<DbUser>()

        if (profErr) throw profErr

        if (!profile) {
          try {
            const { data: sess } = await supabase.auth.getSession()
            const uid = sess.session?.user?.id

            if (uid) {
              await fetch("/api/auth/purge-uninvited", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: uid }),
              })
            }
          } catch (e) {
            console.error("Purge failed:", e)
          } finally {
            await supabase.auth.signOut()
            router.replace("/auth/invite?reason=not_invited")
          }
          return
        }

        if (profile.status === "inactive") {
          await supabase.auth.signOut()
          router.replace("/auth/signin?reason=inactive")
          return
        }

        const email = (session.user.email || "").trim().toLowerCase()
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

        if (profile.role === "admin" || profile.role === "manager") {
          router.replace("/admin")
          return
        }

        if (profile.role === "staff") {
          router.replace("/staff")
          return
        }

        router.replace("/client")
      } catch (e: any) {
        console.error(e)
        setErr(e?.message || "Failed to route your account.")
      }
    }

    run()
  }, [router])

  return (
    <div className="min-h-svh flex items-center justify-center bg-white px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin" />
        <p className="text-sm text-gray-600">Setting up your session…</p>
        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      </div>
    </div>
  )
}
