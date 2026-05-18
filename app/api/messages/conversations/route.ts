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
  draft_id: string | null
}

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  client_id: string | null
  created_by: string | null
}

type DraftRow = {
  draft_id: string
  draft_code: string | null
  project_name: string | null
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

  const projectConversationIds = (existingConversations ?? []).map(
    (c) => c.id as string,
  )

  // Note: we deliberately do NOT auto-create an empty project conversation
  // here. A real conversation gets created the first time something
  // happens — e.g. notify-client fires, or the client picks a recipient via
  // the new-chat modal. Auto-creating one on every visit produced phantom
  // "Say hello!" rows that survived even after deleting all conversations.

  if (projectConversationIds.length === 0) {
    return NextResponse.json([])
  }

  const { data: participantData } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id, user_id, users(id, username, role, profile_image_url)")
    .in("conversation_id", projectConversationIds)

  // Index participants by (conversation_id, user_id) so we can pick one
  // by sender id below. We also keep a "first seen" fallback per
  // conversation in case nothing has been said yet.
  const participantsByKey = new Map<string, ProjectParticipantUser>()
  const fallbackParticipant = new Map<string, ProjectParticipantUser>()
  for (const row of (participantData ?? []) as Array<{
    conversation_id: string
    user_id: string
    users: ProjectParticipantUser | ProjectParticipantUser[] | null
  }>) {
    const user = Array.isArray(row.users) ? row.users[0] ?? null : row.users
    if (!user) continue
    participantsByKey.set(`${row.conversation_id}:${row.user_id}`, user)
    if (!fallbackParticipant.has(row.conversation_id)) {
      fallbackParticipant.set(row.conversation_id, user)
    }
  }

  // Need the latest message's sender to pick the right participant for the
  // header, so include sender_id in the projection.
  const { data: latestMessages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content, created_at, sender_id")
    .in("conversation_id", projectConversationIds)
    .order("created_at", { ascending: false })

  const latestMessageMap = new Map<
    string,
    MessageRow & { sender_id: string | null }
  >()
  for (const message of (latestMessages ?? []) as Array<
    MessageRow & { sender_id: string | null }
  >) {
    if (!latestMessageMap.has(message.conversation_id)) {
      latestMessageMap.set(message.conversation_id, message)
    }
  }

  // Pick the representative participant per conversation: whoever sent the
  // latest message wins, so a notify-client message sent from saya shows up
  // as a saya conversation, while a thread that bundleofitems was active in
  // shows bundleofitems. Falls back to the first known participant if there
  // are no messages yet (or the sender isn't in the participants list).
  const participantsByConversation = new Map<string, ProjectParticipantUser>()
  for (const conversationId of projectConversationIds) {
    const latestSenderId = latestMessageMap.get(conversationId)?.sender_id
    const senderParticipant = latestSenderId
      ? participantsByKey.get(`${conversationId}:${latestSenderId}`)
      : null
    const picked =
      senderParticipant ?? fallbackParticipant.get(conversationId) ?? null
    if (picked) participantsByConversation.set(conversationId, picked)
  }

  const payload = projectConversationIds.map((conversationId) => {
    const participant = participantsByConversation.get(conversationId)
    const latestMessage = latestMessageMap.get(conversationId)

    return {
      conversation_id: conversationId,
      users: participant
        ? {
            id: participant.id,
            username:
              participant.username || clientName || "Project Team",
            role: participant.role || "manager",
            profile_image_url: participant.profile_image_url ?? null,
          }
        : null,
      project: {
        project_id: projectData.project_id,
        project_code: projectData.project_code,
        title: projectData.title,
      },
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
      .select("id, project_id, draft_id")
      .in("id", convoIds)

    if (conversationsError) {
      return NextResponse.json({ error: conversationsError.message }, { status: 500 })
    }

    const conversationRows = (conversations ?? []) as ConversationRow[]
    const projectConversationIds = conversationRows
      .filter((conversation) => Boolean(conversation.project_id))
      .map((conversation) => conversation.id)
    const draftConversationIds = conversationRows
      .filter((conversation) => Boolean(conversation.draft_id) && !conversation.project_id)
      .map((conversation) => conversation.id)
    const directConversationIds = conversationRows
      .filter((conversation) => !conversation.project_id && !conversation.draft_id)
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
    const creatorsById = new Map<string, ProjectParticipantUser>()

    if (projectConversationIds.length > 0) {
      const projectIds = conversationRows
        .map((conversation) => conversation.project_id)
        .filter((projectId): projectId is string => Boolean(projectId))

      const { data: projects, error: projectsError } = await supabaseAdmin
        .from("projects")
        .select("project_id, project_code, title, client_id, created_by")
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

      // The project's creator (admin / manager) is the human counterpart
      // staff should see at the top of a project conversation. They're
      // who actually sent the message, not the client the project is for.
      const creatorIds = Array.from(
        new Set(
          ((projects ?? []) as ProjectRow[])
            .map((project) => project.created_by)
            .filter((creatorId): creatorId is string => Boolean(creatorId))
        )
      )

      if (creatorIds.length > 0) {
        const { data: creators, error: creatorsError } = await supabaseAdmin
          .from("users")
          .select("id, username, role, profile_image_url")
          .in("id", creatorIds)

        if (creatorsError) {
          return NextResponse.json(
            { error: creatorsError.message },
            { status: 500 },
          )
        }

        for (const creator of (creators ?? []) as ProjectParticipantUser[]) {
          creatorsById.set(creator.id, creator)
        }
      }
    }

    // Load drafts attached to the user's conversations, plus their creator
    // users so the conversation header (admin name + avatar) renders the
    // same way as project conversations.
    const draftsById = new Map<string, DraftRow>()
    if (draftConversationIds.length > 0) {
      const draftIds = conversationRows
        .filter((c) => draftConversationIds.includes(c.id))
        .map((c) => c.draft_id)
        .filter((id): id is string => Boolean(id))

      if (draftIds.length > 0) {
        const { data: drafts, error: draftsError } = await supabaseAdmin
          .from("drafts")
          .select("draft_id, draft_code, project_name, created_by")
          .in("draft_id", draftIds)

        if (draftsError) {
          return NextResponse.json({ error: draftsError.message }, { status: 500 })
        }

        for (const draft of (drafts ?? []) as DraftRow[]) {
          draftsById.set(draft.draft_id, draft)
        }

        const draftCreatorIds = Array.from(
          new Set(
            ((drafts ?? []) as DraftRow[])
              .map((draft) => draft.created_by)
              .filter(
                (id): id is string =>
                  typeof id === "string" && !!id && !creatorsById.has(id),
              ),
          ),
        )
        if (draftCreatorIds.length > 0) {
          const { data: draftCreators } = await supabaseAdmin
            .from("users")
            .select("id, username, role, profile_image_url")
            .in("id", draftCreatorIds)

          for (const creator of (draftCreators ?? []) as ProjectParticipantUser[]) {
            creatorsById.set(creator.id, creator)
          }
        }
      }
    }

    const payload = conversationRows
      .map((conversation) => {
        const latestMessage = latestMessageMap.get(conversation.id)

        if (conversation.project_id) {
          const project = projectsById.get(conversation.project_id)
          if (!project) return null

          const creator = project.created_by
            ? creatorsById.get(project.created_by) ?? null
            : null
          const client = project.client_id
            ? clientsById.get(project.client_id) ?? null
            : null

          // For non-creator viewers (staff): show the project's creator
          // (admin / manager) at the top — they're the human counterpart.
          // For the creator themselves (admin opens their own messages):
          // show the client instead, otherwise every project conversation
          // would surface the admin's own name and look like a self-DM,
          // which is what notify-to-client threads were doing.
          const viewerIsCreator =
            !!creator && !!userId && creator.id === userId

          const creatorHeader = creator
            ? {
                id: creator.id,
                username:
                  creator.username ||
                  project.project_code ||
                  project.title ||
                  "Project Team",
                role: creator.role || "admin",
                profile_image_url: creator.profile_image_url ?? null,
              }
            : null

          const clientHeader = client
            ? {
                id: client.client_id,
                username:
                  client.full_name ||
                  client.email ||
                  project.project_code ||
                  project.title ||
                  "Client",
                role: "client",
                profile_image_url: null,
              }
            : null

          const headerUser = viewerIsCreator
            ? clientHeader ?? creatorHeader
            : creatorHeader ?? clientHeader

          if (!headerUser) return null

          return {
            conversation_id: conversation.id,
            users: headerUser,
            project: {
              project_id: project.project_id,
              project_code: project.project_code,
              title: project.title,
            },
            last_read_at: lastReadMap[conversation.id] ?? null,
            latest_message: latestMessage ?? null,
          }
        }

        if (conversation.draft_id) {
          const draft = draftsById.get(conversation.draft_id)
          if (!draft) return null

          const creator = draft.created_by
            ? creatorsById.get(draft.created_by) ?? null
            : null

          const headerUser = creator
            ? {
                id: creator.id,
                username:
                  creator.username ||
                  draft.project_name ||
                  draft.draft_code ||
                  "Project Team",
                role: creator.role || "admin",
                profile_image_url: creator.profile_image_url ?? null,
              }
            : null

          if (!headerUser) return null

          // Front-end maps `project` straight into the project chip,
          // so we report the draft under the same field. The
          // measure-generator save path then uses the code (which lives
          // on either drafts.draft_code or projects.project_code) to
          // resolve back to the right row server-side.
          return {
            conversation_id: conversation.id,
            users: headerUser,
            project: {
              project_id: draft.draft_id,
              project_code: draft.draft_code,
              title: draft.project_name,
              is_draft: true,
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
          project: null,
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
