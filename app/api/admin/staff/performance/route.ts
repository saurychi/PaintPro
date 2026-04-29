import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Numeric scale for averaging ratings
const RATING_NUM: Record<string, number> = { great: 4, good: 3, bad: 2, awful: 1 }
// Bar width % for display
const RATING_SCORE: Record<string, number> = { great: 90, good: 70, bad: 40, awful: 20 }

function numToRating(n: number): string {
  if (n >= 3.5) return "great"
  if (n >= 2.5) return "good"
  if (n >= 1.5) return "bad"
  return "awful"
}

function avgRating(ratings: (string | null)[]): string | null {
  const nums = ratings
    .map((r) => (r ? RATING_NUM[r.toLowerCase().trim()] : null))
    .filter((n): n is number => n !== null)
  if (nums.length === 0) return null
  return numToRating(nums.reduce((a, b) => a + b, 0) / nums.length)
}

const METRIC_KEYS = [
  { key: "work_quality",    metric: "Work Quality" },
  { key: "time_efficiency", metric: "Time Efficiency" },
  { key: "teamwork",        metric: "Teamwork" },
  { key: "work_ethic",      metric: "Work Ethic" },
] as const

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")?.trim()

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    const { data, error } = await supabaseAdmin
      .from("employee_performance")
      .select("work_quality, time_efficiency, teamwork, work_ethic, total_estimated_hours")
      .eq("user_id", userId)

    if (error || !data || data.length === 0) {
      return NextResponse.json({
        hasData: false,
        cards: METRIC_KEYS.map(({ key, metric }) => ({ key, metric, rating: null, score: 0 })),
        projectCount: 0,
        totalHours: 0,
      })
    }

    const cards = METRIC_KEYS.map(({ key, metric }) => {
      const ratings = data.map((r) => (r as any)[key] as string | null)
      const rating = avgRating(ratings)
      const score = rating ? (RATING_SCORE[rating] ?? 0) : 0
      return { key, metric, rating, score }
    })

    const totalHours = data.reduce((sum, r) => sum + (r.total_estimated_hours ?? 0), 0)

    return NextResponse.json({
      hasData: true,
      cards,
      projectCount: data.length,
      totalHours: Math.round(totalHours * 10) / 10,
    })
  } catch {
    return NextResponse.json({
      hasData: false,
      cards: METRIC_KEYS.map(({ key, metric }) => ({ key, metric, rating: null, score: 0 })),
      projectCount: 0,
      totalHours: 0,
    })
  }
}
