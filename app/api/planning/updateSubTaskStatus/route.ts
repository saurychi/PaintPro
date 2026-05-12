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

    // Cascade is now awaited rather than fire-and-forget: the chain
    // underneath the finishing subtask MUST be coherent by the time we
    // tell the dashboard "done". Background-firing it lost shifts on
    // Vercel function teardowns and made it impossible to surface
    // cascade failures to the admin (they'd just see a "Done" toast
    // and stale times). The cascade is ~1-2s for typical projects;
    // worth the trade for the consistency.
    //
    // The gate accepts either bound: a subtask whose scheduled_end was
    // never populated (manual data tweaks, partially-migrated rows)
    // should still trigger a cascade as long as we know where it sat.
    // Same the other way around. Without this relaxation, finishing a
    // subtask with a missing end silently skipped the cascade and the
    // chain underneath stayed at its old slots.
    const finishingAnchorStartMs =
      originalScheduledStartDate?.getTime() ?? null;
    const finishingAnchorEndMs =
      originalScheduledEndDate?.getTime() ?? null;
    const finishingAnchorMs =
      finishingAnchorStartMs ?? finishingAnchorEndMs;

    let cascadeShifted = 0;
    let cascadeWarning: string | null = null;

    if (
      isCompleting &&
      finishingAnchorMs !== null &&
      existingSubTask.project_task_id
    ) {
      const projectTaskId = existingSubTask.project_task_id;
      // Bounds default to one another when only one side is known so
      // cascadeShiftLaterSubtasks's MIN(start, end) anchor still
      // resolves to the same moment we just decided to use.
      const originalScheduledStartMs =
        finishingAnchorStartMs ?? finishingAnchorEndMs ?? finishingAnchorMs;
      const originalScheduledEndMs =
        finishingAnchorEndMs ?? finishingAnchorStartMs ?? finishingAnchorMs;

      try {
        const cascadeResult = await cascadeShiftLaterSubtasks({
          anchorSubTaskId: projectSubTaskId,
          projectTaskId,
          originalScheduledStartMs,
          originalScheduledEndMs,
          referenceEndMs: referenceNow.getTime(),
          timestampIso,
        });

        if (cascadeResult.error) {
          console.error(
            "[updateSubTaskStatus] cascade shift failed:",
            cascadeResult.error,
          );
          cascadeWarning = cascadeResult.error;
        } else {
          cascadeShifted = cascadeResult.shifted;
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "Unknown error");
        console.error(
          "[updateSubTaskStatus] cascade shift threw:",
          message,
        );
        cascadeWarning = message;
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
      // Surface the cascade result so the dashboard can render a
      // toast describing the shift (or warn if it failed mid-flight).
      // The realtime subscription also patches subtask rows live, but
      // shipping the count here gives a deterministic confirmation in
      // the same response.
      cascadeShifted,
      cascadeWarning,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected error.", details: message },
      { status: 500 },
    );
  }
}
