import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const targetUserId = String(body?.targetUserId ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Missing targetUserId." },
        { status: 400 },
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Cannot start a conversation with yourself." },
        { status: 400 },
      );
    }

    // Find existing shared conversation
    const { data: myConvos } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    const myConvoIds = (myConvos ?? []).map((c: any) => c.conversation_id);

    if (myConvoIds.length > 0) {
      const { data: sharedConvos } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", targetUserId)
        .in("conversation_id", myConvoIds);

      if (sharedConvos && sharedConvos.length > 0) {
        return NextResponse.json({
          conversationId: sharedConvos[0].conversation_id,
        });
      }
    }

    // Create new conversation using admin client to bypass RLS
    const { data: convData, error: convError } = await supabaseAdmin
      .from("conversations")
      .insert([{ updated_at: new Date().toISOString() }])
      .select()
      .single();

    if (convError) {
      return NextResponse.json(
        { error: "Failed to create conversation.", details: convError.message },
        { status: 500 },
      );
    }

    const { error: partError } = await supabaseAdmin
      .from("conversation_participants")
      .insert([
        { conversation_id: convData.id, user_id: user.id },
        { conversation_id: convData.id, user_id: targetUserId },
      ]);

    if (partError) {
      return NextResponse.json(
        {
          error: "Failed to add conversation participants.",
          details: partError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ conversationId: convData.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected error.", details: error?.message },
      { status: 500 },
    );
  }
}

// DELETE /api/messages/conversation?conversationId=xxx
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const conversationId = new URL(request.url).searchParams.get("conversationId") ?? "";
    if (!conversationId) return NextResponse.json({ error: "Missing conversationId." }, { status: 400 });

    // Verify caller is a participant
    const { data: membership } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

    // Delete all messages, then participants, then the conversation
    const { error: msgErr } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const { error: partErr } = await supabaseAdmin
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId);
    if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

    const { error: convErr } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("id", conversationId);
    if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: "Unexpected error.", details: error?.message }, { status: 500 });
  }
}
