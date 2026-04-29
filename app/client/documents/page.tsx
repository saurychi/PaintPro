"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowDownToLine,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  Eye,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  MoreVertical,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  createFolder,
  listDocuments,
  listFolders,
  moveDocument,
  type DocType,
  type FileItem,
  type FolderItem,
  type SortKey,
} from "@/lib/data/documents.repo"

type ArchiveTab = "active" | "archived"

type Toast = {
  id: string
  message: string
  tone?: "default" | "success" | "danger"
}

const typeMeta: Record<
  DocType,
  {
    label: string
    pillText: string
    pillClass: string
  }
> = {
  INV: {
    label: "Invoice",
    pillText: "INV",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  PAY: {
    label: "Payment",
    pillText: "PAY",
    pillClass:
      "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300",
  },
  RCP: {
    label: "Receipt",
    pillText: "RCP",
    pillClass:
      "border border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/25 dark:bg-purple-500/15 dark:text-purple-300",
  },
  QTE: {
    label: "Quotation",
    pillText: "QTE",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
}

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const sectionHeader = "border-b border-gray-100 px-4 py-3 dark:border-slate-700/70"

const btnBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:border-[#00c065]/40 hover:bg-[#00c065]/5 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#00c065]/40 dark:hover:bg-[#00c065]/10 dark:hover:text-emerald-300"

const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"

const iconBtn =
  "grid h-9 w-9 place-items-center rounded-lg border border-transparent bg-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700"

const menuBox =
  "min-w-[240px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"

const menuItem =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:text-slate-100 dark:hover:bg-slate-700"

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function formatDateISO(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

function getClientProjectCode() {
  if (typeof window === "undefined") return ""

  const url = new URL(window.location.href)

  const fromUrl =
    url.searchParams.get("projectCode") ||
    url.searchParams.get("project_code") ||
    url.searchParams.get("code")

  if (fromUrl?.trim()) return fromUrl.trim()

  const keys = [
    "paintpro_client_project_code",
    "client_project_code",
    "project_code",
    "paintpro_project_code",
  ]

  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.trim()
    if (value) return value
  }

  return ""
}

function getClientFolderStorageKey(projectCode: string) {
  return `paintpro_client_folder_ids:${projectCode || "no_project_code"}`
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").toLowerCase()
}

function documentBelongsToProject(file: FileItem, projectCode: string) {
  const code = projectCode.trim().toLowerCase()

  if (!code) return false

  const searchableText = [file.name, file.originalFilename, file.content]
    .map(normalizeText)
    .join(" ")

  return searchableText.includes(code)
}

function downloadFile(file: FileItem) {
  const content = file.content ?? ""
  const contentType = file.contentType ?? "text/plain"
  const extension =
    contentType.includes("html") || file.originalFilename?.endsWith(".html")
      ? "html"
      : contentType.includes("pdf") || file.originalFilename?.endsWith(".pdf")
        ? "pdf"
        : "txt"

  const safeName =
    file.originalFilename?.trim() ||
    `${file.name.replace(/[^\w\- ]+/g, "").trim() || "paintpro-document"}.${extension}`

  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")

  a.href = url
  a.download = safeName

  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-[250] flex w-[92vw] max-w-[380px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
            toast.tone === "success" &&
              "border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
            toast.tone === "danger" &&
              "border-red-500/25 bg-red-50 text-red-900 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean
  title: string
  subtitle?: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[94vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                {subtitle}
              </div>
            ) : null}
          </div>

          <button
            className={iconBtn}
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

function MenuItemBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button className={menuItem} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  )
}

function PortalMenu<T extends HTMLElement>({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean
  anchorRef: React.RefObject<T | null>
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    function update() {
      const el = anchorRef.current
      if (!el) return

      const r = el.getBoundingClientRect()
      const menuWidth = 260
      const gap = 10
      const left = Math.max(
        12,
        Math.min(window.innerWidth - menuWidth - 12, r.right - menuWidth),
      )
      const top = Math.min(window.innerHeight - 12, r.bottom + gap)

      setPos({ top, left })
    }

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node
      const anchorEl = anchorRef.current
      const menuEl = menuRef.current

      if (anchorEl?.contains(target)) return
      if (menuEl?.contains(target)) return

      onClose()
    }

    update()

    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    document.addEventListener("mousedown", onDocMouseDown)

    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
      document.removeEventListener("mousedown", onDocMouseDown)
    }
  }, [open, anchorRef, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed z-[300]"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={menuRef} className={menuBox}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function ActionMenu({
  isOpen,
  onToggle,
  onClose,
  children,
}: {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null)

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        className={iconBtn}
        type="button"
        onClick={onToggle}
        aria-label="Actions"
      >
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>

      <PortalMenu open={isOpen} anchorRef={btnRef} onClose={onClose}>
        {children}
      </PortalMenu>
    </div>
  )
}

