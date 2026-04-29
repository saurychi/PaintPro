import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subTaskId =
      typeof body?.subTaskId === "string" ? body.subTaskId.trim() : "";

    if (!subTaskId) {
      return NextResponse.json(
        { error: "Missing subTaskId." },
        { status: 400 },
      );
    }

    const { error: clearReplacementError } = await supabaseAdmin
      .from("sub_task")
      .update({ replaced_by_sub_task_id: null })
      .eq("replaced_by_sub_task_id", subTaskId);

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
      .from("sub_task")
      .delete()
      .eq("sub_task_id", subTaskId);

    if (deleteError) {
      return NextResponse.json(
        {
          error: "Could not delete this subtask. It may still be used elsewhere.",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while deleting subtask.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
