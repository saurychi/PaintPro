import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("materials_cost, labor_cost, estimated_cost, estimated_profit")
      .eq("project_id", projectId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch project costs.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      materialsCost: Number(data?.materials_cost ?? 0),
      laborCost: Number(data?.labor_cost ?? 0),
      estimatedCost: Number(data?.estimated_cost ?? 0),
      estimatedProfit: Number(data?.estimated_profit ?? 0),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching project costs.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
