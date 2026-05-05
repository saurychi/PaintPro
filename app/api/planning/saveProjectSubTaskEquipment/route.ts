import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEquipmentUsageForStorage } from "@/lib/planning/equipmentUsage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectSubTasks = Array.isArray(body?.projectSubTasks)
      ? body.projectSubTasks.filter((item: any) => item?.project_sub_task_id)
      : [];
    const projectId =
      typeof body?.projectId === "string" ? body.projectId : null;
    const nextStatus =
      typeof body?.nextStatus === "string" && body.nextStatus.trim()
        ? body.nextStatus.trim()
        : null;

    if (projectSubTasks.length === 0 && !nextStatus) {
      return NextResponse.json(
        { error: "Nothing to save." },
        { status: 400 },
      );
    }

    // Run every subtask update plus the optional project-status update in a
    // single Promise.all, so the client only pays one network round-trip and
    // each independent row update overlaps instead of running serially.
    const subTaskTasks = projectSubTasks.map((item: any) =>
      supabaseAdmin
        .from("project_sub_task")
        .update({
          equipments_used: normalizeEquipmentUsageForStorage(item?.equipments),
        })
        .eq("project_sub_task_id", item.project_sub_task_id)
        .then((res) => ({
          kind: "subtask" as const,
          project_sub_task_id: item.project_sub_task_id as string,
          error: res.error,
        })),
    );

    const statusTask =
      nextStatus && projectId
        ? supabaseAdmin
            .from("projects")
            .update({ status: nextStatus, updated_at: new Date().toISOString() })
            .eq("project_id", projectId)
            .then((res) => ({
              kind: "status" as const,
              project_sub_task_id: null,
              error: res.error,
            }))
        : null;

    const results = await Promise.all(
      statusTask ? [...subTaskTasks, statusTask] : subTaskTasks,
    );

    const failed = results.find((r) => r.error);
    if (failed) {
      return NextResponse.json(
        {
          error:
            failed.error?.message ||
            (failed.kind === "status"
              ? "Failed to update project status."
              : "Failed to save project subtask equipment."),
          project_sub_task_id: failed.project_sub_task_id,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected error while saving project subtask equipment." },
      { status: 500 },
    );
  }
}
