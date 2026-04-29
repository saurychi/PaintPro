import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  estimateDurationForSubTask,
  type SubTaskDurationEstimate,
} from "@/lib/planning/durationEstimator";
import {
  computeAreasFromDimensions,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator";

type SuccessResponse = {
  mainTaskId: string;
  subTaskId: string;
  duration: SubTaskDurationEstimate;
};

type MainTaskRow = { main_task_id: string };
type SubTaskRow = { sub_task_id: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isObj(body)) {
    return NextResponse.json({ error: "Invalid body shape." }, { status: 400 });
  }

  const dimensions: ProjectDimensions | null =
    "dimensions" in body
      ? ((body.dimensions as ProjectDimensions | null) ?? null)
      : null;

  let mainTaskId =
    typeof body.mainTaskId === "string" ? body.mainTaskId.trim() : "";
  let subTaskId =
    typeof body.subTaskId === "string" ? body.subTaskId.trim() : "";

  // Name-based fallback — resolve IDs the same way getMaterials does
  if (!mainTaskId) {
    const taskName =
      typeof body.taskName === "string" ? body.taskName.trim() : "";
    if (!taskName) {
      return NextResponse.json(
        { error: "Missing mainTaskId or taskName." },
        { status: 400 },
      );
    }

    const { data: mainRow, error: mainErr } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id")
      .eq("name", taskName)
      .eq("is_active", true)
      .maybeSingle<MainTaskRow>();

    if (mainErr) {
      return NextResponse.json(
        { error: `Failed to look up main task: ${mainErr.message}` },
        { status: 500 },
      );
    }
    if (!mainRow?.main_task_id) {
      return NextResponse.json(
        { error: `No active main task found for name "${taskName}".` },
        { status: 404 },
      );
    }

    mainTaskId = mainRow.main_task_id;
  }

  if (!subTaskId) {
    const subTaskTitle =
      typeof body.subTaskTitle === "string" ? body.subTaskTitle.trim() : "";
    if (!subTaskTitle) {
      return NextResponse.json(
        { error: "Missing subTaskId or subTaskTitle." },
        { status: 400 },
      );
    }

    const { data: subRow, error: subErr } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id")
      .eq("main_task_id", mainTaskId)
      .eq("description", subTaskTitle)
      .eq("is_active", true)
      .maybeSingle<SubTaskRow>();

    if (subErr) {
      return NextResponse.json(
        { error: `Failed to look up sub task: ${subErr.message}` },
        { status: 500 },
      );
    }
    if (!subRow?.sub_task_id) {
      return NextResponse.json(
        { error: `No active sub task found for title "${subTaskTitle}".` },
        { status: 404 },
      );
    }

    subTaskId = subRow.sub_task_id;
  }

  const areas = computeAreasFromDimensions(dimensions);

  let duration: SubTaskDurationEstimate;

  try {
    duration = await estimateDurationForSubTask({ mainTaskId, subTaskId, areas });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to estimate duration." },
      { status: 422 },
    );
  }

  const response: SuccessResponse = { mainTaskId, subTaskId, duration };

  return NextResponse.json(response);
}
