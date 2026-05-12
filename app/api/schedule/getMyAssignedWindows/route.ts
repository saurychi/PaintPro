import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStaffActiveAssignments } from "@/lib/schedule/staffAssignmentConflicts";

export async function GET(request: NextRequest) {
  const token = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const windows = await getStaffActiveAssignments(user.id);
    return NextResponse.json({ windows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load assignments.", details: message },
      { status: 500 },
    );
  }
}
