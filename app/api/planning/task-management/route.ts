import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeSortOrder,
  parseStringArray,
  sortMainTasks,
  type TaskManagementMainTask,
  type TaskManagementResourceOption,
  type TaskManagementSubTask,
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

type MaterialRow = {
  material_id: string;
  name: string | null;
  unit_cost: number | string | null;
};

type EquipmentRow = {
  equipment_id: string;
  name: string | null;
  status: string | null;
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

export async function GET() {
  try {
    const [
      mainTasksResult,
      subTasksResult,
      materialsResult,
      equipmentResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("main_task")
        .select(
          "main_task_id, name, is_active, default_sort_order, replaced_by_main_task_id, created_at, updated_at",
        )
        .order("default_sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("sub_task")
        .select(
          "sub_task_id, main_task_id, description, is_active, replaced_by_sub_task_id, default_equipment, default_materials, default_sort_order, created_at, updated_at",
        )
        .order("default_sort_order", { ascending: true, nullsFirst: false })
        .order("description", { ascending: true }),
      supabaseAdmin
        .from("materials")
        .select("material_id, name, unit_cost")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("equipment")
        .select("equipment_id, name, status")
        .order("name", { ascending: true }),
    ]);

    if (mainTasksResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch main tasks.",
          details: mainTasksResult.error.message,
        },
        { status: 500 },
      );
    }

    if (subTasksResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch subtasks.",
          details: subTasksResult.error.message,
        },
        { status: 500 },
      );
    }

    if (materialsResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch materials.",
          details: materialsResult.error.message,
        },
        { status: 500 },
      );
    }

    if (equipmentResult.error) {
      return NextResponse.json(
        {
          error: "Failed to fetch equipment.",
          details: equipmentResult.error.message,
        },
        { status: 500 },
      );
    }

    const mainTasks = sortMainTasks(
      ((mainTasksResult.data ?? []) as MainTaskRow[])
        .map(mapMainTask)
        .filter((task) => task.main_task_id && task.name),
    );

    const mainTaskOrder = new Map(
      mainTasks.map((task, index) => [task.main_task_id, index]),
    );

    const subTasks = [...((subTasksResult.data ?? []) as SubTaskRow[])]
      .map(mapSubTask)
      .filter((task) => task.sub_task_id && task.main_task_id && task.description)
      .sort((a, b) => {
        const mainGap =
          (mainTaskOrder.get(a.main_task_id) ?? Number.MAX_SAFE_INTEGER) -
          (mainTaskOrder.get(b.main_task_id) ?? Number.MAX_SAFE_INTEGER);

        if (mainGap !== 0) return mainGap;

        const subGap =
          Number(a.default_sort_order ?? 0) - Number(b.default_sort_order ?? 0);
        if (subGap !== 0) return subGap;

        return a.description.localeCompare(b.description);
      });

    const materialOptions: TaskManagementResourceOption[] = (
      (materialsResult.data ?? []) as MaterialRow[]
    )
      .filter((item) => item.material_id && item.name)
      .map((item) => ({
        id: item.material_id,
        name: String(item.name ?? "").trim(),
        meta:
          item.unit_cost === null || item.unit_cost === undefined
            ? null
            : `Unit cost: P${Number(item.unit_cost ?? 0).toFixed(2)}`,
      }));

    const equipmentOptions: TaskManagementResourceOption[] = (
      (equipmentResult.data ?? []) as EquipmentRow[]
    )
      .filter((item) => item.equipment_id && item.name)
      .map((item) => ({
        id: item.equipment_id,
        name: String(item.name ?? "").trim(),
        meta: item.status?.trim() || null,
      }));

    return NextResponse.json({
      mainTasks,
      subTasks,
      materialOptions,
      equipmentOptions,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while loading task management data.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
