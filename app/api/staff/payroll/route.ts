import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  derivePayrollStatus,
  type StaffPayrollRecord,
} from "@/lib/staff/payroll";

type UserRow = {
  id: string;
  username: string | null;
  role: "client" | "staff" | "manager" | "admin" | null;
};

type EmployeePerformanceRow = {
  employee_performance_id: string;
  project_id: string;
  user_id: string;
  note: string | null;
  salary_amount: number | null;
  total_estimated_hours: number | null;
  hourly_wage: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
};

type ReviewerRow = {
  id: string;
  username: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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

    const { data: performanceRows, error: performanceError } =
      await supabaseAdmin
        .from("employee_performance")
        .select(
          `
          employee_performance_id,
          project_id,
          user_id,
          note,
          salary_amount,
          total_estimated_hours,
          hourly_wage,
          reviewed_by,
          reviewed_at,
          created_at,
          updated_at
        `,
        )
        .eq("user_id", authUser.id)
        .returns<EmployeePerformanceRow[]>();

    if (performanceError) {
      return NextResponse.json(
        {
          error: "Failed to load payroll records.",
          details: performanceError.message,
        },
        { status: 500 },
      );
    }

    if (!performanceRows?.length) {
      return NextResponse.json({
        records: [] as StaffPayrollRecord[],
      });
    }

    const projectIds = uniqueStrings(
      performanceRows.map((row) => row.project_id),
    );
    const reviewerIds = uniqueStrings(
      performanceRows.map((row) => row.reviewed_by),
    );

    let projects: ProjectRow[] = [];
    let reviewers: ReviewerRow[] = [];

    if (projectIds.length) {
      const { data: projectRows, error: projectsError } = await supabaseAdmin
        .from("projects")
        .select("project_id, project_code, title")
        .in("project_id", projectIds)
        .returns<ProjectRow[]>();

      if (projectsError) {
        return NextResponse.json(
          {
            error: "Failed to load payroll projects.",
            details: projectsError.message,
          },
          { status: 500 },
        );
      }

      projects = projectRows ?? [];
    }

    if (reviewerIds.length) {
      const { data: reviewerRows, error: reviewersError } = await supabaseAdmin
        .from("users")
        .select("id, username")
        .in("id", reviewerIds)
        .returns<ReviewerRow[]>();

      if (reviewersError) {
        return NextResponse.json(
          {
            error: "Failed to load payroll reviewers.",
            details: reviewersError.message,
          },
          { status: 500 },
        );
      }

      reviewers = reviewerRows ?? [];
    }

    const projectMap = new Map(
      projects.map((project) => [project.project_id, project]),
    );
    const reviewerMap = new Map(
      reviewers.map((reviewer) => [reviewer.id, reviewer]),
    );

    const records: StaffPayrollRecord[] = performanceRows
      .map((row) => {
        const project = projectMap.get(row.project_id);
        const reviewer = row.reviewed_by
          ? reviewerMap.get(row.reviewed_by)
          : null;

        return {
          id: row.employee_performance_id,
          projectId: row.project_id,
          projectCode: project?.project_code ?? "No Code",
          projectTitle: project?.title ?? "Untitled Project",
          reviewedByUserId: row.reviewed_by,
          reviewedByName: reviewer?.username ?? null,
          reviewedAt: row.reviewed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          totalEstimatedHours: row.total_estimated_hours,
          hourlyWage: row.hourly_wage,
          salaryAmount: row.salary_amount,
          note: row.note,
          status: derivePayrollStatus({
            reviewedAt: row.reviewed_at,
          }),
        } satisfies StaffPayrollRecord;
      })
      .sort((left, right) => {
        const leftDate = new Date(
          left.reviewedAt || left.updatedAt || left.createdAt || 0,
        ).getTime();
        const rightDate = new Date(
          right.reviewedAt || right.updatedAt || right.createdAt || 0,
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
