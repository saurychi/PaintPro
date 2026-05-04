import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type EquipmentOut = {
  equipment_id: string
  name: string
  status?: string
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
      // No matching main_task in the catalog — return empty equipment instead
      // of a 404 so a single unmapped task name doesn't abort the whole flow.
      const response: SuccessResponse = {
        taskName,
        subTaskTitle,
        equipment: [],
      }
      return NextResponse.json(response)
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

    const equipmentRefs = uniqueStrings(
      subTaskRows.flatMap((row) => parseEquipmentIds(row.default_equipment))
    )

    if (!equipmentRefs.length) {
      const response: SuccessResponse = {
        taskName,
        subTaskTitle,
        equipment: [],
      }

      return NextResponse.json(response)
    }

    // sub_task.default_equipment may hold either uuids (equipment_id) or
    // free-form names (legacy / catalog items not yet linked). Postgres rejects
    // non-uuid strings on a uuid column, so split and look up each shape
    // separately to keep the route from 500-ing.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const idRefs = equipmentRefs.filter((ref) => UUID_RE.test(ref))
    const nameRefs = equipmentRefs.filter((ref) => !UUID_RE.test(ref))

    const equipmentRows: EquipmentRow[] = []

    if (idRefs.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("equipment")
        .select("equipment_id, name, status, location")
        .in("equipment_id", idRefs)

      if (error) {
        console.error("getEquipment id lookup failed:", error)
      } else if (data) {
        equipmentRows.push(...(data as EquipmentRow[]))
      }
    }

    if (nameRefs.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("equipment")
        .select("equipment_id, name, status, location")
        .in("name", nameRefs)

      if (error) {
        console.error("getEquipment name lookup failed:", error)
      } else if (data) {
        equipmentRows.push(...(data as EquipmentRow[]))
      }
    }

    const seen = new Set<string>()
    const equipment: EquipmentOut[] = equipmentRows
      .filter((row) => {
        if (!row.equipment_id || !row.name) return false
        if (seen.has(row.equipment_id)) return false
        seen.add(row.equipment_id)
        return true
      })
      .sort((a, b) => {
        const aRef = a.equipment_id
        const bRef = b.equipment_id
        const aName = (a.name ?? "").trim()
        const bName = (b.name ?? "").trim()
        const aIndex =
          equipmentRefs.indexOf(aRef) === -1
            ? equipmentRefs.indexOf(aName)
            : equipmentRefs.indexOf(aRef)
        const bIndex =
          equipmentRefs.indexOf(bRef) === -1
            ? equipmentRefs.indexOf(bName)
            : equipmentRefs.indexOf(bRef)
        return aIndex - bIndex
      })
      .map((row) => ({
        equipment_id: row.equipment_id,
        name: row.name?.trim() ?? "",
        status: row.status?.trim() || undefined,
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
