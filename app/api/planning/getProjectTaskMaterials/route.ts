import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title")
      .eq("project_id", projectId)
      .single();

    if (projectError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project details.",
          details: projectError.message,
        },
        { status: 500 }
      );
    }

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select(`
        project_task_id,
        main_task_id,
        main_task:main_task_id (
          main_task_id,
          name
        )
      `)
      .eq("project_id", projectId);

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project tasks.",
          details: projectTasksError.message,
        },
        { status: 500 }
      );
    }

    const mappedProjectTasks = (projectTasks ?? []).map((row: any) => ({
      project_task_id: row.project_task_id,
      main_task_id: row.main_task_id ?? "",
      main_task_name: row.main_task?.name ?? "Main Task",
    }));

    const projectTaskIds = mappedProjectTasks.map((row) => row.project_task_id);

    if (projectTaskIds.length === 0) {
      return NextResponse.json({
        project,
        projectTasks: [],
        materials: [],
      });
    }

    const { data, error } = await supabaseAdmin
        .from("project_task_material")
        .select(`
            project_task_material_id,
            project_task_id,
            estimated_quantity,
            estimated_cost,
            material:material_id (
            material_id,
            name,
            unit_cost
            ),
            project_task:project_task_id (
            project_task_id,
            main_task_id,
            main_task:main_task_id (
                main_task_id,
                name
            )
            )
        `)
        .in("project_task_id", projectTaskIds);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch project task materials.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const materials = (data ?? []).map((row: any) => ({
        project_task_material_id: row.project_task_material_id,
        project_task_id: row.project_task_id,
        main_task_id: row.project_task?.main_task_id ?? "",
        main_task_name: row.project_task?.main_task?.name ?? "",
        material_id: row.material?.material_id ?? "",
        material_name: row.material?.name ?? "",
        material_unit_cost: Number(row.material?.unit_cost ?? 0),
        quantity: row.estimated_quantity ?? 0,
        estimated_cost: row.estimated_cost ?? 0,
    }));

    return NextResponse.json({
      project,
      projectTasks: mappedProjectTasks,
      materials,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching project task materials.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
