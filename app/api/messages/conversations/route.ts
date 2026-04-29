import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

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

export async function GET() {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
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
