import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import {
  findOverlappingAssignments,
  getStaffActiveAssignments,
} from "@/lib/schedule/staffAssignmentConflicts"

export async function POST(request: NextRequest) {
  const token = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim()

  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const startDatetime =
    typeof (body as any)?.startDatetime === "string"
      ? (body as any).startDatetime.trim()
      : ""
  const endDatetime =
    typeof (body as any)?.endDatetime === "string"
      ? (body as any).endDatetime.trim()
      : null
  const reason =
    typeof (body as any)?.reason === "string" ? (body as any).reason.trim() : ""

  if (!startDatetime) {
    return NextResponse.json({ error: "Start date is required." }, { status: 400 })
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 })
  }

  const effectiveEnd = endDatetime || startDatetime

  let conflicts: Awaited<ReturnType<typeof getStaffActiveAssignments>> = []
  try {
    const assignments = await getStaffActiveAssignments(user.id)
    conflicts = findOverlappingAssignments(
      assignments,
      startDatetime,
      effectiveEnd,
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to check existing assignments.", details: message },
      { status: 500 },
    )
  }

  if (conflicts.length > 0) {
    const first = conflicts[0]
    const projectLabel =
      first.projectCode || first.projectTitle || "an assignment"
    return NextResponse.json(
      {
        error: `You're assigned to ${projectLabel} during this window. Pick a time with no assignments.`,
        conflicts: conflicts.map((c) => ({
          projectId: c.projectId,
          projectCode: c.projectCode,
          projectTitle: c.projectTitle,
          subtaskTitle: c.subtaskTitle,
          startDatetime: c.startDatetime,
          endDatetime: c.endDatetime,
        })),
      },
      { status: 409 },
    )
  }

  const { data, error } = await supabaseAdmin
    .from("staff_unavailability")
    .insert({
      user_id: user.id,
      start_datetime: startDatetime,
      end_datetime: effectiveEnd,
      reason,
      status: "pending",
      created_at: new Date().toISOString(),
    })
    .select("unavailability_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, unavailabilityId: data.unavailability_id })
}
