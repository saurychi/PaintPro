import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/notifyCancellationPayment
//
// Drops a settlement reminder in the project conversation. Mirrors
// notifyDownpaymentClient — the message includes the figures the admin
// is currently looking at (earned revenue, earned cost, net balance) so
// the client gets a clear "here's exactly what's owed" reminder rather
// than a vague "please pay" nudge.

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

function formatAud(amount: number) {
  return `$AUD ${amount.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildMessage(opts: {
  projectCode: string | null;
  title: string | null;
  balance: number;
  earnedRevenue: number;
  earnedCost: number;
}) {
  const label =
    typeof opts.projectCode === "string" && opts.projectCode.trim()
      ? `project ${opts.projectCode.trim()}`
      : typeof opts.title === "string" && opts.title.trim()
        ? `project ${opts.title.trim()}`
        : "your cancelled project";

  const balance = Number.isFinite(opts.balance) ? opts.balance : 0;
  const earnedRev = Number.isFinite(opts.earnedRevenue) ? opts.earnedRevenue : 0;

  if (balance > 0) {
    return `${label} has been cancelled. Based on the work completed up to the cancellation point (${formatAud(earnedRev)} earned), you're owed a refund of ${formatAud(balance)}. We'll process it as soon as possible.`;
  }
  if (balance < 0) {
    return `${label} has been cancelled. Based on the work completed (${formatAud(earnedRev)} earned), there is a remaining balance of ${formatAud(Math.abs(balance))} due. Please settle this so we can finalise the close-out.`;
  }
  return `${label} has been cancelled. The settlement is balanced — no further payment is required from either side. Thanks for the cooperation.`;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = String(body?.projectId ?? "").trim();
  const balance = Number(body?.balance ?? 0);
  const earnedRevenue = Number(body?.earnedRevenue ?? 0);
  const earnedCost = Number(body?.earnedCost ?? 0);

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
      content: buildMessage({
        projectCode: project.project_code,
        title: project.title,
        balance,
        earnedRevenue,
        earnedCost,
      }),
    },
  ]);

  if (messageError) {
    return NextResponse.json(
      {
        error: "Failed to send settlement notification.",
        details: messageError.message,
      },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, conversationId });
}
