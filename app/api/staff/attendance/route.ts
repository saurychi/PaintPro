import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  deriveAttendanceStatus,
  type StaffAttendanceRecord,
} from "@/lib/staff/attendance";

type UserRow = {
  id: string;
  username: string | null;
  role: "client" | "staff" | "manager" | "admin" | null;
};

type AssignmentRow = {
  project_sub_task_staff_id: string;
  project_sub_task_id: string;
  user_id: string;
  assignment_status: string | null;
  updated_at: string | null;
};

type ProjectSubTaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  sub_task_id: string;
  estimated_hours: number | null;
  status: string | null;
  updated_at: string | null;
};

type ProjectTaskRow = {
  project_task_id: string;
  project_id: string;
  main_task_id: string;
};

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  site_address: string | null;
  status: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
};

type ProjectScheduleRow = {
  project_schedule_id: string;
  project_id: string;
  start_datetime: string | null;
  end_datetime: string | null;
  status: string | null;
  created_at: string | null;
};

type SubTaskRow = {
  sub_task_id: string;
  description: string | null;
};

type MainTaskRow = {
  main_task_id: string;
  name: string | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}

export async function GET() {
  try {
    const authUser = await getAuthUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: userProfile, error: userProfileError } = await supabaseAdmin
      .from("users")
      .select("id, username, role")
      .eq("id", authUser.id)
      .maybeSingle<UserRow>();

    if (userProfileError) {
      return NextResponse.json(
        {
          error: "Failed to load user profile.",
          details: userProfileError.message,
        },
        { status: 500 },
      );
    }

    if (!userProfile || userProfile.role !== "staff") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select(
        `
        project_sub_task_staff_id,
        project_sub_task_id,
        user_id,
        assignment_status,
        updated_at
      `,
      )
      .eq("user_id", authUser.id)
      .returns<AssignmentRow[]>();

    if (assignmentsError) {
      return NextResponse.json(
        {
          error: "Failed to load attendance assignments.",
          details: assignmentsError.message,
        },
        { status: 500 },
      );
    }

    const projectSubTaskIds = uniqueStrings(
      (assignments ?? []).map((row) => row.project_sub_task_id),
    );

    if (!projectSubTaskIds.length) {
      return NextResponse.json({
        records: [] as StaffAttendanceRecord[],
      });
    }

    const { data: projectSubTasks, error: projectSubTasksError } =
      await supabaseAdmin
        .from("project_sub_task")
        .select(
          `
          project_sub_task_id,
          project_task_id,
          sub_task_id,
          estimated_hours,
          status,
          updated_at
        `,
        )
        .in("project_sub_task_id", projectSubTaskIds)
        .returns<ProjectSubTaskRow[]>();

    if (projectSubTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project sub tasks.",
          details: projectSubTasksError.message,
        },
        { status: 500 },
      );
    }

    const projectTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.project_task_id),
    );
    const subTaskIds = uniqueStrings(
      (projectSubTasks ?? []).map((row) => row.sub_task_id),
    );

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select("project_task_id, project_id, main_task_id")
      .in("project_task_id", projectTaskIds)
      .returns<ProjectTaskRow[]>();

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project tasks.",
          details: projectTasksError.message,
        },
        { status: 500 },
      );
    }

    const projectIds = uniqueStrings(
      (projectTasks ?? []).map((row) => row.project_id),
    );
    const mainTaskIds = uniqueStrings(
      (projectTasks ?? []).map((row) => row.main_task_id),
    );

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from("projects")
      .select(
        `
        project_id,
        project_code,
        title,
        site_address,
        status,
        scheduled_start_datetime,
        scheduled_end_datetime
      `,
      )
      .in("project_id", projectIds)
      .returns<ProjectRow[]>();

    if (projectsError) {
      return NextResponse.json(
        {
          error: "Failed to load projects.",
          details: projectsError.message,
        },
        { status: 500 },
      );
    }

    const { data: projectSchedules, error: projectSchedulesError } =
      await supabaseAdmin
        .from("project_schedule")
        .select(
          `
          project_schedule_id,
          project_id,
          start_datetime,
          end_datetime,
          status,
          created_at
        `,
        )
        .in("project_id", projectIds)
        .returns<ProjectScheduleRow[]>();

    if (projectSchedulesError) {
      return NextResponse.json(
        {
          error: "Failed to load project schedules.",
          details: projectSchedulesError.message,
        },
        { status: 500 },
      );
    }

    const { data: mainTasks, error: mainTasksError } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id, name")
      .in("main_task_id", mainTaskIds)
      .returns<MainTaskRow[]>();

    if (mainTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load main tasks.",
          details: mainTasksError.message,
        },
        { status: 500 },
      );
    }

    const { data: subTasks, error: subTasksError } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, description")
      .in("sub_task_id", subTaskIds)
      .returns<SubTaskRow[]>();

    if (subTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load sub tasks.",
          details: subTasksError.message,
        },
        { status: 500 },
      );
    }

    const projectSubTaskMap = new Map(
      (projectSubTasks ?? []).map((row) => [row.project_sub_task_id, row]),
    );
    const projectTaskMap = new Map(
      (projectTasks ?? []).map((row) => [row.project_task_id, row]),
    );
    const projectMap = new Map((projects ?? []).map((row) => [row.project_id, row]));
    const projectScheduleMap = new Map<string, ProjectScheduleRow>();
    const subTaskMap = new Map((subTasks ?? []).map((row) => [row.sub_task_id, row]));
    const mainTaskMap = new Map(
      (mainTasks ?? []).map((row) => [row.main_task_id, row]),
    );

    for (const row of projectSchedules ?? []) {
      const current = projectScheduleMap.get(row.project_id);

      if (!current) {
        projectScheduleMap.set(row.project_id, row);
        continue;
      }

      const currentTime = new Date(
        current.start_datetime || current.created_at || 0,
      ).getTime();
      const nextTime = new Date(row.start_datetime || row.created_at || 0).getTime();

      if (nextTime > currentTime) {
        projectScheduleMap.set(row.project_id, row);
      }
    }

    const records: StaffAttendanceRecord[] = (assignments ?? [])
      .flatMap<StaffAttendanceRecord>((assignment) => {
        const projectSubTask = projectSubTaskMap.get(assignment.project_sub_task_id);
        if (!projectSubTask) return [];

        const projectTask = projectTaskMap.get(projectSubTask.project_task_id);
        if (!projectTask) return [];

        const project = projectMap.get(projectTask.project_id);
        const projectSchedule = projectScheduleMap.get(projectTask.project_id);
        const subTask = subTaskMap.get(projectSubTask.sub_task_id);
        const mainTask = mainTaskMap.get(projectTask.main_task_id);

        return [
          {
            id: assignment.project_sub_task_staff_id,
            projectId: projectTask.project_id,
            projectCode: project?.project_code ?? "No Code",
            projectTitle: project?.title ?? "Untitled Project",
            siteAddress: project?.site_address ?? null,
            mainTaskName: mainTask?.name ?? "Main Task",
            subTaskName: subTask?.description ?? "Sub Task",
            projectStatus: project?.status ?? null,
            scheduleStatus: projectSchedule?.status ?? null,
            assignmentStatus: assignment.assignment_status ?? null,
            taskStatus: projectSubTask.status ?? null,
            scheduledStartDatetime:
              projectSchedule?.start_datetime ||
              project?.scheduled_start_datetime ||
              null,
            scheduledEndDatetime:
              projectSchedule?.end_datetime ||
              project?.scheduled_end_datetime ||
              null,
            actualStartDatetime: null,
            actualEndDatetime: null,
            estimatedHours: projectSubTask.estimated_hours ?? null,
            updatedAt: projectSubTask.updated_at ?? assignment.updated_at ?? null,
            status: deriveAttendanceStatus({
              projectStatus: project?.status,
              scheduleStatus: projectSchedule?.status,
              assignmentStatus: assignment.assignment_status,
              taskStatus: projectSubTask.status,
              scheduledStartDatetime:
                projectSchedule?.start_datetime ||
                project?.scheduled_start_datetime ||
                null,
            }),
          } satisfies StaffAttendanceRecord,
        ];
      });

    records.sort((left, right) => {
      const leftDate = new Date(
        left.actualStartDatetime ||
          left.scheduledStartDatetime ||
          left.updatedAt ||
          0,
      ).getTime();
      const rightDate = new Date(
        right.actualStartDatetime ||
          right.scheduledStartDatetime ||
          right.updatedAt ||
          0,
      ).getTime();

      return rightDate - leftDate;
    });

    return NextResponse.json({
      records,
      user: {
        id: userProfile.id,
        username: userProfile.username,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
