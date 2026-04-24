import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = (searchParams.get("projectId") || "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 }
      );
    }

    const { data: projectRow, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, status")
      .eq("project_id", projectId)
      .single();

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to load project.",
          details: projectError.message,
        },
        { status: 500 }
      );
    }

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select(`
        project_task_id,
        main_task:main_task_id (
          main_task_id,
          name
        )
      `)
      .eq("project_id", projectId);

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to load project main tasks.",
          details: projectTasksError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      project: projectRow,
      mainTasks: projectTasks ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to load main task assignment data.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
