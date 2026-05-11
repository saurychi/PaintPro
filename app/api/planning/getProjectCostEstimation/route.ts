import { NextResponse } from "next/server";
import {
  loadProjectCostEstimation,
  CostEstimationLoadError,
} from "@/lib/planning/loadProjectCostEstimation";

// GET /api/planning/getProjectCostEstimation?projectId=...&markupRate=...
//
// Read-only endpoint that returns the project + tasks/materials/subtasks/staff
// rolled up into the shape calculateProjectCostEstimation produces. The heavy
// data-loading lives in lib/planning/loadProjectCostEstimation so the
// quotation HTML/PDF pipeline can call it directly without an extra HTTP hop.

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim() || "";
    const markupRateInput = searchParams.get("markupRate");

    const data = await loadProjectCostEstimation(projectId, markupRateInput);
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof CostEstimationLoadError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? null },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
