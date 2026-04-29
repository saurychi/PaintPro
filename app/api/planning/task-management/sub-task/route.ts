import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeSortOrder,
  parseStringArray,
  type TaskManagementSubTask,
} from "@/lib/taskManagement";

type SubTaskRow = {
  sub_task_id: string;
  main_task_id: string | null;
  description: string | null;
  is_active: boolean | null;
  replaced_by_sub_task_id: string | null;
  default_equipment: unknown;
  default_materials: unknown;
  default_sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawSubTaskInput = {
  subTaskId?: unknown;
  mainTaskId?: unknown;
  description?: unknown;
  isActive?: unknown;
  replacedBySubTaskId?: unknown;
  defaultEquipment?: unknown;
  defaultMaterials?: unknown;
  defaultSortOrder?: unknown;
};

function mapSubTask(row: SubTaskRow): TaskManagementSubTask {
  return {
    sub_task_id: row.sub_task_id,
    main_task_id: String(row.main_task_id ?? "").trim(),
    description: String(row.description ?? "").trim(),
    is_active: row.is_active !== false,
    replaced_by_sub_task_id: row.replaced_by_sub_task_id ?? null,
    default_equipment: parseStringArray(row.default_equipment),
    default_materials: parseStringArray(row.default_materials),
    default_sort_order: normalizeSortOrder(row.default_sort_order),
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

function parseIdArray(value: unknown) {
  return parseStringArray(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawSubTasks = Array.isArray(body?.subTasks) ? body.subTasks : [];

    if (!rawSubTasks.length) {
      return NextResponse.json(
        { error: "No subtasks were provided." },
        { status: 400 },
      );
    }

    const savedSubTasks: TaskManagementSubTask[] = [];

    for (const rawItem of rawSubTasks as RawSubTaskInput[]) {
      const subTaskId =
        typeof rawItem?.subTaskId === "string" && rawItem.subTaskId.trim()
          ? rawItem.subTaskId.trim()
          : null;
      const mainTaskId =
        typeof rawItem?.mainTaskId === "string" ? rawItem.mainTaskId.trim() : "";
      const description =
        typeof rawItem?.description === "string"
          ? rawItem.description.trim()
          : "";
      const isActive = rawItem?.isActive !== false;
      const replacedBySubTaskId =
        typeof rawItem?.replacedBySubTaskId === "string" &&
        rawItem.replacedBySubTaskId.trim()
          ? rawItem.replacedBySubTaskId.trim()
          : null;
      const defaultSortOrder = parseSortOrder(rawItem?.defaultSortOrder);
      const defaultEquipment = parseIdArray(rawItem?.defaultEquipment);
      const defaultMaterials = parseIdArray(rawItem?.defaultMaterials);

      if (!mainTaskId) {
        return NextResponse.json(
          { error: "Each subtask must include a mainTaskId." },
          { status: 400 },
        );
      }

      if (!description) {
        return NextResponse.json(
          { error: "Each subtask must include a description." },
          { status: 400 },
        );
      }

      if (Number.isNaN(defaultSortOrder)) {
        return NextResponse.json(
          { error: `Invalid default sort order for "${description}".` },
          { status: 400 },
        );
      }

      if (subTaskId && replacedBySubTaskId === subTaskId) {
        return NextResponse.json(
          { error: `"${description}" cannot replace itself.` },
          { status: 400 },
        );
      }

      const payload = {
        main_task_id: mainTaskId,
        description,
        is_active: isActive,
        replaced_by_sub_task_id: replacedBySubTaskId,
        default_equipment: defaultEquipment,
        default_materials: defaultMaterials,
        default_sort_order: defaultSortOrder,
      };

      const query = subTaskId
        ? supabaseAdmin
            .from("sub_task")
            .update(payload)
            .eq("sub_task_id", subTaskId)
        : supabaseAdmin.from("sub_task").insert(payload);

      const { data, error } = await query
        .select(
          "sub_task_id, main_task_id, description, is_active, replaced_by_sub_task_id, default_equipment, default_materials, default_sort_order, created_at, updated_at",
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          {
            error: subTaskId
              ? `Failed to save "${description}".`
              : `Failed to create "${description}".`,
            details: error?.message,
          },
          { status: 500 },
        );
      }

      savedSubTasks.push(mapSubTask(data as SubTaskRow));
    }

    return NextResponse.json({
      success: true,
      subTasks: savedSubTasks,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving subtasks.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
