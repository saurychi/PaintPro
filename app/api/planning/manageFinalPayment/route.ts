import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId = (body?.projectId as string | undefined)?.trim();
    const finalPayment = body?.finalPayment;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (
      typeof finalPayment !== "number" ||
      Number.isNaN(finalPayment) ||
      finalPayment < 0
    ) {
      return NextResponse.json(
        { error: "Invalid final payment amount." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("estimated_budget, downpayment, status")
      .eq("project_id", projectId)
      .single();

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project payment details.",
          details: projectError.message,
        },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (project.status !== "payment_pending") {
      return NextResponse.json(
        { error: "Project is not ready for final payment." },
        { status: 409 },
      );
    }

    const totalInvoice = Math.max(0, Number(project.estimated_budget) || 0);
    const paidDownpayment = Math.max(0, Number(project.downpayment) || 0);
    const remainingBalance = Math.max(0, totalInvoice - paidDownpayment);

    if (finalPayment + 0.000001 < remainingBalance) {
      return NextResponse.json(
        {
          error: "Final payment must cover the remaining balance.",
          remainingBalance,
        },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        status: "employee_management_pending",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to save final payment.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      nextStatus: "employee_management_pending",
    });
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
