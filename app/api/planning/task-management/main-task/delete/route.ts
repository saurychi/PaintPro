import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mainTaskId =
      typeof body?.mainTaskId === "string" ? body.mainTaskId.trim() : "";

    if (!mainTaskId) {
      return NextResponse.json(
        { error: "Missing mainTaskId." },
        { status: 400 },
      );
    }

    const { count, error: countError } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id", { count: "exact", head: true })
      .eq("main_task_id", mainTaskId);

    if (countError) {
      return NextResponse.json(
        {
          error: "Failed to check related subtasks.",
          details: countError.message,
        },
        { status: 500 },
      );
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Delete or move this main task's subtasks first." },
        { status: 400 },
      );
    }

    const { error: clearReplacementError } = await supabaseAdmin
      .from("main_task")
      .update({ replaced_by_main_task_id: null })
      .eq("replaced_by_main_task_id", mainTaskId);

    if (clearReplacementError) {
      return NextResponse.json(
        {
          error: "Failed to clear replacement links.",
          details: clearReplacementError.message,
        },
        { status: 500 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("main_task")
      .delete()
      .eq("main_task_id", mainTaskId);

    if (deleteError) {
      return NextResponse.json(
        {
          error:
            "Could not delete this main task. It may still be used elsewhere.",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while deleting main task.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
