import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";
import { renderInvoiceHtml } from "@/app/api/invoice/html/route";

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

    // Render via the shared helper instead of `page.goto(htmlUrl)` against
    // a sibling Lambda. The self-HTTP hop was causing Chromium to hit
    // net::ERR_INSUFFICIENT_RESOURCES on Vercel under load.
    const html = await renderInvoiceHtml({
      projectId,
      origin: url.origin,
      markupRate,
    });

    // Old version called launchPdfBrowser() and then awaited browser.close()
    // in finally. That tore the cached Chromium handle down on every
    // request, defeated the cache, and left the next caller staring at the
    // "Target page, context or browser has been closed" error. Use the
    // shared withFreshPdfBrowser wrapper instead: it leaves the browser
    // alive between requests, isolates each render in its own context,
    // and transparently relaunches if the cache is stale.
    const pdfBuffer = await withFreshPdfBrowser(async (browser) => {
      let context: BrowserContext | null = null;
      try {
        context = await browser.newContext();
        const page = await context.newPage();

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
    const filename = `invoice-${projectId}.pdf`;

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
        error: "Failed to generate invoice PDF.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
