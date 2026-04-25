import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("document_folders")
      .select(
        "folder_id, name, is_archived, created_at, updated_at, documents(document_id, content, is_archived)"
      )
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ folders: data ?? [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch folders" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name ?? "").trim()

    if (!name) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("document_folders")
      .insert({ name })
      .select("folder_id, name, is_archived, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ folder: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create folder" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const folderId = String(body.folderId ?? "").trim()
    const action = String(body.action ?? "").trim()
    const now = new Date().toISOString()

    if (!folderId) {
      return NextResponse.json({ error: "Folder id is required" }, { status: 400 })
    }

    if (action === "rename") {
      const name = String(body.name ?? "").trim()

      if (!name) {
        return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from("document_folders")
        .update({ name, updated_at: now })
        .eq("folder_id", folderId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === "archive" || action === "restore") {
      const isArchived = action === "archive"

      const folderUpdate = await supabaseAdmin
        .from("document_folders")
        .update({ is_archived: isArchived, updated_at: now })
        .eq("folder_id", folderId)

      if (folderUpdate.error) {
        return NextResponse.json({ error: folderUpdate.error.message }, { status: 500 })
      }

      const filesUpdate = await supabaseAdmin
        .from("documents")
        .update({ is_archived: isArchived, updated_at: now })
        .eq("folder_id", folderId)

      if (filesUpdate.error) {
        return NextResponse.json({ error: filesUpdate.error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Invalid folder action" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update folder" },
      { status: 500 }
    )
  }
}