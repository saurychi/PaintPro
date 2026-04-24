import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const markupRate =
      typeof body?.markupRate === "number" ? body.markupRate : 30;

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const origin = url.origin;

    const estimationResponse = await fetch(
      `${origin}/api/planning/getProjectCostEstimation?projectId=${encodeURIComponent(
        projectId,
      )}&markupRate=${encodeURIComponent(String(markupRate))}`,
      {
        cache: "no-store",
      },
    );

    const estimationData = await estimationResponse.json();

    if (!estimationResponse.ok) {
      return NextResponse.json(
        {
          error: estimationData?.error || "Failed to calculate project cost.",
          details: estimationData?.details || null,
        },
        { status: 500 },
      );
    }

    const summary = estimationData?.summary;

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        estimated_cost: summary?.totalCost ?? 0,
        estimated_budget: summary?.quotationTotal ?? 0,
        markup_rate: Number(markupRate),
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to save project cost estimation.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      summary,
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
