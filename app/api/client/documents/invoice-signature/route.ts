import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureBucket } from "@/lib/supabase/ensureBucket";
import {
  renderUnsignedInvoicePdf,
  stampClientSignatureOnInvoice,
} from "@/lib/server/invoicePdf";

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

// Download a buffer from Supabase Storage. Returns null when the
// object doesn't exist so the caller can fall back to live render.
async function downloadStoredPdf(
  bucket: string,
  path: string,
): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

    // Pull project + client + (optional) existing pending document
    // in parallel so we don't pay sequential round-trips.
    const [projectResult, pendingDocResult] = await Promise.all([
      supabaseAdmin
        .from("projects")
        .select("project_id, project_code, client_id, status")
        .eq("project_id", projectId)
        .eq("project_code", projectCode)
        .maybeSingle(),
      supabaseAdmin
        .from("project_documents")
        .select(
          "document_id, storage_bucket, storage_path, file_name, file_mime_type",
        )
        .eq("project_id", projectId)
        .eq("document_type", "invoice")
        .neq("document_status", "void")
        .maybeSingle(),
    ]);

    if (projectResult.error) throw projectResult.error;
    const project = projectResult.data;
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

    if (
      !["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)
    ) {
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

    // Try the fast path: stamp the signature onto the pre-rendered
    // unsigned PDF with pdf-lib. Fall back to a full Chromium render
    // when either (a) the unsigned PDF isn't in storage yet, or (b)
    // the signature image is a format pdf-lib can't embed (eg WebP).
    const pendingDoc = pendingDocResult.data;
    const storedBucket = pendingDoc?.storage_bucket ?? "documents";
    const storedPath = pendingDoc?.storage_path ?? invoicePdfPath;

    let signedPdfBuffer: Buffer | null = null;

    const canStamp =
      mimeType === "image/png" ||
      mimeType === "image/jpeg" ||
      mimeType === "image/jpg";

    if (canStamp) {
      const unsigned = await downloadStoredPdf(storedBucket, storedPath);
      if (unsigned) {
        try {
          const stamped = await stampClientSignatureOnInvoice(unsigned, {
            signatureBuffer,
            signatureMimeType: mimeType,
            signedName,
          });
          signedPdfBuffer = stamped.buffer;
        } catch (stampError) {
          // pdf-lib couldn't stamp (corrupt PDF, etc). Drop through
          // to the Chromium fallback so the user still gets a
          // signed invoice — we don't want to block signing on a
          // library-level issue.
          console.error(
            "[invoice-signature] pdf-lib stamping failed, falling back to Chromium:",
            stampError instanceof Error ? stampError.message : stampError,
          );
        }
      }
    }

    // Slow fallback: render the whole invoice via Chromium with the
    // client signature inlined. Only runs when the fast path can't.
    // Same render pipeline as before this refactor, just gated.
    if (!signedPdfBuffer) {
      const { renderInvoiceHtml } = await import(
        "../../../invoice/html/route"
      );
      const clientSignatureDataUrl = `data:${mimeType};base64,${signatureBuffer.toString("base64")}`;
      const html = await renderInvoiceHtml({
        projectId,
        origin,
        clientSignatureDataUrl,
        clientSignedName: signedName,
      });

      const { getPdfBrowser } = await import("@/lib/server/pdfBrowser");
      const browser = await getPdfBrowser();
      const context = await browser.newContext();
      try {
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
        signedPdfBuffer = Buffer.from(pdfBytes);
      } finally {
        await context.close().catch(() => {});
      }
    }

    // Upload the signed PDF, then run the two DB writes in parallel.
    // Upload has to land before the status flips so a quick refresh
    // by the client sees the new file; the document row update and
    // the project status update don't depend on each other.
    const { error: uploadPdfError } = await supabaseAdmin.storage
      .from("documents")
      .upload(invoicePdfPath, signedPdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadPdfError) {
      throw new Error(
        `Failed to upload signed PDF to "documents" bucket: ${uploadPdfError.message}`,
      );
    }

    const documentUpsert = pendingDoc?.document_id
      ? supabaseAdmin
          .from("project_documents")
          .update({
            document_status: "signed",
            storage_bucket: "documents",
            storage_path: invoicePdfPath,
            file_name: invoiceFileName,
            file_mime_type: "application/pdf",
            file_size_bytes: signedPdfBuffer.byteLength,
            signed_at: now,
            signed_name: signedName,
            client_signature_path: null,
            updated_at: now,
          })
          .eq("document_id", pendingDoc.document_id)
          .select("document_id")
          .single()
      : supabaseAdmin
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
            file_size_bytes: signedPdfBuffer.byteLength,
            signed_at: now,
            signed_name: signedName,
            client_signature_path: null,
            created_at: now,
            updated_at: now,
          })
          .select("document_id")
          .single();

    const statusUpdate = supabaseAdmin
      .from("projects")
      .update({
        status: "invoice_signed",
        updated_at: now,
      })
      .eq("project_id", projectId);

    const [docResult, statusResult] = await Promise.all([
      documentUpsert,
      statusUpdate,
    ]);

    if (docResult.error) throw docResult.error;
    if (statusResult.error) throw statusResult.error;

    return NextResponse.json({
      message: "Invoice signed and saved.",
      nextStatus: "invoice_signed",
      documentId: docResult.data?.document_id ?? null,
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
