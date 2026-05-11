import type { BrowserContext } from "playwright-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getPdfBrowser } from "@/lib/server/pdfBrowser";

// Stamp coordinates for the client signature box, expressed in PDF
// points relative to the bottom-left of the last page. These values
// line up with the invoice HTML layout when the `.signature` block
// is forced onto its own A4 page (via `break-before: page`) with
// 12mm Chromium margins. A4 in points is 595.276 x 841.890.
//
// If the layout shifts visibly, tweak the numbers here rather than
// hunting through pdf-lib calls. Each constant has a comment so
// future-you understands the intent.
export const INVOICE_CLIENT_SIGNATURE_LAYOUT = {
  // Right column starts ~half-page across, after the 12mm left
  // margin and a 28px column gap. 320pt gives a touch of breathing
  // room from the column divider.
  rightColumnX: 320,
  // Cap the image box. The HTML allows up to 180x48px (180x36pt);
  // 180x40 keeps a similar visual weight in the stamped output.
  signatureImageMaxWidth: 180,
  signatureImageMaxHeight: 40,
  // y of the image's bottom edge. The signature page lands the
  // signature block near the top with .signature margin-top: 28px,
  // then the sig-image-wrap (h=48px) sits at the top of each box.
  // 740pt from the bottom (~100pt from the page top) is well
  // within the image-wrap region.
  signatureImageBottomY: 740,
  // "Received By / Client Signature" label is part of the
  // pre-rendered PDF; we only stamp the signed name underneath.
  signedNameY: 712,
  signedNameSize: 11,
} as const;

export type StampedInvoiceSignature = {
  buffer: Buffer;
  byteLength: number;
};

// Render the unsigned invoice PDF via Chromium. Slow (~2-5s warm) so
// callers should run it from non-interactive paths (admin "Send to
// Client") where a brief delay is expected. Reuses the cached
// browser singleton from lib/server/pdfBrowser.
export async function renderUnsignedInvoicePdf(args: {
  projectId: string;
  origin: string;
  markupRate?: string;
}): Promise<Buffer> {
  // Dynamic import: route.ts modules can't be statically imported
  // from another route.ts (Turbopack). The helper is exported.
  const { renderInvoiceHtml } = await import(
    "@/app/api/invoice/html/route"
  );

  const html = await renderInvoiceHtml({
    projectId: args.projectId,
    origin: args.origin,
    markupRate: args.markupRate,
  });

  const browser = await getPdfBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "screen" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdfBytes);
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// Overlay the client signature image + signed name onto an existing
// unsigned invoice PDF. No Chromium required — pdf-lib opens the
// buffer, embeds the PNG, and draws it on the last page (the
// signature page) at the coordinates above. Typically <100ms.
export async function stampClientSignatureOnInvoice(
  pdfBuffer: Buffer,
  args: {
    signatureBuffer: Buffer;
    signatureMimeType: string;
    signedName: string;
  },
): Promise<StampedInvoiceSignature> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error("Unsigned invoice PDF has no pages.");
  }
  const lastPage = pages[pages.length - 1];

  let image;
  if (args.signatureMimeType === "image/png") {
    image = await pdfDoc.embedPng(args.signatureBuffer);
  } else if (
    args.signatureMimeType === "image/jpeg" ||
    args.signatureMimeType === "image/jpg"
  ) {
    image = await pdfDoc.embedJpg(args.signatureBuffer);
  } else {
    // pdf-lib only supports PNG/JPG natively. The client's canvas
    // export is PNG, so this path is the safety net for an admin-
    // uploaded signature of another type. Caller should fall back
    // to Chromium rendering when this throws.
    throw new Error(
      `Unsupported signature image type for pdf-lib stamping: ${args.signatureMimeType}`,
    );
  }

  const {
    rightColumnX,
    signatureImageMaxWidth,
    signatureImageMaxHeight,
    signatureImageBottomY,
    signedNameY,
    signedNameSize,
  } = INVOICE_CLIENT_SIGNATURE_LAYOUT;

  const scale = Math.min(
    signatureImageMaxWidth / image.width,
    signatureImageMaxHeight / image.height,
  );
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  lastPage.drawImage(image, {
    x: rightColumnX,
    y: signatureImageBottomY,
    width: drawWidth,
    height: drawHeight,
  });

  if (args.signedName) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    lastPage.drawText(args.signedName, {
      x: rightColumnX,
      y: signedNameY,
      size: signedNameSize,
      font,
      color: rgb(0.067, 0.094, 0.153), // matches the HTML's #111827
    });
  }

  const bytes = await pdfDoc.save();
  const buffer = Buffer.from(bytes);
  return { buffer, byteLength: buffer.byteLength };
}
