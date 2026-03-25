import { fakeDelay, toMs } from "./_shared"

export type DocType = "INV" | "PAY" | "RCP" | "QTE"
export type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc"

export type FolderItem = {
  id: string
  name: string
  fileCount: number
  sizeLabel: string
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
}

const DUMMY_FOLDERS: FolderItem[] = [
  { id: "f1", name: "Job Invoices", fileCount: 23, sizeLabel: "137 MB" },
  { id: "f2", name: "Material Receipts", fileCount: 8, sizeLabel: "55 MB" },
  { id: "f3", name: "Payroll Records", fileCount: 37, sizeLabel: "92 MB" },
  { id: "f4", name: "Job Quotations", fileCount: 29, sizeLabel: "104 MB" },
]

const DUMMY_FILES: FileItem[] = [
  {
    id: "r1",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "manhhackhct108@gmail.com",
    dateLabel: "July 1, 2026",
    dateISO: "2026-07-01T09:00:00.000Z",
    sizeLabel: "17 MB",
    folderId: "f1",
  },
  {
    id: "r2",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "trungkienpsknt@gmail.com",
    dateLabel: "June 2, 2026",
    dateISO: "2026-06-02T09:00:00.000Z",
    sizeLabel: "21 MB",
    folderId: "f1",
  },
  {
    id: "r3",
    type: "PAY",
    name: "Payroll 2025-08",
    createdBy: "danghoang87@gmail.com",
    dateLabel: "August 5, 2025",
    dateISO: "2025-08-05T09:00:00.000Z",
    sizeLabel: "26 MB",
    folderId: "f3",
  },
  {
    id: "a5",
    type: "QTE",
    name: "Quote - Living Room Repaint",
    createdBy: "manager@paintpro.com",
    dateLabel: "Jan 08, 10:12 AM",
    dateISO: "2026-01-08T02:12:00.000Z",
    sizeLabel: "—",
    folderId: "f4",
  },
  {
    id: "a1",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "manhhackhct108@gmail.com",
    dateLabel: "Dec 30, 09:42 PM",
    dateISO: "2025-12-30T13:42:00.000Z",
    sizeLabel: "92 MB",
    folderId: "f1",
  },
  {
    id: "a2",
    type: "PAY",
    name: "Payroll 2025-12",
    createdBy: "trungkienpsknt@gmail.com",
    dateLabel: "Dec 29, 09:42 PM",
    dateISO: "2025-12-29T13:42:00.000Z",
    sizeLabel: "92 MB",
    folderId: "f3",
  },
  {
    id: "a3",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "danghoang87@gmail.com",
    dateLabel: "Dec 28, 11:14 PM",
    dateISO: "2025-12-28T15:14:00.000Z",
    sizeLabel: "92 MB",
    folderId: "f1",
  },
  {
    id: "a4",
    type: "RCP",
    name: "Receipt - Materials",
    createdBy: "ckctm12@gmail.com",
    dateLabel: "Dec 26, 07:52 AM",
    dateISO: "2025-12-26T23:52:00.000Z",
    sizeLabel: "92 MB",
    folderId: "f2",
  },
]

export type ListDocumentsParams = {
  query?: string
  folderId?: string | null
  types?: Partial<Record<DocType, boolean>>
  sort?: SortKey
  limit?: number
}

function applyQuery(rows: FileItem[], q: string) {
  const query = q.trim().toLowerCase()
  if (!query) return rows
  return rows.filter((f) =>
    `${f.name} ${f.createdBy} ${f.dateLabel}`.toLowerCase().includes(query)
  )
}

function applyTypes(rows: FileItem[], types?: Partial<Record<DocType, boolean>>) {
  if (!types) return rows
  return rows.filter((f) => types[f.type] !== false)
}

function applyFolder(rows: FileItem[], folderId?: string | null) {
  if (!folderId) return rows
  return rows.filter((f) => f.folderId === folderId)
}

function applySort(rows: FileItem[], sort: SortKey) {
  const out = rows.slice()
  out.sort((a, b) => {
    if (sort === "name_asc") return a.name.localeCompare(b.name)
    if (sort === "name_desc") return b.name.localeCompare(a.name)
    if (sort === "date_asc") return toMs(a.dateISO) - toMs(b.dateISO)
    return toMs(b.dateISO) - toMs(a.dateISO)
  })
  return out
}

export async function listFolders(): Promise<FolderItem[]> {
  await fakeDelay(200)
  return DUMMY_FOLDERS
}

export async function listDocuments(params: ListDocumentsParams): Promise<FileItem[]> {
  await fakeDelay(250)

  const {
    query = "",
    folderId = null,
    types,
    sort = "date_desc",
    limit,
  } = params

  let rows = DUMMY_FILES.slice()
  rows = applyFolder(rows, folderId)
  rows = applyTypes(rows, types)
  rows = applyQuery(rows, query)
  rows = applySort(rows, sort)

  if (typeof limit === "number") rows = rows.slice(0, limit)
  return rows
}

export async function listRecentDocuments(params: ListDocumentsParams): Promise<FileItem[]> {
  // For dummy, recent is just sorted by newest with a small limit
  return listDocuments({ ...params, sort: "date_desc", limit: params.limit ?? 3 })
}