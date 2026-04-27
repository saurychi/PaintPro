import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select(
        `
        project_id,
        project_code,
        title,
        description,
        site_address,
        status,
        estimated_budget,
        estimated_cost,
        estimated_profit,
        created_at,
        updated_at,
        client_id,
        clients:client_id (
          client_id,
          full_name,
          email,
          phone
        )
      `,
      )
      .eq("status", "quotation_pending")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("getPendingQuotations error:", error);

      return NextResponse.json(
        {
          error: "Failed to fetch pending quotations.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      projects: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error.";

    console.error("getPendingQuotations unexpected error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch pending quotations.",
        details: message,
      },
      { status: 500 },
    );
  }
}
