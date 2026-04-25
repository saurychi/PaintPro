import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

// GET /api/messages/project-chat/users — list staff/admin users the client can message
export async function GET() {
  const cookieStore = await cookies()
  const projectId = cookieStore.get(CLIENT_COOKIE)?.value ?? null
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, username, role, profile_image_url")
    .in("role", ["admin", "manager", "staff"])
    .order("username", { ascending: true })

  return NextResponse.json(users ?? [])
}
