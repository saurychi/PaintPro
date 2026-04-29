import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, username, email, phone, specialty, status, role")
      .in("role", ["staff", "manager"])
      .order("username", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch staff." }, { status: 500 })
    }

    return NextResponse.json({ staff: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 })
  }
}