function DocumentPreview({
  file,
  onDownload,
}: {
  file: FileItem
  onDownload: () => void
}) {
  const content = file.content ?? ""
  const contentType = file.contentType ?? "text/plain"
  const isHtml = contentType.includes("html") || content.trim().startsWith("<")

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <span>{file.originalFilename ?? `${file.name}.html`}</span>
          <span>•</span>
          <span>{contentType}</span>
          <span>•</span>
          <span>{file.sizeLabel}</span>
        </div>

        <button type="button" className={btnPrimary} onClick={onDownload}>
          <ArrowDownToLine className="h-4 w-4" />
          Download
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-gray-100 p-4 dark:bg-slate-900">
        {isHtml ? (
          <iframe
            title={file.name}
            srcDoc={content}
            className="mx-auto h-[72vh] w-full max-w-4xl rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700"
          />
        ) : (
          <pre className="mx-auto max-h-[72vh] max-w-4xl overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {content || "No preview content available."}
          </pre>
        )}
      </div>
    </>
  )
}

function CreateFolderModal({
  open,
  value,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  value: string
  saving: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      title="Create Folder"
      subtitle="Create a folder for organizing your project documents."
      onClose={onClose}
    >
      <div className="p-4">
        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">
          Folder Name
        </label>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Example: Signed Quotations"
          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400"
          autoFocus
        />

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btnBase} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={onSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            Create Folder
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MoveDocumentModal({
  open,
  file,
  folders,
  selectedFolderId,
  moving,
  onSelectFolder,
  onClose,
  onMove,
}: {
  open: boolean
  file: FileItem | null
  folders: FolderItem[]
  selectedFolderId: string
  moving: boolean
  onSelectFolder: (folderId: string) => void
  onClose: () => void
  onMove: () => void
}) {
  return (
    <Modal
      open={open}
      title="Move to Folder"
      subtitle={file ? `Select a destination folder for ${file.name}.` : undefined}
      onClose={onClose}
    >
      <div className="p-4">
        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">
          Destination Folder
        </label>

        <select
          value={selectedFolderId}
          onChange={(e) => onSelectFolder(e.target.value)}
          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100"
        >
          <option value="">No folder</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>

        {folders.length === 0 ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
            Create a folder first before moving a document.
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btnBase} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={onMove}
            disabled={moving || !file}
          >
            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
            Move Document
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function ClientDocumentsPage() {
  const [query, setQuery] = useState("")
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)

  const [filterINV, setFilterINV] = useState(true)
  const [filterPAY, setFilterPAY] = useState(true)
  const [filterRCP, setFilterRCP] = useState(true)
  const [filterQTE, setFilterQTE] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>("date_desc")
  const [tab, setTab] = useState<ArchiveTab>("active")

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)

  const [folders, setFolders] = useState<FolderItem[]>([])
  const [clientFolderIds, setClientFolderIds] = useState<string[]>([])
  const [filesAll, setFilesAll] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [clientProjectCode, setClientProjectCode] = useState("")

  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [savingFolder, setSavingFolder] = useState(false)

  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveTargetFile, setMoveTargetFile] = useState<FileItem | null>(null)
  const [selectedMoveFolderId, setSelectedMoveFolderId] = useState("")
  const [movingFile, setMovingFile] = useState(false)

  const showArchived = tab === "archived"
  const isSearching = query.trim().length > 0

  const clientFolderStorageKey = useMemo(
    () => getClientFolderStorageKey(clientProjectCode),
    [clientProjectCode],
  )

  const types: Partial<Record<DocType, boolean>> = useMemo(
    () => ({
      INV: filterINV,
      PAY: filterPAY,
      RCP: filterRCP,
      QTE: filterQTE,
    }),
    [filterINV, filterPAY, filterRCP, filterQTE],
  )

  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null
    return folders.find((folder) => folder.id === activeFolderId) ?? null
  }, [activeFolderId, folders])

  const sortLabel =
    sortKey === "date_desc"
      ? "Newest"
      : sortKey === "date_asc"
        ? "Oldest"
        : sortKey === "name_asc"
          ? "Name A-Z"
          : "Name Z-A"

  const filterItems: {
    id: DocType
    label: string
    checked: boolean
    setChecked: (value: boolean) => void
  }[] = [
    {
      id: "QTE",
      label: "Quotations",
      checked: filterQTE,
      setChecked: setFilterQTE,
    },
    {
      id: "INV",
      label: "Invoices",
      checked: filterINV,
      setChecked: setFilterINV,
    },
    {
      id: "RCP",
      label: "Receipts",
      checked: filterRCP,
      setChecked: setFilterRCP,
    },
    {
      id: "PAY",
      label: "Payments",
      checked: filterPAY,
      setChecked: setFilterPAY,
    },
  ]

  function pushToast(message: string, tone: Toast["tone"] = "default") {
    const id = makeId("toast")
    setToasts((prev) => [...prev, { id, message, tone }])

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 2500)
  }

  function closeAll() {
    setFiltersOpen(false)
    setSortOpen(false)
    setOpenMenuKey(null)
  }

  function openFolder(folderId: string) {
    setActiveFolderId(folderId)
    closeAll()
  }

  function goBackToRoot() {
    setActiveFolderId(null)
    closeAll()
  }

  function handleDownload(file: FileItem) {
    downloadFile(file)
    setOpenMenuKey(null)
    pushToast("Document downloaded.", "success")
  }

  function handlePreview(file: FileItem) {
    setPreviewFile(file)
    setOpenMenuKey(null)
  }

  function openMoveModal(file: FileItem) {
    setMoveTargetFile(file)
    setSelectedMoveFolderId(file.folderId ?? "")
    setMoveModalOpen(true)
    setOpenMenuKey(null)
  }

  function saveClientFolderIds(nextIds: string[]) {
    setClientFolderIds(nextIds)

    if (typeof window !== "undefined") {
      window.localStorage.setItem(clientFolderStorageKey, JSON.stringify(nextIds))
    }
  }

  async function refreshDocuments() {
    const [folderRows, documentRows] = await Promise.all([
      listFolders(),
      listDocuments({
        query: "",
        folderId: null,
        types: {
          INV: true,
          PAY: true,
          RCP: true,
          QTE: true,
        },
        sort: "date_desc",
      }),
    ])

    setFolders(folderRows)
    setFilesAll(documentRows)
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()

    if (!name) {
      pushToast("Folder name is required.", "danger")
      return
    }

    try {
      setSavingFolder(true)

      const folder = await createFolder(name)

      setFolders((prev) => [folder, ...prev])

      const nextFolderIds = Array.from(new Set([folder.id, ...clientFolderIds]))
      saveClientFolderIds(nextFolderIds)

      setNewFolderName("")
      setCreateFolderOpen(false)
      pushToast("Folder created.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Failed to create folder.", "danger")
    } finally {
      setSavingFolder(false)
    }
  }

  async function handleMoveDocument() {
    if (!moveTargetFile) return

    try {
      setMovingFile(true)

      const folderId = selectedMoveFolderId || null
      await moveDocument(moveTargetFile.id, folderId)

      if (folderId && !clientFolderIds.includes(folderId)) {
        saveClientFolderIds(Array.from(new Set([folderId, ...clientFolderIds])))
      }

      setFilesAll((prev) =>
        prev.map((file) =>
          file.id === moveTargetFile.id
            ? {
                ...file,
                folderId: folderId ?? undefined,
              }
            : file,
        ),
      )

      setMoveModalOpen(false)
      setMoveTargetFile(null)
      setSelectedMoveFolderId("")
      pushToast(folderId ? "Document moved to folder." : "Document removed from folder.", "success")

      await refreshDocuments()
    } catch (error: any) {
      pushToast(error?.message ?? "Failed to move document.", "danger")
    } finally {
      setMovingFile(false)
    }
  }

  useEffect(() => {
    setClientProjectCode(getClientProjectCode())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const raw = window.localStorage.getItem(clientFolderStorageKey)

    try {
      const parsed = raw ? JSON.parse(raw) : []
      setClientFolderIds(Array.isArray(parsed) ? parsed.filter(Boolean) : [])
    } catch {
      setClientFolderIds([])
    }
  }, [clientFolderStorageKey])

  useEffect(() => {
    let cancelled = false

    async function loadDocuments() {
      try {
        setLoading(true)
        setLoadError(null)

        const [folderRows, documentRows] = await Promise.all([
          listFolders(),
          listDocuments({
            query: "",
            folderId: null,
            types: {
              INV: true,
              PAY: true,
              RCP: true,
              QTE: true,
            },
            sort: "date_desc",
          }),
        ])

        if (cancelled) return

        setFolders(folderRows)
        setFilesAll(documentRows)
      } catch (error: any) {
        if (cancelled) return
        setLoadError(error?.message ?? "Failed to load client documents")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDocuments()

    return () => {
      cancelled = true
    }
  }, [])

  const projectScopedFiles = useMemo(() => {
    const code = clientProjectCode.trim()

    if (!code) return []

    return filesAll.filter((file) => documentBelongsToProject(file, code))
  }, [filesAll, clientProjectCode])

  const visibleFolders = useMemo(() => {
    const folderIds = new Set(
      projectScopedFiles
        .filter((file) => Boolean(file.folderId))
        .map((file) => file.folderId as string),
    )

    for (const folderId of clientFolderIds) {
      folderIds.add(folderId)
    }

    return folders.filter((folder) => {
      if (!folderIds.has(folder.id)) return false
      return showArchived ? folder.isArchived : !folder.isArchived
    })
  }, [folders, projectScopedFiles, showArchived, clientFolderIds])

  const folderStats = useMemo(() => {
    const map: Record<string, { count: number; totalKb: number }> = {}

    for (const file of projectScopedFiles) {
      if (!file.folderId) continue
      if (showArchived ? !file.isArchived : file.isArchived) continue

      if (!map[file.folderId]) {
        map[file.folderId] = {
          count: 0,
          totalKb: 0,
        }
      }

      map[file.folderId].count += 1

      const kbMatch = /(\d+)\s*KB/i.exec(file.sizeLabel || "")
      const mbMatch = /(\d+)\s*MB/i.exec(file.sizeLabel || "")

      if (kbMatch) map[file.folderId].totalKb += Number(kbMatch[1])
      if (mbMatch) map[file.folderId].totalKb += Number(mbMatch[1]) * 1024
    }

    return map
  }, [projectScopedFiles, showArchived])

  const scopedFiles = useMemo(() => {
    let rows = projectScopedFiles.slice()

    if (activeFolderId) {
      rows = rows.filter((file) => file.folderId === activeFolderId)
    }

    rows = rows.filter((file) => {
      const isArchived = Boolean(file.isArchived)
      return showArchived ? isArchived : !isArchived
    })

    rows = rows.filter((file) => types[file.type] !== false)

    const q = query.trim().toLowerCase()

    if (q) {
      rows = rows.filter((file) => {
        const searchable = `${file.name} ${file.createdBy} ${
          file.originalFilename ?? ""
        }`.toLowerCase()
        return searchable.includes(q)
      })
    }

    rows.sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name)
      if (sortKey === "name_desc") return b.name.localeCompare(a.name)

      const aMs = Number.isNaN(Date.parse(a.dateISO)) ? 0 : Date.parse(a.dateISO)
      const bMs = Number.isNaN(Date.parse(b.dateISO)) ? 0 : Date.parse(b.dateISO)

      if (sortKey === "date_asc") return aMs - bMs
      return bMs - aMs
    })

    return rows
  }, [projectScopedFiles, activeFolderId, showArchived, types, query, sortKey])

  const recentFiles = useMemo(() => {
    if (isSearching || showArchived) return []

    let rows = projectScopedFiles.slice()

    if (activeFolderId) {
      rows = rows.filter((file) => file.folderId === activeFolderId)
    }

    rows = rows.filter((file) => !file.isArchived)
    rows = rows.filter((file) => types[file.type] !== false)

    rows.sort((a, b) => {
      const aMs = Number.isNaN(Date.parse(a.dateISO)) ? 0 : Date.parse(a.dateISO)
      const bMs = Number.isNaN(Date.parse(b.dateISO)) ? 0 : Date.parse(b.dateISO)
      return bMs - aMs
    })

    return rows.slice(0, 3)
  }, [projectScopedFiles, activeFolderId, isSearching, showArchived, types])

  const quotationCount = useMemo(() => {
    return projectScopedFiles.filter((file) => file.type === "QTE" && !file.isArchived).length
  }, [projectScopedFiles])

  const activeFileCount = useMemo(() => {
    return projectScopedFiles.filter((file) => !file.isArchived).length
  }, [projectScopedFiles])

  const archivedFileCount = useMemo(() => {
    return projectScopedFiles.filter((file) => file.isArchived).length
  }, [projectScopedFiles])

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
      <ToastStack toasts={toasts} />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Documents
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            View quotations, invoices, receipts, and files linked to your project.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-slate-600 dark:bg-slate-900/40">
              <button
                type="button"
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                  tab === "active"
                    ? "bg-[#00c065]/10 text-[#047857] dark:bg-[#00c065]/15 dark:text-emerald-300"
                    : "text-gray-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800",
                )}
                onClick={() => setTab("active")}
              >
                Active
              </button>
              <button
                type="button"
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                  tab === "archived"
                    ? "bg-[#00c065]/10 text-[#047857] dark:bg-[#00c065]/15 dark:text-emerald-300"
                    : "text-gray-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800",
                )}
                onClick={() => setTab("archived")}
              >
                Archived
              </button>
            </div>

            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setCreateFolderOpen(true)
                closeAll()
              }}
            >
              <FolderPlus className="h-4 w-4" />
              New Folder
            </button>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                className={btnBase}
                type="button"
                onClick={() => {
                  setFiltersOpen((prev) => !prev)
                  setSortOpen(false)
                }}
              >
                <SlidersHorizontal className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Filters
              </button>

              {filtersOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[270px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
                    Document Type
                  </div>

                  {filterItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#00c065]"
                        checked={item.checked}
                        onChange={(e) => item.setChecked(e.target.checked)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                className={btnBase}
                type="button"
                onClick={() => {
                  setSortOpen((prev) => !prev)
                  setFiltersOpen(false)
                }}
              >
                <span>Sort:</span>
                <span className="font-semibold">{sortLabel}</span>
                <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              </button>

              {sortOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  {(
                    [
                      ["date_desc", "Newest"],
                      ["date_asc", "Oldest"],
                      ["name_asc", "Name A-Z"],
                      ["name_desc", "Name Z-A"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      className={menuItem}
                      type="button"
                      onClick={() => {
                        setSortKey(key)
                        setSortOpen(false)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <CheckCircle2 className="h-4 w-4" />
              Project Access
            </div>
            <div className="mt-2 text-lg font-semibold text-gray-950 dark:text-slate-100">
              {clientProjectCode || "No project code found"}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Only documents linked to this project code are shown.
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Active Files
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-slate-100">
              {activeFileCount}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Available files for viewing and download.
            </div>
          </div>
        </div>

        <div className={`${cardShell} ${cardAccent}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Quotations
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-slate-100">
              {quotationCount}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Quotation documents linked to the project.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5" onClick={closeAll}>
        {activeFolder && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
              onClick={goBackToRoot}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
              Folders
            </button>
            <span className="text-gray-400 dark:text-slate-500">/</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {activeFolder.name}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:w-[380px] xl:w-[460px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
            <input
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400"
              placeholder="Search documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            <span>
              {scopedFiles.length} result{scopedFiles.length === 1 ? "" : "s"}
            </span>
            <span>•</span>
            <span>{tab === "active" ? "Active" : "Archived"}</span>
            {archivedFileCount > 0 ? (
              <>
                <span>•</span>
                <span>{archivedFileCount} archived</span>
              </>
            ) : null}
          </div>
        </div>

        {(loading || loadError) && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-slate-400" />
              ) : (
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              )}
              {loading ? "Loading documents…" : "Could not load documents"}
            </div>
            {loadError ? (
              <div className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                {loadError}
              </div>
            ) : null}
          </div>
        )}

        {!activeFolder && !isSearching && (
          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className={`${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                      Project Folders
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                      Grouped project document storage.
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                    {visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex min-h-[190px] flex-col gap-2">
                  {visibleFolders.map((folder) => {
                    const stats = folderStats[folder.id]
                    const count = stats?.count ?? folder.fileCount
                    const sizeLabel =
                      stats?.totalKb && stats.totalKb > 0
                        ? stats.totalKb >= 1024
                          ? `${Math.max(1, Math.round(stats.totalKb / 1024))} MB`
                          : `${Math.max(1, Math.round(stats.totalKb))} KB`
                        : folder.sizeLabel

                    return (
                      <button
                        key={folder.id}
                        type="button"
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3 text-left transition-colors hover:border-[#00c065]/35 hover:bg-[#00c065]/5 dark:border-slate-700 dark:bg-slate-900/35 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10"
                        onClick={() => openFolder(folder.id)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#00c065]/10 dark:bg-[#00c065]/15">
                            <Folder className="h-5 w-5 text-[#00a054] dark:text-emerald-300" />
                          </span>

                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                              {folder.name}
                            </span>
                            <span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">
                              {count} file{count === 1 ? "" : "s"} • {sizeLabel}
                            </span>
                          </span>
                        </span>
                      </button>
                    )
                  })}

                  {visibleFolders.length === 0 && (
                    <div className="grid min-h-[190px] place-items-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/35">
                      <div>
                        <Folder className="mx-auto h-7 w-7 text-gray-400 dark:text-slate-500" />
                        <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-slate-100">
                          No project folders
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                          Create a folder, then move project documents into it.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`${cardShell} ${cardAccent}`}>
              <div className={sectionHeader}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                      Recent Files
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                      Latest documents available for this project.
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                    {tab === "archived"
                      ? "—"
                      : `${recentFiles.length} item${recentFiles.length === 1 ? "" : "s"}`}
                  </div>
                </div>
              </div>

              <div className="p-4">
                {tab === "archived" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-300">
                    Recent files are available only for active documents.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {recentFiles.map((file) => {
                      const meta = typeMeta[file.type]
                      const key = `recent:${file.id}`

                      return (
                        <button
                          key={file.id}
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3 text-left transition-colors hover:border-[#00c065]/35 hover:bg-[#00c065]/5 dark:border-slate-700 dark:bg-slate-900/35 dark:hover:border-[#00c065]/35 dark:hover:bg-[#00c065]/10"
                          onClick={() => handlePreview(file)}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "inline-flex h-[24px] min-w-[38px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide",
                                meta.pillClass,
                              )}
                            >
                              {meta.pillText}
                            </span>

                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                                {file.name}
                              </span>
                              <span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">
                                {formatDateISO(file.dateISO)} • {file.sizeLabel}
                              </span>
                            </span>
                          </span>

                          <ActionMenu
                            isOpen={openMenuKey === key}
                            onToggle={() =>
                              setOpenMenuKey((prev) => (prev === key ? null : key))
                            }
                            onClose={() => setOpenMenuKey(null)}
                          >
                            <MenuItemBtn
                              icon={
                                <Eye className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                              }
                              label="Preview"
                              onClick={() => handlePreview(file)}
                            />
                            <MenuItemBtn
                              icon={
                                <FolderInput className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                              }
                              label="Move to folder"
                              onClick={() => openMoveModal(file)}
                            />
                            <MenuItemBtn
                              icon={
                                <ArrowDownToLine className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                              }
                              label="Download"
                              onClick={() => handleDownload(file)}
                            />
                          </ActionMenu>
                        </button>
                      )
                    })}

                    {recentFiles.length === 0 && !loading && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
                        No recent documents match your project code or filters.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section className={`mt-4 ${cardShell} ${cardAccent}`}>
          <div className={sectionHeader}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  {isSearching ? "Search Results" : "Project Files"}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  {scopedFiles.length} result{scopedFiles.length === 1 ? "" : "s"} •{" "}
                  {tab === "active" ? "Active" : "Archived"}
                  {activeFolder ? ` • ${activeFolder.name}` : ""}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-slate-700/70 dark:bg-slate-900/35 dark:text-slate-400">
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-left">Created By</th>
                  <th className="px-3 py-2.5 text-left">Date</th>
                  <th className="px-3 py-2.5 text-left">Size</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                {scopedFiles.map((file) => {
                  const meta = typeMeta[file.type]
                  const key = `file:${file.id}`

                  return (
                    <tr
                      key={file.id}
                      className="cursor-pointer text-sm transition hover:bg-gray-50 dark:hover:bg-slate-700/60"
                      onClick={() => handlePreview(file)}
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#00c065]/10 dark:bg-[#00c065]/15">
                            <FileText className="h-4 w-4 text-[#00a054] dark:text-emerald-300" />
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-semibold text-gray-950 dark:text-slate-100">
                              {file.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                              Click to preview
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex h-[24px] min-w-[38px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide",
                            meta.pillClass,
                          )}
                        >
                          {meta.pillText}
                        </span>
                        <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                          {meta.label}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-middle text-gray-700 dark:text-slate-300">
                        <div className="max-w-[220px] truncate" title={file.createdBy}>
                          {file.createdBy}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 align-middle text-gray-700 dark:text-slate-300">
                        {formatDateISO(file.dateISO)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 align-middle text-gray-700 dark:text-slate-300">
                        {file.sizeLabel}
                      </td>

                      <td className="px-4 py-3 text-right align-middle">
                        <ActionMenu
                          isOpen={openMenuKey === key}
                          onToggle={() =>
                            setOpenMenuKey((prev) => (prev === key ? null : key))
                          }
                          onClose={() => setOpenMenuKey(null)}
                        >
                          <MenuItemBtn
                            icon={
                              <Eye className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                            }
                            label="Preview"
                            onClick={() => handlePreview(file)}
                          />
                          <MenuItemBtn
                            icon={
                              <FolderInput className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                            }
                            label="Move to folder"
                            onClick={() => openMoveModal(file)}
                          />
                          <MenuItemBtn
                            icon={
                              <ArrowDownToLine className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                            }
                            label="Download"
                            onClick={() => handleDownload(file)}
                          />
                        </ActionMenu>
                      </td>
                    </tr>
                  )
                })}

                {scopedFiles.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12">
                      <div className="mx-auto max-w-md text-center">
                        <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gray-50 dark:bg-slate-700">
                          <FileText className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                        </div>
                        <div className="mt-3 text-sm font-semibold text-gray-950 dark:text-slate-100">
                          No matching documents
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                          Only files linked to your project code are shown here.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <CreateFolderModal
        open={createFolderOpen}
        value={newFolderName}
        saving={savingFolder}
        onChange={setNewFolderName}
        onClose={() => {
          setCreateFolderOpen(false)
          setNewFolderName("")
        }}
        onSubmit={handleCreateFolder}
      />

      <MoveDocumentModal
        open={moveModalOpen}
        file={moveTargetFile}
        folders={visibleFolders}
        selectedFolderId={selectedMoveFolderId}
        moving={movingFile}
        onSelectFolder={setSelectedMoveFolderId}
        onClose={() => {
          setMoveModalOpen(false)
          setMoveTargetFile(null)
          setSelectedMoveFolderId("")
        }}
        onMove={handleMoveDocument}
      />

      <Modal
        open={Boolean(previewFile)}
        title={previewFile?.name ?? "Document Preview"}
        subtitle={
          previewFile
            ? `${typeMeta[previewFile.type].label} • ${formatDateISO(previewFile.dateISO)}`
            : undefined
        }
        onClose={() => setPreviewFile(null)}
      >
        {previewFile ? (
          <DocumentPreview
            file={previewFile}
            onDownload={() => handleDownload(previewFile)}
          />
        ) : null}
      </Modal>
    </div>
  )
}