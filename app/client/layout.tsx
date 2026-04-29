import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import ClientShellClient from "./ClientShellClient"
import type { SidebarUser } from "@/components/app-sidebar"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

type DbUser = {
  id: string
  username: string | null
  email: string | null
  role: "client" | "staff" | "manager" | "admin"
  status: "active" | "inactive" | "pending"
  profile_image_url: string | null
}

type ProjectAccessRow = {
  project_id: string
  project_code: string | null
  client_id: string | null
}

type ClientProfileRow = {
  client_id: string
  full_name: string | null
  email: string | null
}

type CookieOptions = {
  domain?: string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  priority?: "low" | "medium" | "high"
  sameSite?: boolean | "lax" | "strict" | "none"
  secure?: boolean
}

const ALLOW_CROSS_ROLE_ACCESS = true
const ALLOWED_ROLES: DbUser["role"][] = ["client", "admin", "manager", "staff"]

async function getProjectAccessSidebarUser(
  projectId: string,
): Promise<SidebarUser | null> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, client_id")
    .eq("project_id", projectId)
    .maybeSingle<ProjectAccessRow>()

  if (projectError) throw projectError
  if (!project) return null

  if (!project.client_id) {
    return {
      id: project.project_id,
      username: project.project_code?.trim() || "Client",
      email: null,
      role: "client",
      profile_image_url: null,
    }
  }

  const { data: clientRow, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("client_id, full_name, email")
    .eq("client_id", project.client_id)
    .maybeSingle<ClientProfileRow>()

  if (clientError) throw clientError

  return {
    id: clientRow?.client_id ?? project.client_id,
    username:
      clientRow?.full_name?.trim() || project.project_code?.trim() || "Client",
    email: clientRow?.email ?? null,
    role: "client",
    profile_image_url: null,
  }
}

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
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string) {
          cookieStore.delete(name)
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
    const guestSidebarUser = await getProjectAccessSidebarUser(clientProjectId)
    if (!guestSidebarUser) redirect("/auth/signin")
    return (
      <ClientShellClient
        role="client"
        projectId={clientProjectId}
        user={guestSidebarUser}
      >
        {children}
      </ClientShellClient>
    )
  }

  // Supabase session exists — staff / admin flow
  const { data: profile } = await supabase
    .from("users")
    .select("id, username, email, role, status, profile_image_url")
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
    <ClientShellClient
      role={sidebarRole}
      projectId={null}
      user={{
        id: profile.id,
        username: profile.username ?? authUser.user_metadata?.username ?? null,
        email: profile.email ?? authUser.email ?? null,
        role: profile.role,
        profile_image_url:
          profile.profile_image_url ?? authUser.user_metadata?.avatar_url ?? null,
      }}
    >
      {children}
    </ClientShellClient>
  )
}
