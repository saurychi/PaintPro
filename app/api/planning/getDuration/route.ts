import { NextResponse } from "next/server"
import {
  estimateDurationForSubTask,
  type SubTaskDurationEstimate,
} from "@/lib/planning/durationEstimator"
import {
  computeAreasFromDimensions,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator"

type SuccessResponse = {
  taskName: string
  subTaskTitle: string
  duration: SubTaskDurationEstimate
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!isObj(body)) {
    return NextResponse.json({ error: "Invalid body shape." }, { status: 400 })
  }

  const taskName =
    typeof body.taskName === "string" ? body.taskName.trim() : ""

  const subTaskTitle =
    typeof body.subTaskTitle === "string" ? body.subTaskTitle.trim() : ""

  const dimensions: ProjectDimensions | null =
    "dimensions" in body ? ((body.dimensions as ProjectDimensions | null) ?? null) : null

  if (!taskName) {
    return NextResponse.json({ error: "Missing taskName." }, { status: 400 })
  }

  if (!subTaskTitle) {
    return NextResponse.json({ error: "Missing subTaskTitle." }, { status: 400 })
  }

  const areas = computeAreasFromDimensions(dimensions)

  const duration = estimateDurationForSubTask({
    taskName,
    subTaskTitle,
    areas,
  })

  const response: SuccessResponse = {
    taskName,
    subTaskTitle,
    duration,
  }

  return NextResponse.json(response)
}
