import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type UnavailRow = {
  unavailability_id: string
  user_id: string
  start_datetime: string | null
  end_datetime: string | null
  reason: string | null
  status: string | null
  created_at: string | null
  users: {
    id: string
    username: string | null
    email: string | null
    role: string | null
    profile_image_url: string | null
  } | null
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {},
        remove() {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("staff_unavailability")
    .select(`
      unavailability_id,
      user_id,
      start_datetime,
      end_datetime,
      reason,
      status,
      created_at,
      users:user_id ( id, username, email, role, profile_image_url )
    `)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requests = ((data ?? []) as unknown as UnavailRow[]).map((row) => ({
    id: row.unavailability_id,
    userId: row.user_id,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    reason: row.reason,
    status: row.status ?? "pending",
    createdAt: row.created_at,
    staff: {
      id: row.users?.id ?? row.user_id,
      username: row.users?.username ?? null,
      email: row.users?.email ?? null,
      role: row.users?.role ?? null,
      profileImageUrl: row.users?.profile_image_url ?? null,
    },
  }))

  return NextResponse.json({ requests })
}
