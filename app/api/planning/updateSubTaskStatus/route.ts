import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string | null;
  status: string | null;
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

function canMoveProjectToReview(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "in_progress" ||
    normalized === "ongoing" ||
    normalized === "active"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectSubTaskId = String(body?.projectSubTaskId ?? "").trim();
    const status = String(body?.status ?? "").trim();

    if (!projectSubTaskId || !status) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId or status." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("project_sub_task")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("project_sub_task_id", projectSubTaskId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update subtask status.", details: error.message },
        { status: 500 },
      );
    }

    let projectStatus: string | null = null;
    let movedToReviewPending = false;

    if (isFinishedSubTaskStatus(status)) {
      const { data: updatedSubTaskRows, error: subTaskLookupError } =
        await supabaseAdmin
          .from("project_sub_task")
          .select("project_sub_task_id, project_task_id, status")
          .eq("project_sub_task_id", projectSubTaskId)
          .returns<ProjectSubTaskRow[]>();

      if (subTaskLookupError) {
        return NextResponse.json(
          {
            error: "Failed to load updated subtask.",
            details: subTaskLookupError.message,
          },
          { status: 500 },
        );
      }

      const updatedSubTask = updatedSubTaskRows?.[0] ?? null;

      if (updatedSubTask?.project_task_id) {
        const { data: projectTaskRows, error: projectTaskLookupError } =
          await supabaseAdmin
            .from("project_task")
            .select("project_task_id, project_id")
            .eq("project_task_id", updatedSubTask.project_task_id)
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
                    updated_at: new Date().toISOString(),
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
    }

    return NextResponse.json({
      ok: true,
      projectStatus,
      movedToReviewPending,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected error.", details: message },
      { status: 500 },
    );
  }
}
