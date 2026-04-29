import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  status: string | null;
};

type UnavailRow = {
  unavailability_id: string;
  start_datetime: string | null;
  end_datetime: string | null;
  reason: string | null;
};

function normalizeStatus(status: string | null) {
  const value = String(status || "").trim().toLowerCase();

  if (value === "completed" || value === "done") return "done";
  if (value === "behind" || value === "delayed" || value === "overdue") return "behind";
  if (
    value === "in_progress" ||
    value === "ongoing" ||
    value === "active" ||
    value === "review_pending" ||
    value === "invoice_pending" ||
    value === "payment_pending" ||
    value === "employee_management_pending" ||
    value === "conclude_job_pending"
  ) {
    return "current";
  }

  return "pending";
}

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Step 1: get project_sub_task IDs this staff member is assigned to
  const { data: assignData, error: assignErr } = await supabaseAdmin
    .from("project_sub_task_staff")
    .select("project_sub_task_id")
    .eq("user_id", userId);

  if (assignErr) {
    return NextResponse.json(
      { error: "Failed to load assignments.", details: assignErr.message },
      { status: 500 },
    );
  }

  const subTaskIds = [...new Set((assignData ?? []).map((a) => a.project_sub_task_id))];

  let projects: ReturnType<typeof buildProject>[] = [];

  if (subTaskIds.length > 0) {
    // Step 2: get project_task_ids
    const { data: subTaskData } = await supabaseAdmin
      .from("project_sub_task")
      .select("project_task_id")
      .in("project_sub_task_id", subTaskIds);

    const projectTaskIds = [...new Set((subTaskData ?? []).map((st) => st.project_task_id))];

    if (projectTaskIds.length > 0) {
      // Step 3: get project_ids
      const { data: taskData } = await supabaseAdmin
        .from("project_task")
        .select("project_id")
        .in("project_task_id", projectTaskIds);

      const projectIds = [...new Set((taskData ?? []).map((t) => t.project_id))];

      if (projectIds.length > 0) {
        // Step 4: get project details
        const { data: projectData, error: projectErr } = await supabaseAdmin
          .from("projects")
          .select(
            "project_id, project_code, title, scheduled_start_datetime, scheduled_end_datetime, status",
          )
          .in("project_id", projectIds)
          .order("scheduled_start_datetime", { ascending: true });

        if (projectErr) {
          return NextResponse.json(
            { error: "Failed to load projects.", details: projectErr.message },
            { status: 500 },
          );
        }

        projects = ((projectData ?? []) as ProjectRow[]).map(buildProject);
      }
    }
  }

  // Get unavailability for this staff member
  const { data: unavailData, error: unavailErr } = await supabaseAdmin
    .from("staff_unavailability")
    .select("unavailability_id, start_datetime, end_datetime, reason")
    .eq("user_id", userId)
    .order("start_datetime", { ascending: true });

  if (unavailErr) {
    return NextResponse.json(
      { error: "Failed to load unavailability.", details: unavailErr.message },
      { status: 500 },
    );
  }

  const unavailability = ((unavailData ?? []) as UnavailRow[]).map((u) => ({
    id: u.unavailability_id,
    startDatetime: u.start_datetime,
    endDatetime: u.end_datetime,
    reason: u.reason,
  }));

  const currentProject =
    projects.find((p) => p.status === "current") ?? projects[0] ?? null;

  return NextResponse.json({ projects, currentProject, unavailability });
}

function buildProject(project: ProjectRow) {
  return {
    id: project.project_id,
    projectCode: project.project_code,
    title: project.title || "Untitled Project",
    scheduledStartDatetime: project.scheduled_start_datetime,
    scheduledEndDatetime: project.scheduled_end_datetime,
    status: normalizeStatus(project.status),
    rawStatus: String(project.status || "").trim().toLowerCase(),
    dateLabel: formatDateLabel(project.scheduled_start_datetime),
  };
}
