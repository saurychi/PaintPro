import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type CreateBody =
  | { role: "staff"; email: string; password: string }
  | { role: "manager"; email: string; password: string }
  | { role: "client"; email: string }

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error("Missing Supabase service role config.")
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("invites")
      .select("id, email, role, status, created_at, used_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ invites: data ?? [] })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to load invites." }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = getAdminClient()
    const body = (await req.json()) as CreateBody

    const email = (body?.email || "").trim().toLowerCase()
    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 })
    }

    const role = body.role

    const { error: inviteErr } = await admin
      .from("invites")
      .upsert({ email, role, status: "pending", used_at: null }, { onConflict: "email" })

    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 })

    // ✅ staff and manager both need an auth user created immediately (password required)
    if (role === "staff" || role === "manager") {
      const password = (body as any).password?.trim()
      if (!password || password.length < 8) {
        return NextResponse.json({ error: "Invalid generated password." }, { status: 400 })
      }

      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { invited_role: role },
      })

      if (createErr && !createErr.message.toLowerCase().includes("already")) {
        return NextResponse.json({ error: createErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to create invite." }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = getAdminClient()
    const { id } = (await req.json()) as { id?: string }

    if (!id) return NextResponse.json({ error: "Missing invite id." }, { status: 400 })

    const { data: invite, error: inviteErr } = await admin
      .from("invites")
      .select("id, email")
      .eq("id", id)
      .maybeSingle()

    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 })
    if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 })

    const email = String(invite.email || "").trim().toLowerCase()
    if (!email) return NextResponse.json({ error: "Invite email is missing." }, { status: 400 })

    const { data: profile, error: profileErr } = await admin
      .from("users")
      .select("id, status")
      .eq("email", email)
      .maybeSingle()

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

    if (profile?.status === "active") {
      const { error: delInviteErr } = await admin.from("invites").delete().eq("id", id)
      if (delInviteErr) return NextResponse.json({ error: delInviteErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, mode: "invite_only" })
    }

    if (profile?.id) {
      const { error: delProfileErr } = await admin.from("users").delete().eq("id", profile.id)
      if (delProfileErr) return NextResponse.json({ error: delProfileErr.message }, { status: 400 })
    }

    const { data: usersByEmail, error: findAuthErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (findAuthErr) return NextResponse.json({ error: findAuthErr.message }, { status: 400 })

    const authUser = usersByEmail.users.find((u) => (u.email || "").toLowerCase() === email)
    if (authUser?.id) {
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(authUser.id)
      if (delAuthErr) return NextResponse.json({ error: delAuthErr.message }, { status: 400 })
    }

    const { error: delInviteErr } = await admin.from("invites").delete().eq("id", id)
    if (delInviteErr) return NextResponse.json({ error: delInviteErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, mode: "full_delete" })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to delete invite." }, { status: 500 })
  }
}
