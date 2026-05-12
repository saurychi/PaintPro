import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";
import { renderCancellationAgreementHtml } from "@/app/api/cancellation-agreement/html/route";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cancellation-agreement/pdf?projectId=...
//
// Renders the agreement HTML via the shared render helper (no self-HTTP
// fetch back to /api/cancellation-agreement/html) and feeds it into
// Playwright via setContent. Going over the network to a sibling
// serverless function caused Chromium to hit
// `net::ERR_INSUFFICIENT_RESOURCES` under Vercel's constrained Lambda
// runtime.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const download = url.searchParams.get("download") === "1";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const html = await renderCancellationAgreementHtml({ projectId });

    const pdfBuffer = await withFreshPdfBrowser(async (browser) => {
      let context: BrowserContext | null = null;
      try {
        context = await browser.newContext();
        const page = await context.newPage();

        // setContent with domcontentloaded is enough since the HTML is
        // fully server-rendered with images inlined as base64 data URLs:
        // no remote fetches, no client-side hydration, nothing to wait
        // for past parsing.
        await page.setContent(html, { waitUntil: "domcontentloaded" });
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
