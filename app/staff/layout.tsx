import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import StaffShellClient from "./StaffShellClient"

type DbUser = {
  id: string
  username: string | null
  email: string | null
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
  profile_image_url: string | null
}

export default async function StaffLayout({ children }: { children: ReactNode }) {
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
    .select("id, username, email, role, status, profile_image_url")
    .eq("id", authUser.id)
    .maybeSingle<DbUser>()

  if (!profile) redirect("/auth/invite?reason=not_invited")
  if (profile.status !== "active") redirect("/auth/post-auth")
  if (profile.role !== "staff") redirect("/auth/post-auth")

  return (
    <StaffShellClient
      user={{
        id: profile.id,
        username: profile.username ?? authUser.user_metadata?.username ?? null,
        email: profile.email ?? authUser.email ?? null,
        role: profile.role,
        profile_image_url: profile.profile_image_url ?? authUser.user_metadata?.avatar_url ?? null,
      }}
    >
      {children}
    </StaffShellClient>
  )
}
