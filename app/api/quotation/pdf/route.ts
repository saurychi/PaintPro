import { NextResponse } from "next/server";
import type { Browser } from "playwright-core";
import { launchPdfBrowser } from "@/lib/server/pdfBrowser";

// Playwright + @sparticuz/chromium need a long-running Node runtime; the Edge
// runtime can't load the binary. maxDuration covers cold-start + render time
// on slower projects.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  let browser: Browser | null = null;

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

    browser = await launchPdfBrowser();

    const page = await browser.newPage();

    await page.goto(htmlUrl, {
      waitUntil: "networkidle",
    });

    await page.emulateMedia({ media: "screen" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
