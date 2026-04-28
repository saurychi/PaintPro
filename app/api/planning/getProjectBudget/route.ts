import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = (searchParams.get("projectId") || "").trim();

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("estimated_budget, estimated_cost, downpayment")
    .eq("project_id", projectId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch project budget.", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    estimatedBudget: data.estimated_budget ?? 0,
    estimatedCost: data.estimated_cost ?? 0,
    downpayment: data.downpayment ?? 0,
  });
}
