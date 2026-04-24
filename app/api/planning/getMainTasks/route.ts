import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("main_task")
      .select("main_task_id, name, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch main tasks.",
          details: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      mainTasks: data ?? [],
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching main tasks.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
