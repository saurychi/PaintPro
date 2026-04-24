import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type ProjectScheduleRow = {
  start_datetime: string | null
  end_datetime: string | null
  status: string | null
}

function enumerateDates(startIso: string, endIso: string) {
  const result: string[] = []

  const start = new Date(startIso)
  const end = new Date(endIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return result
  }

  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)

  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)

  while (cursor <= endDay) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("project_schedule")
    .select("start_datetime, end_datetime, status")
    .not("start_datetime", "is", null)
    .not("end_datetime", "is", null)

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to load unavailable schedule dates.",
        details: error.message,
      },
      { status: 500 }
    )
  }

  const blockedStatuses = new Set([
    "scheduled",
    "in_progress",
    "pending",
    "rescheduled",
  ])

  const unavailableDateSet = new Set<string>()

  for (const row of ((data ?? []) as ProjectScheduleRow[])) {
    const status = String(row.status || "").trim().toLowerCase()

    if (!blockedStatuses.has(status)) continue
    if (!row.start_datetime || !row.end_datetime) continue

    for (const day of enumerateDates(row.start_datetime, row.end_datetime)) {
      unavailableDateSet.add(day)
    }
  }

  return NextResponse.json({
    unavailableDates: Array.from(unavailableDateSet).sort(),
  })
}
