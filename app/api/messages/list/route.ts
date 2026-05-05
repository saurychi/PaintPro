import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CLIENT_COOKIE = "paintpro_client_project_id";

// GET /api/messages/list?conversationId=xxx
//
// Returns the message history for a conversation. Two access modes:
//   1. Auth user (admin / staff / client) — caller must be a participant in
//      conversation_participants.
//   2. Project-cookie client — caller has paintpro_client_project_id, and the
//      conversation's project_id must match.
//
// Both modes use supabaseAdmin to fetch (so RLS isn't in the way for the
// cookie-mode client, which has no Supabase auth user).

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() ?? "";

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversationId." },
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

    if (userId) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json(
          { error: membershipError.message },
          { status: 500 },
        );
      }

      if (!membership) {
        return NextResponse.json(
          { error: "Not a participant of this conversation." },
          { status: 403 },
        );
      }
    } else {
      const clientProjectId = await getClientProjectId();
      if (!clientProjectId) {
        return NextResponse.json(
          { error: "Unauthorized." },
          { status: 401 },
        );
      }
      if (conversation.project_id !== clientProjectId) {
        return NextResponse.json(
          { error: "Conversation does not belong to your project." },
          { status: 403 },
        );
      }
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(messages ?? []);
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
