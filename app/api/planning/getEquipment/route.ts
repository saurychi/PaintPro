import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type EquipmentOut = {
  equipment_id: string
  name: string
  status?: string
  condition?: string
  location?: string
}

type SuccessResponse = {
  taskName: string
  subTaskTitle: string | null
  equipment: EquipmentOut[]
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
  default_equipment: unknown
  is_active: boolean | null
}

type EquipmentRow = {
  equipment_id: string
  name: string | null
  status: string | null
  condition: string | null
  location: string | null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, arr) => arr.indexOf(value) === index)
}

function parseEquipmentIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .flatMap((item) => {
          if (typeof item === "string") return [item.trim()]
          if (isObj(item)) {
            const fromEquipmentId =
              typeof item.equipment_id === "string" ? item.equipment_id.trim() : ""
            const fromId = typeof item.id === "string" ? item.id.trim() : ""
            return [fromEquipmentId || fromId].filter(Boolean)
          }
          return []
        })
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
            .flatMap((item) => {
              if (typeof item === "string") return [item.trim()]
              if (isObj(item)) {
                const fromEquipmentId =
                  typeof item.equipment_id === "string" ? item.equipment_id.trim() : ""
                const fromId = typeof item.id === "string" ? item.id.trim() : ""
                return [fromEquipmentId || fromId].filter(Boolean)
              }
              return []
            })
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
  try {
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

    const { data: mainTaskRows, error: mainTaskError } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id, name, is_active")
      .ilike("name", taskName)
      .eq("is_active", true)
      .limit(1)

    if (mainTaskError) {
      return NextResponse.json(
        {
          error: "Failed to fetch main task.",
          details: mainTaskError.message,
        },
        { status: 500 }
      )
    }

    const mainTaskRow = ((mainTaskRows ?? []) as MainTaskRow[])[0] ?? null

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
        .select("sub_task_id, main_task_id, description, default_equipment, is_active")
        .eq("main_task_id", mainTaskRow.main_task_id)
        .ilike("description", subTaskTitle)
        .eq("is_active", true)

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to fetch sub task equipment.",
            details: error.message,
          },
          { status: 500 }
        )
      }

      subTaskRows = (data ?? []) as SubTaskRow[]
    } else {
      const { data, error } = await supabaseAdmin
        .from("sub_task")
        .select("sub_task_id, main_task_id, description, default_equipment, is_active")
        .eq("main_task_id", mainTaskRow.main_task_id)
        .eq("is_active", true)

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to fetch task equipment.",
            details: error.message,
          },
          { status: 500 }
        )
      }

      subTaskRows = (data ?? []) as SubTaskRow[]
    }

    const equipmentIds = uniqueStrings(
      subTaskRows.flatMap((row) => parseEquipmentIds(row.default_equipment))
    )

    if (!equipmentIds.length) {
      const response: SuccessResponse = {
        taskName,
        subTaskTitle,
        equipment: [],
      }

      return NextResponse.json(response)
    }

    const { data: equipmentRows, error: equipmentError } = await supabaseAdmin
      .from("equipment")
      .select("equipment_id, name, status, condition, location")
      .in("equipment_id", equipmentIds)

    if (equipmentError) {
      return NextResponse.json(
        {
          error: "Failed to fetch equipment records.",
          details: equipmentError.message,
        },
        { status: 500 }
      )
    }

    const equipment: EquipmentOut[] = ((equipmentRows ?? []) as EquipmentRow[])
      .filter((row) => row.equipment_id && row.name)
      .sort((a, b) => {
        const aIndex = equipmentIds.indexOf(a.equipment_id)
        const bIndex = equipmentIds.indexOf(b.equipment_id)
        return aIndex - bIndex
      })
      .map((row) => ({
        equipment_id: row.equipment_id,
        name: row.name?.trim() ?? "",
        status: row.status?.trim() || undefined,
        condition: row.condition?.trim() || undefined,
        location: row.location?.trim() || undefined,
      }))

    const response: SuccessResponse = {
      taskName,
      subTaskTitle,
      equipment,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Unexpected getEquipment error:", error)

    return NextResponse.json(
      {
        error: "Unexpected error while loading equipment.",
        details: error?.message || "Unknown server error.",
      },
      { status: 500 }
    )
  }
}
