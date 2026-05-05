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
        // Cookie refresh is handled by middleware.ts before this layout
        // runs, so no-op here. Writing cookies from a server component is
        // a hard error in Next 16.
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
  // Normalize before comparing — see /auth/post-auth for the matching logic.
  // Prevents a casing or whitespace quirk in the DB from bouncing valid
  // admins/managers between here and post-auth in a redirect loop.
  const profileStatus = String(profile.status ?? "").trim().toLowerCase()
  const profileRole = String(profile.role ?? "").trim().toLowerCase()
  if (profileStatus !== "active") redirect("/auth/post-auth")
  if (profileRole !== "admin" && profileRole !== "manager") redirect("/auth/post-auth")

  // After the guard above, profileRole is narrowed by the equality checks but
  // TS doesn't propagate that to profile.role (the un-normalized DB field).
  // Use the normalized value for the shell — it's the same identity, just
  // case/whitespace-cleaned.
  const normalizedRole: "admin" | "manager" = profileRole

  return (
    <AdminShellClient
      role={normalizedRole}
      user={{
        id: profile.id,
        username: profile.username ?? authUser.user_metadata?.username ?? null,
        email: profile.email ?? authUser.email ?? null,
        role: normalizedRole,
        profile_image_url: profile.profile_image_url ?? authUser.user_metadata?.avatar_url ?? null,
      }}
    >
      {children}
    </AdminShellClient>
  )
}
