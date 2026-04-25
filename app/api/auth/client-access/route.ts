import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export const COOKIE_NAME = "paintpro_client_project_id"
const SEVEN_DAYS = 60 * 60 * 24 * 7

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const projectCode = String(body?.projectCode ?? "").trim().toUpperCase()
    const remember = body?.remember !== false

    if (!projectCode) {
      return NextResponse.json({ error: "Project code is required." }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code")
      .eq("project_code", projectCode)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Failed to verify project code." }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Project code not found." }, { status: 404 })
    }

    const response = NextResponse.json({
      projectId: data.project_id,
      projectCode: data.project_code,
    })

    response.cookies.set(COOKIE_NAME, data.project_id, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: remember ? SEVEN_DAYS : undefined,
      path: "/",
    })

    return response
  } catch {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  })
  return response
}
