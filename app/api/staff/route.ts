import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, username, email, phone, profile_image_url, status")
    .eq("role", "staff")
    .eq("status", "active")
    .order("username", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ staff: data ?? [] })
}

export async function POST(req: Request) {
  try {
    const { name, email, phone } = await req.json()

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 })
    }

    const password =
      Math.random().toString(36).slice(-8) +
      Math.random().toString(36).toUpperCase().slice(-4) +
      "1!"

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { invited_role: "staff" },
    })

    if (authError && !authError.message.toLowerCase().includes("already")) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    let userId = authData?.user?.id

    if (!userId) {
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
      const existing = authList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) return NextResponse.json({ error: "Could not resolve user ID." }, { status: 400 })
      userId = existing.id
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert({ id: userId, username: name, email, phone: phone || null, role: "staff", status: "active" })
      .select("id, username, email, phone, profile_image_url")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ staff: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, name, email, phone } = await req.json()

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.username = name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone || null

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", id)
      .select("id, username, email, phone, profile_image_url")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ staff: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
