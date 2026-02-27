import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import AdminShellClient from "./AdminShellClient"

type DbUser = {
  id: string
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          try {
            ;(cookieStore as any).delete({ name, ...options })
          } catch {
            cookieStore.delete(name)
          }
        },
      },
    }
  )

  const { data: userData } = await supabase.auth.getUser()
  const authUser = userData.user
  if (!authUser) redirect("/auth/signin")

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("id", authUser.id)
    .maybeSingle<DbUser>()

  // No profile means not allowed in your system
  if (!profile) redirect("/auth/invite?reason=not_invited")

  // Block inactive or pending if you want to enforce active-only
  if (profile.status !== "active") redirect("/auth/post-auth")

  // Option B: admin + manager only
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/auth/post-auth")

  return <AdminShellClient role={profile.role}>{children}</AdminShellClient>
}
