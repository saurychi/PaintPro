import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function PATCH(request: NextRequest) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const unavailabilityId =
    typeof (body as any)?.unavailabilityId === "string"
      ? (body as any).unavailabilityId.trim()
      : ""

  const status =
    typeof (body as any)?.status === "string" ? (body as any).status.trim() : ""

  if (!unavailabilityId) {
    return NextResponse.json({ error: "Missing unavailabilityId." }, { status: 400 })
  }

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "Status must be 'approved' or 'rejected'." },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin
    .from("staff_unavailability")
    .update({ status })
    .eq("unavailability_id", unavailabilityId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, status })
}
