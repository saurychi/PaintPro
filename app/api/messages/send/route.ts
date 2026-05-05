import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CLIENT_COOKIE = "paintpro_client_project_id";

// POST /api/messages/send
//
// Inserts a row into the `messages` table on behalf of the caller. Same dual
// auth model as /api/messages/list — auth user (RLS enforces participation)
// OR a guest client identified by the project cookie. Using a server route
// instead of a direct supabase.from('messages').insert() means the cookie-mode
// client (no Supabase auth user) can still send, since RLS would otherwise
// block them from inserting.

async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getClientProjectId() {
  const cookieStore = await cookies();
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      conversationId?: unknown;
      content?: unknown;
    } | null;

    const conversationId =
      typeof body?.conversationId === "string"
        ? body.conversationId.trim()
        : "";
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversationId." },
        { status: 400 },
      );
    }
    if (!content) {
      return NextResponse.json(
        { error: "Message content is required." },
        { status: 400 },
      );
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .select("id, project_id")
      .eq("id", conversationId)
      .maybeSingle<{ id: string; project_id: string | null }>();

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

    const userId = await getAuthUserId();

    let senderId: string | null = null;
    let clientId: string | null = null;

    if (userId) {
      const { data: membership } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json(
          { error: "Not a participant of this conversation." },
          { status: 403 },
        );
      }
      senderId = userId;
    } else {
      const clientProjectId = await getClientProjectId();
      if (!clientProjectId) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      if (conversation.project_id !== clientProjectId) {
        return NextResponse.json(
          { error: "Conversation does not belong to your project." },
          { status: 403 },
        );
      }
      // Resolve the project's client_id so the message row can record who the
      // guest sender is, since they don't have a sender_id (no Supabase auth
      // user).
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("client_id")
        .eq("project_id", clientProjectId)
        .maybeSingle<{ client_id: string | null }>();
      clientId = project?.client_id ?? null;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("messages")
      .insert([
        {
          conversation_id: conversationId,
          sender_id: senderId,
          client_id: clientId,
          content,
        },
      ])
      .select("*")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        {
          error: "Failed to send message.",
          details: insertError?.message ?? "Unknown error.",
        },
        { status: 500 },
      );
    }

    // Bump the conversation so it sorts to the top of recipients' lists.
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json(inserted);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
