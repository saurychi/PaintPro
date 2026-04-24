import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const projectId = body?.projectId as string | undefined
    const status = body?.status as string | undefined

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 })
    }

    if (!status) {
      return NextResponse.json({ error: "Missing status." }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("projects")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update project status.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Project status updated successfully.",
      status,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while updating project status.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
