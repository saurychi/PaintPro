import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const SEED_USERS = [
  { email: "johndoe@paintpro.test", username: "John Doe", phone: "+63 910 000 0001" },
  { email: "janedoe@paintpro.test", username: "Jane Doe", phone: "+63 910 000 0002" },
]

export async function POST() {
  try {
    const results = []

    for (const user of SEED_USERS) {
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", user.email)
        .maybeSingle()

      if (existing) {
        results.push({ email: user.email, status: "already_exists" })
        continue
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: "TestPaintPro2025!",
        email_confirm: true,
        user_metadata: { invited_role: "staff" },
      })

      let userId = authData?.user?.id

      if (authError && !authError.message.toLowerCase().includes("already")) {
        results.push({ email: user.email, status: "error", message: authError.message })
        continue
      }

      if (!userId) {
        const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
        const found = authList?.users?.find((u) => u.email?.toLowerCase() === user.email.toLowerCase())
        userId = found?.id
      }

      if (!userId) {
        results.push({ email: user.email, status: "error", message: "Could not resolve auth user ID." })
        continue
      }

      const { error: upsertError } = await supabaseAdmin.from("users").upsert({
        id: userId,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: "staff",
        status: "active",
      })

      if (upsertError) {
        results.push({ email: user.email, status: "error", message: upsertError.message })
      } else {
        results.push({ email: user.email, status: "created" })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
