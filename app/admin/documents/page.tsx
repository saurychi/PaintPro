"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  MoreVertical,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Folder,
  Download,
  Pencil,
  Archive,
  X,
  ChevronLeft,
  AlertTriangle,
  Loader2,
  Upload,
  Check,
  Info,
  Plus,
  FileText,
} from "lucide-react"

import {
  listFolders,
  listDocuments,
  createFolder,
  renameFolder,
  archiveFolder,
  restoreFolder,
  createDocument,
  renameDocument,
  archiveDocument,
  restoreDocument,
  type FolderItem,
  type FileItem,
  type DocType,
  type SortKey,
} from "@/lib/data/documents.repo"

const folderPickerProps = {
  webkitdirectory: "true",
  directory: "true",
} as any

const typeMeta: Record<DocType, { label: string; pillClass: string; pillText: string }> = {
  INV: {
    label: "Invoice",
    pillText: "INV",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  PAY: {
    label: "Payroll",
    pillText: "PAY",
    pillClass:
      "border border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
  },
  RCP: {
    label: "Receipt",
    pillText: "RCP",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  QTE: {
    label: "Quote",
    pillText: "QTE",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
}

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const btnBase =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const btnPrimary =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"

const btnDanger =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 shadow-sm transition-all duration-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/25 active:scale-[0.98] dark:border-red-400/30 dark:bg-slate-800 dark:text-red-200 dark:hover:bg-red-950/30"

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-gray-500 transition-all duration-200 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100"

const menuBox =
  "min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/60 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40"

const menuItem =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700"

const inputBase =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-400"

type Toast = { id: string; message: string; tone?: "default" | "success" | "danger" }
type ArchiveTab = "active" | "archived"

function MenuItemBtn({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: "default" | "danger"
}) {
  return (
    <button
      className={cn(
        menuItem,
        tone === "danger" && "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/15 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/50">
        <div className="h-1 w-full bg-[#00c065]" />
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
          <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">{title}</div>
          <button className={iconBtn} type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-[250] flex w-[92vw] max-w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-slate-950/40",
            t.tone === "success" &&
              "border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
            t.tone === "danger" &&
              "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300"
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
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

function safeBytesToMbLabel(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (!Number.isFinite(mb) || mb <= 0) return "—"
  const rounded = Math.max(1, Math.round(mb))
  return `${rounded} MB`
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function pickDocTypeFromFilename(name: string): DocType {
  const n = name.toLowerCase()
  if (n.includes("pay")) return "PAY"
  if (n.includes("receipt") || n.includes("rcp")) return "RCP"
  if (n.includes("quote") || n.includes("qte")) return "QTE"
  return "INV"
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function folderMeta(count: number, size: string) {
  return `${count} files • ${size}`
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
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    function update() {
      const el = anchorRef.current
      if (!el) return

      const r = el.getBoundingClientRect()
      const menuWidth = 240
      const gap = 8
      const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, r.right - menuWidth))
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
    document.body
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
      <button ref={btnRef} className={iconBtn} type="button" onClick={onToggle} aria-label="Actions">
        <MoreVertical className="h-[17px] w-[17px]" />
      </button>

      <PortalMenu open={isOpen} anchorRef={btnRef} onClose={onClose}>
        {children}
      </PortalMenu>
    </div>
  )
}

export default function AdminDocuments() {
  const [query, setQuery] = useState("")
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)

  const [filterINV, setFilterINV] = useState(true)
  const [filterPAY, setFilterPAY] = useState(true)
  const [filterRCP, setFilterRCP] = useState(true)
  const [filterQTE, setFilterQTE] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>("date_desc")
  const [tab, setTab] = useState<ArchiveTab>("active")

  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})

  const [folders, setFolders] = useState<FolderItem[]>([])
  const [filesAll, setFilesAll] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [archivedFileIds, setArchivedFileIds] = useState<Record<string, boolean>>({})
  const [archivedFolderIds, setArchivedFolderIds] = useState<Record<string, boolean>>({})

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameKind, setRenameKind] = useState<"file" | "folder">("file")
  const [renameTargetId, setRenameTargetId] = useState<string>("")
  const [renameValue, setRenameValue] = useState("")

  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")

  const [uploadFileOpen, setUploadFileOpen] = useState(false)
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false)
  const [uploadFolderTargetId, setUploadFolderTargetId] = useState<string>("")

  const [confirmArchiveFolderOpen, setConfirmArchiveFolderOpen] = useState(false)
  const [archiveFolderTargetId, setArchiveFolderTargetId] = useState<string>("")

  const [confirmRestoreFolderOpen, setConfirmRestoreFolderOpen] = useState(false)
  const [restoreFolderTargetId, setRestoreFolderTargetId] = useState<string>("")

  const [viewOpen, setViewOpen] = useState(false)
  const [viewFile, setViewFile] = useState<FileItem | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  const isSearching = query.trim().length > 0
  const showArchived = tab === "archived"

  const types: Partial<Record<DocType, boolean>> = useMemo(
    () => ({ INV: filterINV, PAY: filterPAY, RCP: filterRCP, QTE: filterQTE }),
    [filterINV, filterPAY, filterRCP, filterQTE]
  )

  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null
    return folders.find((f) => f.id === activeFolderId) ?? null
  }, [activeFolderId, folders])

  const sortLabel =
    sortKey === "date_desc"
      ? "Newest"
      : sortKey === "date_asc"
        ? "Oldest"
        : sortKey === "name_asc"
          ? "Name A-Z"
          : "Name Z-A"

  const filterItems: { id: DocType; label: string; checked: boolean; setChecked: (v: boolean) => void }[] = [
    { id: "INV", label: "Invoices (INV)", checked: filterINV, setChecked: setFilterINV },
    { id: "PAY", label: "Payroll (PAY)", checked: filterPAY, setChecked: setFilterPAY },
    { id: "RCP", label: "Receipts (RCP)", checked: filterRCP, setChecked: setFilterRCP },
    { id: "QTE", label: "Quotes (QTE)", checked: filterQTE, setChecked: setFilterQTE },
  ]

  function pushToast(message: string, tone: Toast["tone"] = "default") {
    const id = makeId("toast")
    setToasts((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2500)
  }

  useEffect(() => {
    let cancelled = false

    async function seed() {
      try {
        setLoading(true)
        setLoadError(null)

        const [f, a] = await Promise.all([
          listFolders(),
          listDocuments({
            query: "",
            folderId: null,
            types: { INV: true, PAY: true, RCP: true, QTE: true },
            sort: "date_desc",
          }),
        ])

        if (cancelled) return

        setFolders(f)
        setFilesAll(a)

        setArchivedFolderIds(
          Object.fromEntries(f.filter((folder) => folder.isArchived).map((folder) => [folder.id, true]))
        )

        setArchivedFileIds(
          Object.fromEntries(a.filter((file) => file.isArchived).map((file) => [file.id, true]))
        )
      } catch (e: any) {
        if (cancelled) return
        setLoadError(e?.message ?? "Failed to load documents")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    seed()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleFolders = useMemo(() => {
    return folders.filter((f) =>
      showArchived ? Boolean(archivedFolderIds[f.id]) : !archivedFolderIds[f.id]
    )
  }, [folders, archivedFolderIds, showArchived])

  const folderStats = useMemo(() => {
    const map: Record<string, { count: number; totalBytesApprox: number }> = {}
    for (const f of filesAll) {
      const isArchived = Boolean(archivedFileIds[f.id])
      if (showArchived ? !isArchived : isArchived) continue
      if (!f.folderId) continue
      if (!map[f.folderId]) map[f.folderId] = { count: 0, totalBytesApprox: 0 }
      map[f.folderId].count += 1

      const sizeValue = f.content ? new Blob([f.content]).size : 0
      map[f.folderId].totalBytesApprox += sizeValue
    }
    return map
  }, [filesAll, archivedFileIds, showArchived])

  const scopedFiles = useMemo(() => {
    let rows = filesAll.slice()
    if (activeFolderId) rows = rows.filter((f) => f.folderId === activeFolderId)

    rows = rows.filter((f) => {
      const isArchived = Boolean(archivedFileIds[f.id])
      return showArchived ? isArchived : !isArchived
    })

    rows = rows.filter((f) => types[f.type] !== false)

    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((f) => `${f.name} ${f.createdBy}`.toLowerCase().includes(q))

    rows.sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name)
      if (sortKey === "name_desc") return b.name.localeCompare(a.name)
      const aMs = Number.isNaN(Date.parse(a.dateISO)) ? 0 : Date.parse(a.dateISO)
      const bMs = Number.isNaN(Date.parse(b.dateISO)) ? 0 : Date.parse(b.dateISO)
      if (sortKey === "date_asc") return aMs - bMs
      return bMs - aMs
    })

    return rows
  }, [filesAll, activeFolderId, archivedFileIds, showArchived, types, query, sortKey])

  const recentFiles = useMemo(() => {
    if (isSearching) return []
    if (showArchived) return []

    let rows = filesAll.slice()
    if (activeFolderId) rows = rows.filter((f) => f.folderId === activeFolderId)
    rows = rows.filter((f) => !archivedFileIds[f.id])
    rows = rows.filter((f) => types[f.type] !== false)

    rows.sort((a, b) => {
      const aMs = Number.isNaN(Date.parse(a.dateISO)) ? 0 : Date.parse(a.dateISO)
      const bMs = Number.isNaN(Date.parse(b.dateISO)) ? 0 : Date.parse(b.dateISO)
      return bMs - aMs
    })

    return rows.slice(0, 3)
  }, [filesAll, activeFolderId, archivedFileIds, types, isSearching, showArchived])

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds])
  const allCheckedOnScreen = useMemo(
    () => scopedFiles.length > 0 && scopedFiles.every((f) => Boolean(selectedIds[f.id])),
    [scopedFiles, selectedIds]
  )

  function closeAll() {
    setOpenMenuKey(null)
    setFiltersOpen(false)
    setSortOpen(false)
    setNewOpen(false)
  }

  function openFolder(folderId: string) {
    setActiveFolderId(folderId)
    setSelectedIds({})
    closeAll()
  }

  function goBackToRoot() {
    setActiveFolderId(null)
    setSelectedIds({})
    closeAll()
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }))
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = { ...prev }
      for (const f of scopedFiles) next[f.id] = checked
      return next
    })
  }

  function clearSelection() {
    setSelectedIds({})
  }

  function selectedItems() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    return scopedFiles.filter((f) => ids.has(f.id))
  }

  function canReadAsPlainContent(file: File) {
    const name = file.name.toLowerCase()

    return (
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      name.endsWith(".txt") ||
      name.endsWith(".csv") ||
      name.endsWith(".json") ||
      name.endsWith(".md") ||
      name.endsWith(".html") ||
      name.endsWith(".css") ||
      name.endsWith(".js") ||
      name.endsWith(".ts") ||
      name.endsWith(".tsx")
    )
  }

  function openViewFile(file: FileItem) {
    setViewFile(file)
    setViewOpen(true)
    setOpenMenuKey(null)
  }

  function actionDownloadFile(file: FileItem) {
    const safeName = file.name.replace(/[^\w\- ]+/g, "").trim() || "document"
    const content = file.content || "No content saved for this document."

    downloadTextFile(`${safeName}.txt`, content)
    pushToast("Exported saved content.", "success")
    setOpenMenuKey(null)
  }

  async function actionArchiveFile(fileId: string) {
    try {
      await archiveDocument(fileId)

      setArchivedFileIds((prev) => ({ ...prev, [fileId]: true }))
      setOpenMenuKey(null)
      setSelectedIds((prev) => {
        if (!prev[fileId]) return prev
        const next = { ...prev }
        delete next[fileId]
        return next
      })

      pushToast("Document archived.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Archive failed.", "danger")
    }
  }

  async function actionUnarchiveFile(fileId: string) {
    try {
      await restoreDocument(fileId)

      setArchivedFileIds((prev) => {
        const next = { ...prev }
        delete next[fileId]
        return next
      })

      setOpenMenuKey(null)
      pushToast("Document restored.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Restore failed.", "danger")
    }
  }

  function requestArchiveFolder(folderId: string) {
    setArchiveFolderTargetId(folderId)
    setConfirmArchiveFolderOpen(true)
    setOpenMenuKey(null)
  }

  async function confirmArchiveFolder() {
    const folderId = archiveFolderTargetId
    if (!folderId) return

    try {
      await archiveFolder(folderId)

      setArchivedFolderIds((prev) => ({ ...prev, [folderId]: true }))
      setArchivedFileIds((prev) => {
        const next = { ...prev }
        for (const f of filesAll) if (f.folderId === folderId) next[f.id] = true
        return next
      })

      if (activeFolderId === folderId) setActiveFolderId(null)

      setConfirmArchiveFolderOpen(false)
      setArchiveFolderTargetId("")
      pushToast("Folder archived.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Folder archive failed.", "danger")
    }
  }

  function requestRestoreFolder(folderId: string) {
    setRestoreFolderTargetId(folderId)
    setConfirmRestoreFolderOpen(true)
    setOpenMenuKey(null)
  }

  async function confirmRestoreFolder() {
    const folderId = restoreFolderTargetId
    if (!folderId) return

    try {
      await restoreFolder(folderId)

      setArchivedFolderIds((prev) => {
        const next = { ...prev }
        delete next[folderId]
        return next
      })

      setArchivedFileIds((prev) => {
        const next = { ...prev }
        for (const f of filesAll) if (f.folderId === folderId) delete next[f.id]
        return next
      })

      setConfirmRestoreFolderOpen(false)
      setRestoreFolderTargetId("")
      pushToast("Folder restored.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Folder restore failed.", "danger")
    }
  }

  function openRenameModal(kind: "file" | "folder", id: string, currentName: string) {
    setRenameKind(kind)
    setRenameTargetId(id)
    setRenameValue(currentName)
    setRenameOpen(true)
    setOpenMenuKey(null)
  }

  async function submitRename() {
    const nextName = renameValue.trim()
    if (!nextName) return

    try {
      if (renameKind === "folder") {
        await renameFolder(renameTargetId, nextName)

        setFolders((prev) => prev.map((f) => (f.id === renameTargetId ? { ...f, name: nextName } : f)))
        pushToast("Folder renamed.", "success")
      } else {
        await renameDocument(renameTargetId, nextName)

        setFilesAll((prev) => prev.map((f) => (f.id === renameTargetId ? { ...f, name: nextName } : f)))
        pushToast("Document renamed.", "success")
      }

      setRenameOpen(false)
    } catch (error: any) {
      pushToast(error?.message ?? "Rename failed.", "danger")
    }
  }

  function bulkDownload() {
    const items = selectedItems()
    const content = [
      `PaintPro Bulk Export`,
      `Count: ${items.length}`,
      ``,
      ...items.map((f, i) => {
        return [
          `${i + 1}. ${f.name} (${f.type}) - ${formatDateISO(f.dateISO)}`,
          f.content || "No content saved for this document.",
          "",
        ].join("\n")
      }),
    ].join("\n")

    downloadTextFile(`paintpro_bulk_${new Date().toISOString().slice(0, 10)}.txt`, content)
    clearSelection()
    pushToast("Exported selected content.", "success")
  }

  async function bulkArchive() {
    const items = selectedItems()

    try {
      for (const item of items) {
        await archiveDocument(item.id)
      }

      setArchivedFileIds((prev) => {
        const next = { ...prev }
        for (const f of items) next[f.id] = true
        return next
      })

      clearSelection()
      pushToast("Selected documents archived.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Bulk archive failed.", "danger")
    }
  }

  async function bulkRestore() {
    const items = selectedItems()

    try {
      for (const item of items) {
        await restoreDocument(item.id)
      }

      setArchivedFileIds((prev) => {
        const next = { ...prev }
        for (const f of items) delete next[f.id]
        return next
      })

      clearSelection()
      pushToast("Selected documents restored.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Bulk restore failed.", "danger")
    }
  }

  function openNewFolder() {
    setNewFolderName("")
    setNewFolderOpen(true)
    setNewOpen(false)
  }

  async function submitNewFolder() {
    const name = newFolderName.trim()
    if (!name) return

    try {
      const newFolder = await createFolder(name)

      setFolders((prev) => [newFolder, ...prev])
      setNewFolderOpen(false)
      pushToast("Folder created.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Failed to create folder.", "danger")
    }
  }

  function openUploadFile() {
    setUploadFileOpen(true)
    setNewOpen(false)
  }

  function openUploadFolder() {
    setUploadFolderTargetId(activeFolderId ?? "")
    setUploadFolderOpen(true)
    setNewOpen(false)
  }

  async function handleFilePicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    try {
      const picked = fileList[0]

      if (!canReadAsPlainContent(picked)) {
        pushToast("Only text-based files can be saved as content for now.", "danger")
        return
      }

      const content = await picked.text()

      const created = await createDocument({
        folderId: activeFolderId,
        documentType: pickDocTypeFromFilename(picked.name),
        title: picked.name.replace(/\.[^/.]+$/, ""),
        content,
        contentType: picked.type || "text/plain",
        originalFilename: picked.name,
        createdBy: "admin@paintpro.com",
      })

      setFilesAll((prev) => [created, ...prev])
      setUploadFileOpen(false)
      pushToast("Document content saved.", "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Failed to save document content.", "danger")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleFolderPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    try {
      const targetFolderId = uploadFolderTargetId || activeFolderId || null
      const createdFiles: FileItem[] = []

      for (const picked of Array.from(fileList)) {
        if (!canReadAsPlainContent(picked)) {
          continue
        }

        const content = await picked.text()

        const created = await createDocument({
          folderId: targetFolderId,
          documentType: pickDocTypeFromFilename(picked.name),
          title: picked.name.replace(/\.[^/.]+$/, ""),
          content,
          contentType: picked.type || "text/plain",
          originalFilename: picked.name,
          createdBy: "admin@paintpro.com",
        })

        createdFiles.push(created)
      }

      if (createdFiles.length === 0) {
        pushToast("No readable text-based files were found in that folder.", "danger")
        return
      }

      setFilesAll((prev) => [...createdFiles, ...prev])
      setUploadFolderOpen(false)
      pushToast(`Saved content from ${createdFiles.length} files.`, "success")
    } catch (error: any) {
      pushToast(error?.message ?? "Failed to save folder content.", "danger")
    } finally {
      if (folderInputRef.current) folderInputRef.current.value = ""
    }
  }

  return (
    <div
      className="min-h-full bg-[#f7f8fa] px-4 py-4 text-gray-900 dark:bg-slate-700 dark:text-slate-100 sm:px-6"
      onClick={closeAll}
    >
      <ToastStack toasts={toasts} />

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-slate-100">
            Documents
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            Files, folders, exports, and project records.
          </p>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        {activeFolder && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              className="bg-transparent p-0 text-sm font-semibold text-[#00a054] hover:underline dark:text-emerald-300"
              onClick={goBackToRoot}
              type="button"
            >
              Folders
            </button>
            <span className="text-gray-400 dark:text-slate-500">›</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{activeFolder.name}</span>

            <button className={cn(btnBase, "ml-1")} onClick={goBackToRoot} type="button">
              <ChevronLeft className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              Back
            </button>
          </div>
        )}

        <div className={cn(cardShell.replace("overflow-hidden", "overflow-visible"), cardAccent, "relative z-30 mb-4")}>
          <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-[380px] xl:w-[440px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
              <input
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400"
                placeholder="Search documents, users, dates"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:flex-nowrap">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-900/40">
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                    tab === "active"
                      ? "bg-[#00c065]/10 text-[#047857] dark:bg-[#00c065]/15 dark:text-emerald-300"
                      : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  )}
                  onClick={() => {
                    setTab("active")
                    setSelectedIds({})
                  }}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                    tab === "archived"
                      ? "bg-[#00c065]/10 text-[#047857] dark:bg-[#00c065]/15 dark:text-emerald-300"
                      : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  )}
                  onClick={() => {
                    setTab("archived")
                    setSelectedIds({})
                  }}
                >
                  Archived
                </button>
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button className={btnPrimary} type="button" onClick={() => setNewOpen((v) => !v)}>
                  <Plus className="h-4 w-4" />
                  New
                </button>

                {newOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[500] min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40">
                    <MenuItemBtn
                      icon={<Folder className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                      label="New Folder"
                      onClick={openNewFolder}
                    />
                    <MenuItemBtn
                      icon={<Upload className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                      label="File Upload"
                      onClick={openUploadFile}
                    />
                    <MenuItemBtn
                      icon={<Folder className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                      label="Folder Upload"
                      onClick={openUploadFolder}
                    />
                  </div>
                )}
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button className={btnBase} type="button" onClick={() => setFiltersOpen((v) => !v)}>
                  <SlidersHorizontal className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Filters
                </button>

                {filtersOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[500] min-w-[288px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40">
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-400">
                      Document Type
                    </div>
                    {filterItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700"
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
                    <div className="mt-2 border-t border-gray-100 px-3 pb-1 pt-2 text-xs text-gray-500 dark:border-slate-700/70 dark:text-slate-400">
                      Archive is controlled by the Active/Archived tabs.
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button className={btnBase} type="button" onClick={() => setSortOpen((v) => !v)}>
                  <span>Sort:</span>
                  <span className="font-semibold text-gray-950 dark:text-slate-100">{sortLabel}</span>
                  <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                </button>

                {sortOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[500] min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40">
                    {([
                      ["date_desc", "Newest"],
                      ["date_asc", "Oldest"],
                      ["name_asc", "Name A-Z"],
                      ["name_desc", "Name Z-A"],
                    ] as const).map(([key, label]) => (
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

        {(loading || loadError) && (
          <div className={cn(cardShell, "mb-4 p-3")}>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-slate-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              {loading ? "Loading documents…" : "Could not load documents"}
            </div>
            {loadError ? <div className="mt-1 text-sm text-gray-600 dark:text-slate-300">{loadError}</div> : null}
          </div>
        )}

        {isSearching && (
          <div className={cn(cardShell, "mb-4 p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Search results for <span className="text-gray-700 dark:text-slate-300">“{query.trim()}”</span>
              </div>
              <button className={btnBase} type="button" onClick={() => setQuery("")}>
                <X className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Clear search
              </button>
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Folders and recent are hidden while searching.
            </div>
          </div>
        )}

        {!activeFolder && !isSearching && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className={cn(cardShell, cardAccent)}>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
                <div>
                  <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">Folders</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Grouped document storage.</div>
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-slate-400">{visibleFolders.length} folders</div>
              </div>

              <div className="divide-y divide-gray-100 px-3 py-2 dark:divide-slate-700/70">
                {visibleFolders.map((folder) => {
                  const stats = folderStats[folder.id]
                  const count = stats?.count ?? folder.fileCount
                  const sizeLabel =
                    stats?.totalBytesApprox && stats.totalBytesApprox > 0
                      ? safeBytesToMbLabel(stats.totalBytesApprox)
                      : folder.sizeLabel

                  const key = `folder:${folder.id}`

                  return (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition hover:bg-gray-50 dark:hover:bg-slate-700/60"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => openFolder(folder.id)}
                        disabled={tab === "archived"}
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#00c065]/10 dark:bg-[#00c065]/15">
                          <Folder className="h-5 w-5 text-[#00a054] dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                            {folder.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            {tab === "archived" ? "Archived folder" : folderMeta(count, sizeLabel)}
                          </div>
                        </div>
                      </button>

                      <ActionMenu
                        isOpen={openMenuKey === key}
                        onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                        onClose={() => setOpenMenuKey(null)}
                      >
                        {tab === "active" ? (
                          <>
                            <MenuItemBtn
                              icon={<Folder className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Open"
                              onClick={() => openFolder(folder.id)}
                            />
                            <MenuItemBtn
                              icon={<Pencil className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Rename"
                              onClick={() => openRenameModal("folder", folder.id, folder.name)}
                            />
                            <MenuItemBtn
                              icon={<Archive className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Archive"
                              onClick={() => requestArchiveFolder(folder.id)}
                            />
                          </>
                        ) : (
                          <>
                            <MenuItemBtn
                              icon={<Check className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Restore"
                              onClick={() => requestRestoreFolder(folder.id)}
                            />
                            <MenuItemBtn
                              icon={<Pencil className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Rename"
                              onClick={() => openRenameModal("folder", folder.id, folder.name)}
                            />
                          </>
                        )}
                      </ActionMenu>
                    </div>
                  )
                })}

                {visibleFolders.length === 0 && (
                  <div className="px-3 py-8 text-sm text-gray-500 dark:text-slate-400">
                    {tab === "archived" ? "No archived folders." : "No folders to display."}
                  </div>
                )}
              </div>
            </div>

            <div className={cn(cardShell, cardAccent)}>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
                <div>
                  <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">Recent</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                    Latest uploaded and generated files.
                  </div>
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
                  {tab === "archived" ? "—" : `${recentFiles.length} items`}
                </div>
              </div>

              <div className="px-3 py-3">
                {tab === "archived" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                    Recent is available only for Active documents.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {recentFiles.map((f) => {
                      const meta = typeMeta[f.type]
                      const key = `recent:${f.id}`

                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/70"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "inline-flex h-[22px] min-w-[36px] items-center justify-center rounded-md px-2 text-xs font-semibold tracking-wide",
                                meta.pillClass
                              )}
                            >
                              {meta.pillText}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                                {f.name}
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                                {formatDateISO(f.dateISO)} • {f.sizeLabel}
                              </div>
                            </div>
                          </div>

                          <ActionMenu
                            isOpen={openMenuKey === key}
                            onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                            onClose={() => setOpenMenuKey(null)}
                          >
                            <MenuItemBtn
                              icon={<Info className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="View Content"
                              onClick={() => openViewFile(f)}
                            />
                            <MenuItemBtn
                              icon={<Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Export Content"
                              onClick={() => actionDownloadFile(f)}
                            />
                            <MenuItemBtn
                              icon={<Pencil className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Rename"
                              onClick={() => openRenameModal("file", f.id, f.name)}
                            />
                            <MenuItemBtn
                              icon={<Archive className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                              label="Archive"
                              onClick={() => actionArchiveFile(f.id)}
                            />
                          </ActionMenu>
                        </div>
                      )
                    })}

                    {recentFiles.length === 0 && !loading && (
                      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        No recent documents match your filters.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-slate-300">
                {isSearching ? "Search Results" : "All Files"}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">• {scopedFiles.length} results</div>
              {activeFolder && <div className="text-xs text-gray-500 dark:text-slate-400">• {activeFolder.name}</div>}
              <div className="text-xs font-semibold text-gray-500 dark:text-slate-300">
                • {tab === "active" ? "Active" : "Archived"}
              </div>
            </div>

            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#00c065]/10 px-2.5 py-1 text-xs font-semibold text-[#047857] dark:bg-[#00c065]/15 dark:text-emerald-300">
                  {selectedCount} selected
                </span>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-transparent bg-transparent px-3 text-sm font-semibold text-[#047857] transition-colors hover:bg-[#00c065]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
                  onClick={clearSelection}
                  type="button"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>

                {tab === "active" ? (
                  <>
                    <button className={btnBase} type="button" onClick={bulkDownload}>
                      <Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      Export
                    </button>
                    <button className={btnBase} type="button" onClick={bulkArchive}>
                      <Archive className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      Archive
                    </button>
                  </>
                ) : (
                  <button className={btnDanger} type="button" onClick={bulkRestore}>
                    <Check className="h-4 w-4" />
                    Restore
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={cn(cardShell, cardAccent)}>
            <div className="grid grid-cols-[52px_1fr_280px_180px_60px] items-center border-b border-gray-100 bg-white px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px] max-[920px]:grid-cols-[52px_1fr_0px_140px_60px] dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-400">
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={allCheckedOnScreen}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all"
                  className="h-4 w-4 accent-[#00c065]"
                />
              </div>
              <div>Name</div>
              <div className="max-[920px]:hidden">Created By</div>
              <div>Date</div>
              <div />
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {scopedFiles.map((f) => {
                const meta = typeMeta[f.type]
                const checked = Boolean(selectedIds[f.id])
                const key = `file:${f.id}`

                return (
                  <div
                    key={f.id}
                    className={cn(
                      "grid grid-cols-[52px_1fr_280px_180px_60px] items-center px-3 py-3 text-sm transition hover:bg-gray-50 max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px] max-[920px]:grid-cols-[52px_1fr_0px_140px_60px] dark:hover:bg-slate-700/60",
                      checked && "bg-[#00c065]/10 hover:bg-[#00c065]/10 dark:hover:bg-[#00c065]/15"
                    )}
                  >
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleOne(f.id, e.target.checked)}
                        aria-label={`Select ${f.name}`}
                        className="h-4 w-4 accent-[#00c065]"
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex h-[22px] min-w-[36px] items-center justify-center rounded-md px-2 text-xs font-semibold tracking-wide",
                            meta.pillClass
                          )}
                        >
                          {meta.pillText}
                        </span>

                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-950 dark:text-slate-100">{f.name}</div>
                          <div className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                            {meta.label}
                            {f.sizeLabel !== "—" ? ` • ${f.sizeLabel}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="truncate text-sm text-gray-700 max-[920px]:hidden dark:text-slate-300">
                      {f.createdBy}
                    </div>
                    <div className="whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                      {formatDateISO(f.dateISO)}
                    </div>

                    <ActionMenu
                      isOpen={openMenuKey === key}
                      onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                      onClose={() => setOpenMenuKey(null)}
                    >
                      <MenuItemBtn
                        icon={<Info className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                        label="View Content"
                        onClick={() => openViewFile(f)}
                      />
                      <MenuItemBtn
                        icon={<Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                        label="Export Content"
                        onClick={() => actionDownloadFile(f)}
                      />
                      <MenuItemBtn
                        icon={<Pencil className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                        label="Rename"
                        onClick={() => openRenameModal("file", f.id, f.name)}
                      />
                      {tab === "active" ? (
                        <MenuItemBtn
                          icon={<Archive className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                          label="Archive"
                          onClick={() => actionArchiveFile(f.id)}
                        />
                      ) : (
                        <MenuItemBtn
                          icon={<Check className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                          label="Restore"
                          onClick={() => actionUnarchiveFile(f.id)}
                        />
                      )}
                    </ActionMenu>
                  </div>
                )
              })}
            </div>

            {scopedFiles.length === 0 && !loading && (
              <div className="px-3 py-12 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gray-50 dark:bg-slate-700">
                  <FileText className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                </div>
                <div className="mt-3 text-sm font-semibold text-gray-950 dark:text-slate-100">
                  No matching documents
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Try changing your search, filters, or sort option.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <Modal open={viewOpen} title={viewFile?.name ?? "Document Content"} onClose={() => setViewOpen(false)}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            <span>{viewFile?.originalFilename ?? "Saved content"}</span>
            <span>•</span>
            <span>{viewFile?.contentType ?? "text/plain"}</span>
            <span>•</span>
            <span>{viewFile?.sizeLabel ?? "—"}</span>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 dark:text-slate-200">
              {viewFile?.content || "No content saved for this document."}
            </pre>
          </div>

          <div className="flex justify-end">
            <button className={btnBase} type="button" onClick={() => setViewOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        title={renameKind === "folder" ? "Rename Folder" : "Rename Document"}
        onClose={() => setRenameOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-slate-300">Enter a new name.</div>
          <input className={inputBase} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className={btnBase} type="button" onClick={() => setRenameOpen(false)}>
              Cancel
            </button>
            <button className={btnPrimary} type="button" onClick={submitRename}>
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={newFolderOpen} title="New Folder" onClose={() => setNewFolderOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-slate-300">Create a folder to organize documents.</div>
          <input
            className={inputBase}
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className={btnBase} type="button" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </button>
            <button className={btnPrimary} type="button" onClick={submitNewFolder}>
              Create
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={uploadFileOpen} title="File Upload" onClose={() => setUploadFileOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-slate-300">
            Pick a text-based file to save its content. It will be added{" "}
            {activeFolder ? `to "${activeFolder.name}"` : "to the root"}.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFilePicked(e.currentTarget.files)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose File
            </button>
            <button className={btnBase} type="button" onClick={() => setUploadFileOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={uploadFolderOpen} title="Folder Upload" onClose={() => setUploadFolderOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-slate-300">
            Select a folder. Only readable text-based files will be saved as content.
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-400">
              Target folder
            </div>
            <select
              className={inputBase}
              value={uploadFolderTargetId}
              onChange={(e) => setUploadFolderTargetId(e.target.value)}
            >
              <option value="">Root (no folder)</option>
              {folders
                .filter((f) => !archivedFolderIds[f.id])
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            multiple
            {...folderPickerProps}
            onChange={(e) => handleFolderPicked(e.currentTarget.files)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} type="button" onClick={() => folderInputRef.current?.click()}>
              <Folder className="h-4 w-4" /> Choose Folder
            </button>
            <button className={btnBase} type="button" onClick={() => setUploadFolderOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmArchiveFolderOpen}
        title="Archive Folder"
        onClose={() => setConfirmArchiveFolderOpen(false)}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <Info className="mt-0.5 h-4 w-4 text-gray-500 dark:text-slate-400" />
            <div className="text-sm text-gray-700 dark:text-slate-300">
              Archiving a folder will also archive all documents inside it.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className={btnBase} type="button" onClick={() => setConfirmArchiveFolderOpen(false)}>
              Cancel
            </button>
            <button className={btnDanger} type="button" onClick={confirmArchiveFolder}>
              <Archive className="h-4 w-4" /> Archive Folder
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmRestoreFolderOpen}
        title="Restore Folder"
        onClose={() => setConfirmRestoreFolderOpen(false)}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <Info className="mt-0.5 h-4 w-4 text-gray-500 dark:text-slate-400" />
            <div className="text-sm text-gray-700 dark:text-slate-300">
              Restoring a folder will also restore all archived documents inside it.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className={btnBase} type="button" onClick={() => setConfirmRestoreFolderOpen(false)}>
              Cancel
            </button>
            <button className={btnPrimary} type="button" onClick={confirmRestoreFolder}>
              <Check className="h-4 w-4" /> Restore Folder
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}