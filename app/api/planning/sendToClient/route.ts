import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { ensureBucket } from "@/lib/supabase/ensureBucket"
import { renderUnsignedInvoicePdf } from "@/lib/server/invoicePdf"

export const runtime = "nodejs"
export const maxDuration = 60

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

// Pre-render and store the unsigned invoice PDF so the client-sign
// endpoint can skip Chromium and just pdf-lib-stamp the signature.
// Failures are logged but don't break the send-to-client flow — the
// sign endpoint has a Chromium fallback for missing PDFs.
async function prerenderUnsignedInvoice(
  request: NextRequest,
  projectId: string,
): Promise<void> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_code, client_id")
    .eq("project_id", projectId)
    .maybeSingle()

  if (projectError || !project) {
    console.error(
      "[sendToClient] Failed to load project for pre-render:",
      projectError?.message,
    )
    return
  }

  const safeProjectCode = sanitizeFileName(project.project_code || projectId)
  const invoicePdfPath = `invoices/${projectId}/invoice-${safeProjectCode}.pdf`
  const invoiceFileName = `invoice-${safeProjectCode}.pdf`

  await ensureBucket("documents")

  const origin = new URL(request.url).origin
  const pdfBuffer = await renderUnsignedInvoicePdf({ projectId, origin })

  const { error: uploadError } = await supabaseAdmin.storage
    .from("documents")
    .upload(invoicePdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error(
      `Failed to upload unsigned invoice PDF: ${uploadError.message}`,
    )
  }

  const now = new Date().toISOString()

  // Upsert the document row so the sign endpoint can locate it and
  // know the bucket/path without re-deriving them. We park it at
  // pending_signature; the sign endpoint flips to signed.
  const { data: existing } = await supabaseAdmin
    .from("project_documents")
    .select("document_id")
    .eq("project_id", projectId)
    .eq("document_type", "invoice")
    .neq("document_status", "void")
    .maybeSingle()

  if (existing?.document_id) {
    await supabaseAdmin
      .from("project_documents")
      .update({
        document_status: "pending_signature",
        storage_bucket: "documents",
        storage_path: invoicePdfPath,
        file_name: invoiceFileName,
        file_mime_type: "application/pdf",
        file_size_bytes: pdfBuffer.byteLength,
        signed_at: null,
        signed_name: null,
        client_signature_path: null,
        updated_at: now,
      })
      .eq("document_id", existing.document_id)
  } else {
    await supabaseAdmin.from("project_documents").insert({
      project_id: projectId,
      client_id: project.client_id,
      document_type: "invoice",
      document_status: "pending_signature",
      storage_bucket: "documents",
      storage_path: invoicePdfPath,
      file_name: invoiceFileName,
      file_mime_type: "application/pdf",
      file_size_bytes: pdfBuffer.byteLength,
      created_at: now,
      updated_at: now,
    })
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const body = await request.json()
  const projectId = String(body?.projectId ?? "").trim()
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 })

  // Update project status to invoice_agreement_pending
  const { error: statusError } = await supabaseAdmin
    .from("projects")
    .update({ status: "invoice_agreement_pending", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)

  if (statusError) {
    return NextResponse.json(
      { error: "Failed to update project status.", details: statusError.message },
      { status: 500 }
    )
  }

  // Pre-render the unsigned PDF so the client's "Sign" tap doesn't
  // have to wait on Chromium. Soft-fail: if rendering breaks here,
  // the admin still completes "Send to Client"; the sign endpoint
  // re-renders on demand the first time the client signs.
  try {
    await prerenderUnsignedInvoice(request, projectId)
  } catch (renderError) {
    console.error(
      "[sendToClient] Unsigned PDF pre-render failed:",
      renderError instanceof Error ? renderError.message : renderError,
    )
  }

  // Find or create the project conversation
  let conversationId: string | null = null

  const { data: existingConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .limit(1)

  if (existingConvos && existingConvos.length > 0) {
    conversationId = existingConvos[0].id
  } else {
    const { data: newConv, error: convError } = await supabaseAdmin
      .from("conversations")
      .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
      .select("id")
      .single()

    if (convError || !newConv) {
      return NextResponse.json({ success: true, messageSent: false })
    }

    conversationId = newConv.id
  }

  // Ensure admin user is a participant
  const { data: existingParticipant } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!existingParticipant) {
    await supabaseAdmin
      .from("conversation_participants")
      .insert([{ conversation_id: conversationId, user_id: userId }])
  }

  // Send notification message
  const { error: msgError } = await supabaseAdmin
    .from("messages")
    .insert([{
      conversation_id: conversationId,
      sender_id: userId,
      content: "Your invoice is ready for review. Please check the invoice and let us know if you have any questions.",
    }])

  return NextResponse.json({ success: true, messageSent: !msgError })
}
