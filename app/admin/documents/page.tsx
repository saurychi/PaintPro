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
} from "lucide-react"

import {
  listFolders,
  listDocuments,
  type FolderItem,
  type FileItem,
  type DocType,
  type SortKey,
} from "@/lib/data/documents.repo"

/* ----------------------------- non-standard input props ----------------------------- */
/** Fixes TS error for folder upload inputs (webkitdirectory/directory not in React typings) */
const folderPickerProps = {
  webkitdirectory: "true",
  directory: "true",
} as any

/* ----------------------------------- meta ----------------------------------- */

const typeMeta: Record<DocType, { label: string; pillClass: string; pillText: string }> = {
  INV: {
    label: "Invoice",
    pillText: "INV",
    pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20",
  },
  PAY: {
    label: "Payroll",
    pillText: "PAY",
    pillClass: "bg-red-500/10 text-red-900 border border-red-500/20",
  },
  RCP: {
    label: "Receipt",
    pillText: "RCP",
    pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20",
  },
  QTE: {
    label: "Quote",
    pillText: "QTE",
    pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20",
  },
}

/* --------------------------------- styling --------------------------------- */

const btnBase =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"

const btnPrimary =
  "inline-flex h-10 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"

const btnDanger =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/25 bg-white px-4 text-sm font-semibold text-red-900 shadow-sm hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/25 active:scale-[0.98]"

const iconBtn =
  "grid h-9 w-9 place-items-center rounded-lg border border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"

const menuBox = "min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
const menuItem =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"

const inputBase =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25"

/* -------------------------------- utilities -------------------------------- */

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
      className={cn(menuItem, tone === "danger" && "text-red-900 hover:bg-red-50")}
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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button className={iconBtn} type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

type Toast = { id: string; message: string; tone?: "default" | "success" | "danger" }

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-[250] flex w-[92vw] max-w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm",
            t.tone === "success" && "border-[#00c065]/25 bg-[#00c065]/10 text-[#166534]",
            t.tone === "danger" && "border-red-500/25 bg-red-50 text-red-900"
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
  return `${count} files  •  ${size}`
}

type ArchiveTab = "active" | "archived"

/* -------------------------- portal dropdown (fix clipping) -------------------------- */

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
      const gap = 10
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
        <MoreVertical className="h-[18px] w-[18px] text-gray-500" />
      </button>

      <PortalMenu open={isOpen} anchorRef={btnRef} onClose={onClose}>
        {children}
      </PortalMenu>
    </div>
  )
}

