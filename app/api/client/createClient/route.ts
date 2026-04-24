import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const full_name = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const address = String(body?.address || "").trim();
    const notes =
      body?.notes === null || body?.notes === undefined
        ? null
        : String(body.notes).trim();

    if (!full_name) {
      return NextResponse.json(
        { error: "Client name is required." },
        { status: 400 }
      );
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid client email is required." },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Client phone is required." },
        { status: 400 }
      );
    }

    if (!address) {
      return NextResponse.json(
        { error: "Client address is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        full_name,
        email,
        phone,
        address,
        notes,
      })
      .select("client_id, full_name, phone, email, address, notes")
      .single();

    if (error) throw error;

    return NextResponse.json({
      client: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to create client.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
