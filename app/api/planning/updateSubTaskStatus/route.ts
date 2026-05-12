import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PROJECT_TIME_REFERENCE_COOKIE,
  resolveProjectTimeReferenceDate,
} from "@/lib/time/projectTimeReference";
// Shared cascade helper. Same function the edit-schedule flow uses, so
// both surfaces honour identical work-hour / lunch / unavailable-day rules.
import { cascadeShiftLaterSubtasks } from "@/lib/schedule/cascadeShift";

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
    const originalScheduledStartDate = parseDate(
      existingSubTask.scheduled_start_datetime,
    );
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

    // Cascade runs in the background. Each subtask it shifts emits a
    // project_sub_task UPDATE that the dashboard's realtime
    // subscription patches in place — so the user sees the new times
    // land within ~1s of the response, instead of waiting for the
    // entire cascade to finish before getting "Done". For a project
    // with many remaining subtasks the cascade can take 1-3s to
    // chunk through; making it block the response was the main
    // source of the perceived "Finishing..." lag.
    if (
      isCompleting &&
      originalScheduledEndDate &&
      existingSubTask.project_task_id
    ) {
      const projectTaskId = existingSubTask.project_task_id;
      const originalScheduledEndMs = originalScheduledEndDate.getTime();
      // Fall back to the end timestamp if start is missing, so the
      // cascade can still anchor itself on a sensible value.
      const originalScheduledStartMs =
        originalScheduledStartDate?.getTime() ?? originalScheduledEndMs;

      void cascadeShiftLaterSubtasks({
        anchorSubTaskId: projectSubTaskId,
        projectTaskId,
        originalScheduledStartMs,
        originalScheduledEndMs,
        referenceEndMs: referenceNow.getTime(),
        timestampIso,
      })
        .then((result) => {
          if (result.error) {
            console.error(
              "[updateSubTaskStatus] background cascade shift failed:",
              result.error,
            );
          }
        })
        .catch((err: unknown) => {
          console.error(
            "[updateSubTaskStatus] background cascade shift threw:",
            err instanceof Error ? err.message : String(err),
          );
        });
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
        // Stage 2 — projects.status, all-project-tasks-for-this-project,
        // and (anticipating need) all-subtasks need not be sequential.
        // Fan them out together: the projects.status read tells us if
        // we even need to check; the other two feed the
        // hasRemainingOpenSubTask computation below.
        const [projectResult, allProjectTaskRowsResult] = await Promise.all([
          supabaseAdmin
            .from("projects")
            .select("status")
            .eq("project_id", projectTask.project_id)
            .returns<ProjectRow[]>(),
          supabaseAdmin
            .from("project_task")
            .select("project_task_id, project_id")
            .eq("project_id", projectTask.project_id)
            .returns<ProjectTaskRow[]>(),
        ]);

        if (projectResult.error) {
          return NextResponse.json(
            {
              error: "Failed to load project status.",
              details: projectResult.error.message,
            },
            { status: 500 },
          );
        }
        if (allProjectTaskRowsResult.error) {
          return NextResponse.json(
            {
              error: "Failed to load project tasks.",
              details: allProjectTaskRowsResult.error.message,
            },
            { status: 500 },
          );
        }

        const currentProject = projectResult.data?.[0] ?? null;
        projectStatus = normalizeStatus(currentProject?.status);

        if (canMoveProjectToReview(projectStatus)) {
          const projectTaskIds = (allProjectTaskRowsResult.data ?? []).map(
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
      // Cascade now runs in the background; its UPDATE events
      // broadcast via realtime so dashboards patch the shifted
      // subtask times automatically. We no longer carry a per-call
      // shifted/delta/warning summary because awaiting that would
      // re-introduce the slowness this change was made to remove.
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected error.", details: message },
      { status: 500 },
    );
  }
}