/* ---------------------------------- page ---------------------------------- */

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
      const m = /(\d+)\s*MB/i.exec(f.sizeLabel || "")
      if (m) map[f.folderId].totalBytesApprox += Number(m[1]) * 1024 * 1024
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

  function actionDownloadFile(file: FileItem) {
    const content = [
      `PaintPro Document (Dummy)`,
      `Name: ${file.name}`,
      `Type: ${file.type}`,
      `Created By: ${file.createdBy}`,
      `Date: ${formatDateISO(file.dateISO)}`,
      `Size: ${file.sizeLabel}`,
      ``,
      `This is a placeholder download while the database/storage is not finalized.`,
    ].join("\n")

    const safeName = file.name.replace(/[^\w\- ]+/g, "").trim() || "document"
    downloadTextFile(`${safeName}.txt`, content)
    pushToast("Downloaded document (dummy).", "success")
    setOpenMenuKey(null)
  }

  function actionArchiveFile(fileId: string) {
    setArchivedFileIds((prev) => ({ ...prev, [fileId]: true }))
    setOpenMenuKey(null)
    setSelectedIds((prev) => {
      if (!prev[fileId]) return prev
      const next = { ...prev }
      delete next[fileId]
      return next
    })
    pushToast("Document archived.", "success")
  }

  function actionUnarchiveFile(fileId: string) {
    setArchivedFileIds((prev) => {
      const next = { ...prev }
      delete next[fileId]
      return next
    })
    setOpenMenuKey(null)
    pushToast("Document restored.", "success")
  }

  function requestArchiveFolder(folderId: string) {
    setArchiveFolderTargetId(folderId)
    setConfirmArchiveFolderOpen(true)
    setOpenMenuKey(null)
  }

  function confirmArchiveFolder() {
    const folderId = archiveFolderTargetId
    if (!folderId) return

    setArchivedFolderIds((prev) => ({ ...prev, [folderId]: true }))
    setArchivedFileIds((prev) => {
      const next = { ...prev }
      for (const f of filesAll) if (f.folderId === folderId) next[f.id] = true
      return next
    })

    if (activeFolderId === folderId) setActiveFolderId(null)

    setConfirmArchiveFolderOpen(false)
    setArchiveFolderTargetId("")
    pushToast("Folder archived (files inside archived too).", "success")
  }

  function requestRestoreFolder(folderId: string) {
    setRestoreFolderTargetId(folderId)
    setConfirmRestoreFolderOpen(true)
    setOpenMenuKey(null)
  }

  function confirmRestoreFolder() {
    const folderId = restoreFolderTargetId
    if (!folderId) return

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
    pushToast("Folder restored (files inside restored too).", "success")
  }

  function openRenameModal(kind: "file" | "folder", id: string, currentName: string) {
    setRenameKind(kind)
    setRenameTargetId(id)
    setRenameValue(currentName)
    setRenameOpen(true)
    setOpenMenuKey(null)
  }

  function submitRename() {
    const nextName = renameValue.trim()
    if (!nextName) return

    if (renameKind === "folder") {
      setFolders((prev) => prev.map((f) => (f.id === renameTargetId ? { ...f, name: nextName } : f)))
      pushToast("Folder renamed.", "success")
    } else {
      setFilesAll((prev) => prev.map((f) => (f.id === renameTargetId ? { ...f, name: nextName } : f)))
      pushToast("Document renamed.", "success")
    }

    setRenameOpen(false)
  }

  function bulkDownload() {
    const items = selectedItems()
    const content = [
      `PaintPro Bulk Download (Dummy)`,
      `Count: ${items.length}`,
      ``,
      ...items.map((f, i) => `${i + 1}. ${f.name} (${f.type}) - ${formatDateISO(f.dateISO)}`),
    ].join("\n")

    downloadTextFile(`paintpro_bulk_${new Date().toISOString().slice(0, 10)}.txt`, content)
    clearSelection()
    pushToast("Downloaded selection (dummy).", "success")
  }

  function bulkArchive() {
    const items = selectedItems()
    setArchivedFileIds((prev) => {
      const next = { ...prev }
      for (const f of items) next[f.id] = true
      return next
    })
    clearSelection()
    pushToast("Selected documents archived.", "success")
  }

  function bulkRestore() {
    const items = selectedItems()
    setArchivedFileIds((prev) => {
      const next = { ...prev }
      for (const f of items) delete next[f.id]
      return next
    })
    clearSelection()
    pushToast("Selected documents restored.", "success")
  }

  function openNewFolder() {
    setNewFolderName("")
    setNewFolderOpen(true)
    setNewOpen(false)
  }

  function submitNewFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const id = makeId("folder")
    const newFolder: FolderItem = { id, name, fileCount: 0, sizeLabel: "0 MB" }
    setFolders((prev) => [newFolder, ...prev])
    setNewFolderOpen(false)
    pushToast("Folder created.", "success")
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

  function handleFilePicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const picked = fileList[0]
    const iso = new Date().toISOString()

    const newFile: FileItem = {
      id: makeId("file"),
      type: pickDocTypeFromFilename(picked.name),
      name: picked.name.replace(/\.[^/.]+$/, ""),
      createdBy: "admin@paintpro.com",
      dateISO: iso,
      dateLabel: "",
      sizeLabel: safeBytesToMbLabel(picked.size),
      folderId: activeFolderId ?? undefined,
    }

    setFilesAll((prev) => [newFile, ...prev])
    setUploadFileOpen(false)
    pushToast("File uploaded (dummy).", "success")
  }

  function handleFolderPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const targetFolderId = uploadFolderTargetId || activeFolderId || ""
    const iso = new Date().toISOString()

    const toAdd: FileItem[] = Array.from(fileList).map((picked) => ({
      id: makeId("file"),
      type: pickDocTypeFromFilename(picked.name),
      name: picked.name.replace(/\.[^/.]+$/, ""),
      createdBy: "admin@paintpro.com",
      dateISO: iso,
      dateLabel: "",
      sizeLabel: safeBytesToMbLabel(picked.size),
      folderId: targetFolderId || undefined,
    }))

    setFilesAll((prev) => [...toAdd, ...prev])
    setUploadFolderOpen(false)
    pushToast(`Folder uploaded (dummy): ${toAdd.length} files added.`, "success")
  }

  return (
    <div className="p-6 text-gray-900" onClick={closeAll}>
      <ToastStack toasts={toasts} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
          <div className="mt-1 text-sm text-gray-500">Files, folders, and exports.</div>
        </div>
      </div>

      <div className="mt-5" onClick={(e) => e.stopPropagation()}>
        {activeFolder && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              className="bg-transparent p-0 text-sm font-semibold text-[#00c065] hover:underline"
              onClick={goBackToRoot}
              type="button"
            >
              Folders
            </button>
            <span className="text-gray-400">›</span>
            <span className="text-sm font-semibold text-gray-900">{activeFolder.name}</span>

            <button className={cn(btnBase, "ml-1 px-3")} onClick={goBackToRoot} type="button">
              <ChevronLeft className="h-4 w-4 text-gray-500" />
              Back
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:w-[360px] xl:w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25"
              placeholder="Search documents, users, dates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:flex-nowrap">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                  tab === "active" ? "bg-[#00c065]/10 text-[#166534]" : "text-gray-700 hover:bg-gray-50"
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
                  tab === "archived" ? "bg-[#00c065]/10 text-[#166534]" : "text-gray-700 hover:bg-gray-50"
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
                + New
              </button>

              {newOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <MenuItemBtn
                    icon={<Folder className="h-4 w-4 text-gray-500" />}
                    label="New Folder"
                    onClick={openNewFolder}
                  />
                  <MenuItemBtn
                    icon={<Upload className="h-4 w-4 text-gray-500" />}
                    label="File Upload"
                    onClick={openUploadFile}
                  />
                  <MenuItemBtn
                    icon={<Folder className="h-4 w-4 text-gray-500" />}
                    label="Folder Upload"
                    onClick={openUploadFolder}
                  />
                </div>
              )}
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button className={btnBase} type="button" onClick={() => setFiltersOpen((v) => !v)}>
                <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                Filters
              </button>

              {filtersOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[288px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500">Document Type</div>
                  {filterItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
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
                  <div className="mt-2 border-t border-gray-200 px-3 pb-1 pt-2 text-xs text-gray-500">
                    Archive is controlled by the Active/Archived tabs.
                  </div>
                </div>
              )}
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button className={btnBase} type="button" onClick={() => setSortOpen((v) => !v)}>
                <span>Sort:</span>
                <span className="font-semibold text-gray-900">{sortLabel}</span>
                <ArrowUpDown className="h-4 w-4 text-gray-500" />
              </button>

              {sortOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
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

        {(loading || loadError) && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              {loading ? "Loading documents…" : "Could not load documents"}
            </div>
            {loadError ? <div className="mt-1 text-sm text-gray-600">{loadError}</div> : null}
          </div>
        )}

        {isSearching && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">
                Search results for <span className="text-gray-700">“{query.trim()}”</span>
              </div>
              <button className={btnBase} type="button" onClick={() => setQuery("")}>
                <X className="h-4 w-4 text-gray-500" />
                Clear search
              </button>
            </div>
            <div className="mt-1 text-sm text-gray-500">Folders and recent are hidden while searching.</div>
          </div>
        )}

        {!activeFolder && !isSearching && (
          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500">Folders</div>
                <div className="text-xs text-gray-500">{visibleFolders.length} folders</div>
              </div>

              <div className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
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
                      className="flex items-center justify-between gap-3 bg-white px-3 py-3 hover:bg-gray-50"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => openFolder(folder.id)}
                        disabled={tab === "archived"}
                      >
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#00c065]/10">
                          <Folder className="h-5 w-5 text-[#00a054]" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">{folder.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
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
                              icon={<Folder className="h-4 w-4 text-gray-500" />}
                              label="Open"
                              onClick={() => openFolder(folder.id)}
                            />
                            <MenuItemBtn
                              icon={<Pencil className="h-4 w-4 text-gray-500" />}
                              label="Rename"
                              onClick={() => openRenameModal("folder", folder.id, folder.name)}
                            />
                            <MenuItemBtn
                              icon={<Archive className="h-4 w-4 text-gray-500" />}
                              label="Archive"
                              onClick={() => requestArchiveFolder(folder.id)}
                            />
                          </>
                        ) : (
                          <>
                            <MenuItemBtn
                              icon={<Check className="h-4 w-4 text-gray-500" />}
                              label="Restore"
                              onClick={() => requestRestoreFolder(folder.id)}
                            />
                            <MenuItemBtn
                              icon={<Pencil className="h-4 w-4 text-gray-500" />}
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
                  <div className="px-3 py-6 text-sm text-gray-500">
                    {tab === "archived" ? "No archived folders." : "No folders to display."}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500">Recent</div>
                <div className="text-xs text-gray-500">{tab === "archived" ? "—" : `${recentFiles.length} items`}</div>
              </div>

              {tab === "archived" ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-sm text-gray-600">
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
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide",
                              meta.pillClass
                            )}
                          >
                            {meta.pillText}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">{f.name}</div>
                            <div className="mt-1 text-xs text-gray-500">
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
                            icon={<Download className="h-4 w-4 text-gray-500" />}
                            label="Download"
                            onClick={() => actionDownloadFile(f)}
                          />
                          <MenuItemBtn
                            icon={<Pencil className="h-4 w-4 text-gray-500" />}
                            label="Rename"
                            onClick={() => openRenameModal("file", f.id, f.name)}
                          />
                          <MenuItemBtn
                            icon={<Archive className="h-4 w-4 text-gray-500" />}
                            label="Archive"
                            onClick={() => actionArchiveFile(f.id)}
                          />
                        </ActionMenu>
                      </div>
                    )
                  })}

                  {recentFiles.length === 0 && !loading && (
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
                      No recent documents match your filters.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-gray-500">{isSearching ? "Search Results" : "All Files"}</div>
              <div className="text-xs text-gray-500">• {scopedFiles.length} results</div>
              {activeFolder && <div className="text-xs text-gray-500">• {activeFolder.name}</div>}
              <div className="text-xs font-semibold text-gray-500">• {tab === "active" ? "Active" : "Archived"}</div>
            </div>

            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-green-900">{selectedCount} selected</span>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-transparent bg-transparent px-3 text-sm font-semibold text-green-900 hover:bg-[#00c065]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]"
                  onClick={clearSelection}
                  type="button"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>

                {tab === "active" ? (
                  <>
                    <button className={btnBase} type="button" onClick={bulkDownload}>
                      <Download className="h-4 w-4 text-gray-500" />
                      Download
                    </button>
                    <button className={btnBase} type="button" onClick={bulkArchive}>
                      <Archive className="h-4 w-4 text-gray-500" />
                      Archive
                    </button>
                  </>
                ) : (
                  <button className={btnDanger} type="button" onClick={bulkRestore}>
                    <Check className="h-4 w-4 text-red-700" />
                    Restore
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="sticky top-0 z-10 grid grid-cols-[52px_1fr_280px_180px_60px] items-center border-b border-gray-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px] max-[920px]:grid-cols-[52px_1fr_0px_140px_60px]">
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={allCheckedOnScreen}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all"
                  className="h-4 w-4 accent-[#00c065]"
                />
              </div>
              <div>NAME</div>
              <div className="max-[920px]:hidden">CREATED BY</div>
              <div>DATE</div>
              <div />
            </div>

            {scopedFiles.map((f) => {
              const meta = typeMeta[f.type]
              const checked = Boolean(selectedIds[f.id])
              const key = `file:${f.id}`

              return (
                <div
                  key={f.id}
                  className={cn(
                    "grid grid-cols-[52px_1fr_280px_180px_60px] items-center border-b border-gray-100 px-3 py-3 text-sm hover:bg-gray-50 max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px] max-[920px]:grid-cols-[52px_1fr_0px_140px_60px]",
                    checked && "bg-[#00c065]/10 hover:bg-[#00c065]/10"
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
                          "inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide",
                          meta.pillClass
                        )}
                      >
                        {meta.pillText}
                      </span>

                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">{f.name}</div>
                        <div className="mt-1 truncate text-xs text-gray-500">
                          {meta.label}
                          {f.sizeLabel !== "—" ? `  •  ${f.sizeLabel}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="truncate text-sm text-gray-700 max-[920px]:hidden">{f.createdBy}</div>
                  <div className="whitespace-nowrap text-sm text-gray-700">{formatDateISO(f.dateISO)}</div>

                  <ActionMenu
                    isOpen={openMenuKey === key}
                    onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                    onClose={() => setOpenMenuKey(null)}
                  >
                    <MenuItemBtn
                      icon={<Download className="h-4 w-4 text-gray-500" />}
                      label="Download"
                      onClick={() => actionDownloadFile(f)}
                    />
                    <MenuItemBtn
                      icon={<Pencil className="h-4 w-4 text-gray-500" />}
                      label="Rename"
                      onClick={() => openRenameModal("file", f.id, f.name)}
                    />
                    {tab === "active" ? (
                      <MenuItemBtn
                        icon={<Archive className="h-4 w-4 text-gray-500" />}
                        label="Archive"
                        onClick={() => actionArchiveFile(f.id)}
                      />
                    ) : (
                      <MenuItemBtn
                        icon={<Check className="h-4 w-4 text-gray-500" />}
                        label="Restore"
                        onClick={() => actionUnarchiveFile(f.id)}
                      />
                    )}
                  </ActionMenu>
                </div>
              )
            })}

            {scopedFiles.length === 0 && !loading && (
              <div className="px-3 py-10 text-center">
                <div className="text-sm font-semibold text-gray-900">No matching documents</div>
                <div className="mt-2 text-sm text-gray-500">Try changing your search, filters, or sort option.</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Rename */}
      <Modal
        open={renameOpen}
        title={renameKind === "folder" ? "Rename Folder" : "Rename Document"}
        onClose={() => setRenameOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-600">Enter a new name.</div>
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

      {/* New folder */}
      <Modal open={newFolderOpen} title="New Folder" onClose={() => setNewFolderOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">Create a folder to organize documents.</div>
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

      {/* File upload */}
      <Modal open={uploadFileOpen} title="File Upload" onClose={() => setUploadFileOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            Pick a file to add. It will be added {activeFolder ? `to "${activeFolder.name}"` : "to the root"}.
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

      {/* Folder upload */}
      <Modal open={uploadFolderOpen} title="Folder Upload" onClose={() => setUploadFolderOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            Select a folder (browser will pick multiple files). Files will be added to the selected folder.
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Target folder</div>
            <select
              className={inputBase}
              value={uploadFolderTargetId}
              onChange={(e) => setUploadFolderTargetId(e.target.value)}
            >
              <option value="">Root (no folder)</option>
              {folders.map((f) => (
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

      {/* Confirm archive folder */}
      <Modal
        open={confirmArchiveFolderOpen}
        title="Archive Folder"
        onClose={() => setConfirmArchiveFolderOpen(false)}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <Info className="mt-0.5 h-4 w-4 text-gray-500" />
            <div className="text-sm text-gray-700">Archiving a folder will also archive all documents inside it.</div>
          </div>

          <div className="flex justify-end gap-2">
            <button className={btnBase} type="button" onClick={() => setConfirmArchiveFolderOpen(false)}>
              Cancel
            </button>
            <button className={btnDanger} type="button" onClick={confirmArchiveFolder}>
              <Archive className="h-4 w-4 text-red-700" /> Archive Folder
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm restore folder */}
      <Modal
        open={confirmRestoreFolderOpen}
        title="Restore Folder"
        onClose={() => setConfirmRestoreFolderOpen(false)}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <Info className="mt-0.5 h-4 w-4 text-gray-500" />
            <div className="text-sm text-gray-700">
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