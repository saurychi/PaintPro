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
    .select("project_id, status")
    .eq("project_id", projectId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch project status.", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ status: data.status });
}
