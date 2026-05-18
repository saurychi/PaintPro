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
  // Optional date-range filter applied to employee_performance rows
  // via reviewed_at. When start/end are omitted, the endpoint
  // returns aggregated results across all reviews (lifetime view).
  const startParam = searchParams.get("start")?.trim() || null
  const endParam = searchParams.get("end")?.trim() || null

  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 })

  try {
    // Pull review rows and the user's current hourly wage in parallel.
    // hourly_wage feeds the Payroll panel even when no reviews exist,
    // so it's fetched regardless of the performance result.
    let perfQuery = supabaseAdmin
      .from("employee_performance")
      .select(
        "work_quality, time_efficiency, teamwork, work_ethic, total_estimated_hours, salary_amount, hourly_wage, reviewed_at",
      )
      .eq("user_id", userId)

    if (startParam) perfQuery = perfQuery.gte("reviewed_at", startParam)
    if (endParam) perfQuery = perfQuery.lte("reviewed_at", endParam)

    const [perfRes, userRes] = await Promise.all([
      perfQuery,
      supabaseAdmin
        .from("users")
        .select("hourly_wage")
        .eq("id", userId)
        .maybeSingle(),
    ])

    const hourlyWage = Number(userRes.data?.hourly_wage ?? 0)

    const data = perfRes.data
    if (perfRes.error || !data || data.length === 0) {
      return NextResponse.json({
        hasData: false,
        cards: METRIC_KEYS.map(({ key, metric }) => ({ key, metric, rating: null, score: 0, count: 0 })),
        projectCount: 0,
        totalHours: 0,
        totalSalary: 0,
        hourlyWage,
      })
    }

    const cards = METRIC_KEYS.map(({ key, metric }) => {
      const ratings = data.map((r) => (r as any)[key] as string | null)
      const rating = avgRating(ratings)
      const score = rating ? (RATING_SCORE[rating] ?? 0) : 0
      // Total reviewers who rated this metric. The bar shows the
      // averaged tier across these reviewers, so the count reflects
      // how many people contributed to that average (not how many
      // picked the displayed tier exactly — that can be 0 when the
      // average lands between tiers, e.g. one Great + one Bad → Good).
      const count = ratings.filter((r) => r && RATING_NUM[r.toLowerCase().trim()]).length
      return { key, metric, rating, score, count }
    })

    const totalHours = data.reduce((sum, r) => sum + (Number(r.total_estimated_hours) || 0), 0)
    const totalSalary = data.reduce((sum, r) => sum + (Number(r.salary_amount) || 0), 0)

    return NextResponse.json({
      hasData: true,
      cards,
      projectCount: data.length,
      totalHours: Math.round(totalHours * 10) / 10,
      totalSalary: Math.round(totalSalary * 100) / 100,
      hourlyWage,
    })
  } catch {
    return NextResponse.json({
      hasData: false,
      cards: METRIC_KEYS.map(({ key, metric }) => ({ key, metric, rating: null, score: 0 })),
      projectCount: 0,
      totalHours: 0,
      totalSalary: 0,
      hourlyWage: 0,
    })
  }
}
