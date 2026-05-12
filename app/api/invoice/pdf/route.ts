import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "@/lib/server/pdfBrowser";

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

    const htmlUrl = `${origin}/api/invoice/html?projectId=${encodeURIComponent(
      projectId,
    )}&markupRate=${encodeURIComponent(markupRate)}`;

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
