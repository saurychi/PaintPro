import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type UserRecipient = {
  id: string
  username: string | null
  role: string | null
  profile_image_url: string | null
}

type ProjectRecipient = {
  project_id: string
  project_code: string | null
  title: string | null
  status: string | null
  client_id: string | null
}

type ClientRecipient = {
  client_id: string
  full_name: string | null
  email: string | null
}

async function getAuthUserId() {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user?.id ?? null
}

function formatStatusLabel(status: string | null) {
  return String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export async function GET() {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, username, role, profile_image_url")
      .neq("id", userId)
      .order("username", { ascending: true })

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, status, client_id")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .not("client_id", "is", null)
      .order("updated_at", { ascending: false })

    if (projectsError) {
      return NextResponse.json({ error: projectsError.message }, { status: 500 })
    }

    const pendingProjects = (projects ?? []) as ProjectRecipient[]
    const clientIds = Array.from(
      new Set(
        pendingProjects
          .map((project) => project.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    )

    const clientsById = new Map<string, ClientRecipient>()
    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabaseAdmin
        .from("clients")
        .select("client_id, full_name, email")
        .in("client_id", clientIds)

      if (clientsError) {
        return NextResponse.json({ error: clientsError.message }, { status: 500 })
      }

      for (const client of (clients ?? []) as ClientRecipient[]) {
        clientsById.set(client.client_id, client)
      }
    }

    const userRecipients = ((users ?? []) as UserRecipient[]).map((user) => ({
      kind: "user" as const,
      id: user.id,
      username: user.username || "Unknown User",
      role: user.role || "staff",
      profile_image_url: user.profile_image_url ?? null,
    }))

    const clientRecipients = pendingProjects
      .map((project) => {
        if (!project.client_id) return null
        const client = clientsById.get(project.client_id)
        if (!client) return null

        const projectLabel = project.project_code?.trim() || project.title?.trim() || "Pending Project"

        return {
          kind: "client" as const,
          id: `client:${client.client_id}:${project.project_id}`,
          username: client.full_name || client.email || "Client",
          role: "client",
          profile_image_url: null,
          clientId: client.client_id,
          projectId: project.project_id,
          assignedTasks: `${projectLabel} • ${formatStatusLabel(project.status)}`,
        }
      })
      .filter(Boolean)

    return NextResponse.json([...userRecipients, ...clientRecipients])
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    )
  }
}
