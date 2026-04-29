import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ScheduleItem = {
  projectSubTaskId?: string;
  estimatedHours?: number | null;
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
};

type SaveProjectScheduleBody = {
  projectId?: string;
  nextStatus?: string;
  schedules?: ScheduleItem[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveProjectScheduleBody;
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const schedules = Array.isArray(body?.schedules) ? body.schedules : [];
    const nextStatus =
      typeof body?.nextStatus === "string" && body.nextStatus.trim()
        ? body.nextStatus.trim()
        : null;

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

    const timestamp = new Date().toISOString();

    const scheduleRows = (schedules as ScheduleItem[])
      .filter((item) => item?.projectSubTaskId)
      .map((item) => ({
        project_sub_task_id: item.projectSubTaskId as string,
        estimated_hours:
          typeof item.estimatedHours === "number" ? item.estimatedHours : null,
        scheduled_start_datetime: item.scheduledStartDatetime ?? null,
        scheduled_end_datetime: item.scheduledEndDatetime ?? null,
        updated_at: timestamp,
      }));

    if (scheduleRows.length === 0) {
      return NextResponse.json(
        { error: "No valid schedules provided." },
        { status: 400 },
      );
    }

    const { error: scheduleError } = await supabaseAdmin
      .from("project_sub_task")
      .upsert(scheduleRows, {
        onConflict: "project_sub_task_id",
      });

    if (scheduleError) {
      return NextResponse.json(
        {
          error: "Failed to save project schedule.",
          details: scheduleError.message,
        },
        { status: 500 },
      );
    }

    if (nextStatus) {
      const { error: statusError } = await supabaseAdmin
        .from("projects")
        .update({
          status: nextStatus,
          updated_at: timestamp,
        })
        .eq("project_id", projectId);

      if (statusError) {
        return NextResponse.json(
          {
            error: "Failed to update project status.",
            details: statusError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      statusUpdated: Boolean(nextStatus),
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
