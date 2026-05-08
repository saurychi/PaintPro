import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/notifyDownpaymentClient
//
// Drops a message in the project's conversation telling the client their
// downpayment is needed. Mirrors the notifyQuotationClient pattern:
//   - sender is the project owner (created_by), not whichever staff member
//     happened to click the button
//   - if a matching auth-user client exists (linked by email), add them as
//     a participant so they actually see the conversation in their messages
//   - project-cookie clients are reached via the existing project_id-based
//     fallback in /api/messages/conversations

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

function formatAud(amount: number) {
  return `$AUD ${amount.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildDownpaymentReminderMessage(opts: {
  projectCode: string | null;
  title: string | null;
  calculatedDownpayment: number;
  paidAmount: number;
  neededDownpayment: number;
  percentage: number;
}) {
  const label =
    typeof opts.projectCode === "string" && opts.projectCode.trim()
      ? `project ${opts.projectCode.trim()}`
      : typeof opts.title === "string" && opts.title.trim()
        ? `project ${opts.title.trim()}`
        : "your project";

  const calculated = opts.calculatedDownpayment;
  const paid = opts.paidAmount;
  const needed = opts.neededDownpayment;

  // No amount was supplied (older client or bad data) — fall back to a
  // generic reminder so we still get the message out.
  if (!Number.isFinite(calculated) || calculated <= 0) {
    return `${label} is ready for downpayment. Please review the amount and submit your payment so we can move forward with the work.`;
  }

  if (paid > 0 && needed > 0) {
    return `${label} is ready for downpayment. ${formatAud(paid)} has already been recorded against the required ${formatAud(calculated)}, leaving ${formatAud(needed)} still due. Please submit the remainder so we can move forward with the work.`;
  }

  return `${label} is ready for downpayment. The amount due is ${formatAud(calculated)}. Please submit your payment so we can move forward with the work.`;
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

  const calculatedDownpayment = Number(body?.calculatedDownpayment ?? 0);
  const paidAmount = Number(body?.paidAmount ?? 0);
  const neededDownpayment = Number(body?.neededDownpayment ?? 0);
  const percentage = Number(body?.percentage ?? 0);

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

  if (project.status !== "downpayment_pending") {
    return NextResponse.json(
      { error: "This project is not currently awaiting downpayment." },
      { status: 400 },
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

  // Ensure the project owner is a participant.
  const { data: ownerParticipant } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", projectOwnerId)
    .maybeSingle();

  if (!ownerParticipant) {
    const { error: ownerInsertError } = await supabaseAdmin
      .from("conversation_participants")
      .insert([{ conversation_id: conversationId, user_id: projectOwnerId }]);

    if (ownerInsertError) {
      return NextResponse.json(
        {
          error: "Failed to add conversation participant.",
          details: ownerInsertError.message,
        },
        { status: 500 },
      );
    }
  }

  // If the client has a matching auth user, add them too so they see the
  // conversation in their participant list. Project-cookie clients reach
  // the conversation through the project_id fallback regardless.
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
      content: buildDownpaymentReminderMessage({
        projectCode: project.project_code,
        title: project.title,
        calculatedDownpayment,
        paidAmount,
        neededDownpayment,
        percentage,
      }),
    },
  ]);

  if (messageError) {
    return NextResponse.json(
      {
        error: "Failed to send downpayment notification.",
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
