import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/invoice/from-bucket?projectId=xxx&download=0|1
//
// Streams the project's signed invoice PDF straight from the storage
// bucket. Mirrors the quotation from-bucket route. The signed PDF
// (uploaded by the client-signature flow) embeds the client signature
// inline, so reading it back preserves the signature — unlike
// re-rendering /api/invoice/html which has no access to the saved
// signature bytes once the embed-as-data-URL refactor landed.
//
// Two auth modes:
//   1. Auth user (admin / staff / manager / client) — passes through.
//   2. Project-cookie client (paintpro_client_project_id) — must
//      match the requested project's id.

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
      .eq("document_type", "invoice")
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

    if (!document || !document.storage_path) {
      return NextResponse.json(
        { error: "Invoice has not been generated yet for this project." },
        { status: 404 },
      );
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(document.storage_bucket)
      .download(document.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        {
          error: "Failed to download invoice from bucket.",
          details: downloadError?.message ?? "Unknown",
        },
        { status: 500 },
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const fileName = document.file_name || `invoice-${projectId}.pdf`;

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
        error: "Unexpected error fetching invoice.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function HEAD(request: Request) {
  // Lightweight existence check used by the invoice-generation page
  // to decide whether to use the from-bucket route or fall back to
  // /api/invoice/html (which renders on the fly without the saved
  // signature). Mirrors GET's lookup but skips the storage download.
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return new Response(null, { status: 400 });
    }

    const userId = await getAuthUserId();
    if (!userId) {
      const clientProjectId = await getClientProjectId();
      if (!clientProjectId || clientProjectId !== projectId) {
        return new Response(null, { status: 401 });
      }
    }

    const { data: document } = await supabaseAdmin
      .from("project_documents")
      .select("storage_path")
      .eq("project_id", projectId)
      .eq("document_type", "invoice")
      .neq("document_status", "void")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!document || !document.storage_path) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
