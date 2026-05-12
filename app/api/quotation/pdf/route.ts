import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";

// Playwright + @sparticuz/chromium need a long-running Node runtime; the Edge
// runtime can't load the binary. maxDuration covers cold-start + render time
// on slower projects.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const download = url.searchParams.get("download") === "1";
    const markupRate = url.searchParams.get("markupRate")?.trim() || "30";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const origin = url.origin;
    const htmlUrl = `${origin}/api/quotation/html?projectId=${encodeURIComponent(
      projectId,
    )}&markupRate=${encodeURIComponent(markupRate)}`;

    // Reuse the cached browser across requests (~1-2s saved per call).
    // Each render gets its own isolated context so concurrent renders
    // don't share storage / cookies. withFreshPdfBrowser retries once
    // with a fresh launch if the cached handle has been zombie-reaped
    // by Vercel's freeze/thaw cycle.
    const pdfBuffer = await withFreshPdfBrowser(async (browser) => {
      let context: BrowserContext | null = null;
      try {
        context = await browser.newContext();
        const page = await context.newPage();

        // domcontentloaded is enough since the HTML page server-renders
        // the quotation body inline (no client-side fetch waterfall).
        // Switching away from networkidle saves ~500ms of "wait for
        // nothing" time.
        await page.goto(htmlUrl, { waitUntil: "domcontentloaded" });
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
    const filename = `quotation-${projectId}.pdf`;

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
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to generate quotation PDF.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
