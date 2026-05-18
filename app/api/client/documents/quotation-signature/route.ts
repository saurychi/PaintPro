import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureBucket } from "@/lib/supabase/ensureBucket";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";

// Dynamic import below — same reason as the other signature endpoints:
// Turbopack's static graph doesn't like a route.ts statically importing
// from another route.ts.

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

    const quotationStorageBucket = "documents";
    const quotationPdfPath = `quotations/${projectId}/quotation-${safeProjectCode}.pdf`;
    const quotationFileName = `quotation-${safeProjectCode}.pdf`;

    await ensureBucket(quotationStorageBucket);

    // Render signed quotation HTML in memory and turn it into a PDF
    // via Playwright. The client signature is inlined as a data URL —
    // it never gets uploaded to the signatures bucket.
    const clientSignatureDataUrl = `data:${mimeType};base64,${signatureBuffer.toString("base64")}`;

    const { renderQuotationHtml } = await import(
      "../../../quotation/html/route"
    );
    const html = await renderQuotationHtml({
      projectId,
      clientSignatureDataUrl,
      clientSignedName: signedName,
    });

    // withFreshPdfBrowser retries once on "browser has been closed" errors
    // by tearing down the cached Chromium handle and relaunching. Vercel's
    // freeze/thaw cycle occasionally zombie-reaps the underlying process
    // even though Playwright's isConnected() still says it's alive, which
    // is exactly the failure mode the client signing flow was hitting.
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
      .from(quotationStorageBucket)
      .upload(quotationPdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadPdfError) {
      throw new Error(
        `Failed to upload signed PDF to "${quotationStorageBucket}" bucket: ${uploadPdfError.message}`,
      );
    }

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
          storage_bucket: quotationStorageBucket,
          storage_path: quotationPdfPath,
          file_name: quotationFileName,
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
            document_type: "quotation",
            document_status: "signed",
            storage_bucket: quotationStorageBucket,
            storage_path: quotationPdfPath,
            file_name: quotationFileName,
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

    // Mark the project as "client signed, awaiting project manager". The
    // admin still has to advance to downpayment_pending from their side once
    // they've acknowledged via the project conversation, but having a
    // dedicated status makes the in-between state legible to every page.
    const { error: statusError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "client_quotation_done",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (statusError) throw statusError;

    return NextResponse.json({
      message: "Quotation signed and saved.",
      nextStatus: "client_quotation_done",
      documentId,
      signedName,
      signedAt: now,
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
