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

    const { data: projectTasks, error: projectTasksError } = await supabaseAdmin
      .from("project_task")
      .select(`
        project_task_id,
        main_task_id,
        main_task:main_task_id (
          main_task_id,
          name,
          sort_order
        )
      `)
      .eq("project_id", projectId);

    if (projectTasksError) {
      return NextResponse.json(
        {
          error: "Failed to fetch project main tasks.",
          details: projectTasksError.message,
        },
        { status: 500 }
      );
    }

    const mainTaskIds = Array.from(
      new Set((projectTasks ?? []).map((row) => row.main_task_id).filter(Boolean))
    );

    if (mainTaskIds.length === 0) {
      return NextResponse.json({
        catalog: [],
      });
    }

    const { data: subTasks, error: subTasksError } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, main_task_id, description, sort_order")
      .in("main_task_id", mainTaskIds)
      .order("sort_order", { ascending: true });

    if (subTasksError) {
      return NextResponse.json(
        {
          error: "Failed to fetch sub task catalog.",
          details: subTasksError.message,
        },
        { status: 500 }
      );
    }

    const groupedCatalog = [...(projectTasks ?? [])]
      .sort((a: any, b: any) => {
        const aSort = Number(a?.main_task?.sort_order ?? 0);
        const bSort = Number(b?.main_task?.sort_order ?? 0);
        if (aSort !== bSort) return aSort - bSort;

        const aName = String(a?.main_task?.name ?? "");
        const bName = String(b?.main_task?.name ?? "");
        return aName.localeCompare(bName);
      })
      .map((projectTaskRow: any) => {
        const mainTask = projectTaskRow.main_task;

        return {
          mainTaskId: projectTaskRow.main_task_id,
          mainTaskTitle: mainTask?.name ?? "",
          mainTaskSortOrder: Number(mainTask?.sort_order ?? 0),
          subTasks: (subTasks ?? [])
            .filter(
              (subTaskRow: any) =>
                subTaskRow.main_task_id === projectTaskRow.main_task_id,
            )
            .map((subTaskRow: any) => ({
              id: subTaskRow.sub_task_id,
              name: subTaskRow.description,
              sortOrder: Number(subTaskRow.sort_order ?? 0),
            }))
            .sort((a: any, b: any) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.name.localeCompare(b.name);
            }),
        };
      });

    return NextResponse.json({
      catalog: groupedCatalog,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching sub task catalog.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
