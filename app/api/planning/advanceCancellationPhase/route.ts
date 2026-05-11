import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  CANCELLATION_PHASES,
  type CancellationPhase,
} from "@/lib/planning/cancellationPhase";

// POST /api/planning/advanceCancellationPhase
//
// Bumps a cancelled project's `cancellation_phase` from one substep to
// the next. Used by the Project Cancellation group's child action
// buttons (Review, Payment, Document, Employee, Conclude). Each click
// expects the caller to specify both the phase it's currently on and
// the phase it wants to move to — the API only accepts the move when
// `from` matches the DB and `to` is the immediate successor, so a
// stale client can't accidentally skip steps.

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

function isValidPhase(value: unknown): value is CancellationPhase {
  return (
    typeof value === "string" &&
    (CANCELLATION_PHASES as readonly string[]).includes(value)
  );
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
    if (callerStatus !== "active" || (role !== "admin" && role !== "manager")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const fromPhase = body?.fromPhase;
    const toPhase = body?.toPhase;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }
    if (!isValidPhase(fromPhase) || !isValidPhase(toPhase)) {
      return NextResponse.json(
        { error: "Invalid phase value." },
        { status: 400 },
      );
    }

    const fromIdx = CANCELLATION_PHASES.indexOf(fromPhase);
    const toIdx = CANCELLATION_PHASES.indexOf(toPhase);
    if (toIdx !== fromIdx + 1) {
      return NextResponse.json(
        {
          error:
            "Phase advance must move forward by exactly one step.",
          hint: `Current ${fromPhase} can only advance to ${
            CANCELLATION_PHASES[fromIdx + 1] ?? "<terminal>"
          }.`,
        },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, status, cancellation_phase")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }
    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    if (String(project.status ?? "").toLowerCase() !== "cancelled") {
      return NextResponse.json(
        {
          error:
            "Project is not cancelled — cancellation phase only applies to cancelled projects.",
        },
        { status: 400 },
      );
    }

    const currentPhase = String(project.cancellation_phase ?? "review");
    if (currentPhase !== fromPhase) {
      return NextResponse.json(
        {
          error:
            "Cancellation phase has already moved on. Refresh the dashboard to see the latest state.",
          currentPhase,
        },
        { status: 409 },
      );
    }

    const updates: Record<string, unknown> = {
      cancellation_phase: toPhase,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update(updates)
      .eq("project_id", projectId);

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to advance cancellation phase.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, phase: toPhase });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error advancing cancellation phase.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
