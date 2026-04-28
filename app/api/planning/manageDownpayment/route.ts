import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId = (body?.projectId as string | undefined)?.trim();
    const downpayment = body?.downpayment;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (typeof downpayment !== "number" || downpayment < 0) {
      return NextResponse.json({ error: "Invalid downpayment amount." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("projects")
      .update({
        downpayment,
        status: "ready_to_start",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to save downpayment.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected error.", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
