import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/getSubTasksByMainTask?mainTaskIds=id1,id2
//
// Returns active sub_task rows keyed off main_task_id, independent of
// any project_task linkage. Used by the manual-mode wizard flow so the
// admin's just-added main tasks can be seeded with their catalog
// subtasks before any DB rows exist for the project.
//
// /api/planning/getProjectMainTaskSubTaskCatalog covers the AI flow
// (it joins through project_task) — this endpoint covers the case
// where there's nothing in project_task yet.

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("mainTaskIds") ?? "";
    const ids = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ subTasks: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("sub_task")
      .select(
        "sub_task_id, main_task_id, description, sort_order:default_sort_order, is_active",
      )
      .in("main_task_id", ids)
      .eq("is_active", true)
      .order("default_sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch sub task catalog.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    const subTasks = (data ?? []).map((row) => ({
      id: row.sub_task_id as string,
      mainTaskId: row.main_task_id as string,
      name: (row.description ?? "") as string,
      sortOrder: Number(row.sort_order ?? 0),
    }));

    return NextResponse.json({ subTasks });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching sub task catalog.",
        details: err?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
