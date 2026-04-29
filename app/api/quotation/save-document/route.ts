import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const projectId = String(body.projectId ?? "").trim()
    const projectCode = String(body.projectCode ?? "").trim()
    const projectTitle = String(body.projectTitle ?? "").trim()
    const markupRate = String(body.markupRate ?? "30").trim()

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 })
    }

    const url = new URL(request.url)
    const origin = url.origin

    const htmlResponse = await fetch(
      `${origin}/api/quotation/html?projectId=${encodeURIComponent(
        projectId
      )}&markupRate=${encodeURIComponent(markupRate)}`,
      { cache: "no-store" }
    )

    if (!htmlResponse.ok) {
      const data = await htmlResponse.json().catch(() => null)

      return NextResponse.json(
        {
          error: data?.error ?? "Failed to generate quotation HTML.",
          details: data?.details ?? null,
        },
        { status: 500 }
      )
    }

    const html = await htmlResponse.text()

    const titleBase = projectTitle || projectCode || projectId
    const title = `Quote - ${titleBase}`
    const originalFilename = `quotation-${projectId}.html`

    const existing = await supabaseAdmin
      .from("documents")
      .select("document_id")
      .eq("document_type", "QTE")
      .eq("original_filename", originalFilename)
      .maybeSingle()

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 })
    }

    if (existing.data?.document_id) {
      const { data, error } = await supabaseAdmin
        .from("documents")
        .update({
          title,
          content: html,
          content_type: "text/html",
          created_by: "admin@paintpro.com",
          is_archived: false,
          updated_at: new Date().toISOString(),
        })
        .eq("document_id", existing.data.document_id)
        .select(
          "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at"
        )
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        document: data,
        mode: "updated",
      })
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        folder_id: null,
        document_type: "QTE",
        title,
        content: html,
        content_type: "text/html",
        original_filename: originalFilename,
        created_by: "admin@paintpro.com",
        is_archived: false,
      })
      .select(
        "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at"
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      document: data,
      mode: "created",
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to save quotation document.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 }
    )
  }
}