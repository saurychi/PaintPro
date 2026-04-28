import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// GET /api/messages/staff-conversations
// Returns all direct conversations for the current admin user with full message history.
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Find every conversation this admin belongs to
  const { data: myParticipations, error: partErr } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

  const convIds = (myParticipations ?? []).map((p: any) => p.conversation_id as string);
  if (convIds.length === 0) return NextResponse.json({ conversations: [] });

  // Get the other participant (employee) for each conversation with their user info
  const { data: otherParticipants, error: otherErr } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id, user_id, users(id, username, email, role, profile_image_url)")
    .in("conversation_id", convIds)
    .neq("user_id", userId);

  if (otherErr) return NextResponse.json({ error: otherErr.message }, { status: 500 });

  // Load all messages for these conversations in chronological order
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("messages")
    .select("id, conversation_id, sender_id, content, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Build one object per conversation
  const participantByConv = new Map<string, any>();
  for (const p of otherParticipants ?? []) {
    if (!participantByConv.has(p.conversation_id)) participantByConv.set(p.conversation_id, p);
  }

  const conversations = convIds
    .map((convId) => {
      const participant = participantByConv.get(convId);
      const employee = (participant as any)?.users ?? null;
      const convMessages = (messages ?? []).filter((m: any) => m.conversation_id === convId);

      return {
        id: convId,
        employeeId: participant?.user_id ?? "",
        employeeName: employee?.username ?? employee?.email ?? "Unknown",
        employeeEmail: employee?.email ?? "",
        employeeRole: employee?.role ?? "",
        employeeAvatarUrl: employee?.profile_image_url ?? null,
        lastMessage: convMessages.length > 0 ? convMessages[convMessages.length - 1].content : "",
        messages: convMessages.map((m: any) => ({
          id: m.id,
          senderId: m.sender_id ?? "",
          senderType: m.sender_id === userId ? "admin" : "employee",
          text: m.content ?? "",
          createdAt: m.created_at ?? "",
        })),
      };
    })
    // Only include conversations where we found an employee participant
    .filter((c) => Boolean(c.employeeId));

  return NextResponse.json({ conversations });
}
