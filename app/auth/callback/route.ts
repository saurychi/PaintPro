import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const origin = url.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/signin?error=missing_code`)
  }

  const cookieStore = await cookies()

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
          // Next.js cookies supports delete(name). Some versions also support delete({ name, ...options })
          try {
            ;(cookieStore as any).delete({ name, ...options })
          } catch {
            cookieStore.delete(name)
          }
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("OAuth exchange failed:", error)
    const msg = encodeURIComponent(error.message || "exchange_failed")
    return NextResponse.redirect(`${origin}/auth/signin?error=oauth_exchange_failed&message=${msg}`)
  }

  return NextResponse.redirect(`${origin}/auth/post-auth`)
}
