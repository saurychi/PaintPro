import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectSubTaskId = String(body?.projectSubTaskId ?? "").trim();
    const status = String(body?.status ?? "").trim();

    if (!projectSubTaskId || !status) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId or status." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("project_sub_task")
      .update({ status })
      .eq("project_sub_task_id", projectSubTaskId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update subtask status.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected error.", details: error?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
