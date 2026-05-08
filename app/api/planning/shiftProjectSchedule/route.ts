import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/shiftProjectSchedule
// Body: { projectId: string, offsetMs: number }
//
// Adds `offsetMs` (signed, in milliseconds) to every subtask's
// scheduled_start_datetime / scheduled_end_datetime that belongs to the
// given project, and to the project's own scheduled_start_datetime /
// scheduled_end_datetime. Used by the dashboard's "Start Project" flow to
// keep the rest of the schedule consistent when the user actually starts
// early or late versus the original plan.
//
// Negative offsetMs pulls the schedule earlier; positive pushes it later.

export const runtime = "nodejs";

type SubTaskRow = {
  project_sub_task_id: string;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
};

function shiftIso(value: string | null, offsetMs: number): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + offsetMs).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const offsetMs = Number(body?.offsetMs);

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(offsetMs) || offsetMs === 0) {
      return NextResponse.json({ ok: true, shifted: 0 });
    }

    // Find every project_task for this project, then every subtask under
    // those tasks. We update in chunks to avoid firing dozens of parallel
    // requests against Supabase (same reason batchSaveProject chunks).
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id")
      .eq("project_id", projectId);

    if (tasksError) {
      return NextResponse.json(
        { error: "Failed to load project tasks.", details: tasksError.message },
        { status: 500 },
      );
    }

    const taskIds = (tasks ?? []).map((t) => t.project_task_id as string);
    let shifted = 0;

    if (taskIds.length > 0) {
      const { data: subTasks, error: subError } = await supabaseAdmin
        .from("project_sub_task")
        .select(
          "project_sub_task_id, scheduled_start_datetime, scheduled_end_datetime",
        )
        .in("project_task_id", taskIds);

      if (subError) {
        return NextResponse.json(
          { error: "Failed to load subtasks.", details: subError.message },
          { status: 500 },
        );
      }

      const updatable = (subTasks ?? []) as SubTaskRow[];
      const CHUNK_SIZE = 8;
      const timestamp = new Date().toISOString();

      for (let i = 0; i < updatable.length; i += CHUNK_SIZE) {
        const chunk = updatable.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map((row) => {
            const newStart = shiftIso(row.scheduled_start_datetime, offsetMs);
            const newEnd = shiftIso(row.scheduled_end_datetime, offsetMs);
            // Skip rows that have neither time set — nothing to shift.
            if (newStart === null && newEnd === null) {
              return Promise.resolve({ error: null as unknown as Error });
            }
            return supabaseAdmin
              .from("project_sub_task")
              .update({
                scheduled_start_datetime: newStart,
                scheduled_end_datetime: newEnd,
                updated_at: timestamp,
              })
              .eq("project_sub_task_id", row.project_sub_task_id);
          }),
        );
        const failed = results.find((r) => (r as { error: unknown }).error);
        if (failed && (failed as { error: { message?: string } }).error) {
          const errMsg = (failed as { error: { message?: string } }).error
            .message;
          return NextResponse.json(
            {
              error: "Failed to shift subtask schedule.",
              details: errMsg ?? "Unknown error",
            },
            { status: 500 },
          );
        }
        shifted += chunk.length;
      }
    }

    // Now shift the project's own scheduled start/end so admin/projects and
    // any other consumer of those fields stays accurate.
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("scheduled_start_datetime, scheduled_end_datetime")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: "Failed to load project.", details: projectError.message },
        { status: 500 },
      );
    }

    if (project) {
      const newStart = shiftIso(project.scheduled_start_datetime, offsetMs);
      const newEnd = shiftIso(project.scheduled_end_datetime, offsetMs);
      const { error: updateError } = await supabaseAdmin
        .from("projects")
        .update({
          scheduled_start_datetime: newStart,
          scheduled_end_datetime: newEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to shift project schedule.",
            details: updateError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, shifted, offsetMs });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error shifting schedule.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
