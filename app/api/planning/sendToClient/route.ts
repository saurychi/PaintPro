import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const body = await request.json()
  const projectId = String(body?.projectId ?? "").trim()
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 })

  // Update project status to invoice_agreement_pending
  const { error: statusError } = await supabaseAdmin
    .from("projects")
    .update({ status: "invoice_agreement_pending", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)

  if (statusError) {
    return NextResponse.json(
      { error: "Failed to update project status.", details: statusError.message },
      { status: 500 }
    )
  }

  // Find or create the project conversation
  let conversationId: string | null = null

  const { data: existingConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .limit(1)

  if (existingConvos && existingConvos.length > 0) {
    conversationId = existingConvos[0].id
  } else {
    const { data: newConv, error: convError } = await supabaseAdmin
      .from("conversations")
      .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
      .select("id")
      .single()

    if (convError || !newConv) {
      return NextResponse.json({ success: true, messageSent: false })
    }

    conversationId = newConv.id
  }

  // Ensure admin user is a participant
  const { data: existingParticipant } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!existingParticipant) {
    await supabaseAdmin
      .from("conversation_participants")
      .insert([{ conversation_id: conversationId, user_id: userId }])
  }

  // Send notification message
  const { error: msgError } = await supabaseAdmin
    .from("messages")
    .insert([{
      conversation_id: conversationId,
      sender_id: userId,
      content: "Your invoice is ready for review. Please check the invoice and let us know if you have any questions.",
    }])

  return NextResponse.json({ success: true, messageSent: !msgError })
}
