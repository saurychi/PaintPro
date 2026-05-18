import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/messages/conversation-project?conversationId=<uuid>
// Resolves a conversation to either its project or its draft so the
// staff measure-generator knows where to save measurements. Returns
// `project: null` for direct DM threads with neither attached.
export async function GET(request: NextRequest) {
  const conversationId = new URL(request.url)
    .searchParams.get("conversationId")
    ?.trim();

  if (!conversationId) {
    return NextResponse.json(
      { error: "Missing conversationId." },
      { status: 400 },
    );
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .select("id, project_id, draft_id")
    .eq("id", conversationId)
    .maybeSingle<{
      id: string;
      project_id: string | null;
      draft_id: string | null;
    }>();

  if (conversationError) {
    return NextResponse.json(
      { error: conversationError.message },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  if (conversation.project_id) {
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title")
      .eq("project_id", conversation.project_id)
      .maybeSingle<{
        project_id: string;
        project_code: string | null;
        title: string | null;
      }>();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      project: project
        ? {
            project_id: project.project_id,
            project_code: project.project_code,
            title: project.title,
            is_draft: false,
          }
        : null,
    });
  }

  if (conversation.draft_id) {
    const { data: draft, error: draftError } = await supabaseAdmin
      .from("drafts")
      .select("draft_id, draft_code, project_name")
      .eq("draft_id", conversation.draft_id)
      .maybeSingle<{
        draft_id: string;
        draft_code: string | null;
        project_name: string | null;
      }>();

    if (draftError) {
      return NextResponse.json(
        { error: draftError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      project: draft
        ? {
            project_id: draft.draft_id,
            project_code: draft.draft_code,
            title: draft.project_name,
            is_draft: true,
          }
        : null,
    });
  }

  return NextResponse.json({ project: null });
}
