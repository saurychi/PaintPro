import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/notifyProjectCancelled
//
// Sends a cancellation notice to the project's client by reusing the
// project's existing conversation (or creating one). Mirrors the
// notifyQuotationClient pattern so the conversation history shows the
// cancellation message from the project owner, not whoever clicked the
// button.

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

function aud(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildCancellationMessage(args: {
  projectCode: string | null;
  title: string | null;
  balance: number;
}) {
  const label =
    args.projectCode?.trim()
      ? `project ${args.projectCode.trim()}`
      : args.title?.trim()
        ? `project "${args.title.trim()}"`
        : "your project";

  let settlement: string;
  if (Math.abs(args.balance) < 0.005) {
    settlement = " The downpayment exactly covers the work completed, so no further payment is required.";
  } else if (args.balance > 0) {
    settlement = ` A refund of ${aud(args.balance)} is due back to you for work that was not performed.`;
  } else {
    settlement = ` An additional ${aud(Math.abs(args.balance))} is owed for work already completed beyond the downpayment.`;
  }

  // Internal admin notes (now stored on projects.notes) deliberately
  // don't bleed into the client-facing message — the admin can write
  // them candidly without worrying about tone for the client.
  return `Your ${label} has been cancelled.${settlement} We will be in touch shortly to finalize the settlement.`;
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
    .select(
      "project_id, project_code, title, status, client_id, created_by, cancellation_balance",
    )
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
      { error: "Project is not in a cancelled state." },
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
      .insert([
        { project_id: projectId, updated_at: new Date().toISOString() },
      ])
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

  const projectOwnerId =
    (project as { created_by?: string | null }).created_by ?? userId;

  const { data: existingParticipant } = await supabaseAdmin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", projectOwnerId)
    .maybeSingle();

  if (!existingParticipant) {
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
            .insert([
              { conversation_id: conversationId, user_id: clientUserId },
            ]);
        }
      }
    }
  }

  const { error: messageError } = await supabaseAdmin.from("messages").insert([
    {
      conversation_id: conversationId,
      sender_id: projectOwnerId,
      content: buildCancellationMessage({
        projectCode: project.project_code,
        title: project.title,
        balance: Number(project.cancellation_balance ?? 0),
      }),
    },
  ]);

  if (messageError) {
    return NextResponse.json(
      {
        error: "Failed to send cancellation notification.",
        details: messageError.message,
      },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ success: true, conversationId });
}
