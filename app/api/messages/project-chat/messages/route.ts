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

async function verifyConversation(conversationId: string, projectId: string) {
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("project_id", projectId)
    .maybeSingle()
  return data
}

// GET /api/messages/project-chat/messages?conversationId=xxx
export async function GET(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const conversationId = new URL(request.url).searchParams.get("conversationId") ?? ""
  if (!conversationId) return NextResponse.json({ error: "Missing conversationId." }, { status: 400 })

  const conv = await verifyConversation(conversationId, projectId)
  if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 })

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  return NextResponse.json(messages ?? [])
}

// POST /api/messages/project-chat/messages — send a message as the client
export async function POST(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const clientId = await getClientId(projectId)
  if (!clientId) return NextResponse.json({ error: "Client not found for this project." }, { status: 404 })

  const body = await request.json()
  const conversationId = String(body?.conversationId ?? "").trim()
  const content = String(body?.content ?? "").trim()

  if (!conversationId || !content) {
    return NextResponse.json({ error: "Missing conversationId or content." }, { status: 400 })
  }

  const conv = await verifyConversation(conversationId, projectId)
  if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 })

  // sender_id is null for client messages; client_id identifies who sent it
  const { data: message, error: msgError } = await supabaseAdmin
    .from("messages")
    .insert([{ conversation_id: conversationId, sender_id: null, client_id: clientId, content }])
    .select()
    .single()

  if (msgError || !message) {
    return NextResponse.json(
      { error: "Failed to send message.", details: msgError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json(message)
}

// PATCH /api/messages/project-chat/messages — edit a client message
export async function PATCH(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const clientId = await getClientId(projectId)
  if (!clientId) return NextResponse.json({ error: "Client not found." }, { status: 404 })

  const body = await request.json()
  const messageId = String(body?.messageId ?? "").trim()
  const content = String(body?.content ?? "").trim()
  if (!messageId || !content) return NextResponse.json({ error: "Missing messageId or content." }, { status: 400 })

  const { data: message, error } = await supabaseAdmin
    .from("messages")
    .update({ content })
    .eq("id", messageId)
    .eq("client_id", clientId)
    .select()
    .single()

  if (error || !message) return NextResponse.json({ error: "Failed to update message.", details: error?.message }, { status: 500 })
  return NextResponse.json(message)
}

// DELETE /api/messages/project-chat/messages — delete a client message
export async function DELETE(request: NextRequest) {
  const projectId = await getProjectId()
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const clientId = await getClientId(projectId)
  if (!clientId) return NextResponse.json({ error: "Client not found." }, { status: 404 })

  const messageId = new URL(request.url).searchParams.get("messageId") ?? ""
  if (!messageId) return NextResponse.json({ error: "Missing messageId." }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("client_id", clientId)

  if (error) return NextResponse.json({ error: "Failed to delete message.", details: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
