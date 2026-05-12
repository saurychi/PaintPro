import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureBucket } from "@/lib/supabase/ensureBucket";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";

// Dynamic import below — Turbopack chokes on static cross-route imports
// between two route.ts files (the dependency graph thinks the importer
// is pulling in a route handler module factory). Importing lazily inside
// the handler keeps the static graph clean while still letting us call
// the renderer in-process and avoid writing the client signature to
// storage.

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/client/documents/cancellation-agreement-signature
//
// Accepts the client's base64 signature image, renders the signed
// cancellation-agreement PDF *in-process* (HTML helper + Playwright,
// no HTTP round trip, no signature image written to storage), and
// uploads only the resulting PDF to the "documents" bucket. The row in
// `project_documents` records signing metadata but never references a
// client_signature_path — the raw client signature never persists.

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
    const body = await request.json();

    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const projectCode =
      typeof body?.projectCode === "string" ? body.projectCode.trim() : "";
    const signatureDataUrl =
      typeof body?.signatureDataUrl === "string"
        ? body.signatureDataUrl.trim()
        : "";

    if (!projectId)
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    if (!projectCode)
      return NextResponse.json(
        { error: "Missing project code." },
        { status: 400 },
      );
    if (!signatureDataUrl)
      return NextResponse.json(
        { error: "Missing client signature." },
        { status: 400 },
      );

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select(
        "project_id, project_code, client_id, status, cancellation_phase",
      )
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

    if (project.status !== "cancelled") {
      return NextResponse.json(
        {
          error:
            "Cancellation agreement can only be signed for cancelled projects.",
        },
        { status: 409 },
      );
    }

    if (
      project.cancellation_phase &&
      project.cancellation_phase !== "document"
    ) {
      return NextResponse.json(
        {
          error:
            project.cancellation_phase === "review" ||
            project.cancellation_phase === "payment"
              ? "Document signing is gated on the previous wrap-up steps. Have the admin complete review and payment first."
              : "This cancellation agreement has already been signed.",
        },
        { status: 409 },
      );
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("client_id, full_name")
      .eq("client_id", project.client_id)
      .maybeSingle();

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
    const safeProjectCode = sanitizeFileName(
      project.project_code || projectId,
    );

    const agreementStorageBucket = "documents";
    const agreementPdfPath = `cancellation-agreements/${projectId}/cancellation-agreement-${safeProjectCode}.pdf`;
    const agreementFileName = `cancellation-agreement-${safeProjectCode}.pdf`;

    await ensureBucket(agreementStorageBucket);

    // Render the signed agreement HTML *in memory* — the client
    // signature is inlined as a base64 data URL straight from the
    // request buffer, so the raw image never gets persisted to the
    // signatures bucket. Anything in storage from here on is the
    // baked-in signed PDF only.
    const clientSignatureDataUrl = `data:${mimeType};base64,${signatureBuffer.toString("base64")}`;

    const { renderCancellationAgreementHtml } = await import(
      "../../../cancellation-agreement/html/route"
    );
    const html = await renderCancellationAgreementHtml({
      projectId,
      clientSignatureDataUrl,
      clientSignedName: signedName,
      clientSignedAt: now,
    });

    // Convert HTML to PDF in-process. Mirrors the /pdf route's options
    // (A4, 12mm margins, print backgrounds on) but skips the HTTP hop
    // to /api/cancellation-agreement/html, which would have lost our
    // inline signature. withFreshPdfBrowser retries once on a stale
    // cached browser.
    const pdfBuffer = await withFreshPdfBrowser(async (browser) => {
      let context: BrowserContext | null = null;
      try {
        context = await browser.newContext();
        const page = await context.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.emulateMedia({ media: "screen" });
        const pdfBytes = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "12mm",
            right: "12mm",
            bottom: "12mm",
            left: "12mm",
          },
        });
        return Buffer.from(pdfBytes);
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    });

    const { error: uploadPdfError } = await supabaseAdmin.storage
      .from(agreementStorageBucket)
      .upload(agreementPdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadPdfError) {
      throw new Error(
        `Failed to upload signed PDF: ${uploadPdfError.message}`,
      );
    }

    const { data: existingDocument, error: existingError } = await supabaseAdmin
      .from("project_documents")
      .select("document_id")
      .eq("project_id", projectId)
      .eq("document_type", "cancellation_agreement")
      .neq("document_status", "void")
      .maybeSingle();

    if (existingError) throw existingError;

    let documentId: string | null = existingDocument?.document_id ?? null;

    if (documentId) {
      const { error: updateDocumentError } = await supabaseAdmin
        .from("project_documents")
        .update({
          document_status: "signed",
          storage_bucket: agreementStorageBucket,
          storage_path: agreementPdfPath,
          file_name: agreementFileName,
          file_mime_type: "application/pdf",
          file_size_bytes: pdfBuffer.byteLength,
          signed_at: now,
          signed_name: signedName,
          // Intentionally never set — the raw client signature image
          // does not live in any bucket.
          client_signature_path: null,
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
            document_type: "cancellation_agreement",
            document_status: "signed",
            storage_bucket: agreementStorageBucket,
            storage_path: agreementPdfPath,
            file_name: agreementFileName,
            file_mime_type: "application/pdf",
            file_size_bytes: pdfBuffer.byteLength,
            signed_at: now,
            signed_name: signedName,
            client_signature_path: null,
            created_at: now,
            updated_at: now,
          })
          .select("document_id")
          .single();
      if (insertDocumentError) throw insertDocumentError;
      documentId = insertedDocument.document_id;
    }

    return NextResponse.json({
      message: "Cancellation agreement signed.",
      documentId,
      signedName,
      signedAt: now,
      agreementPdfPath,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to save cancellation agreement signature.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
