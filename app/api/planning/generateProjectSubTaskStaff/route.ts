import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getRequiredEmployeeCountFromEstimatedHours,
  suggestEmployeesForTasks,
} from "@/lib/planning/employeeAssignment";
type EmployeeAssignmentScore = {
  employee: EmployeeHint;
  score: number;
};

import type { EmployeeHint } from "@/lib/planning/aiContext";

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
        project_task:project_task_id (
          project_task_id,
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

    const estimatedHours = Number(projectSubTask?.estimated_hours ?? 0);
    const requiredEmployeeCount =
      getRequiredEmployeeCountFromEstimatedHours(estimatedHours);

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

    const selectedEmployees = pickWeightedEmployees(
      candidates,
      requiredEmployeeCount,
    );

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
