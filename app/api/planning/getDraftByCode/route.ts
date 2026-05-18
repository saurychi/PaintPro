import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/getDraftByCode?code=<draft_code>
//
// Existence probe used by /staff/measure-generator to decide whether a
// projectCode it has cached locally still points to a live draft. Unlike
// /api/planning/listDrafts (which scopes by created_by so the dropdown
// only shows the caller's own drafts), this endpoint resolves any draft
// by code — staff working from a manager-created draft need to see that
// the draft is alive even though they didn't create it.
//
// Auth: any signed-in user. The endpoint reveals only draft_id /
// draft_code / project_name, which the user can already see in the
// conversation header they came in from.

async function getAuthUserId(): Promise<string | null> {
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

  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const { data: draft, error } = await supabaseAdmin
    .from("drafts")
    .select("draft_id, draft_code, project_name")
    .eq("draft_code", code)
    .maybeSingle<{
      draft_id: string;
      draft_code: string;
      project_name: string | null;
    }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    exists: !!draft,
    draft: draft
      ? {
          draft_id: draft.draft_id,
          draft_code: draft.draft_code,
          project_name: draft.project_name,
        }
      : null,
  });
}
