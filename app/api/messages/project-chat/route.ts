import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"
const ALLOWED_PROJECT_ROLES = new Set(["staff", "manager"])

type ProjectContext = {
  client_id: string | null
  created_by: string | null
}

type ParticipantUser = {
  id: string
  username: string | null
  role: string | null
  profile_image_url: string | null
}

type ParticipantRow = {
  conversation_id: string
  user_id: string
  users: ParticipantUser | ParticipantUser[] | null
}

type MessageRow = {
  conversation_id: string
  content: string
  created_at: string
  sender_id?: string | null
}

function normalizeRole(role: string | null | undefined) {
  return String(role ?? "").trim().toLowerCase()
}

function readSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function getProjectId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null
}

async function getProjectContext(projectId: string) {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("client_id, created_by")
    .eq("project_id", projectId)
    .maybeSingle()

  return (data as ProjectContext | null) ?? null
}

async function getAssignedUserIds(projectId: string) {
  const { data: taskData } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id")
    .eq("project_id", projectId)

  const taskIds = (taskData ?? []).map((task) => task.project_task_id)
  if (taskIds.length === 0) return new Set<string>()

  const { data: subTaskData } = await supabaseAdmin
    .from("project_sub_task")
    .select("project_sub_task_id")
    .in("project_task_id", taskIds)

  const subTaskIds = (subTaskData ?? []).map((subTask) => subTask.project_sub_task_id)
  if (subTaskIds.length === 0) return new Set<string>()

  const { data: assignmentData } = await supabaseAdmin
    .from("project_sub_task_staff")
    .select("user_id")
    .in("project_sub_task_id", subTaskIds)

  return new Set((assignmentData ?? []).map((assignment) => assignment.user_id))
}

function isAllowedProjectRecipient(
  userId: string,
  role: string | null | undefined,
  assignedUserIds: Set<string>,
  projectManagerId: string | null
) {
  const normalizedRole = normalizeRole(role)
  if (!ALLOWED_PROJECT_ROLES.has(normalizedRole)) return false

  return assignedUserIds.has(userId) || (userId === projectManagerId && normalizedRole === "manager")
}

// GET /api/messages/project-chat — list all conversations for this project
export async function GET() {
  const projectId = await getProjectId()
  if (!projectId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const projectContext = await getProjectContext(projectId)
  const assignedUserIds = await getAssignedUserIds(projectId)

  const { data: conversationData } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)

  if (!conversationData || conversationData.length === 0) {
    return NextResponse.json({ conversations: [], clientId: projectContext?.client_id ?? null })
  }

  const conversationIds = conversationData.map((conversation) => conversation.id)

  const { data: participantData } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id, user_id, users(id, username, role, profile_image_url)")
    .in("conversation_id", conversationIds)

  const { data: messageData } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content, created_at, sender_id")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })

  const latestMessageMap = new Map<string, MessageRow>()
  const latestSenderByConversation = new Map<string, string>()
  for (const message of (messageData ?? []) as MessageRow[]) {
    if (!latestMessageMap.has(message.conversation_id)) {
      latestMessageMap.set(message.conversation_id, message)
    }
    if (message.sender_id && !latestSenderByConversation.has(message.conversation_id)) {
      latestSenderByConversation.set(message.conversation_id, message.sender_id)
    }
  }

  const preferredParticipantMap = new Map<string, ParticipantUser>()
  const fallbackParticipantMap = new Map<string, ParticipantUser>()
  for (const participant of (participantData ?? []) as ParticipantRow[]) {
    const user = readSingleRelation(participant.users)
    if (!user) continue

    if (!fallbackParticipantMap.has(participant.conversation_id)) {
      fallbackParticipantMap.set(participant.conversation_id, user)
    }

    if (
      isAllowedProjectRecipient(
        user.id,
        user.role,
        assignedUserIds,
        projectContext?.created_by ?? null
      ) &&
      !preferredParticipantMap.has(participant.conversation_id)
    ) {
      preferredParticipantMap.set(participant.conversation_id, user)
    }
  }

  const senderFallbackIds = Array.from(new Set(latestSenderByConversation.values()))
  const senderFallbackUsers = new Map<string, ParticipantUser>()

  if (senderFallbackIds.length > 0) {
    const { data: senderUserData } = await supabaseAdmin
      .from("users")
      .select("id, username, role, profile_image_url")
      .in("id", senderFallbackIds)

    for (const user of (senderUserData ?? []) as ParticipantUser[]) {
      senderFallbackUsers.set(user.id, user)
    }
  }

  const conversations = conversationData
    .map((conversation) => {
      const latestMessage = latestMessageMap.get(conversation.id)
      const senderFallbackId = latestSenderByConversation.get(conversation.id)
      const senderFallbackUser = senderFallbackId
        ? senderFallbackUsers.get(senderFallbackId) ?? null
        : null
      const participant =
        preferredParticipantMap.get(conversation.id) ??
        fallbackParticipantMap.get(conversation.id) ??
        senderFallbackUser

      return {
        id: conversation.id,
        name: participant?.username ?? "Project Team",
        role: normalizeRole(participant?.role) || "team",
        profile_image_url: participant?.profile_image_url ?? null,
        lastMessage: latestMessage?.content ?? "Say hello!",
        lastActivity: latestMessage ? new Date(latestMessage.created_at).getTime() : 0,
      }
    })

  conversations.sort((a, b) => b.lastActivity - a.lastActivity)

  return NextResponse.json({
    conversations,
    clientId: projectContext?.client_id ?? null,
  })
}

// POST /api/messages/project-chat — start (or reuse) a conversation with an assigned staff/manager user
export async function POST(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json()
  const targetUserId = String(body?.targetUserId ?? "").trim()
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing targetUserId." }, { status: 400 })
  }

  const projectContext = await getProjectContext(projectId)
  const assignedUserIds = await getAssignedUserIds(projectId)

  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("id", targetUserId)
    .maybeSingle()

  if (!targetUser) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
  }

  if (
    !isAllowedProjectRecipient(
      targetUser.id,
      targetUser.role,
      assignedUserIds,
      projectContext?.created_by ?? null
    )
  ) {
    return NextResponse.json(
      { error: "This recipient is not assigned to the current project." },
      { status: 403 }
    )
  }

  const { data: existingConversationData } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)

  const existingConversationIds = (existingConversationData ?? []).map((conversation) => conversation.id)

  if (existingConversationIds.length > 0) {
    const { data: sharedConversationData } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", targetUserId)
      .in("conversation_id", existingConversationIds)

    if (sharedConversationData && sharedConversationData.length > 0) {
      return NextResponse.json({ conversationId: sharedConversationData[0].conversation_id })
    }
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
    .select("id")
    .single()

  if (conversationError || !conversation) {
    return NextResponse.json(
      { error: "Failed to create conversation.", details: conversationError?.message },
      { status: 500 }
    )
  }

  const { error: participantError } = await supabaseAdmin
    .from("conversation_participants")
    .insert([{ conversation_id: conversation.id, user_id: targetUserId }])

  if (participantError) {
    return NextResponse.json(
      { error: "Failed to add participant.", details: participantError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ conversationId: conversation.id })
}
