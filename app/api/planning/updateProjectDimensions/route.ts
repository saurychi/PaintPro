import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// Writes the provided `dimensions` jsonb onto either a draft or a real
// project. Body accepts:
//   - { draftId, dimensions } when the wizard is still in draft form
//   - { projectId, dimensions } when the project row already exists
// Returns { success: true, ownerTable } so the caller can tell which
// table actually got the write.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const draftId = typeof body?.draftId === "string" ? body.draftId.trim() : "";
    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const dimensions = body?.dimensions;

    if (!draftId && !projectId) {
      return NextResponse.json(
        { error: "Missing draftId or projectId." },
        { status: 400 },
      );
    }

    if (!isPlainObject(dimensions)) {
      return NextResponse.json(
        { error: "dimensions must be a JSON object." },
        { status: 400 },
      );
    }

    if (draftId) {
      const { error } = await supabaseAdmin
        .from("drafts")
        .update({
          dimensions,
          updated_at: new Date().toISOString(),
        })
        .eq("draft_id", draftId);

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to update draft dimensions.",
            details: error.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, ownerTable: "drafts" });
    }

    const { error } = await supabaseAdmin
      .from("projects")
      .update({
        dimensions,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update project dimensions.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, ownerTable: "projects" });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while updating dimensions.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
