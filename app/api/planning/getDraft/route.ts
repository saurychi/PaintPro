import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/getDraft?draftId=<uuid>
// Returns everything basic-details needs to repopulate the wizard from a
// stored draft: identity, project fields, client fields, dimensions.
async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const draftId = new URL(request.url).searchParams.get("draftId")?.trim();
  if (!draftId) {
    return NextResponse.json(
      { error: "Missing draftId." },
      { status: 400 },
    );
  }

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("drafts")
    .select(
      "draft_id, draft_code, project_name, description, site_address, scheduled_start_datetime, scheduled_end_datetime, dimensions, client_id, client_full_name, client_email, client_phone, client_address, created_by, created_at, updated_at",
    )
    .eq("draft_id", draftId)
    .eq("created_by", userId)
    .maybeSingle();

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 });
  }

  if (!draft) {
    return NextResponse.json(
      { error: "Draft not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ draft });
}
