import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId = (body?.projectId as string | undefined)?.trim();
    const downpayment = body?.downpayment;
    // When finalize is true the project moves on to ready_to_start. When
    // false (or omitted) we just record the running tally so the admin can
    // collect the downpayment in instalments without flipping the project
    // status until the calculated amount is fully paid.
    const finalize = body?.finalize === true;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (typeof downpayment !== "number" || downpayment < 0) {
      return NextResponse.json({ error: "Invalid downpayment amount." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      downpayment,
      updated_at: new Date().toISOString(),
    };

    if (finalize) updates.status = "ready_to_start";

    const { error } = await supabaseAdmin
      .from("projects")
      .update(updates)
      .eq("project_id", projectId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to save downpayment.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, finalized: finalize });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected error.", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
