import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const CLIENT_COOKIE = "paintpro_client_project_id";

const TYPE_MAP: Record<string, "INV" | "PAY" | "RCP" | "QTE"> = {
  invoice: "INV",
  inv: "INV",
  payroll: "PAY",
  pay: "PAY",
  receipt: "RCP",
  rcp: "RCP",
  quotation: "QTE",
  quote: "QTE",
  qte: "QTE",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function mapProjectDocumentType(value: unknown) {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return TYPE_MAP[key] ?? TYPE_MAP[key.replace(/_/g, "")] ?? "QTE";
}

function mapTypeLabel(type: "INV" | "PAY" | "RCP" | "QTE") {
  if (type === "INV") return "Invoice";
  if (type === "PAY") return "Payroll";
  if (type === "RCP") return "Receipt";
  return "Quote";
}

function formatFileName(row: any, type: "INV" | "PAY" | "RCP" | "QTE") {
  const explicitName = normalizeText(row?.file_name);
  if (explicitName) return explicitName;

  const projectCode = normalizeText(row?.project_id).slice(0, 8);
  const ext = normalizeText(row?.file_mime_type).includes("pdf") ? "pdf" : "file";
  return `${mapTypeLabel(type).toLowerCase()}-${projectCode}.${ext}`;
}

function formatTitle(row: any, type: "INV" | "PAY" | "RCP" | "QTE") {
  const fileName = formatFileName(row, type);
  return fileName.replace(/\.[^/.]+$/, "");
}

function formatSizeLabel(bytes: unknown) {
  const value = typeof bytes === "number" ? bytes : Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "—";

  const kb = value / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;

  const mb = kb / 1024;
  return `${Math.max(1, Math.round(mb))} MB`;
}

async function createSignedUrl(bucket: string, path: string) {
  if (!bucket || !path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cookieStore = await cookies();
    const cookieProjectId = cookieStore.get(CLIENT_COOKIE)?.value ?? null;

    const requestedProjectId = normalizeText(url.searchParams.get("projectId"));
    const projectId = requestedProjectId || cookieProjectId || "";

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing client project context." },
        { status: 400 },
      );
    }

    if (cookieProjectId && requestedProjectId && requestedProjectId !== cookieProjectId) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    const query = normalizeText(url.searchParams.get("query")).toLowerCase();
    const sort = normalizeText(url.searchParams.get("sort")) || "date_desc";
    const selectedTypes = normalizeText(url.searchParams.get("types"))
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("project_id, project_code, title, client_id")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;

    if (!project) {
      return NextResponse.json({ error: "Project was not found." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("project_documents")
      .select(
        "document_id, project_id, client_id, document_type, document_status, storage_bucket, storage_path, file_name, file_mime_type, file_size_bytes, signed_at, signed_name, created_at, updated_at",
      )
      .eq("project_id", projectId)
      .neq("document_status", "void")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const rows = await Promise.all(
      (data ?? [])
        .filter((row: any) => normalizeText(row.storage_bucket) && normalizeText(row.storage_path))
        .map(async (row: any) => {
          const type = mapProjectDocumentType(row.document_type);
          const bucket = normalizeText(row.storage_bucket);
          const path = normalizeText(row.storage_path);
          const fileName = formatFileName(row, type);
          const title = formatTitle(row, type);
          const signedUrl = await createSignedUrl(bucket, path);
          const dateISO = normalizeText(row.signed_at) || normalizeText(row.updated_at) || normalizeText(row.created_at);

          return {
            id: row.document_id,
            type,
            typeLabel: mapTypeLabel(type),
            name: title,
            fileName,
            createdBy: normalizeText(row.signed_name) || "PaintPro Admin",
            dateISO,
            sizeLabel: formatSizeLabel(row.file_size_bytes),
            contentType: normalizeText(row.file_mime_type) || "application/pdf",
            originalFilename: fileName,
            documentStatus: normalizeText(row.document_status) || "available",
            signedAt: normalizeText(row.signed_at) || null,
            signedName: normalizeText(row.signed_name) || null,
            storageBucket: bucket,
            storagePath: path,
            signedUrl,
          };
        }),
    );

    let documents = rows;

    if (selectedTypes.length > 0 && selectedTypes.length < 4) {
      documents = documents.filter((doc) => selectedTypes.includes(doc.type));
    }

    if (query) {
      documents = documents.filter((doc) => {
        const haystack = [doc.name, doc.fileName, doc.createdBy, doc.typeLabel, doc.documentStatus]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    documents.sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);

      const aTime = Date.parse(a.dateISO || "") || 0;
      const bTime = Date.parse(b.dateISO || "") || 0;

      if (sort === "date_asc") return aTime - bTime;
      return bTime - aTime;
    });

    return NextResponse.json({
      project,
      documents,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch client documents.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
