import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ScheduleItem = {
  projectSubTaskId?: string;
  estimatedHours?: number | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const schedules = Array.isArray(body?.schedules) ? body.schedules : [];

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    if (schedules.length === 0) {
      return NextResponse.json(
        { error: "No schedules provided." },
        { status: 400 },
      );
    }

    for (const item of schedules as ScheduleItem[]) {
      if (!item?.projectSubTaskId) continue;

      const { error } = await supabaseAdmin
        .from("project_sub_task")
        .update({
          estimated_hours:
            typeof item.estimatedHours === "number" ? item.estimatedHours : null,
          scheduled_start_datetime: item.scheduledStartDatetime ?? null,
          scheduled_end_datetime: item.scheduledEndDatetime ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("project_sub_task_id", item.projectSubTaskId);

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to save project schedule.",
            details: error.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
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
