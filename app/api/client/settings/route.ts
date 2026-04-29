import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

type AppRole = "client" | "staff" | "manager" | "admin"

type UserProfileRow = {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  role: AppRole
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
  phone: string | null
}

type SettingsProfile = {
  id: string
  username: string
  email: string | null
  phone: string | null
  role: AppRole
}

type ResolvedSettingsContext =
  | {
      accessMode: "auth"
      canEditPhone: boolean
      profile: SettingsProfile
    }
  | {
      accessMode: "project"
      canEditPhone: boolean
      profile: SettingsProfile
    }

function createRouteSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

async function resolveSettingsContext(): Promise<ResolvedSettingsContext | null> {
  const cookieStore = await cookies()
  const supabase = createRouteSupabase(cookieStore)

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (authUser) {
    const { data: row, error } = await supabase
      .from("users")
      .select("id, username, email, phone, role")
      .eq("id", authUser.id)
      .maybeSingle<UserProfileRow>()

    if (error) throw error

    if (!row) {
      return null
    }

    return {
      accessMode: "auth",
      canEditPhone: true,
      profile: {
        id: row.id,
        username:
          row.username?.trim() ||
          authUser.user_metadata?.username?.trim() ||
          authUser.email?.split("@")[0] ||
          "User",
        email: row.email ?? authUser.email ?? null,
        phone: row.phone,
        role: row.role,
      },
    }
  }

  const projectId = cookieStore.get(CLIENT_COOKIE)?.value ?? null
  if (!projectId) return null

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, client_id")
    .eq("project_id", projectId)
    .maybeSingle<ProjectAccessRow>()

  if (projectError) throw projectError
  if (!project) return null

  if (!project.client_id) {
    return {
      accessMode: "project",
      canEditPhone: false,
      profile: {
        id: project.project_id,
        username: project.project_code?.trim() || "Client",
        email: null,
        phone: null,
        role: "client",
      },
    }
  }

  const { data: clientRow, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("client_id, full_name, email, phone")
    .eq("client_id", project.client_id)
    .maybeSingle<ClientProfileRow>()

  if (clientError) throw clientError

  return {
    accessMode: "project",
    canEditPhone: Boolean(clientRow),
    profile: {
      id: clientRow?.client_id ?? project.client_id,
      username: clientRow?.full_name?.trim() || project.project_code?.trim() || "Client",
      email: clientRow?.email ?? null,
      phone: clientRow?.phone ?? null,
      role: "client",
    },
  }
}

export async function GET() {
  try {
    const context = await resolveSettingsContext()

    if (!context) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    return NextResponse.json(context)
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to load client settings.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { phone?: unknown } | null
    const phoneValue = String(body?.phone ?? "").trim()
    const phone = phoneValue || null

    const context = await resolveSettingsContext()

    if (!context) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    if (!context.canEditPhone) {
      return NextResponse.json({ error: "Phone cannot be updated for this client." }, { status: 400 })
    }

    if (context.accessMode === "auth") {
      const { error } = await supabaseAdmin
        .from("users")
        .update({ phone, updated_at: new Date().toISOString() })
        .eq("id", context.profile.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from("clients")
        .update({ phone })
        .eq("client_id", context.profile.id)

      if (error) throw error
    }

    return NextResponse.json({ ok: true, phone })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to update phone.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    )
  }
}
