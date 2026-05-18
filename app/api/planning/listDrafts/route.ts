import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/listDrafts
// Returns every draft in the table, newest-updated first. Used by:
//   - basic-details' "See Drafts" modal (admin picks a draft to resume)
//   - measure-generator's project-code dropdown (staff picks a draft to
//     save measurements into)
//
// Used to filter by `created_by = caller`, but that meant staff working
// from a manager-created draft saw an empty list and couldn't pick the
// draft they were actually measuring for. The drafts table is a shared
// workspace inside the org, so the listing is shared too. Auth gate
// (signed-in only) is preserved so guests / cookie-clients can't probe.
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

export async function GET(_request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("drafts")
    .select(
      "draft_id, draft_code, project_name, description, client_full_name, client_email, site_address, scheduled_start_datetime, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}
