import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
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

function buildQuotationReminderMessage(projectCode: string | null, title: string | null) {
  const label =
    typeof projectCode === "string" && projectCode.trim()
      ? `quotation ${projectCode.trim()}`
      : typeof title === "string" && title.trim()
        ? `quotation for ${title.trim()}`
        : "quotation";

  return `Your ${label} is ready for review. Please check the pending quotation in your documents and let us know if you have any questions.`;
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
    .select("project_id, project_code, title, status")
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

  if (project.status !== "quotation_pending") {
    return NextResponse.json(
      { error: "This quotation is no longer pending client review." },
      { status: 400 },
    );
  }

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
    conversationId = existingConvos[0].id;
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

    conversationId = newConversation.id;
  }

  const { data: existingParticipant, error: participantLookupError } =
    await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
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
      .insert([{ conversation_id: conversationId, user_id: userId }]);

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

  const { error: messageError } = await supabaseAdmin.from("messages").insert([
    {
      conversation_id: conversationId,
      sender_id: userId,
      content: buildQuotationReminderMessage(project.project_code, project.title),
    },
  ]);

  if (messageError) {
    return NextResponse.json(
      {
        error: "Failed to send quotation notification.",
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
}
