import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select(
        "id, username, email, phone, specialty, status, role, hourly_wage",
      )
      .in("role", ["staff", "manager"])
      .order("username", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch staff." }, { status: 500 })
    }

    return NextResponse.json({ staff: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 })
  }
}

// PATCH /api/admin/staff
// Body: { userId: string, specialty?: string, hourlyWage?: number | null }
// Updates whichever of `specialty` / `hourly_wage` are present in the
// payload. Either field is independently optional so callers (specialty
// modal, profile-card wage input) can patch only what they're editing.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""

    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (Object.prototype.hasOwnProperty.call(body, "specialty")) {
      const specialty =
        typeof body.specialty === "string" ? body.specialty.trim() : null
      updates.specialty =
        specialty && specialty.length > 0 ? specialty : null
    }

    if (Object.prototype.hasOwnProperty.call(body, "hourlyWage")) {
      const raw = body.hourlyWage
      if (raw === null || raw === "") {
        updates.hourly_wage = null
      } else {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed) || parsed < 0) {
          return NextResponse.json(
            { error: "hourlyWage must be a non-negative number." },
            { status: 400 },
          )
        }
        updates.hourly_wage = parsed
      }
    }

    // Guard against an "update with only updated_at" no-op (which would
    // bump updated_at without changing anything meaningful).
    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", userId)
      .in("role", ["staff", "manager"])
      .select("id, specialty, hourly_wage")
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: "Failed to update staff.", details: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: "Staff member was not found." },
        { status: 404 },
      )
    }

    return NextResponse.json({ user: data })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 },
    )
  }
}
