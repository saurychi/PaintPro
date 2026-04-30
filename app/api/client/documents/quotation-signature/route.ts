import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function dataUrlToBuffer(dataUrl: string) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!matches) {
    throw new Error("Invalid signature image format.");
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const buffer = Buffer.from(base64, "base64");

  return { buffer, mimeType };
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const body = await request.json();

    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";

    const projectCode =
      typeof body?.projectCode === "string" ? body.projectCode.trim() : "";

    const signatureDataUrl =
      typeof body?.signatureDataUrl === "string"
        ? body.signatureDataUrl.trim()
        : "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (!projectCode) {
      return NextResponse.json(
        { error: "Missing project code." },
        { status: 400 },
      );
    }

    if (!signatureDataUrl) {
      return NextResponse.json(
        { error: "Missing client signature." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, client_id, status")
      .eq("project_id", projectId)
      .eq("project_code", projectCode)
      .maybeSingle();

    if (projectError) throw projectError;

    if (!project) {
      return NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      );
    }

    if (project.status !== "quotation_pending") {
      return NextResponse.json(
        { error: "This quotation is not pending client signature." },
        { status: 409 },
      );
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("client_id, full_name")
      .eq("client_id", project.client_id)
      .maybeSingle();

    if (clientError) throw clientError;

    const signedName =
      typeof client?.full_name === "string" && client.full_name.trim()
        ? client.full_name.trim()
        : "Client";

    const { buffer: signatureBuffer, mimeType } =
      dataUrlToBuffer(signatureDataUrl);

    if (
      !["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(
        mimeType,
      )
    ) {
      return NextResponse.json(
        { error: "Signature must be a PNG, JPEG, or WEBP image." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const safeProjectCode = sanitizeFileName(project.project_code || projectId);

    const clientSignaturePath = `project-documents/${projectId}/quotation-client-signature.png`;
    const quotationPdfPath = `quotations/${projectId}/quotation-${safeProjectCode}.pdf`;
    const quotationFileName = `quotation-${safeProjectCode}.pdf`;

    const { error: uploadSignatureError } = await supabaseAdmin.storage
      .from("signatures")
      .upload(clientSignaturePath, signatureBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadSignatureError) throw uploadSignatureError;

    const { data: existingDocument, error: existingError } = await supabaseAdmin
      .from("project_documents")
      .select("document_id")
      .eq("project_id", projectId)
      .eq("document_type", "quotation")
      .neq("document_status", "void")
      .maybeSingle();

    if (existingError) throw existingError;

    let documentId: string | null = existingDocument?.document_id ?? null;

    if (documentId) {
      const { error: updateDocumentError } = await supabaseAdmin
        .from("project_documents")
        .update({
          document_status: "signed",
          storage_bucket: "documents",
          storage_path: quotationPdfPath,
          file_name: quotationFileName,
          file_mime_type: "application/pdf",
          signed_at: now,
          signed_name: signedName,
          client_signature_path: clientSignaturePath,
          updated_at: now,
        })
        .eq("document_id", documentId);

      if (updateDocumentError) throw updateDocumentError;
    } else {
      const { data: insertedDocument, error: insertDocumentError } =
        await supabaseAdmin
          .from("project_documents")
          .insert({
            project_id: projectId,
            client_id: project.client_id,
            document_type: "quotation",
            document_status: "signed",
            storage_bucket: "documents",
            storage_path: quotationPdfPath,
            file_name: quotationFileName,
            file_mime_type: "application/pdf",
            signed_at: now,
            signed_name: signedName,
            client_signature_path: clientSignaturePath,
            created_at: now,
            updated_at: now,
          })
          .select("document_id")
          .single();

      if (insertDocumentError) throw insertDocumentError;

      documentId = insertedDocument.document_id;
    }

    const pdfResponse = await fetch(
      `${origin}/api/quotation/pdf?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );

    if (!pdfResponse.ok) {
      const pdfError = await pdfResponse.json().catch(() => null);

      throw new Error(
        [pdfError?.error, pdfError?.details].filter(Boolean).join(": ") ||
          "Failed to generate signed quotation PDF.",
      );
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    const { error: uploadPdfError } = await supabaseAdmin.storage
      .from("documents")
      .upload(quotationPdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadPdfError) throw uploadPdfError;

    const { error: updateSizeError } = await supabaseAdmin
      .from("project_documents")
      .update({
        file_size_bytes: pdfBuffer.byteLength,
        updated_at: new Date().toISOString(),
      })
      .eq("document_id", documentId);

    if (updateSizeError) throw updateSizeError;

    const { error: statusError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "downpayment_pending",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (statusError) throw statusError;

    return NextResponse.json({
      message: "Quotation signed and saved.",
      nextStatus: "downpayment_pending",
      documentId,
      signedName,
      signedAt: now,
      clientSignaturePath,
      quotationPdfPath,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to save quotation signature.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
