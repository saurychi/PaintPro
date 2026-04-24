import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function toSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, username, email, specialty, status")
      .eq("role", "staff")
      .eq("status", "active")
      .order("username", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to load active staff users.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      staffUsers: (data ?? []).map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        specialties: toSpecialties(row.specialty),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
