import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Statuses that mean the task/assignment is fully resolved
const TERMINAL = new Set([
  "completed", "cancelled", "done", "finished", "rejected", "archived",
])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")?.trim()

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    const { data, error } = await supabaseAdmin
      .from("project_sub_task_staff")
      .select("project_sub_task_id, assignment_status")
      .eq("user_id", userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const active = (data ?? []).filter(
      (a) => !TERMINAL.has((a.assignment_status ?? "").toLowerCase()),
    )

    return NextResponse.json({ hasActiveAssignments: active.length > 0, count: active.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
