import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("client_id, full_name, phone, email, address, notes")
      .order("full_name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      clients: data ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to load clients.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
