import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

async function getProjectInfo(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, title, client_id")
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function getSignedQuotationFromBucket(projectId: string, projectCode?: string | null) {
  const { data: projectDocument, error: projectDocumentError } = await supabaseAdmin
    .from("project_documents")
    .select("document_id, storage_bucket, storage_path, file_name, file_mime_type")
    .eq("project_id", projectId)
    .eq("document_type", "quotation")
    .eq("document_status", "signed")
    .neq("document_status", "void")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (projectDocumentError) throw projectDocumentError

  const safeProjectCode = sanitizeFileName(projectCode || projectId)
  const fallbackPath = `quotations/${projectId}/quotation-${safeProjectCode}.pdf`

  const bucket = projectDocument?.storage_bucket || "documents"
  const path = projectDocument?.storage_path || fallbackPath
  const filename = projectDocument?.file_name || `quotation-${safeProjectCode}.pdf`

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(bucket)
    .download(path)

  if (downloadError || !fileData) {
    return null
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  const mimeType = projectDocument?.file_mime_type || fileData.type || "application/pdf"

  return {
    bucket,
    path,
    filename,
    mimeType,
    content: `data:${mimeType};base64,${base64}`,
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const projectId = String(body.projectId ?? "").trim()
    const bodyProjectCode = String(body.projectCode ?? "").trim()
    const bodyProjectTitle = String(body.projectTitle ?? "").trim()
    const markupRate = String(body.markupRate ?? "30").trim()

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 })
    }

    const project = await getProjectInfo(projectId)

    if (!project) {
      return NextResponse.json({ error: "Project was not found." }, { status: 404 })
    }

    const projectCode = bodyProjectCode || project.project_code || projectId
    const projectTitle = bodyProjectTitle || project.title || projectCode
    const title = `Quote - ${projectTitle}`

    const signedQuotation = await getSignedQuotationFromBucket(projectId, projectCode)

    const originalFilename = signedQuotation?.filename || `quotation-${projectId}.html`
    const content = signedQuotation?.content ?? null
    const contentType = signedQuotation?.mimeType || "text/html"

    let finalContent = content

    if (!finalContent) {
      const url = new URL(request.url)
      const origin = url.origin

      const htmlResponse = await fetch(
        `${origin}/api/quotation/html?projectId=${encodeURIComponent(
          projectId,
        )}&markupRate=${encodeURIComponent(markupRate)}`,
        { cache: "no-store" },
      )

      if (!htmlResponse.ok) {
        const data = await htmlResponse.json().catch(() => null)

        return NextResponse.json(
          {
            error: data?.error ?? "Failed to generate quotation HTML.",
            details: data?.details ?? null,
          },
          { status: 500 },
        )
      }

      finalContent = await htmlResponse.text()
    }

    const existing = await supabaseAdmin
      .from("documents")
      .select("document_id")
      .eq("document_type", "QTE")
      .eq("original_filename", originalFilename)
      .maybeSingle()

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 })
    }

    const payload = {
      folder_id: null,
      document_type: "QTE",
      title,
      content: finalContent,
      content_type: contentType,
      original_filename: originalFilename,
      created_by: "admin@paintpro.com",
      is_archived: false,
      updated_at: new Date().toISOString(),
    }

    if (existing.data?.document_id) {
      const { data, error } = await supabaseAdmin
        .from("documents")
        .update(payload)
        .eq("document_id", existing.data.document_id)
        .select(
          "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at",
        )
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        document: data,
        mode: "updated",
        source: signedQuotation ? "signed-pdf-bucket" : "html-preview",
        storagePath: signedQuotation?.path ?? null,
      })
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert(payload)
      .select(
        "document_id, folder_id, document_type, title, content, content_type, original_filename, created_by, is_archived, created_at, updated_at",
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      document: data,
      mode: "created",
      source: signedQuotation ? "signed-pdf-bucket" : "html-preview",
      storagePath: signedQuotation?.path ?? null,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to save quotation document.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    )
  }
}
