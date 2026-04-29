import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const mainTaskId = body?.mainTaskId as string | undefined;
    const description = body?.description as string | undefined;
    const sortOrderRaw = body?.sortOrder as string | undefined;
    const defaultEquipmentIds = Array.isArray(body?.defaultEquipmentIds)
      ? body.defaultEquipmentIds.filter((item: unknown): item is string => typeof item === "string")
      : [];
    const defaultMaterialIds = Array.isArray(body?.defaultMaterialIds)
      ? body.defaultMaterialIds.filter((item: unknown): item is string => typeof item === "string")
      : [];

    if (!mainTaskId) {
      return NextResponse.json(
        { error: "Missing mainTaskId." },
        { status: 400 }
      );
    }

    if (!description?.trim()) {
      return NextResponse.json(
        { error: "Description is required." },
        { status: 400 }
      );
    }

    if (!sortOrderRaw?.trim()) {
      return NextResponse.json(
        { error: "Sort order is required." },
        { status: 400 }
      );
    }

    const sortOrder = Number(sortOrderRaw);

    if (Number.isNaN(sortOrder)) {
      return NextResponse.json(
        { error: "Sort order must be a number." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("sub_task")
      .insert({
        main_task_id: mainTaskId,
        description: description.trim(),
        default_sort_order: sortOrder,
        default_equipment: defaultEquipmentIds.length > 0 ? defaultEquipmentIds : null,
        default_materials: defaultMaterialIds.length > 0 ? defaultMaterialIds : null,
        is_active: true,
      })
      .select(
        "sub_task_id, main_task_id, description, sort_order:default_sort_order, default_equipment, default_materials",
      )
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to create sub task.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      subTask: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating sub task.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
