import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getRequiredEmployeeCountFromEstimatedHours,
  suggestEmployeesForTasks,
} from "@/lib/planning/employeeAssignment";
import { estimateDurationForSubTask } from "@/lib/planning/durationEstimator";
import {
  computeAreasFromDimensions,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator";
type EmployeeAssignmentScore = {
  employee: EmployeeHint;
  score: number;
};

import type { EmployeeHint } from "@/lib/planning/aiContext";

function toSortOrder(value: unknown, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function pickWeightedEmployees(
  candidates: EmployeeAssignmentScore[],
  requiredCount: number,
): EmployeeHint[] {
  const remaining = [...candidates];
  const chosen: EmployeeHint[] = [];

  while (chosen.length < requiredCount && remaining.length > 0) {
    const topPool = remaining.slice(0, Math.min(4, remaining.length));

    const minScore = Math.min(...topPool.map((item) => item.score));
    const weighted = topPool.map((item) => ({
      item,
      weight: Math.max(item.score - minScore + 1, 1),
    }));

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let random = Math.random() * totalWeight;

    let picked = weighted[0].item;

    for (const entry of weighted) {
      random -= entry.weight;
      if (random <= 0) {
        picked = entry.item;
        break;
      }
    }

    chosen.push(picked.employee);

    const pickedIndex = remaining.findIndex(
      (entry) => entry.employee.id === picked.employee.id,
    );

    if (pickedIndex >= 0) {
      remaining.splice(pickedIndex, 1);
    }
  }

  return chosen;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const projectSubTaskId =
      typeof body?.projectSubTaskId === "string" ? body.projectSubTaskId.trim() : "";

    if (!projectSubTaskId) {
      return NextResponse.json(
        { error: "Missing projectSubTaskId." },
        { status: 400 },
      );
    }

    const { data: projectSubTask, error: projectSubTaskError } = await supabaseAdmin
      .from("project_sub_task")
      .select(
        `
        project_sub_task_id,
        estimated_hours,
        sort_order,
        project_task:project_task_id (
          project_task_id,
          project_id,
          sort_order,
          main_task:main_task_id (
            main_task_id,
            name
          )
        ),
        sub_task:sub_task_id (
          sub_task_id,
          description
        )
      `,
      )
      .eq("project_sub_task_id", projectSubTaskId)
      .maybeSingle();

    if (projectSubTaskError) {
      return NextResponse.json(
        {
          error: "Failed to load project subtask.",
          details: projectSubTaskError.message,
        },
        { status: 500 },
      );
    }

    if (!projectSubTask) {
      return NextResponse.json(
        { error: "Project subtask not found." },
        { status: 404 },
      );
    }

    const { data: staffUsers, error: staffUsersError } = await supabaseAdmin
      .from("users")
      .select("id, username, email, specialty")
      .eq("role", "staff")
      .eq("status", "active");

    if (staffUsersError) {
      return NextResponse.json(
        {
          error: "Failed to load active staff users.",
          details: staffUsersError.message,
        },
        { status: 500 },
      );
    }

    const normalizedEmployees: EmployeeHint[] = (staffUsers ?? []).map(
      (user: any): EmployeeHint => ({
        id: String(user.id),
        name: String(user.username || user.email || "Staff"),
        role: "staff",
        specialties: toSpecialties(user.specialty),
        availability: [],
      }),
    );

    const projectTaskRelation = Array.isArray(projectSubTask?.project_task)
      ? projectSubTask.project_task[0]
      : projectSubTask?.project_task;

    const mainTaskRelation = Array.isArray(projectTaskRelation?.main_task)
      ? projectTaskRelation.main_task[0]
      : projectTaskRelation?.main_task;

    const subTaskRelation = Array.isArray(projectSubTask?.sub_task)
      ? projectSubTask.sub_task[0]
      : projectSubTask?.sub_task;

    const mainTaskName = mainTaskRelation?.name || "Main Task";
    const subTaskTitle = subTaskRelation?.description || "Sub Task";
    const projectId =
      typeof projectTaskRelation?.project_id === "string"
        ? projectTaskRelation.project_id
        : "";
    const mainTaskId =
      typeof mainTaskRelation?.main_task_id === "string"
        ? mainTaskRelation.main_task_id
        : "";
    const subTaskId =
      typeof subTaskRelation?.sub_task_id === "string"
        ? subTaskRelation.sub_task_id
        : "";

    const estimatedHours = Number(projectSubTask?.estimated_hours ?? 0);
    let requiredEmployeeCount =
      getRequiredEmployeeCountFromEstimatedHours(estimatedHours);

    if (projectId && mainTaskId && subTaskId) {
      const { data: projectRow, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("dimensions")
        .eq("project_id", projectId)
        .maybeSingle();

      if (!projectError && projectRow?.dimensions) {
        try {
          const durationEstimate = await estimateDurationForSubTask({
            mainTaskId,
            subTaskId,
            areas: computeAreasFromDimensions(
              projectRow.dimensions as ProjectDimensions,
            ),
          });

          requiredEmployeeCount = durationEstimate.requiredEmployeeCount;
        } catch {
          // Fall back to the saved estimate if the original formula inputs are
          // no longer available or the rule has changed.
        }
      }
    }

    let previousEmployeeIds: string[] = [];

    if (projectId) {
      const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
        .from("project_task")
        .select("project_task_id, sort_order")
        .eq("project_id", projectId);

      if (projectTasksError) {
        return NextResponse.json(
          {
            error: "Failed to load project task order.",
            details: projectTasksError.message,
          },
          { status: 500 },
        );
      }

      const projectTaskIds = (projectTasks ?? []).map((row: any) => row.project_task_id);
      const projectTaskSortOrderMap = new Map(
        (projectTasks ?? []).map((row: any) => [
          row.project_task_id,
          toSortOrder(row.sort_order),
        ]),
      );

      if (projectTaskIds.length > 0) {
        const { data: orderedProjectSubTasks, error: orderedProjectSubTasksError } =
          await supabaseAdmin
            .from("project_sub_task")
            .select("project_sub_task_id, project_task_id, sort_order")
            .in("project_task_id", projectTaskIds);

        if (orderedProjectSubTasksError) {
          return NextResponse.json(
            {
              error: "Failed to load project subtask order.",
              details: orderedProjectSubTasksError.message,
            },
            { status: 500 },
          );
        }

        const orderedRows = [...(orderedProjectSubTasks ?? [])].sort(
          (a: any, b: any) => {
            const projectTaskOrder =
              toSortOrder(projectTaskSortOrderMap.get(a.project_task_id)) -
              toSortOrder(projectTaskSortOrderMap.get(b.project_task_id));

            if (projectTaskOrder !== 0) return projectTaskOrder;

            return toSortOrder(a.sort_order) - toSortOrder(b.sort_order);
          },
        );

        const currentIndex = orderedRows.findIndex(
          (row: any) => row.project_sub_task_id === projectSubTaskId,
        );

        if (currentIndex > 0) {
          const previousProjectSubTaskId =
            orderedRows[currentIndex - 1]?.project_sub_task_id ?? "";

          if (previousProjectSubTaskId) {
            const { data: previousAssignments, error: previousAssignmentsError } =
              await supabaseAdmin
                .from("project_sub_task_staff")
                .select("user_id")
                .eq("project_sub_task_id", previousProjectSubTaskId);

            if (previousAssignmentsError) {
              return NextResponse.json(
                {
                  error: "Failed to load previous subtask assignments.",
                  details: previousAssignmentsError.message,
                },
                { status: 500 },
              );
            }

            previousEmployeeIds = uniqueStrings(
              (previousAssignments ?? []).map((row: any) => String(row.user_id || "")),
            );
          }
        }
      }
    }

    const candidates = suggestEmployeesForTasks({
      tasks: [
        { name: mainTaskName },
        { name: subTaskTitle },
      ],
      employees: normalizedEmployees,
      limit: normalizedEmployees.length,
      requireAvailability: false,
      assignmentCounts: {},
    });

    const previousEmployeeIdSet = new Set(previousEmployeeIds);
    const nonConsecutiveCandidates =
      previousEmployeeIdSet.size === 0
        ? candidates
        : candidates.filter(
            (candidate) => !previousEmployeeIdSet.has(candidate.employee.id),
          );

    const candidatePool =
      nonConsecutiveCandidates.length >= requiredEmployeeCount
        ? nonConsecutiveCandidates
        : candidates;

    const selectedEmployees = pickWeightedEmployees(candidatePool, requiredEmployeeCount);

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

    if (selectedEmployees.length > 0) {
      const rows = selectedEmployees.map((employee) => ({
        project_sub_task_id: projectSubTaskId,
        user_id: employee.id,
        role: "staff",
        assignment_status: "assigned",
      }));

      const { error: insertError } = await supabaseAdmin
        .from("project_sub_task_staff")
        .insert(rows);

      if (insertError) {
        return NextResponse.json(
          {
            error: "Failed to save generated employee assignments.",
            details: insertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      recommendedEmployeeIds: selectedEmployees.map((employee) => employee.id),
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
