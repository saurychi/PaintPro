import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type MaterialOut = {
  material_id: string
  name: string
  unit: string
  notes?: string
}

type SuccessResponse = {
  taskName: string
  subTaskTitle: string | null
  materials: MaterialOut[]
}

type MainTaskRow = {
  main_task_id: string
  name: string | null
  is_active: boolean | null
}

type SubTaskRow = {
  sub_task_id: string
  main_task_id: string | null
  description: string | null
  default_materials: unknown
  is_active: boolean | null
}

type MaterialRow = {
  material_id: string
  name: string | null
  unit: string | null
  notes: string | null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function norm(value: string) {
  return String(value || "").trim().toLowerCase()
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, arr) => arr.indexOf(value) === index)
}

function parseMaterialIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return uniqueStrings(
          parsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        )
      }
    } catch {
      return []
    }
  }

  return []
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
    typeof body.subTaskTitle === "string" && body.subTaskTitle.trim()
      ? body.subTaskTitle.trim()
      : null

  if (!taskName) {
    return NextResponse.json({ error: "Missing taskName." }, { status: 400 })
  }

  const { data: mainTaskRow, error: mainTaskError } = await supabaseAdmin
    .from("main_task")
    .select("main_task_id, name, is_active")
    .eq("name", taskName)
    .eq("is_active", true)
    .maybeSingle<MainTaskRow>()

  if (mainTaskError) {
    return NextResponse.json(
      {
        error: "Failed to fetch main task.",
        details: mainTaskError.message,
      },
      { status: 500 }
    )
  }

  if (!mainTaskRow?.main_task_id) {
    return NextResponse.json(
      {
        error: "Main task not found.",
        details: `No active main_task matched "${taskName}".`,
      },
      { status: 404 }
    )
  }

  let subTaskRows: SubTaskRow[] = []

  if (subTaskTitle) {
    const { data, error } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, main_task_id, description, default_materials, is_active")
      .eq("main_task_id", mainTaskRow.main_task_id)
      .eq("description", subTaskTitle)
      .eq("is_active", true)

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch sub task materials.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    subTaskRows = (data ?? []) as SubTaskRow[]
  } else {
    const { data, error } = await supabaseAdmin
      .from("sub_task")
      .select("sub_task_id, main_task_id, description, default_materials, is_active")
      .eq("main_task_id", mainTaskRow.main_task_id)
      .eq("is_active", true)

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch task materials.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    subTaskRows = (data ?? []) as SubTaskRow[]
  }

  const materialIds = uniqueStrings(
    subTaskRows.flatMap((row) => parseMaterialIds(row.default_materials))
  )

  if (!materialIds.length) {
    const response: SuccessResponse = {
      taskName,
      subTaskTitle,
      materials: [],
    }

    return NextResponse.json(response)
  }

  const { data: materialRows, error: materialError } = await supabaseAdmin
    .from("materials")
    .select("material_id, name, unit, notes")
    .in("material_id", materialIds)

  if (materialError) {
    return NextResponse.json(
      {
        error: "Failed to fetch material records.",
        details: materialError.message,
      },
      { status: 500 }
    )
  }

  const materials: MaterialOut[] = ((materialRows ?? []) as MaterialRow[])
    .filter((row) => row.material_id && row.name && row.unit)
    .sort((a, b) => {
      const aIndex = materialIds.indexOf(a.material_id)
      const bIndex = materialIds.indexOf(b.material_id)
      return aIndex - bIndex
    })
    .map((row) => ({
      material_id: row.material_id,
      name: row.name?.trim() ?? "",
      unit: row.unit?.trim() ?? "",
      notes: row.notes?.trim() || undefined,
    }))

  const response: SuccessResponse = {
    taskName,
    subTaskTitle,
    materials,
  }

  return NextResponse.json(response)
}
