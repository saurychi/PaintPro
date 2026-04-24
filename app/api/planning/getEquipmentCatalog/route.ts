import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("equipment")
      .select(`
        equipment_id,
        name,
        unit_cost,
        condition,
        location,
        status
      `)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch equipment catalog." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      equipment: (data ?? []).map((item) => ({
        id: item.equipment_id,
        name: item.name,
        unitCost: Number(item.unit_cost ?? 0),
        condition: item.condition ?? "",
        location: item.location ?? "",
        status: item.status ?? "",
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected error while fetching equipment catalog." },
      { status: 500 },
    );
  }
}
