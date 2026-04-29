import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const VALID_TYPES = new Set(["INV", "PAY", "RCP", "QTE"])

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)

    const query = url.searchParams.get("query")?.trim() ?? ""
    const folderId = url.searchParams.get("folderId")
    const sort = url.searchParams.get("sort") ?? "date_desc"
    const types = url.searchParams.get("types")?.split(",").filter(Boolean) ?? []

    let requestQuery = supabaseAdmin
      .from("documents")
      .select(
        "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at"
      )

    if (folderId) {
      requestQuery = requestQuery.eq("folder_id", folderId)
    }

    if (query) {
      requestQuery = requestQuery.or(`title.ilike.%${query}%,created_by.ilike.%${query}%`)
    }

    if (types.length > 0 && types.length < 4) {
      requestQuery = requestQuery.in("document_type", types)
    }

    if (sort === "name_asc") {
      requestQuery = requestQuery.order("title", { ascending: true })
    } else if (sort === "name_desc") {
      requestQuery = requestQuery.order("title", { ascending: false })
    } else if (sort === "date_asc") {
      requestQuery = requestQuery.order("created_at", { ascending: true })
    } else {
      requestQuery = requestQuery.order("created_at", { ascending: false })
    }

    const { data, error } = await requestQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents: data ?? [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch documents" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const documentType = String(body.documentType ?? "").trim()
    const title = String(body.title ?? "").trim()
    const content = String(body.content ?? "")
    const folderId = body.folderId ? String(body.folderId) : null

    if (!VALID_TYPES.has(documentType)) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: "Document title is required" }, { status: 400 })
    }

    if (!content.trim()) {
      return NextResponse.json({ error: "Document content is required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        folder_id: folderId,
        document_type: documentType,
        title,
        content,
        content_type: body.contentType ?? "text/plain",
        original_filename: body.originalFilename ?? null,
        created_by: body.createdBy ?? "admin@paintpro.com",
      })
      .select(
        "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at"
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ document: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create document" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const documentId = String(body.documentId ?? "").trim()
    const action = String(body.action ?? "").trim()
    const now = new Date().toISOString()

    if (!documentId) {
      return NextResponse.json({ error: "Document id is required" }, { status: 400 })
    }

    if (action === "move") {
      const folderId = body.folderId ? String(body.folderId) : null

      const { error } = await supabaseAdmin
        .from("documents")
        .update({
          folder_id: folderId,
          updated_at: now,
        })
        .eq("document_id", documentId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === "rename") {
      const title = String(body.title ?? "").trim()

      if (!title) {
        return NextResponse.json({ error: "Document title is required" }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from("documents")
        .update({ title, updated_at: now })
        .eq("document_id", documentId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === "archive" || action === "restore") {
      const { error } = await supabaseAdmin
        .from("documents")
        .update({
          is_archived: action === "archive",
          updated_at: now,
        })
        .eq("document_id", documentId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Invalid document action" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update document" },
      { status: 500 }
    )
  }
}