import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

// Pending documents = rows in project_documents that have a generated PDF
// in storage but haven't been signed yet. Grouped by document_type so the
// admin pending page can render Quotations, Invoices and Cancellation
// Agreements side by side.

const PENDING_STATUSES = ["generated", "sent"] as const

type DocType = "quotation" | "invoice" | "cancellation_agreement"

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function buildFileName(row: any, projectCode: string | null, type: DocType) {
  const explicit = normalizeText(row?.file_name)
  if (explicit) return explicit
  const code = normalizeText(projectCode) || normalizeText(row?.project_id).slice(0, 8)
  const ext = normalizeText(row?.file_mime_type).includes("pdf") ? "pdf" : "file"
  const slug =
    type === "invoice"
      ? "invoice"
      : type === "cancellation_agreement"
        ? "cancellation-agreement"
        : "quotation"
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

function mapType(value: unknown): DocType | null {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_")
  if (key === "quotation" || key === "quote") return "quotation"
  if (key === "invoice") return "invoice"
  if (key === "cancellation_agreement") return "cancellation_agreement"
  return null
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("project_documents")
      .select(
        `document_id, project_id, document_type, document_status,
         storage_bucket, storage_path, file_name, file_mime_type, file_size_bytes,
         created_at, updated_at,
         projects:project_id (
           project_code, title, site_address, status, created_by,
           clients:client_id ( full_name, email, phone )
         )`,
      )
      .in("document_status", PENDING_STATUSES as unknown as string[])
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
        .map((row: any) => ({ row, type: mapType(row.document_type) }))
        .filter(({ row, type }) => {
          if (!type) return false
          if (!normalizeText(row.storage_bucket)) return false
          if (!normalizeText(row.storage_path)) return false
          return true
        })
        .map(async ({ row, type }) => {
          const t = type as DocType
          const bucket = normalizeText(row.storage_bucket)
          const path = normalizeText(row.storage_path)
          const projectCode = normalizeText(row?.projects?.project_code) || null
          const fileName = buildFileName(row, projectCode, t)
          const dateISO =
            normalizeText(row.updated_at) || normalizeText(row.created_at)
          const managerId = normalizeText(row?.projects?.created_by)
          const projectManager = managerId
            ? usernameById.get(managerId) || "Project Manager"
            : "PaintPro Admin"
          const signedUrl = await createSignedUrl(bucket, path)

          return {
            id: row.document_id,
            type: t,
            fileName,
            dateISO,
            sizeLabel: formatSizeLabel(row.file_size_bytes),
            documentStatus: normalizeText(row.document_status),
            projectId: normalizeText(row.project_id),
            projectCode,
            projectTitle: normalizeText(row?.projects?.title) || null,
            siteAddress: normalizeText(row?.projects?.site_address) || null,
            projectStatus: normalizeText(row?.projects?.status) || null,
            projectManager,
            clientName: normalizeText(row?.projects?.clients?.full_name) || null,
            clientEmail: normalizeText(row?.projects?.clients?.email) || null,
            clientPhone: normalizeText(row?.projects?.clients?.phone) || null,
            signedUrl,
          }
        }),
    )

    return NextResponse.json({
      quotations: rows.filter((r) => r.type === "quotation"),
      invoices: rows.filter((r) => r.type === "invoice"),
      agreements: rows.filter((r) => r.type === "cancellation_agreement"),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch pending documents" },
      { status: 500 },
    )
  }
}
