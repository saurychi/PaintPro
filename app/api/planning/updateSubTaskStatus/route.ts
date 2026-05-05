import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PROJECT_TIME_REFERENCE_COOKIE,
  resolveProjectTimeReferenceDate,
} from "@/lib/time/projectTimeReference";

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string | null;
  status: string | null;
  scheduled_start_datetime?: string | null;
  scheduled_end_datetime?: string | null;
  estimated_hours?: number | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string | null;
};

type ProjectRow = {
  status: string | null;
};

const CASCADE_THRESHOLD_MS = 60 * 1000;

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isFinishedSubTaskStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "cancelled"
  );
}

function isCompletionStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished"
  );
}

function canMoveProjectToReview(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "in_progress" ||
    normalized === "ongoing" ||
    normalized === "active"
  );
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftIso(value: string | null | undefined, deltaMs: number) {
  const date = parseDate(value);
  if (!date) return null;
  return new Date(date.getTime() + deltaMs).toISOString();
}

async function cascadeShiftLaterSubtasks(args: {
  finishingSubTaskId: string;
  projectTaskId: string;
  originalScheduledEndMs: number;
  deltaMs: number;
  timestampIso: string;
}): Promise<{ shifted: number; error: string | null }> {
  const { data: projectTaskRows, error: projectTaskError } = await supabaseAdmin
    .from("project_task")
    .select("project_task_id, project_id")
    .eq("project_task_id", args.projectTaskId)
    .returns<ProjectTaskRow[]>();

  if (projectTaskError) {
    return { shifted: 0, error: projectTaskError.message };
  }

  const projectId = projectTaskRows?.[0]?.project_id;
  if (!projectId) return { shifted: 0, error: null };

  const { data: allProjectTaskRows, error: allProjectTasksError } =
    await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id")
      .eq("project_id", projectId)
      .returns<ProjectTaskRow[]>();

  if (allProjectTasksError) {
    return { shifted: 0, error: allProjectTasksError.message };
  }

  const projectTaskIds = (allProjectTaskRows ?? []).map(
    (row) => row.project_task_id,
  );

  if (projectTaskIds.length === 0) return { shifted: 0, error: null };

  const { data: subTaskRows, error: subTaskError } = await supabaseAdmin
    .from("project_sub_task")
    .select(
      "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime",
    )
    .in("project_task_id", projectTaskIds)
    .returns<ProjectSubTaskRow[]>();

  if (subTaskError) {
    return { shifted: 0, error: subTaskError.message };
  }

  const candidates = (subTaskRows ?? []).filter((row) => {
    if (row.project_sub_task_id === args.finishingSubTaskId) return false;
    if (isFinishedSubTaskStatus(row.status)) return false;
    const startDate = parseDate(row.scheduled_start_datetime);
    if (!startDate) return false;
    return startDate.getTime() >= args.originalScheduledEndMs;
  });

  if (candidates.length === 0) return { shifted: 0, error: null };

  const updates = await Promise.all(
    candidates.map((row) => {
      const newStart = shiftIso(row.scheduled_start_datetime, args.deltaMs);
      const newEnd = shiftIso(row.scheduled_end_datetime, args.deltaMs);

      const payload: Record<string, unknown> = { updated_at: args.timestampIso };
      if (newStart) payload.scheduled_start_datetime = newStart;
      if (newEnd) payload.scheduled_end_datetime = newEnd;

      return supabaseAdmin
        .from("project_sub_task")
        .update(payload)
        .eq("project_sub_task_id", row.project_sub_task_id);
    }),
  );

  const failed = updates.find((result) => result.error);
  if (failed?.error) {
    return { shifted: 0, error: failed.error.message };
  }

  return { shifted: candidates.length, error: null };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const referenceNow =
      resolveProjectTimeReferenceDate(
        cookieStore.get(PROJECT_TIME_REFERENCE_COOKIE)?.value ?? null,
      ) ?? new Date();
    const timestampIso = referenceNow.toISOString();

    const body = await request.json();
    const projectSubTaskId = String(body?.projectSubTaskId ?? "").trim();
    const status = String(body?.status ?? "").trim();

    if (!projectSubTaskId || !status) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId or status." },
        { status: 400 },
      );
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        "project_sub_task_id, project_task_id, status, scheduled_start_datetime, scheduled_end_datetime, estimated_hours",
      )
      .eq("project_sub_task_id", projectSubTaskId)
      .returns<ProjectSubTaskRow[]>();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to load subtask.", details: existingError.message },
        { status: 500 },
      );
    }

    const existingSubTask = existingRows?.[0] ?? null;
    if (!existingSubTask) {
      return NextResponse.json({ error: "Subtask not found." }, { status: 404 });
    }

    const isCompleting = isCompletionStatus(status);
    const originalScheduledEndDate = parseDate(
      existingSubTask.scheduled_end_datetime,
    );

    // The finishing subtask keeps its original `scheduled_start_datetime`,
    // `scheduled_end_datetime`, and `estimated_hours` so the timing label
    // (`completion vs scheduled_start + estimated_hours`) can detect early/late.
    // `updated_at` records the actual completion time.
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: timestampIso,
    };

    const { error: updateError } = await supabaseAdmin
      .from("project_sub_task")
      .update(updatePayload)
      .eq("project_sub_task_id", projectSubTaskId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update subtask status.", details: updateError.message },
        { status: 500 },
      );
    }

    let cascadeShiftedCount = 0;
    let cascadeDeltaMs = 0;

    if (
      isCompleting &&
      originalScheduledEndDate &&
      existingSubTask.project_task_id
    ) {
      const deltaMs = referenceNow.getTime() - originalScheduledEndDate.getTime();
      cascadeDeltaMs = deltaMs;

      if (Math.abs(deltaMs) >= CASCADE_THRESHOLD_MS) {
        const result = await cascadeShiftLaterSubtasks({
          finishingSubTaskId: projectSubTaskId,
          projectTaskId: existingSubTask.project_task_id,
          originalScheduledEndMs: originalScheduledEndDate.getTime(),
          deltaMs,
          timestampIso,
        });

        if (result.error) {
          return NextResponse.json(
            {
              error: "Failed to cascade scheduled times to later subtasks.",
              details: result.error,
            },
            { status: 500 },
          );
        }

        cascadeShiftedCount = result.shifted;
      }
    }

    let projectStatus: string | null = null;
    let movedToReviewPending = false;

    if (isFinishedSubTaskStatus(status) && existingSubTask.project_task_id) {
      const { data: projectTaskRows, error: projectTaskLookupError } =
        await supabaseAdmin
          .from("project_task")
          .select("project_task_id, project_id")
          .eq("project_task_id", existingSubTask.project_task_id)
          .returns<ProjectTaskRow[]>();

      if (projectTaskLookupError) {
        return NextResponse.json(
          {
            error: "Failed to load project task.",
            details: projectTaskLookupError.message,
          },
          { status: 500 },
        );
      }

      const projectTask = projectTaskRows?.[0] ?? null;

      if (projectTask?.project_id) {
        const { data: projectRows, error: projectLookupError } =
          await supabaseAdmin
            .from("projects")
            .select("status")
            .eq("project_id", projectTask.project_id)
            .returns<ProjectRow[]>();

        if (projectLookupError) {
          return NextResponse.json(
            {
              error: "Failed to load project status.",
              details: projectLookupError.message,
            },
            { status: 500 },
          );
        }

        const currentProject = projectRows?.[0] ?? null;
        projectStatus = normalizeStatus(currentProject?.status);

        if (canMoveProjectToReview(projectStatus)) {
          const { data: allProjectTaskRows, error: allProjectTasksError } =
            await supabaseAdmin
              .from("project_task")
              .select("project_task_id, project_id")
              .eq("project_id", projectTask.project_id)
              .returns<ProjectTaskRow[]>();

          if (allProjectTasksError) {
            return NextResponse.json(
              {
                error: "Failed to load project tasks.",
                details: allProjectTasksError.message,
              },
              { status: 500 },
            );
          }

          const projectTaskIds = (allProjectTaskRows ?? []).map(
            (row) => row.project_task_id,
          );

          if (projectTaskIds.length > 0) {
            const { data: projectSubTaskRows, error: projectSubTasksError } =
              await supabaseAdmin
                .from("project_sub_task")
                .select("project_sub_task_id, project_task_id, status")
                .in("project_task_id", projectTaskIds)
                .returns<ProjectSubTaskRow[]>();

            if (projectSubTasksError) {
              return NextResponse.json(
                {
                  error: "Failed to load project subtasks.",
                  details: projectSubTasksError.message,
                },
                { status: 500 },
              );
            }

            const hasRemainingOpenSubTask = (projectSubTaskRows ?? []).some(
              (row) => !isFinishedSubTaskStatus(row.status),
            );

            if (!hasRemainingOpenSubTask) {
              const nextProjectStatus = "review_pending";

              const { error: reviewStatusError } = await supabaseAdmin
                .from("projects")
                .update({
                  status: nextProjectStatus,
                  updated_at: timestampIso,
                })
                .eq("project_id", projectTask.project_id);

              if (reviewStatusError) {
                return NextResponse.json(
                  {
                    error: "Failed to move project to review.",
                    details: reviewStatusError.message,
                  },
                  { status: 500 },
                );
              }

              projectStatus = nextProjectStatus;
              movedToReviewPending = true;
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      projectStatus,
      movedToReviewPending,
      cascade: {
        shifted: cascadeShiftedCount,
        deltaMs: cascadeDeltaMs,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected error.", details: message },
      { status: 500 },
    );
  }
}
