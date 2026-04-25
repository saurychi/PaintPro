export type DocType = "INV" | "PAY" | "RCP" | "QTE"
export type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc"

export type FolderItem = {
  id: string
  name: string
  fileCount: number
  sizeLabel: string
  isArchived?: boolean
}

export type FileItem = {
  id: string
  type: DocType
  name: string
  createdBy: string
  dateLabel: string
  dateISO: string
  sizeLabel: string
  folderId?: string
  content?: string
  contentType?: string
  originalFilename?: string | null
  isArchived?: boolean
}

export type ListDocumentsParams = {
  query?: string
  folderId?: string | null
  types?: Partial<Record<DocType, boolean>>
  sort?: SortKey
  limit?: number
}

function formatSizeFromContent(content: string | null | undefined) {
  const bytes = new Blob([content ?? ""]).size
  if (bytes <= 0) return "—"

  const kb = bytes / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`

  const mb = kb / 1024
  return `${Math.max(1, Math.round(mb))} MB`
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
    id: row.document_id,
    type: row.document_type as DocType,
    name: row.title,
    createdBy: row.created_by ?? "Unknown",
    dateISO: row.created_at,
    dateLabel: toDateLabel(row.created_at),
    sizeLabel: formatSizeFromContent(row.content),
    folderId: row.folder_id ?? undefined,
    content: row.content ?? "",
    contentType: row.content_type ?? "text/plain",
    originalFilename: row.original_filename ?? null,
    isArchived: Boolean(row.is_archived),
  }
}

function mapFolder(row: any): FolderItem {
  const docs = row.documents ?? []

  const visibleDocs = docs.filter((doc: any) => {
    return Boolean(doc.is_archived) === Boolean(row.is_archived)
  })

  const totalBytes = visibleDocs.reduce((sum: number, doc: any) => {
    return sum + new Blob([doc.content ?? ""]).size
  }, 0)

  return {
    id: row.folder_id,
    name: row.name,
    fileCount: visibleDocs.length,
    sizeLabel:
      totalBytes <= 0
        ? "—"
        : totalBytes < 1024 * 1024
          ? `${Math.max(1, Math.round(totalBytes / 1024))} KB`
          : `${Math.max(1, Math.round(totalBytes / 1024 / 1024))} MB`,
    isArchived: Boolean(row.is_archived),
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed")
  }

  return data as T
}

export async function listFolders(): Promise<FolderItem[]> {
  const response = await fetch("/api/documents/folders", {
    method: "GET",
    cache: "no-store",
  })

  const data = await parseResponse<{ folders: any[] }>(response)
  return (data.folders ?? []).map(mapFolder)
}

export async function listDocuments(params: ListDocumentsParams): Promise<FileItem[]> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) searchParams.set("query", params.query.trim())
  if (params.folderId) searchParams.set("folderId", params.folderId)
  if (params.sort) searchParams.set("sort", params.sort)

  const selectedTypes = Object.entries(params.types ?? {})
    .filter(([, enabled]) => enabled !== false)
    .map(([key]) => key)

  if (selectedTypes.length > 0 && selectedTypes.length < 4) {
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

export async function createFolder(name: string) {
  const response = await fetch("/api/documents/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })

  const data = await parseResponse<{ folder: any }>(response)

  return {
    id: data.folder.folder_id,
    name: data.folder.name,
    fileCount: 0,
    sizeLabel: "—",
    isArchived: Boolean(data.folder.is_archived),
  } satisfies FolderItem
}

export async function renameFolder(folderId: string, name: string) {
  const response = await fetch("/api/documents/folders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rename", folderId, name }),
  })

  await parseResponse<{ ok: boolean }>(response)
}

export async function archiveFolder(folderId: string) {
  const response = await fetch("/api/documents/folders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive", folderId }),
  })

  await parseResponse<{ ok: boolean }>(response)
}

export async function restoreFolder(folderId: string) {
  const response = await fetch("/api/documents/folders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", folderId }),
  })

  await parseResponse<{ ok: boolean }>(response)
}

export async function createDocument(input: {
  folderId?: string | null
  documentType: DocType
  title: string
  content: string
  contentType?: string
  originalFilename?: string | null
  createdBy?: string | null
}) {
  const response = await fetch("/api/documents/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  const data = await parseResponse<{ document: any }>(response)
  return mapDocument(data.document)
}

export async function renameDocument(documentId: string, title: string) {
  const response = await fetch("/api/documents/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rename", documentId, title }),
  })

  await parseResponse<{ ok: boolean }>(response)
}

export async function archiveDocument(documentId: string) {
  const response = await fetch("/api/documents/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive", documentId }),
  })

  await parseResponse<{ ok: boolean }>(response)
}

export async function restoreDocument(documentId: string) {
  const response = await fetch("/api/documents/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", documentId }),
  })

  await parseResponse<{ ok: boolean }>(response)
}