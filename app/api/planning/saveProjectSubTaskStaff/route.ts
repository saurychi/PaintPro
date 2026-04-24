import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const projectSubTaskId =
      typeof body?.projectSubTaskId === "string" ? body.projectSubTaskId : "";

    const employeeIds: string[] = Array.isArray(body?.employeeIds)
      ? body.employeeIds.filter((value: unknown): value is string => typeof value === "string")
      : [];

    if (!projectSubTaskId) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId." },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .delete()
      .eq("project_sub_task_id", projectSubTaskId);

    if (deleteError) {
      return NextResponse.json(
        {
          error: "Failed to clear existing employee assignments.",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    if (employeeIds.length > 0) {
      const rows = employeeIds.map((userId: string) => ({
        project_sub_task_id: projectSubTaskId,
        user_id: userId,
        role: "staff",
        assignment_status: "assigned",
      }));

      const { error: insertError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .insert(rows);

      if (insertError) {
        return NextResponse.json(
          {
            error: "Failed to save employee assignments.",
            details: insertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
