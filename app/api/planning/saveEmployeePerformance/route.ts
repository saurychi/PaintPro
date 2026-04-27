import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EMPLOYEE_PERFORMANCE_RATING_VALUES } from "@/lib/planning/employeePerformance";

const VALID_RATINGS = new Set<string>(EMPLOYEE_PERFORMANCE_RATING_VALUES);

function isValidRating(value: unknown): value is (typeof EMPLOYEE_PERFORMANCE_RATING_VALUES)[number] {
  return typeof value === "string" && VALID_RATINGS.has(value);
}

function readNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() &&
    !Number.isNaN(Number(value)) &&
    Number(value) >= 0
  ) {
    return Number(value);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const reviewedBy =
      typeof body?.reviewedBy === "string" && body.reviewedBy.trim()
        ? body.reviewedBy.trim()
        : null;

    const totalEstimatedHours = readNonNegativeNumber(body?.totalEstimatedHours);
    const hourlyWage = readNonNegativeNumber(body?.hourlyWage);
    const salaryAmount = readNonNegativeNumber(body?.salaryAmount);

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    if (
      !isValidRating(body?.rating?.timeEfficiency) ||
      !isValidRating(body?.rating?.workQuality) ||
      !isValidRating(body?.rating?.teamwork) ||
      !isValidRating(body?.rating?.workEthic)
    ) {
      return NextResponse.json(
        { error: "Invalid employee performance rating." },
        { status: 400 },
      );
    }

    if (
      totalEstimatedHours === null ||
      hourlyWage === null ||
      salaryAmount === null
    ) {
      return NextResponse.json(
        { error: "Invalid salary or estimated-hours data." },
        { status: 400 },
      );
    }

    const reviewedAt = new Date().toISOString();

    const payload = {
      project_id: projectId,
      user_id: userId,
      time_efficiency: body.rating.timeEfficiency,
      work_quality: body.rating.workQuality,
      teamwork: body.rating.teamwork,
      work_ethic: body.rating.workEthic,
      note,
      salary_amount: salaryAmount,
      total_estimated_hours: totalEstimatedHours,
      hourly_wage: hourlyWage,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    };

    const { data: existingRow, error: existingError } = await supabaseAdmin
      .from("employee_performance")
      .select("employee_performance_id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: "Failed to check existing employee performance.",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existingRow?.employee_performance_id) {
      const { error: updateError } = await supabaseAdmin
        .from("employee_performance")
        .update(payload)
        .eq(
          "employee_performance_id",
          existingRow.employee_performance_id,
        );

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to update employee performance.",
            details: updateError.message,
          },
          { status: 500 },
        );
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("employee_performance")
        .insert({
          ...payload,
          created_at: reviewedAt,
        });

      if (insertError) {
        return NextResponse.json(
          {
            error: "Failed to save employee performance.",
            details: insertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
