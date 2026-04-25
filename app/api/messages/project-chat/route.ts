import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

async function getProjectId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null
}

async function getClientId(projectId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("client_id")
    .eq("project_id", projectId)
    .maybeSingle()
  return (data as any)?.client_id ?? null
}

// GET /api/messages/project-chat — list all conversations for this project
export async function GET() {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const clientId = await getClientId(projectId)

  const { data: convos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)

  if (!convos || convos.length === 0) return NextResponse.json({ conversations: [], clientId })

  const convoIds = convos.map((c) => c.id)

  const { data: participants } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id, user_id, users(id, username, role, profile_image_url)")
    .in("conversation_id", convoIds)

  const { data: allMessages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", convoIds)
    .order("created_at", { ascending: false })

  const latestMsgMap: Record<string, any> = {}
  for (const msg of allMessages ?? []) {
    if (!latestMsgMap[msg.conversation_id]) latestMsgMap[msg.conversation_id] = msg
  }

  const participantMap: Record<string, any> = {}
  for (const p of participants ?? []) {
    if (!participantMap[p.conversation_id]) participantMap[p.conversation_id] = p
  }

  const conversations = convos.map((c) => {
    const p = participantMap[c.id]
    const latestMsg = latestMsgMap[c.id]
    const staffUser = (p as any)?.users
    return {
      id: c.id,
      name: staffUser?.username ?? "Project Team",
      role: staffUser?.role ?? "",
      profile_image_url: staffUser?.profile_image_url ?? null,
      lastMessage: latestMsg?.content ?? "Say hello!",
      lastActivity: latestMsg ? new Date(latestMsg.created_at).getTime() : 0,
    }
  })

  conversations.sort((a, b) => b.lastActivity - a.lastActivity)
  return NextResponse.json({ conversations, clientId })
}

// POST /api/messages/project-chat — start (or reuse) a conversation with a staff user
export async function POST(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const body = await request.json()
  const targetUserId = String(body?.targetUserId ?? "").trim()
  if (!targetUserId) return NextResponse.json({ error: "Missing targetUserId." }, { status: 400 })

  // Reuse existing conversation with this staff member if one exists
  const { data: existingConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)

  const existingIds = (existingConvos ?? []).map((c) => c.id)

  if (existingIds.length > 0) {
    const { data: shared } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", targetUserId)
      .in("conversation_id", existingIds)

    if (shared && shared.length > 0) {
      return NextResponse.json({ conversationId: shared[0].conversation_id })
    }
  }

  const { data: conv, error: convError } = await supabaseAdmin
    .from("conversations")
    .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
    .select("id")
    .single()

  if (convError || !conv) {
    return NextResponse.json(
      { error: "Failed to create conversation.", details: convError?.message },
      { status: 500 }
    )
  }

  const { error: partError } = await supabaseAdmin
    .from("conversation_participants")
    .insert([{ conversation_id: conv.id, user_id: targetUserId }])

  if (partError) {
    return NextResponse.json(
      { error: "Failed to add participant.", details: partError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ conversationId: conv.id })
}
