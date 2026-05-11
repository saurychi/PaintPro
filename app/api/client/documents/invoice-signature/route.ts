import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureBucket } from "@/lib/supabase/ensureBucket";
import { getPdfBrowser } from "@/lib/server/pdfBrowser";

// Dynamic import below — same reason as the cancellation-agreement
// signature endpoint: Turbopack's static graph doesn't like a route.ts
// statically importing from another route.ts.

export const runtime = "nodejs";
export const maxDuration = 60;

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

    if (project.status !== "invoice_agreement_pending") {
      return NextResponse.json(
        { error: "This invoice is not pending client agreement." },
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

    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
      return NextResponse.json(
        { error: "Signature must be a PNG, JPEG, or WEBP image." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const safeProjectCode = sanitizeFileName(project.project_code || projectId);

    const invoicePdfPath = `invoices/${projectId}/invoice-${safeProjectCode}.pdf`;
    const invoiceFileName = `invoice-${safeProjectCode}.pdf`;

    await ensureBucket("documents");

    // Render the signed invoice HTML *in memory* — client signature
    // rides along as an inline data URL so the raw PNG never reaches
    // the signatures bucket.
    const clientSignatureDataUrl = `data:${mimeType};base64,${signatureBuffer.toString("base64")}`;

    const { renderInvoiceHtml } = await import(
      "../../../invoice/html/route"
    );
    const html = await renderInvoiceHtml({
      projectId,
      origin,
      clientSignatureDataUrl,
      clientSignedName: signedName,
    });

    let context: BrowserContext | null = null;
    let pdfBuffer: Buffer;
    try {
      const browser = await getPdfBrowser();
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
      pdfBuffer = Buffer.from(pdfBytes);
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }

    const { error: uploadPdfError } = await supabaseAdmin.storage
      .from("documents")
      .upload(invoicePdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadPdfError) {
      throw new Error(
        `Failed to upload signed PDF to "documents" bucket: ${uploadPdfError.message}`,
      );
    }

    const { data: existingDocument, error: existingError } = await supabaseAdmin
      .from("project_documents")
      .select("document_id")
      .eq("project_id", projectId)
      .eq("document_type", "invoice")
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
          storage_path: invoicePdfPath,
          file_name: invoiceFileName,
          file_mime_type: "application/pdf",
          file_size_bytes: pdfBuffer.byteLength,
          signed_at: now,
          signed_name: signedName,
          // Never set — raw client signature is not persisted anywhere.
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
            document_type: "invoice",
            document_status: "signed",
            storage_bucket: "documents",
            storage_path: invoicePdfPath,
            file_name: invoiceFileName,
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

    // Client just signed the invoice but the admin still needs to
    // confirm "Proceed to Payment" before money is owed — park the
    // project at invoice_signed in between. The admin invoice page
    // shows a button on this status that flips to payment_pending.
    const { error: statusError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "invoice_signed",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (statusError) throw statusError;

    return NextResponse.json({
      message: "Invoice signed and saved.",
      nextStatus: "invoice_signed",
      documentId,
      signedName,
      signedAt: now,
      invoicePdfPath,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to save invoice signature.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
