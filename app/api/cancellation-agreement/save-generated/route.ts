import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureBucket } from "@/lib/supabase/ensureBucket";

// POST /api/cancellation-agreement/save-generated
//
// Mirrors /api/quotation/save-generated for cancellation agreements.
// Generates the agreement PDF (server-side via /api/cancellation-agreement/pdf)
// and stores it in the "documents" bucket at
//   cancellation-agreements/<projectId>/cancellation-agreement-<code>.pdf
// Creates or updates the matching project_documents row with
// document_status='generated' so the client portal can later read the
// file from the bucket without regenerating it on every visit.
//
// If a signed cancellation agreement row already exists for the project we
// still refresh the storage file but preserve the signed_at / signed_name /
// signed_ip metadata so the signature audit trail isn't overwritten.

export const runtime = "nodejs";
export const maxDuration = 60;

const CANCELLATION_BUCKET = "documents";

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, client_id, status")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json(
        {
          error: "Project not found.",
          details: projectError?.message ?? "Unknown",
        },
        { status: 404 },
      );
    }

    if (project.status !== "cancelled") {
      return NextResponse.json(
        { error: "Project is not cancelled." },
        { status: 400 },
      );
    }

    const safeProjectCode = sanitizeFileName(project.project_code || projectId);
    const storagePath = `cancellation-agreements/${projectId}/cancellation-agreement-${safeProjectCode}.pdf`;
    const fileName = `cancellation-agreement-${safeProjectCode}.pdf`;

    const origin = new URL(request.url).origin;
    const pdfResponse = await fetch(
      `${origin}/api/cancellation-agreement/pdf?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );

    if (!pdfResponse.ok) {
      const pdfError = await pdfResponse.json().catch(() => null);
      return NextResponse.json(
        {
          error: "Failed to generate cancellation agreement PDF.",
          details:
            [pdfError?.error, pdfError?.details].filter(Boolean).join(": ") ||
            `pdf endpoint returned ${pdfResponse.status}`,
        },
        { status: 500 },
      );
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    await ensureBucket(CANCELLATION_BUCKET);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(CANCELLATION_BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          error: "Failed to upload cancellation agreement PDF.",
          details: uploadError.message,
        },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();

    const { data: existingDocument, error: existingError } = await supabaseAdmin
      .from("project_documents")
      .select("document_id, document_status")
      .eq("project_id", projectId)
      .eq("document_type", "cancellation_agreement")
      .neq("document_status", "void")
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: "Failed to look up existing cancellation agreement document.",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existingDocument) {
      const isSigned = existingDocument.document_status === "signed";
      const updatePayload: Record<string, unknown> = {
        storage_bucket: CANCELLATION_BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        file_mime_type: "application/pdf",
        file_size_bytes: pdfBuffer.byteLength,
        updated_at: now,
      };
      if (!isSigned) {
        updatePayload.document_status = "generated";
      }

      const { error: updateError } = await supabaseAdmin
        .from("project_documents")
        .update(updatePayload)
        .eq("document_id", existingDocument.document_id);

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to update cancellation agreement document row.",
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        documentId: existingDocument.document_id,
        storage_bucket: CANCELLATION_BUCKET,
        storage_path: storagePath,
        regenerated: true,
      });
    }

    const { data: insertedDocument, error: insertError } = await supabaseAdmin
      .from("project_documents")
      .insert({
        project_id: projectId,
        client_id: project.client_id ?? null,
        document_type: "cancellation_agreement",
        document_status: "generated",
        storage_bucket: CANCELLATION_BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        file_mime_type: "application/pdf",
        file_size_bytes: pdfBuffer.byteLength,
        created_at: now,
        updated_at: now,
      })
      .select("document_id")
      .single();

    if (insertError || !insertedDocument) {
      return NextResponse.json(
        {
          error: "Failed to create cancellation agreement document row.",
          details: insertError?.message ?? "Unknown",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      documentId: insertedDocument.document_id,
      storage_bucket: CANCELLATION_BUCKET,
      storage_path: storagePath,
      regenerated: false,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error generating cancellation agreement.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
