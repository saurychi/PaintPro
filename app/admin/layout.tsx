import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import AdminShellClient from "./AdminShellClient"

type DbUser = {
  id: string
  username: string | null
  email: string | null
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
  profile_image_url: string | null
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
        set() {},
        remove() {},
      },
    }
  )

  const { data: userData } = await supabase.auth.getUser()
  const authUser = userData.user
  if (!authUser) redirect("/auth/signin")

  const { data: profile } = await supabase
    .from("users")
    .select("id, username, email, role, status, profile_image_url")
    .eq("id", authUser.id)
    .maybeSingle<DbUser>()

  if (!profile) redirect("/auth/invite?reason=not_invited")
  if (profile.status !== "active") redirect("/auth/post-auth")
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/auth/post-auth")

  return (
    <AdminShellClient
      role={profile.role}
      user={{
        id: profile.id,
        username: profile.username ?? authUser.user_metadata?.username ?? null,
        email: profile.email ?? authUser.email ?? null,
        role: profile.role,
        profile_image_url: profile.profile_image_url ?? authUser.user_metadata?.avatar_url ?? null,
      }}
    >
      {children}
    </AdminShellClient>
  )
}
