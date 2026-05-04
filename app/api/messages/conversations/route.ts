import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

type DirectParticipantRow = {
  conversation_id: string
  user_id: string
  users: {
    id: string
    username: string | null
    role: string | null
    profile_image_url: string | null
  } | null
}

type ConversationRow = {
  id: string
  project_id: string | null
}

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  client_id: string | null
  created_by: string | null
}

type ClientRow = {
  client_id: string
  full_name: string | null
  email: string | null
}

type MessageRow = {
  conversation_id: string
  content: string | null
  created_at: string
}

type ProjectParticipantUser = {
  id: string
  username: string | null
  role: string | null
  profile_image_url: string | null
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

async function getClientProjectId() {
  const cookieStore = await cookies()
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null
}

// For a guest client (project-cookie auth), build the conversation list keyed off
// the project: include every existing project conversation plus the project creator,
// auto-creating a conversation with the creator so the client always sees them.
async function buildClientProjectConversations(projectId: string) {
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, title, client_id, created_by")
    .eq("project_id", projectId)
    .maybeSingle<ProjectRow>()

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 })
  }
  if (!projectData) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  let clientName: string | null = null
  if (projectData.client_id) {
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("client_id, full_name, email")
      .eq("client_id", projectData.client_id)
      .maybeSingle<ClientRow>()

    clientName = clientRow?.full_name?.trim() || clientRow?.email?.trim() || null
  }

  const { data: existingConversations, error: existingConversationsError } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)

  if (existingConversationsError) {
    return NextResponse.json({ error: existingConversationsError.message }, { status: 500 })
  }

  let projectConversationIds = (existingConversations ?? []).map((c) => c.id as string)

  // Make sure the project creator (manager / admin) is reachable, even on first visit.
  if (projectData.created_by) {
    const { data: creator } = await supabaseAdmin
      .from("users")
      .select("id, role, status")
      .eq("id", projectData.created_by)
      .maybeSingle()

    const creatorRole = String((creator as { role?: string | null } | null)?.role ?? "").toLowerCase()
    const creatorActive = String((creator as { status?: string | null } | null)?.status ?? "").toLowerCase() === "active"

    if (creator && creatorActive && (creatorRole === "manager" || creatorRole === "admin")) {
      let creatorHasConversation = false

      if (projectConversationIds.length > 0) {
        const { data: creatorParticipantRows } = await supabaseAdmin
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", projectData.created_by)
          .in("conversation_id", projectConversationIds)

        creatorHasConversation = (creatorParticipantRows ?? []).length > 0
      }

      if (!creatorHasConversation) {
        const { data: newConversation, error: newConversationError } = await supabaseAdmin
          .from("conversations")
          .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
          .select("id")
          .single()

        if (!newConversationError && newConversation) {
          await supabaseAdmin
            .from("conversation_participants")
            .insert([{ conversation_id: newConversation.id, user_id: projectData.created_by }])

          projectConversationIds = [...projectConversationIds, newConversation.id as string]
        }
      }
    }
  }

  if (projectConversationIds.length === 0) {
    return NextResponse.json([])
  }

  const { data: participantData } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id, user_id, users(id, username, role, profile_image_url)")
    .in("conversation_id", projectConversationIds)

  const participantsByConversation = new Map<string, ProjectParticipantUser>()
  for (const row of (participantData ?? []) as Array<{
    conversation_id: string
    user_id: string
    users: ProjectParticipantUser | ProjectParticipantUser[] | null
  }>) {
    const user = Array.isArray(row.users) ? row.users[0] ?? null : row.users
    if (!user) continue
    if (!participantsByConversation.has(row.conversation_id)) {
      participantsByConversation.set(row.conversation_id, user)
    }
  }

  const { data: latestMessages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", projectConversationIds)
    .order("created_at", { ascending: false })

  const latestMessageMap = new Map<string, MessageRow>()
  for (const message of (latestMessages ?? []) as MessageRow[]) {
    if (!latestMessageMap.has(message.conversation_id)) {
      latestMessageMap.set(message.conversation_id, message)
    }
  }

  const payload = projectConversationIds.map((conversationId) => {
    const participant = participantsByConversation.get(conversationId)
    const latestMessage = latestMessageMap.get(conversationId)

    return {
      conversation_id: conversationId,
      users: participant
        ? {
            id: participant.id,
            username: participant.username || clientName || "Project Team",
            role: participant.role || "manager",
            profile_image_url: participant.profile_image_url ?? null,
          }
        : null,
      last_read_at: null,
      latest_message: latestMessage ?? null,
    }
  })

  return NextResponse.json(payload)
}

