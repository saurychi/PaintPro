import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    const sortOrderRaw =
      typeof body?.sortOrder === "string"
        ? body.sortOrder.trim()
        : String(body?.sortOrder ?? "");
    const subTasksInput = Array.isArray(body?.subTasks) ? body.subTasks : [];

    if (!name) {
      return NextResponse.json(
        { error: "Task name is required." },
        { status: 400 },
      );
    }

    if (!sortOrderRaw) {
      return NextResponse.json(
        { error: "Sort order is required." },
        { status: 400 },
      );
    }

    const sortOrder = Number(sortOrderRaw);

    if (Number.isNaN(sortOrder)) {
      return NextResponse.json(
        { error: "Sort order must be a number." },
        { status: 400 },
      );
    }

    const { data: mainTask, error: mainTaskError } = await supabaseAdmin
      .from("main_task")
      .insert({
        name,
        sort_order: sortOrder,
        is_active: true,
        base_price: 0,
      })
      .select("main_task_id, name, sort_order")
      .single();

    if (mainTaskError || !mainTask) {
      return NextResponse.json(
        {
          error: "Failed to create main task.",
          details: mainTaskError?.message,
        },
        { status: 500 },
      );
    }

    const subTasks = [];

    for (const item of subTasksInput) {
      const description =
        typeof item?.description === "string" ? item.description.trim() : "";

      if (!description) continue;

      const subSortOrder = Number(item?.sortOrder) || 0;
      const materialIds = Array.isArray(item?.materialIds)
        ? item.materialIds.filter(
            (id: unknown): id is string => typeof id === "string",
          )
        : [];
      const equipmentIds = Array.isArray(item?.equipmentIds)
        ? item.equipmentIds.filter(
            (id: unknown): id is string => typeof id === "string",
          )
        : [];

      const { data: subTask, error: subTaskError } = await supabaseAdmin
        .from("sub_task")
        .insert({
          main_task_id: mainTask.main_task_id,
          description,
          sort_order: subSortOrder,
          default_equipment: equipmentIds.length > 0 ? equipmentIds : null,
          default_materials: materialIds.length > 0 ? materialIds : null,
          is_active: true,
        })
        .select("sub_task_id, main_task_id, description, sort_order")
        .single();

      if (subTaskError) {
        return NextResponse.json(
          {
            error: `Failed to create sub task "${description}".`,
            details: subTaskError.message,
          },
          { status: 500 },
        );
      }

      if (subTask) subTasks.push(subTask);
    }

    return NextResponse.json({
      success: true,
      mainTask,
      subTasks,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating main task.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
