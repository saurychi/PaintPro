import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Inserts a row into the `drafts` table holding the basic-details wizard
// state so the "Message Employee" / measure-generator flow has something
// real to attach to. The projects table stays clean. Once the admin
// clicks Save and Continue, createProject reads this draft, inserts the
// real projects row, migrates the conversations, and deletes the draft.

type DraftClientInput = {
  client_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type DraftBody = {
  // When set, the endpoint UPDATEs that draft instead of inserting. The
  // "Save Draft" button on basic-details passes this for repeated saves
  // of the same wizard session.
  draftId?: string | null;
  client?: DraftClientInput | null;
  project?: {
    title?: string | null;
    description?: string | null;
    site_address?: string | null;
    scheduled_start_datetime?: string | null;
    scheduled_end_datetime?: string | null;
    dimensions?: Record<string, unknown> | null;
    project_code?: string | null;
  } | null;
  createdBy?: { userId?: string | null } | null;
};

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: unknown): string | null {
  const trimmed = trim(value);
  return trimmed ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateCode(): string {
  const partA = Math.random().toString(36).slice(2, 6).toUpperCase();
  const partB = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PP-${partA}-${partB}`;
}

// Checks both projects.project_code and drafts.draft_code so codes don't
// collide across the two tables. Important once a draft is upgraded to a
// project: the same code must stay attached.
async function isCodeAvailable(code: string): Promise<boolean> {
  const { data: projectHit } = await supabaseAdmin
    .from("projects")
    .select("project_id")
    .eq("project_code", code)
    .maybeSingle();
  if (projectHit) return false;
  const { data: draftHit } = await supabaseAdmin
    .from("drafts")
    .select("draft_id")
    .eq("draft_code", code)
    .maybeSingle();
  return !draftHit;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DraftBody;

    const creatorId = trim(body?.createdBy?.userId);
    if (!creatorId) {
      return NextResponse.json(
        { error: "Missing createdBy.userId." },
        { status: 400 },
      );
    }

    const existingDraftId = trim(body?.draftId);

    const clientInput = body?.client ?? {};
    const clientId = trim(clientInput.client_id) || null;
    const clientFullName = nullable(clientInput.full_name);
    const clientEmail = trim(clientInput.email).toLowerCase() || null;
    const clientPhone = nullable(clientInput.phone);
    const clientAddress = nullable(clientInput.address);

    // Drafts intentionally do NOT require a clients row. The point of a
    // draft is that the admin hasn't committed the full project yet,
    // including the client. Storing the client fields directly on the
    // draft means we can revive the wizard state without making the
    // admin re-pick a client.

    const projectInput = body?.project ?? {};
    const dimensions = isPlainObject(projectInput.dimensions)
      ? projectInput.dimensions
      : { scaled: {}, notes: "" };

    // Update path. When the caller hands us an existing draftId, we
    // overwrite that row's fields rather than inserting a new draft.
    // draft_code is preserved so any conversations attached to this
    // draft (via conversations.draft_id) keep matching the code the
    // staff side already knows.
    if (existingDraftId) {
      const updatePayload: Record<string, unknown> = {
        project_name: nullable(projectInput.title),
        description: nullable(projectInput.description),
        site_address: nullable(projectInput.site_address),
        scheduled_start_datetime: nullable(
          projectInput.scheduled_start_datetime,
        ),
        scheduled_end_datetime: nullable(
          projectInput.scheduled_end_datetime,
        ),
        dimensions,
        client_id: clientId,
        client_full_name: clientFullName,
        client_email: clientEmail,
        client_phone: clientPhone,
        client_address: clientAddress,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedDraft, error: updateError } = await supabaseAdmin
        .from("drafts")
        .update(updatePayload)
        .eq("draft_id", existingDraftId)
        .eq("created_by", creatorId)
        .select("draft_id, draft_code, project_name")
        .maybeSingle<{
          draft_id: string;
          draft_code: string;
          project_name: string | null;
        }>();

      if (updateError || !updatedDraft?.draft_id) {
        return NextResponse.json(
          {
            error: "Failed to update draft.",
            details:
              updateError?.message ||
              "Draft not found or not owned by current user.",
          },
          { status: updateError ? 500 : 404 },
        );
      }

      return NextResponse.json({
        success: true,
        draft: {
          draft_id: updatedDraft.draft_id,
          draft_code: updatedDraft.draft_code,
          project_name: updatedDraft.project_name,
        },
        project: {
          project_id: updatedDraft.draft_id,
          project_code: updatedDraft.draft_code,
          title: updatedDraft.project_name,
        },
      });
    }

    const requestedCode = trim(projectInput.project_code);
    let draftCode = requestedCode || generateCode();

    for (let attempt = 0; attempt < 3; attempt++) {
      if (await isCodeAvailable(draftCode)) break;
      if (requestedCode) {
        return NextResponse.json(
          { error: `Code "${requestedCode}" already exists.` },
          { status: 409 },
        );
      }
      draftCode = generateCode();
    }

    const insertPayload = {
      draft_code: draftCode,
      project_name: nullable(projectInput.title),
      description: nullable(projectInput.description),
      site_address: nullable(projectInput.site_address),
      scheduled_start_datetime: nullable(projectInput.scheduled_start_datetime),
      scheduled_end_datetime: nullable(projectInput.scheduled_end_datetime),
      dimensions,
      client_id: clientId,
      client_full_name: clientFullName,
      client_email: clientEmail,
      client_phone: clientPhone,
      client_address: clientAddress,
      created_by: creatorId,
    };

    const { data: insertedDraft, error: insertError } = await supabaseAdmin
      .from("drafts")
      .insert(insertPayload)
      .select("draft_id, draft_code, project_name")
      .single<{
        draft_id: string;
        draft_code: string;
        project_name: string | null;
      }>();

    if (insertError || !insertedDraft?.draft_id) {
      return NextResponse.json(
        {
          error: "Failed to create draft.",
          details: insertError?.message || "Draft insert failed.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      draft: {
        draft_id: insertedDraft.draft_id,
        draft_code: insertedDraft.draft_code,
        project_name: insertedDraft.project_name,
      },
      project: {
        project_id: insertedDraft.draft_id,
        project_code: insertedDraft.draft_code,
        title: insertedDraft.project_name,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating draft.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
