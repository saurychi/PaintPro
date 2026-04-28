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

// PATCH /api/messages/manage — edit a message (only sender can edit)
export async function PATCH(request: NextRequest) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const body = await request.json()
  const messageId = String(body?.messageId ?? "").trim()
  const content = String(body?.content ?? "").trim()
  if (!messageId || !content) return NextResponse.json({ error: "Missing messageId or content." }, { status: 400 })

  const { data: message, error } = await supabaseAdmin
    .from("messages")
    .update({ content })
    .eq("id", messageId)
    .eq("sender_id", userId)
    .select()
    .single()

  if (error || !message) return NextResponse.json({ error: "Failed to update.", details: error?.message }, { status: 500 })
  return NextResponse.json(message)
}

// DELETE /api/messages/manage?messageId=xxx — delete a message (only sender can delete)
export async function DELETE(request: NextRequest) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const messageId = new URL(request.url).searchParams.get("messageId") ?? ""
  if (!messageId) return NextResponse.json({ error: "Missing messageId." }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", userId)

  if (error) return NextResponse.json({ error: "Failed to delete.", details: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
