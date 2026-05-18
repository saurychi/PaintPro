import { NextResponse } from "next/server";
import type { BrowserContext } from "playwright-core";
import { withFreshPdfBrowser } from "../../../../../lib/server/pdfBrowser";
import {
  getProjectReportFilename,
  loadProjectReportExport,
  renderProjectReportHtml,
} from "../../../../../lib/server/reportProjectExport";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const download = url.searchParams.get("download") === "1";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const data = await loadProjectReportExport(projectId);
    const html = renderProjectReportHtml(data);

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

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${getProjectReportFilename(data, "pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Project not found." ? 404 : 500;

    return NextResponse.json(
      { error: "Failed to generate project report PDF.", details: message },
      { status },
    );
  }
}
