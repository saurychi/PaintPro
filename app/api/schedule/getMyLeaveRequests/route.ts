import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type UnavailRow = {
  unavailability_id: string
  start_datetime: string | null
  end_datetime: string | null
  reason: string | null
  status: string | null
  created_at: string | null
}

export async function GET(request: NextRequest) {
  const token = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim()

  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("staff_unavailability")
    .select("unavailability_id, start_datetime, end_datetime, reason, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requests = ((data ?? []) as UnavailRow[]).map((row) => ({
    id: row.unavailability_id,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    reason: row.reason,
    status: row.status ?? "pending",
    createdAt: row.created_at,
  }))

  return NextResponse.json({ requests })
}