export async function GET() {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      // Fall back to guest-client auth (project-code cookie)
      const clientProjectId = await getClientProjectId()
      if (clientProjectId) {
        return await buildClientProjectConversations(clientProjectId)
      }
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: myConvos, error: myConvosError } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)

    if (myConvosError) {
      return NextResponse.json({ error: myConvosError.message }, { status: 500 })
    }

    if (!myConvos || myConvos.length === 0) {
      return NextResponse.json([])
    }

    const convoIds = myConvos.map((conversation) => conversation.conversation_id)
    const lastReadMap = Object.fromEntries(
      myConvos.map((conversation) => [conversation.conversation_id, conversation.last_read_at])
    )

    const { data: conversations, error: conversationsError } = await supabaseAdmin
      .from("conversations")
      .select("id, project_id")
      .in("id", convoIds)

    if (conversationsError) {
      return NextResponse.json({ error: conversationsError.message }, { status: 500 })
    }

    const conversationRows = (conversations ?? []) as ConversationRow[]
    const projectConversationIds = conversationRows
      .filter((conversation) => Boolean(conversation.project_id))
      .map((conversation) => conversation.id)
    const directConversationIds = conversationRows
      .filter((conversation) => !conversation.project_id)
      .map((conversation) => conversation.id)

    const { data: latestMessages, error: latestMessagesError } = await supabaseAdmin
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false })

    if (latestMessagesError) {
      return NextResponse.json({ error: latestMessagesError.message }, { status: 500 })
    }

    const latestMessageMap = new Map<string, MessageRow>()
    for (const message of (latestMessages ?? []) as MessageRow[]) {
      if (!latestMessageMap.has(message.conversation_id)) {
        latestMessageMap.set(message.conversation_id, message)
      }
    }

    const directParticipantMap = new Map<string, DirectParticipantRow>()
    if (directConversationIds.length > 0) {
      const { data: directParticipants, error: directParticipantsError } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id, user_id, users(id, username, role, profile_image_url)")
        .in("conversation_id", directConversationIds)
        .neq("user_id", userId)

      if (directParticipantsError) {
        return NextResponse.json({ error: directParticipantsError.message }, { status: 500 })
      }

      for (const participant of (directParticipants ?? []) as unknown as DirectParticipantRow[]) {
        if (!directParticipantMap.has(participant.conversation_id)) {
          directParticipantMap.set(participant.conversation_id, participant)
        }
      }
    }

    const projectsById = new Map<string, ProjectRow>()
    const clientsById = new Map<string, ClientRow>()

    if (projectConversationIds.length > 0) {
      const projectIds = conversationRows
        .map((conversation) => conversation.project_id)
        .filter((projectId): projectId is string => Boolean(projectId))

      const { data: projects, error: projectsError } = await supabaseAdmin
        .from("projects")
        .select("project_id, project_code, title, client_id")
        .in("project_id", projectIds)

      if (projectsError) {
        return NextResponse.json({ error: projectsError.message }, { status: 500 })
      }

      for (const project of (projects ?? []) as ProjectRow[]) {
        projectsById.set(project.project_id, project)
      }

      const clientIds = Array.from(
        new Set(
          ((projects ?? []) as ProjectRow[])
            .map((project) => project.client_id)
            .filter((clientId): clientId is string => Boolean(clientId))
        )
      )

      if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabaseAdmin
          .from("clients")
          .select("client_id, full_name, email")
          .in("client_id", clientIds)

        if (clientsError) {
          return NextResponse.json({ error: clientsError.message }, { status: 500 })
        }

        for (const client of (clients ?? []) as ClientRow[]) {
          clientsById.set(client.client_id, client)
        }
      }
    }

    const payload = conversationRows
      .map((conversation) => {
        const latestMessage = latestMessageMap.get(conversation.id)

        if (conversation.project_id) {
          const project = projectsById.get(conversation.project_id)
          const client = project?.client_id ? clientsById.get(project.client_id) : null

          if (!project || !client) return null

          return {
            conversation_id: conversation.id,
            users: {
              id: client.client_id,
              username: client.full_name || client.email || project.project_code || project.title || "Client",
              role: "client",
              profile_image_url: null,
            },
            last_read_at: lastReadMap[conversation.id] ?? null,
            latest_message: latestMessage ?? null,
          }
        }

        const participant = directParticipantMap.get(conversation.id)
        if (!participant) return null

        return {
          conversation_id: conversation.id,
          users: participant.users,
          last_read_at: lastReadMap[conversation.id] ?? null,
          latest_message: latestMessage ?? null,
        }
      })
      .filter(Boolean)

    return NextResponse.json(payload)
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
