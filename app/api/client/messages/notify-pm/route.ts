import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/client/messages/notify-pm
//
// Called from the client portal right after the client signs the quotation.
// Posts a system-style notification message in the project's conversation so
// the admin / project manager (`projects.created_by`) sees the agreement in
// their messages list. Does NOT change the project status — the admin still
// has to acknowledge from their side before the project advances.
//
// We don't require a Supabase auth user here because the client portal
// supports a project-cookie access mode (no auth user). The (projectId,
// projectCode) pair acts as a soft credential — same shape used by the
// signature endpoint.

export const runtime = "nodejs";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  status: string | null;
  created_by: string | null;
  client_id: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const projectCode =
      typeof body?.projectCode === "string" ? body.projectCode.trim() : "";
    // Optional — lets the caller specify whether the notification is
    // for a quotation or an invoice. The message text differs (the
    // next admin step is different in each case). Defaults to
    // "quotation" so existing callers keep their original behavior.
    const documentType =
      body?.documentType === "invoice" ? "invoice" : "quotation";

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, status, created_by, client_id")
      .eq("project_id", projectId)
      .maybeSingle<ProjectRow>();

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to load project.",
          details: projectError.message,
        },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (projectCode && project.project_code && project.project_code !== projectCode) {
      return NextResponse.json(
        { error: "Project code mismatch." },
        { status: 400 },
      );
    }

    if (!project.created_by) {
      return NextResponse.json(
        { error: "Project has no project manager assigned." },
        { status: 409 },
      );
    }

    // Find or create the project conversation.
    let conversationId: string | null = null;

    const { data: existingConvos, error: convoLookupError } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (convoLookupError) {
      return NextResponse.json(
        {
          error: "Failed to load project conversation.",
          details: convoLookupError.message,
        },
        { status: 500 },
      );
    }

    if (existingConvos && existingConvos.length > 0) {
      conversationId = existingConvos[0].id as string;
    } else {
      const { data: newConversation, error: convError } = await supabaseAdmin
        .from("conversations")
        .insert([
          { project_id: projectId, updated_at: new Date().toISOString() },
        ])
        .select("id")
        .single();

      if (convError || !newConversation) {
        return NextResponse.json(
          {
            error: "Failed to create project conversation.",
            details: convError?.message ?? "Unknown error.",
          },
          { status: 500 },
        );
      }

      conversationId = newConversation.id as string;
    }

    // Make sure the project manager is a participant — without that they
    // won't see this conversation in their messages list.
    const { data: existingParticipant, error: participantLookupError } =
      await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", project.created_by)
        .maybeSingle();

    if (participantLookupError) {
      return NextResponse.json(
        {
          error: "Failed to verify conversation participant.",
          details: participantLookupError.message,
        },
        { status: 500 },
      );
    }

    if (!existingParticipant) {
      const { error: participantInsertError } = await supabaseAdmin
        .from("conversation_participants")
        .insert([{ conversation_id: conversationId, user_id: project.created_by }]);

      if (participantInsertError) {
        return NextResponse.json(
          {
            error: "Failed to add conversation participant.",
            details: participantInsertError.message,
          },
          { status: 500 },
        );
      }
    }

    const projectLabel =
      project.project_code?.trim() ||
      project.title?.trim() ||
      `the ${documentType}`;
    const nextStepText =
      documentType === "invoice"
        ? "Please review and advance the project to the payment step when ready."
        : "Please review and advance the project to the downpayment step when ready.";
    const messageBody = [
      `[System notification]`,
      `The client has signed and approved ${projectLabel}'s ${documentType}.`,
      nextStepText,
    ].join(" ");

    // Attribute the message to the client (via client_id, with sender_id
    // null) instead of to the manager. The manager is already a
    // conversation participant — they'll still see this thread in their
    // messages list — but in their chat panel the message renders on the
    // LEFT side with the client's avatar (because sender_id != currentUser),
    // and it counts toward the manager's unread badge. Attributing to the
    // manager would have made it look like a self-authored message and
    // wouldn't bump the unread count.
    const { error: messageError } = await supabaseAdmin.from("messages").insert([
      {
        conversation_id: conversationId,
        sender_id: null,
        client_id: project.client_id,
        content: messageBody,
      },
    ]);

    if (messageError) {
      return NextResponse.json(
        {
          error: "Failed to send notification.",
          details: messageError.message,
        },
        { status: 500 },
      );
    }

    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      success: true,
      conversationId,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while sending notification.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
