import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeSortOrder,
  type TaskManagementMainTask,
} from "@/lib/taskManagement";

type MainTaskRow = {
  main_task_id: string;
  name: string | null;
  is_active: boolean | null;
  default_sort_order: number | null;
  replaced_by_main_task_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapMainTask(row: MainTaskRow): TaskManagementMainTask {
  return {
    main_task_id: row.main_task_id,
    name: String(row.name ?? "").trim(),
    is_active: row.is_active !== false,
    default_sort_order: normalizeSortOrder(row.default_sort_order),
    replaced_by_main_task_id: row.replaced_by_main_task_id ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function parseSortOrder(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const mainTaskId =
      typeof body?.mainTaskId === "string" && body.mainTaskId.trim()
        ? body.mainTaskId.trim()
        : null;
    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    const isActive = body?.isActive !== false;
    const defaultSortOrder = parseSortOrder(body?.defaultSortOrder);
    const replacedByMainTaskId =
      typeof body?.replacedByMainTaskId === "string" &&
      body.replacedByMainTaskId.trim()
        ? body.replacedByMainTaskId.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        { error: "Main task name is required." },
        { status: 400 },
      );
    }

    if (Number.isNaN(defaultSortOrder)) {
      return NextResponse.json(
        { error: "Default sort order must be a valid number." },
        { status: 400 },
      );
    }

    if (mainTaskId && replacedByMainTaskId === mainTaskId) {
      return NextResponse.json(
        { error: "A main task cannot replace itself." },
        { status: 400 },
      );
    }

    const payload = {
      name,
      is_active: isActive,
      default_sort_order: defaultSortOrder,
      replaced_by_main_task_id: replacedByMainTaskId,
    };

    const query = mainTaskId
      ? supabaseAdmin
          .from("main_task")
          .update(payload)
          .eq("main_task_id", mainTaskId)
      : supabaseAdmin.from("main_task").insert(payload);

    const { data, error } = await query
      .select(
        "main_task_id, name, is_active, default_sort_order, replaced_by_main_task_id, created_at, updated_at",
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error: mainTaskId
            ? "Failed to save main task."
            : "Failed to create main task.",
          details: error?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      mainTask: mapMainTask(data as MainTaskRow),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving main task.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
