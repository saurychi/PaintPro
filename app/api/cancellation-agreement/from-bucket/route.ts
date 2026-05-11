import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/cancellation-agreement/from-bucket?projectId=xxx&download=0|1
//
// Streams the project's cancellation agreement PDF straight from the
// storage bucket so the iframe can render it through the browser's
// built-in PDF viewer (zoom, rotate, page nav, dark mode, print, etc.) —
// same fast-path /api/quotation/from-bucket uses for the quotation
// preview. Two access modes match the quotation route:
//   1. Auth user (admin / staff / manager / client) — passes through.
//   2. Project-cookie client (paintpro_client_project_id) — must match
//      the requested project's id.

export const runtime = "nodejs";

const CLIENT_COOKIE = "paintpro_client_project_id";

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

async function getClientProjectId() {
  const cookieStore = await cookies();
  return cookieStore.get(CLIENT_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const download = url.searchParams.get("download") === "1";

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId." },
        { status: 400 },
      );
    }

    const userId = await getAuthUserId();
    if (!userId) {
      const clientProjectId = await getClientProjectId();
      if (!clientProjectId) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      if (clientProjectId !== projectId) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const { data: document, error: documentError } = await supabaseAdmin
      .from("project_documents")
      .select("storage_bucket, storage_path, file_name")
      .eq("project_id", projectId)
      .eq("document_type", "cancellation_agreement")
      .neq("document_status", "void")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (documentError) {
      return NextResponse.json(
        { error: documentError.message },
        { status: 500 },
      );
    }

    if (!document || !document.storage_bucket || !document.storage_path) {
      return NextResponse.json(
        {
          error:
            "Cancellation agreement has not been generated yet for this project.",
        },
        { status: 404 },
      );
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(document.storage_bucket)
      .download(document.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        {
          error: "Failed to download cancellation agreement from bucket.",
          details: downloadError?.message ?? "Unknown",
        },
        { status: 500 },
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const fileName =
      document.file_name || `cancellation-agreement-${projectId}.pdf`;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${
          download ? "attachment" : "inline"
        }; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error fetching cancellation agreement.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
