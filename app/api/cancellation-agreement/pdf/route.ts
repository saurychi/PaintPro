import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cancellation-agreement/pdf?projectId=...
//
// Mirrors /api/quotation/pdf. Fetches the agreement HTML and runs it
// through the cached Playwright instance to produce a one-page A4 PDF
// for both admin preview and post-sign upload.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const download = url.searchParams.get("download") === "1";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const origin = url.origin;
    const htmlUrl = `${origin}/api/cancellation-agreement/html?projectId=${encodeURIComponent(
      projectId,
    )}`;

    const pdfBuffer = await withFreshPdfBrowser(async (browser) => {
      let context: BrowserContext | null = null;
      try {
        context = await browser.newContext();
        const page = await context.newPage();

        // Match the invoice route. Wait until network is idle so the
        // server-side data fetch the HTML route triggers (project +
        // client + signatures) is fully resolved before we snapshot.
        // With everything already inlined as base64 data URLs there are
        // no remote image fetches, so this is just belt-and-braces.
        await page.goto(htmlUrl, { waitUntil: "networkidle" });
        await page.emulateMedia({ media: "screen" });

        return await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "12mm",
            right: "12mm",
            bottom: "12mm",
            left: "12mm",
          },
        });
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    });

    const pdfBytes = new Uint8Array(pdfBuffer);
    const filename = `cancellation-agreement-${projectId}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${
          download ? "attachment" : "inline"
        }; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to generate cancellation agreement PDF.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
