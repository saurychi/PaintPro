import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/messages/unread-count[?since=ISO]
//
// Returns the total number of unread messages for the requesting user.
//
// Auth user: counts messages across every conversation they participate in
// where created_at > last_read_at AND sender_id != self.
//
// Project-cookie client: needs a `since` ISO timestamp (the client maintains
// it in localStorage). Counts messages across the project's conversations
// where created_at > since AND sender_id is not null (i.e., not from a
// cookie client themselves). Without `since` this returns 0 to avoid
// double-counting old history.

export const runtime = "nodejs";

const CLIENT_COOKIE = "paintpro_client_project_id";

async function getAuthUserId(): Promise<string | null> {
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

async function getClientProjectId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();

    // Cookie-client path: identify by project_id, anchor read state on a
    // client-supplied `since` ISO timestamp.
    if (!userId) {
      const projectId = await getClientProjectId();
      if (!projectId) {
        return NextResponse.json({ total: 0, byConversation: {} });
      }

      const since = new URL(request.url).searchParams.get("since")?.trim();
      if (!since) {
        return NextResponse.json({ total: 0, byConversation: {} });
      }

      const { data: convoIds } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("project_id", projectId);

      const ids = (convoIds ?? []).map((c) => c.id as string);
      if (ids.length === 0) {
        return NextResponse.json({ total: 0, byConversation: {} });
      }

      const { count } = await supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .not("sender_id", "is", null)
        .gt("created_at", since);

      return NextResponse.json({
        total: count ?? 0,
        byConversation: {},
      });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);

    if (participantsError) {
      return NextResponse.json(
        { error: participantsError.message },
        { status: 500 },
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ total: 0, byConversation: {} });
    }

    // Count unread per conversation in parallel. For typical inboxes (<100
    // conversations) this is fine; if it ever needs to scale further, swap
    // for a single RPC that aggregates server-side.
    const counts = await Promise.all(
      participants.map(async (p) => {
        const sinceIso = p.last_read_at ?? "1970-01-01T00:00:00Z";
        // Count messages from anyone other than self. We use OR to include
        // sender_id IS NULL rows (client-attributed messages, e.g. system
        // notifications inserted with sender_id=null + client_id set) since
        // a plain `.neq("sender_id", userId)` evaluates `NULL != userId` to
        // NULL/unknown and silently drops those rows from the count.
        const { count, error } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .or(`sender_id.is.null,sender_id.neq.${userId}`)
          .gt("created_at", sinceIso);

        if (error) {
          console.error(
            `[unread-count] failed for conversation ${p.conversation_id}:`,
            error.message,
          );
          return { conversation_id: p.conversation_id, count: 0 };
        }

        return { conversation_id: p.conversation_id, count: count ?? 0 };
      }),
    );

    const byConversation: Record<string, number> = {};
    let total = 0;
    for (const row of counts) {
      byConversation[row.conversation_id] = row.count;
      total += row.count;
    }

    return NextResponse.json({ total, byConversation });
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
