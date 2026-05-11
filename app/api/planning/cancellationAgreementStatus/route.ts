import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/planning/cancellationAgreementStatus?projectId=...
// Returns the current `project_documents` row for the cancellation
// agreement (if any). Used by the admin's Document Management modal
// to poll for the client's signature.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("project_documents")
      .select(
        "document_id, document_status, signed_at, signed_name, storage_bucket, storage_path",
      )
      .eq("project_id", projectId)
      .eq("document_type", "cancellation_agreement")
      .neq("document_status", "void")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to load agreement status.", details: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({
        documentStatus: "missing",
        signedAt: null,
        signedName: null,
      });
    }

    return NextResponse.json({
      documentId: data.document_id,
      documentStatus: data.document_status,
      signedAt: data.signed_at,
      signedName: data.signed_name,
      storageBucket: data.storage_bucket,
      storagePath: data.storage_path,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
