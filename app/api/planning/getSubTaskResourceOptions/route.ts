import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data: equipment, error: equipmentError } = await supabaseAdmin
      .from("equipment")
      .select("equipment_id, name, status")
      .order("name", { ascending: true });

    if (equipmentError) {
      return NextResponse.json(
        {
          error: "Failed to fetch equipment options.",
          details: equipmentError.message,
        },
        { status: 500 }
      );
    }

    const { data: materials, error: materialsError } = await supabaseAdmin
      .from("materials")
      .select("material_id, name, unit_cost")
      .order("name", { ascending: true });

    if (materialsError) {
      return NextResponse.json(
        {
          error: "Failed to fetch material options.",
          details: materialsError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      equipment:
        (equipment ?? []).map((item) => ({
          id: item.equipment_id,
          name: item.name,
          status: item.status,
        })) ?? [],
      materials:
        (materials ?? []).map((item) => ({
          id: item.material_id,
          name: item.name,
          unit_cost: Number(item.unit_cost ?? 0),
        })) ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while fetching sub task resource options.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
