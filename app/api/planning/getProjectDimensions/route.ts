import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/getProjectDimensions?projectCode=<code>
// (also accepts ?projectId=<uuid> / ?draftId=<uuid>).
// Returns the current `dimensions` jsonb so the basic-details refresh
// button can re-sync after the staff measure-generator pushed updates.
// Looks in drafts first (the basic-details flow stays in draft form
// until Save and Continue), then falls through to projects.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const projectCode = url.searchParams.get("projectCode")?.trim() || "";
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  const draftId = url.searchParams.get("draftId")?.trim() || "";

  if (!projectCode && !projectId && !draftId) {
    return NextResponse.json(
      { error: "Missing projectCode, projectId, or draftId." },
      { status: 400 },
    );
  }

  if (draftId) {
    const { data, error } = await supabaseAdmin
      .from("drafts")
      .select("draft_id, draft_code, dimensions, updated_at")
      .eq("draft_id", draftId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    return NextResponse.json({
      ownerTable: "drafts",
      ownerId: data.draft_id,
      code: data.draft_code,
      dimensions: data.dimensions ?? null,
      updatedAt: data.updated_at,
      // Back-compat aliases for callers that still read these:
      projectId: data.draft_id,
      projectCode: data.draft_code,
    });
  }

  if (projectCode) {
    const { data: draft } = await supabaseAdmin
      .from("drafts")
      .select("draft_id, draft_code, dimensions, updated_at")
      .eq("draft_code", projectCode)
      .maybeSingle();
    if (draft) {
      return NextResponse.json({
        ownerTable: "drafts",
        ownerId: draft.draft_id,
        code: draft.draft_code,
        dimensions: draft.dimensions ?? null,
        updatedAt: draft.updated_at,
        projectId: draft.draft_id,
        projectCode: draft.draft_code,
      });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, dimensions, updated_at")
    .match(projectCode ? { project_code: projectCode } : { project_id: projectId })
    .maybeSingle<{
      project_id: string;
      project_code: string | null;
      dimensions: unknown;
      updated_at: string | null;
    }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Project or draft not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ownerTable: "projects",
    ownerId: data.project_id,
    code: data.project_code,
    dimensions: data.dimensions ?? null,
    updatedAt: data.updated_at,
    projectId: data.project_id,
    projectCode: data.project_code,
  });
}
