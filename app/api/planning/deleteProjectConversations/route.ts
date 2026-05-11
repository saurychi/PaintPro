import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/deleteProjectConversations
//
// Hard-deletes every conversation tied to the given project (and all
// the messages and participants under it). Called when a project is
// concluded, whether via the normal flow (status -> completed) or
// the cancellation wrap-up (cancellation_phase -> done). Both paths
// signal that the back-and-forth between client and the project's
// recipient is no longer needed, so we clear it out instead of
// leaving stale threads in everyone's message lists.
//
// Auth-gated to admin/manager since this is destructive and not
// available from client/staff UIs.

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
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (
      callerStatus !== "active" ||
      (role !== "admin" && role !== "manager")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }

    // Pull every conversation tied to this project. Includes both
    // admin-to-client and admin-to-staff threads if either exists
    // (anything with project_id pointing at this project).
    const { data: conversations, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("project_id", projectId);

    if (convError) {
      return NextResponse.json(
        {
          error: "Failed to load conversations.",
          details: convError.message,
        },
        { status: 500 },
      );
    }

    const conversationIds = (conversations ?? []).map((c) => c.id as string);
    if (conversationIds.length === 0) {
      // Nothing to delete. Return a clean ok so callers can run
      // this idempotently without special-casing.
      return NextResponse.json({ ok: true, deletedConversations: 0 });
    }

    // Cascade order: messages first (FK -> conversations.id), then
    // conversation_participants (FK -> conversations.id), then the
    // conversations themselves. Continue past per-table errors so a
    // partial failure surfaces details rather than leaving the
    // caller guessing which step failed.
    const errors: string[] = [];

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("conversation_id", conversationIds);
    if (messagesError) {
      errors.push(`messages: ${messagesError.message}`);
    }

    const { error: participantsError } = await supabaseAdmin
      .from("conversation_participants")
      .delete()
      .in("conversation_id", conversationIds);
    if (participantsError) {
      errors.push(`conversation_participants: ${participantsError.message}`);
    }

    const { error: conversationsError } = await supabaseAdmin
      .from("conversations")
      .delete()
      .in("id", conversationIds);
    if (conversationsError) {
      errors.push(`conversations: ${conversationsError.message}`);
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "Some rows could not be deleted.",
          details: errors.join("; "),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      deletedConversations: conversationIds.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error deleting project conversations.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
