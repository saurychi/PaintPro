import { NextResponse } from "next/server";
import {
  getProjectReportFilename,
  loadProjectReportExport,
  renderProjectReportCsv,
} from "../../../../../lib/server/reportProjectExport";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const data = await loadProjectReportExport(projectId);
    const csv = renderProjectReportCsv(data);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getProjectReportFilename(data, "csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Project not found." ? 404 : 500;

    return NextResponse.json(
      { error: "Failed to generate project report CSV.", details: message },
      { status },
    );
  }
}
