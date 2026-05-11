import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/notifyCancellationAgreement
// Drops a "please sign the cancellation agreement" message in the
// project conversation. Mirrors the quotation/downpayment notify
// endpoints — falls back gracefully when the client isn't a real
// auth user (project-cookie clients still see project conversations
// via the project_id fallback).

async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = String(body?.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("project_id, project_code, title, status, client_id, created_by")
    .eq("project_id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json(
      {
        error: "Failed to load project.",
        details: projectError?.message ?? "Project not found.",
      },
      { status: 500 },
    );
  }

  if (project.status !== "cancelled") {
    return NextResponse.json(
      { error: "Project is not cancelled." },
      { status: 400 },
    );
  }

  // Mirror the invoice flow: generate the agreement PDF and upload it to
  // storage BEFORE sending the notification so the client portal can stream
  // the file straight from the bucket. This populates project_documents
  // with storage_bucket / storage_path / file_name so /client/documents/pending
  // can preview the unsigned agreement.
  const origin = new URL(request.url).origin;
  const generateResponse = await fetch(
    `${origin}/api/cancellation-agreement/save-generated`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    },
  );
  if (!generateResponse.ok) {
    const generateError = await generateResponse.json().catch(() => null);
    return NextResponse.json(
      {
        error: "Failed to generate cancellation agreement PDF.",
        details:
          [generateError?.error, generateError?.details]
            .filter(Boolean)
            .join(": ") ||
          `save-generated returned ${generateResponse.status}`,
      },
      { status: 500 },
    );
  }

  const label =
    typeof project.project_code === "string" && project.project_code.trim()
      ? `project ${project.project_code.trim()}`
      : typeof project.title === "string" && project.title.trim()
        ? `project ${project.title.trim()}`
        : "your project";

  const messageContent = `${label} has been cancelled. Please review and sign the cancellation agreement to finalise the close-out. You can sign at /client/documents/pending?projectId=${projectId}`;

  // Resolve / create the project conversation.
  let conversationId: string | null = null;

  const { data: existingConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingConvos && existingConvos.length > 0) {
    conversationId = existingConvos[0].id as string;
  } else {
    const { data: newConversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .insert([{ project_id: projectId, updated_at: new Date().toISOString() }])
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

  const projectOwnerId = project.created_by ?? userId;

  const { data: ownerParticipant } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", projectOwnerId)
    .maybeSingle();

  if (!ownerParticipant) {
    await supabaseAdmin
      .from("conversation_participants")
      .insert([{ conversation_id: conversationId, user_id: projectOwnerId }]);
  }

  if (project.client_id) {
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("email")
      .eq("client_id", project.client_id)
      .maybeSingle();
    const clientEmail = clientRow?.email?.trim();
    if (clientEmail) {
      const { data: clientAuthUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", clientEmail)
        .maybeSingle();
      const clientUserId = clientAuthUser?.id;
      if (clientUserId && clientUserId !== projectOwnerId) {
        const { data: clientParticipant } = await supabaseAdmin
          .from("conversation_participants")
          .select("conversation_id")
          .eq("conversation_id", conversationId)
          .eq("user_id", clientUserId)
          .maybeSingle();
        if (!clientParticipant) {
          await supabaseAdmin
            .from("conversation_participants")
            .insert([{ conversation_id: conversationId, user_id: clientUserId }]);
        }
      }
    }
  }

  const { error: messageError } = await supabaseAdmin.from("messages").insert([
    {
      conversation_id: conversationId,
      sender_id: projectOwnerId,
      content: messageContent,
    },
  ]);

  if (messageError) {
    return NextResponse.json(
      {
        error: "Failed to send agreement notification.",
        details: messageError.message,
      },
      { status: 500 },
    );
  }

  // Track that we've sent the agreement so the admin's modal can show
  // the "Sent — awaiting signature" pill even before the client signs.
  // Inserts a placeholder project_documents row (status="sent") if no
  // row exists yet; otherwise leaves the existing row alone.
  const { data: existingDoc } = await supabaseAdmin
    .from("project_documents")
    .select("document_id, document_status")
    .eq("project_id", projectId)
    .eq("document_type", "cancellation_agreement")
    .neq("document_status", "void")
    .maybeSingle();

  if (!existingDoc) {
    await supabaseAdmin.from("project_documents").insert({
      project_id: projectId,
      client_id: project.client_id,
      document_type: "cancellation_agreement",
      document_status: "sent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else if (
    existingDoc.document_status === "draft" ||
    existingDoc.document_status === "generated"
  ) {
    // After save-generated above, the row is in `generated` state. Once
    // we've actually posted the message and notified the client, flip it
    // to `sent` so the admin badge reflects "awaiting signature" rather
    // than "still drafting". Don't touch already-signed/void rows.
    await supabaseAdmin
      .from("project_documents")
      .update({
        document_status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("document_id", existingDoc.document_id);
  }

  await supabaseAdmin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, conversationId });
}
