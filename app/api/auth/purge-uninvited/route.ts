import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()

    // Session-aware client (reads the logged-in user from cookies)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            try {
              ;(cookieStore as any).delete({ name, ...options })
            } catch {
              cookieStore.delete(name)
            }
          },
        },
      }
    )

    const { data: sessData, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 401 })

    const session = sessData.session
    if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { userId?: string }
    const userId = body.userId?.trim()

    // Safety: only allow deleting the currently signed-in user
    if (!userId || userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 })
    }

    // Service role client to delete from auth.users
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to purge user." }, { status: 500 })
  }
}
