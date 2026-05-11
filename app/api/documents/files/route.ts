import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

// Admin Documents page reads everything from `project_documents` (one row per
// generated PDF: quotation, invoice, cancellation agreement). The actual file
// bytes live in Supabase Storage at `<storage_bucket>/<storage_path>`. We
// surface a short-lived signed URL so the page can preview/download.
//
// There is NO write path — the admin page does not create files. They are
// emitted by the project flow (save-generated, signature endpoints, etc.).

const TYPE_MAP: Record<string, "INV" | "QTE" | "AGR"> = {
  invoice: "INV",
  inv: "INV",
  quotation: "QTE",
  quote: "QTE",
  qte: "QTE",
  cancellation_agreement: "AGR",
  cancellationagreement: "AGR",
  agr: "AGR",
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function mapDocumentType(value: unknown) {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_")
  return (
    TYPE_MAP[key] ??
    TYPE_MAP[key.replace(/_/g, "")] ??
    null
  )
}

function typeLabel(type: "INV" | "QTE" | "AGR") {
  if (type === "INV") return "Invoice"
  if (type === "AGR") return "Cancellation Agreement"
  return "Quotation"
}

function buildFileName(row: any, projectCode: string | null, type: "INV" | "QTE" | "AGR") {
  const explicit = normalizeText(row?.file_name)
  if (explicit) return explicit
  const code = normalizeText(projectCode) || normalizeText(row?.project_id).slice(0, 8)
  const ext = normalizeText(row?.file_mime_type).includes("pdf") ? "pdf" : "file"
  const slug = type === "INV" ? "invoice" : type === "AGR" ? "cancellation-agreement" : "quotation"
  return `${slug}-${code}.${ext}`
}

function formatSizeLabel(bytes: unknown) {
  const value = typeof bytes === "number" ? bytes : Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return "—"
  const kb = value / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  const mb = kb / 1024
  return `${Math.max(1, Math.round(mb))} MB`
}

async function createSignedUrl(bucket: string, path: string) {
  if (!bucket || !path) return null
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const query = normalizeText(url.searchParams.get("query")).toLowerCase()
    const sort = normalizeText(url.searchParams.get("sort")) || "date_desc"
    const selectedTypes = normalizeText(url.searchParams.get("types"))
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)

    const { data, error } = await supabaseAdmin
      .from("project_documents")
      .select(
        "document_id, project_id, document_type, document_status, storage_bucket, storage_path, file_name, file_mime_type, file_size_bytes, signed_at, signed_name, created_at, updated_at, projects:project_id ( project_code, title, created_by )",
      )
      .neq("document_status", "void")
      .order("updated_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const managerIds = Array.from(
      new Set(
        (data ?? [])
          .map((row: any) => normalizeText(row?.projects?.created_by))
          .filter(Boolean),
      ),
    )

    const usernameById = new Map<string, string>()
    if (managerIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, username, email")
        .in("id", managerIds)

      ;(users ?? []).forEach((user: any) => {
        const id = normalizeText(user?.id)
        const display = normalizeText(user?.username) || normalizeText(user?.email)
        if (id) usernameById.set(id, display || "Project Manager")
      })
    }

    const rows = await Promise.all(
      (data ?? [])
        .map((row: any) => ({ row, type: mapDocumentType(row.document_type) }))
        .filter(({ row, type }) => {
          if (!type) return false
          if (!normalizeText(row.storage_bucket)) return false
          if (!normalizeText(row.storage_path)) return false
          return true
        })
        .map(async ({ row, type }) => {
          const t = type as "INV" | "QTE" | "AGR"
          const bucket = normalizeText(row.storage_bucket)
          const path = normalizeText(row.storage_path)
          const projectCode = normalizeText(row?.projects?.project_code) || null
          const fileName = buildFileName(row, projectCode, t)
          const title = fileName.replace(/\.[^/.]+$/, "")
          const dateISO =
            normalizeText(row.signed_at) ||
            normalizeText(row.updated_at) ||
            normalizeText(row.created_at)
          const managerId = normalizeText(row?.projects?.created_by)
          const createdBy = managerId
            ? usernameById.get(managerId) || "Project Manager"
            : "PaintPro Admin"
          const signedUrl = await createSignedUrl(bucket, path)

          return {
            id: row.document_id,
            type: t,
            typeLabel: typeLabel(t),
            name: title,
            fileName,
            createdBy,
            dateISO,
            sizeLabel: formatSizeLabel(row.file_size_bytes),
            contentType: normalizeText(row.file_mime_type) || "application/pdf",
            originalFilename: fileName,
            documentStatus: normalizeText(row.document_status) || "available",
            signedAt: normalizeText(row.signed_at) || null,
            signedName: normalizeText(row.signed_name) || null,
            projectId: normalizeText(row.project_id),
            projectCode,
            projectTitle: normalizeText(row?.projects?.title) || null,
            storageBucket: bucket,
            storagePath: path,
            signedUrl,
          }
        }),
    )

    let documents = rows

    if (selectedTypes.length > 0 && selectedTypes.length < 3) {
      documents = documents.filter((doc) => selectedTypes.includes(doc.type))
    }

    if (query) {
      documents = documents.filter((doc) => {
        const haystack = [
          doc.name,
          doc.fileName,
          doc.createdBy,
          doc.typeLabel,
          doc.documentStatus,
          doc.projectCode,
          doc.projectTitle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(query)
      })
    }

    documents.sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name)
      if (sort === "name_desc") return b.name.localeCompare(a.name)
      const aTime = Date.parse(a.dateISO || "") || 0
      const bTime = Date.parse(b.dateISO || "") || 0
      if (sort === "date_asc") return aTime - bTime
      return bTime - aTime
    })

    return NextResponse.json({ documents })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch documents" },
      { status: 500 },
    )
  }
}
