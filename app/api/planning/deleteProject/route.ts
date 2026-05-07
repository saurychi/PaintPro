import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/deleteProject
//
// Hard-deletes a project and best-effort cleans up its bucket files. The
// caller MUST send the projectCode in the body — if it doesn't match the row
// we refuse, so the modal's "type the code to confirm" gate has a server-side
// check too (you can't bypass it by hitting the endpoint directly).
//
// Auth: must be an active admin or manager.
//
// Order of operations:
//   1. Auth + role check.
//   2. Verify project exists and the supplied code matches.
//   3. Read the project's bucket files BEFORE deleting (CASCADE will wipe
//      project_documents on delete, so we have to capture the paths first).
//   4. DELETE FROM projects — relies on the ON DELETE CASCADE constraints.
//      If those haven't been set up yet, this errors out and we return the
//      Postgres detail so the operator knows what to do.
//   5. Best-effort delete the bucket files. A failure here doesn't roll back
//      the project delete (the row is already gone).

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

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const status = String(caller?.status ?? "").toLowerCase();
    if (status !== "active" || (role !== "admin" && role !== "manager")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const projectId = String(body?.projectId ?? "").trim();
    const projectCode = String(body?.projectCode ?? "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    if (!projectCode) {
      return NextResponse.json(
        { error: "Missing projectCode confirmation." },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }
    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    if (project.project_code?.trim() !== projectCode) {
      return NextResponse.json(
        { error: "Project code does not match. Deletion aborted." },
        { status: 400 },
      );
    }

    // Capture the bucket paths before the cascade wipes project_documents.
    const { data: docs } = await supabaseAdmin
      .from("project_documents")
      .select("storage_bucket, storage_path, client_signature_path")
      .eq("project_id", projectId);

    const { error: deleteError } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("project_id", projectId);

    if (deleteError) {
      // Most likely cause if this fires: ON DELETE CASCADE constraints
      // haven't been added yet. Surface the Postgres detail so the operator
      // knows exactly which dependent table is blocking.
      return NextResponse.json(
        {
          error: "Failed to delete project.",
          details: deleteError.message,
          hint: "If this mentions a foreign key constraint, add ON DELETE CASCADE to the FK referencing projects.project_id.",
        },
        { status: 500 },
      );
    }

    // Best-effort bucket cleanup. Group paths by bucket and fire one remove
    // call per bucket. Failures are logged but don't fail the request — the
    // DB row is already gone.
    if (docs && docs.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const d of docs) {
        if (!d.storage_bucket) continue;
        if (!byBucket.has(d.storage_bucket)) byBucket.set(d.storage_bucket, []);
        if (d.storage_path) byBucket.get(d.storage_bucket)!.push(d.storage_path);
        if (d.client_signature_path) {
          byBucket.get(d.storage_bucket)!.push(d.client_signature_path);
        }
      }

      for (const [bucket, paths] of byBucket) {
        if (paths.length === 0) continue;
        const { error: removeError } = await supabaseAdmin.storage
          .from(bucket)
          .remove(paths);
        if (removeError) {
          console.error(
            `[deleteProject] storage cleanup failed for bucket "${bucket}":`,
            removeError.message,
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while deleting project.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
