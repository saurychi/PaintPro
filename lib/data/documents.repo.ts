export type DocType = "INV" | "QTE" | "AGR"
export type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc"

export type FileItem = {
  id: string
  type: DocType
  typeLabel: string
  name: string
  fileName: string
  createdBy: string
  dateLabel: string
  dateISO: string
  sizeLabel: string
  contentType: string
  originalFilename: string | null
  documentStatus: string
  signedAt: string | null
  signedName: string | null
  projectId: string
  projectCode: string | null
  projectTitle: string | null
  storageBucket: string
  storagePath: string
  signedUrl: string | null
}

export type ListDocumentsParams = {
  query?: string
  types?: Partial<Record<DocType, boolean>>
  sort?: SortKey
  limit?: number
}

function toDateLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

function mapDocument(row: any): FileItem {
  return {
    id: row.id,
    type: row.type as DocType,
    typeLabel: row.typeLabel,
    name: row.name,
    fileName: row.fileName,
    createdBy: row.createdBy ?? "Unknown",
    dateISO: row.dateISO,
    dateLabel: toDateLabel(row.dateISO),
    sizeLabel: row.sizeLabel,
    contentType: row.contentType ?? "application/pdf",
    originalFilename: row.originalFilename ?? null,
    documentStatus: row.documentStatus ?? "available",
    signedAt: row.signedAt ?? null,
    signedName: row.signedName ?? null,
    projectId: row.projectId ?? "",
    projectCode: row.projectCode ?? null,
    projectTitle: row.projectTitle ?? null,
    storageBucket: row.storageBucket ?? "",
    storagePath: row.storagePath ?? "",
    signedUrl: row.signedUrl ?? null,
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed")
  }
  return data as T
}

export async function listDocuments(params: ListDocumentsParams): Promise<FileItem[]> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) searchParams.set("query", params.query.trim())
  if (params.sort) searchParams.set("sort", params.sort)

  const selectedTypes = Object.entries(params.types ?? {})
    .filter(([, enabled]) => enabled !== false)
    .map(([key]) => key)

  if (selectedTypes.length > 0 && selectedTypes.length < 3) {
    searchParams.set("types", selectedTypes.join(","))
  }

  const response = await fetch(`/api/documents/files?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  })

  const data = await parseResponse<{ documents: any[] }>(response)
  const rows = (data.documents ?? []).map(mapDocument)

  if (typeof params.limit === "number") {
    return rows.slice(0, params.limit)
  }

  return rows
}
