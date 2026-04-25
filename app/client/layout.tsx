import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import ClientShellClient from "./ClientShellClient"

const CLIENT_COOKIE = "paintpro_client_project_id"

type DbUser = {
  id: string
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
}

const ALLOW_CROSS_ROLE_ACCESS = true
const ALLOWED_ROLES: DbUser["role"][] = ["client", "admin", "manager", "staff"]

export default async function ClientLayout({ children }: { children: ReactNode }) {
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

  // No Supabase session — check for project-code cookie access
  if (!authUser) {
    const clientProjectId = cookieStore.get(CLIENT_COOKIE)?.value
    if (!clientProjectId) redirect("/auth/signin")
    return (
      <ClientShellClient role="client" projectId={clientProjectId}>
        {children}
      </ClientShellClient>
    )
  }

  // Supabase session exists — staff / admin flow
  const { data: profile } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("id", authUser.id)
    .maybeSingle<DbUser>()

  if (!profile) redirect("/auth/invite?reason=not_invited")
  if (profile.status !== "active") redirect("/auth/post-auth")

  if (!ALLOW_CROSS_ROLE_ACCESS) {
    if (profile.role !== "client") redirect("/auth/post-auth")
  } else {
    if (!ALLOWED_ROLES.includes(profile.role)) redirect("/auth/post-auth")
  }

  const sidebarRole: DbUser["role"] = ALLOW_CROSS_ROLE_ACCESS ? profile.role : "client"

  return (
    <ClientShellClient role={sidebarRole} projectId={null}>
      {children}
    </ClientShellClient>
  )
}
