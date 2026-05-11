"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  MoreVertical,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Download,
  X,
  AlertTriangle,
  Info,
  FileText,
  ChevronDown,
  RefreshCw,
  Clock,
} from "lucide-react"

import {
  listDocuments,
  type FileItem,
  type DocType,
  type SortKey,
} from "@/lib/data/documents.repo"

const typeMeta: Record<DocType, { label: string; pillClass: string; pillText: string }> = {
  INV: {
    label: "Invoice",
    pillText: "INV",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  QTE: {
    label: "Quotation",
    pillText: "QTE",
    pillClass:
      "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300",
  },
  AGR: {
    label: "Cancellation Agreement",
    pillText: "AGR",
    pillClass:
      "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300",
  },
}

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const btnBase =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const iconBtn =
  "grid h-7 w-7 place-items-center rounded-md border border-transparent bg-transparent text-gray-500 transition-all duration-200 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100"

const menuBox =
  "min-w-[200px] rounded-md border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-200/60 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40"

const menuItem =
  "inline-flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700"

type Toast = { id: string; message: string; tone?: "default" | "success" | "danger" }

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

function Modal({
  open,
  title,
  children,
  onClose,
  size = "default",
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  size?: "default" | "wide"
}) {
  if (!open) return null

  const widthClass = size === "wide" ? "max-w-[1120px]" : "max-w-[560px]"

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "absolute left-1/2 top-1/2 w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl shadow-gray-900/15 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/50",
          widthClass,
        )}
      >
        <div className="h-1 w-full bg-[#00c065]" />
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-slate-700/70">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
              {title}
            </div>
          </div>
          <button className={iconBtn} type="button" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
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
            "rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-slate-950/40",
            t.tone === "success" &&
              "border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
            t.tone === "danger" &&
              "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
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

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
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
      const menuWidth = 220
      const gap = 6
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
      <button ref={btnRef} className={iconBtn} type="button" onClick={onToggle} aria-label="Actions">
        <MoreVertical className="h-4 w-4" />
      </button>
      <PortalMenu open={isOpen} anchorRef={btnRef} onClose={onClose}>
        {children}
      </PortalMenu>
    </div>
  )
}

export default function AdminDocuments() {
  // `/admin/documents?openType=INV[&projectCode=PP-XXX]` deep-link from
  // pages like the invoice-generation "Go to file" button. We auto-open
  // the matching file once after files load.
  const searchParams = useSearchParams()
  const openTypeParam = (searchParams.get("openType") || "").toUpperCase()
  const projectCodeParam = (searchParams.get("projectCode") || "").trim()
  const handledOpenKeyRef = useRef<string | null>(null)

  const [query, setQuery] = useState("")
  const [filterINV, setFilterINV] = useState(true)
  const [filterQTE, setFilterQTE] = useState(true)
  const [filterAGR, setFilterAGR] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>("date_desc")

  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [filesAll, setFilesAll] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewFile, setViewFile] = useState<FileItem | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])

  const isSearching = query.trim().length > 0

  const types: Partial<Record<DocType, boolean>> = useMemo(
    () => ({ INV: filterINV, QTE: filterQTE, AGR: filterAGR }),
    [filterINV, filterQTE, filterAGR],
  )

  const filterItems: { id: DocType; label: string; checked: boolean; setChecked: (v: boolean) => void }[] = [
    { id: "INV", label: "Invoices (INV)", checked: filterINV, setChecked: setFilterINV },
    { id: "QTE", label: "Quotations (QTE)", checked: filterQTE, setChecked: setFilterQTE },
    { id: "AGR", label: "Cancellation Agreement (AGR)", checked: filterAGR, setChecked: setFilterAGR },
  ]

  const activeFilterCount =
    (sortKey !== "date_desc" ? 1 : 0) + filterItems.filter((item) => !item.checked).length

  function clearDocumentFilters() {
    setSortKey("date_desc")
    setFilterINV(true)
    setFilterQTE(true)
    setFilterAGR(true)
  }

  function pushToast(message: string, tone: Toast["tone"] = "default") {
    const id = makeId("toast")
    setToasts((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2500)
  }

  async function loadFiles(mode: "initial" | "refresh" = "initial") {
    try {
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setLoadError(null)

      const rows = await listDocuments({
        query: "",
        types: { INV: true, QTE: true, AGR: true },
        sort: "date_desc",
      })

      setFilesAll(rows)
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load documents")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadFiles("initial")
  }, [])

  // Auto-open when arriving via `?openType=INV&projectCode=PP-XXXX`.
  useEffect(() => {
    if (!openTypeParam) return
    if (filesAll.length === 0) return

    const allowedTypes: DocType[] = ["INV", "QTE", "AGR"]
    if (!(allowedTypes as string[]).includes(openTypeParam)) return

    const seedKey = `${openTypeParam}::${projectCodeParam}`
    if (handledOpenKeyRef.current === seedKey) return

    const codeNeedle = projectCodeParam.toLowerCase()
    const matches = filesAll
      .filter((file) => file.type === (openTypeParam as DocType))
      .filter((file) => {
        if (!codeNeedle) return true
        const haystack = `${file.name} ${file.fileName} ${file.projectCode ?? ""}`.toLowerCase()
        return haystack.includes(codeNeedle)
      })
      .sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime())

    const target = matches[0]
    if (!target) return

    handledOpenKeyRef.current = seedKey
    setViewFile(target)
    setViewOpen(true)
  }, [openTypeParam, projectCodeParam, filesAll])

  const scopedFiles = useMemo(() => {
    let rows = filesAll.slice()
    rows = rows.filter((f) => types[f.type] !== false)

    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((f) =>
        `${f.name} ${f.createdBy} ${f.projectCode ?? ""} ${f.projectTitle ?? ""}`.toLowerCase().includes(q),
      )
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
  }, [filesAll, types, query, sortKey])

  function closeAll() {
    setOpenMenuKey(null)
    setFiltersOpen(false)
  }

  function openViewFile(file: FileItem) {
    setViewFile(file)
    setViewOpen(true)
    setOpenMenuKey(null)
  }

  async function actionDownloadFile(file: FileItem) {
    if (!file.signedUrl) {
      pushToast("Storage URL is not available for this file.", "danger")
      return
    }
    try {
      const response = await fetch(file.signedUrl)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = file.fileName || file.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      pushToast("Download started.", "success")
    } catch (e: any) {
      pushToast(e?.message ?? "Failed to download file.", "danger")
    }
  }

  return (
    <div
      className="flex min-h-0 flex-col overflow-y-auto bg-[#f7f8fa] px-3 pb-3 pt-3 text-gray-900 dark:bg-slate-700 dark:text-slate-100 sm:px-4 lg:h-screen lg:overflow-hidden lg:pb-3"
      onClick={closeAll}
    >
      <ToastStack toasts={toasts} />

      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-8 text-gray-900 dark:text-slate-100">
            Documents
          </h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Project-generated quotations, invoices, and agreements pulled from secure storage.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/documents/pending"
            className={cn(btnBase, "shrink-0")}
            title="View pending documents"
          >
            <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
            Pending
          </Link>
          <button
            type="button"
            onClick={() => loadFiles("refresh")}
            disabled={loading || refreshing}
            className={cn(btnBase, "shrink-0", refreshing && "opacity-70")}
            title="Refresh from storage"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-gray-500 dark:text-slate-400", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1" onClick={(e) => e.stopPropagation()}>
        <div className={cn(cardShell.replace("overflow-hidden", "overflow-visible"), "relative z-30 shrink-0")}>
          <div className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-[340px] xl:w-[400px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
              <input
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400"
                placeholder="Search by file, project code, manager"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:flex-nowrap">
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]",
                    filtersOpen || activeFilterCount > 0
                      ? "border-[#00c065]/40 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/40 dark:bg-[#00c065]/15 dark:text-emerald-300"
                      : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700",
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#00c065] px-1 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")} />
                </button>

                {filtersOpen && (
                  <div className="absolute right-0 top-10 z-[500] w-[320px] rounded-md border border-gray-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-2 flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-slate-700/70">
                      <div>
                        <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">Filter Documents</div>
                        <div className="text-[11px] text-gray-500 dark:text-slate-400">Refine the documents list results.</div>
                      </div>
                      <button type="button" onClick={() => setFiltersOpen(false)} className={iconBtn} aria-label="Close filters">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-slate-400">Document Type</span>
                        <div className="grid grid-cols-1 gap-1.5">
                          {filterItems.map((item) => (
                            <label
                              key={item.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-[#00c065]"
                                checked={item.checked}
                                onChange={(e) => item.setChecked(e.target.checked)}
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-slate-400">Sort by</span>
                        <div className="relative">
                          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                          <select
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                            className="h-8 w-full appearance-none rounded-md border border-gray-200 bg-white pl-8 pr-8 text-xs font-semibold text-gray-900 shadow-sm outline-none transition hover:bg-gray-50 focus:ring-2 focus:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            <option value="date_desc">Newest</option>
                            <option value="date_asc">Oldest</option>
                            <option value="name_asc">Name A-Z</option>
                            <option value="name_desc">Name Z-A</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                        </div>
                      </label>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-slate-700/70">
                      <button
                        type="button"
                        onClick={clearDocumentFilters}
                        className="inline-flex h-7 items-center rounded-md border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className="inline-flex h-7 items-center rounded-md bg-[#00c065] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#00a054]"
                      >
                        Apply filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <section className="flex flex-col lg:min-h-0 lg:flex-1">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-slate-300">
                {isSearching ? "Search Results" : "All Files"}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400">• {scopedFiles.length} results</div>
            </div>
          </div>

          <div className={cn(cardShell, cardAccent, "flex flex-col lg:min-h-0 lg:flex-1")}>
            <div className="grid shrink-0 grid-cols-[1fr_180px_220px_140px_56px] items-center border-b border-gray-100 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 max-[1220px]:grid-cols-[1fr_160px_180px_130px_56px] max-[920px]:grid-cols-[1fr_140px_0px_120px_56px] dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-400">
              <div>Name</div>
              <div>Project</div>
              <div className="max-[920px]:hidden">Project Manager</div>
              <div>Date</div>
              <div />
            </div>

            <div className="flex flex-col bg-white dark:bg-slate-800/25 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              <div className="min-h-[200px] divide-y divide-gray-100 overflow-y-auto dark:divide-slate-700/70 lg:min-h-0 lg:flex-1">
                {loading ? (
                  <div className="divide-y divide-gray-100 dark:divide-slate-700/70">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="grid min-h-[52px] grid-cols-[1fr_180px_220px_140px_56px] items-center px-3 py-2 max-[1220px]:grid-cols-[1fr_160px_180px_130px_56px] max-[920px]:grid-cols-[1fr_140px_0px_120px_56px]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="h-5 w-9 animate-pulse rounded-md bg-gray-200 dark:bg-slate-700" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                            <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-slate-700/60" />
                          </div>
                        </div>
                        <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                        <div className="h-3 w-28 animate-pulse rounded bg-gray-200 max-[920px]:hidden dark:bg-slate-700" />
                        <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                        <div className="justify-self-center">
                          <div className="h-7 w-7 animate-pulse rounded-md bg-gray-100 dark:bg-slate-700/60" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : loadError ? (
                  <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-3 py-8 text-center">
                    <div className="mx-auto grid h-9 w-9 place-items-center rounded-md bg-amber-50 dark:bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-gray-950 dark:text-slate-100">
                      Could not load documents
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                      {loadError}
                    </div>
                  </div>
                ) : scopedFiles.length > 0 ? (
                  scopedFiles.map((f) => {
                    const meta = typeMeta[f.type]
                    const key = `file:${f.id}`

                    return (
                      <div
                        key={f.id}
                        onClick={() => openViewFile(f)}
                        className={cn(
                          "grid cursor-pointer grid-cols-[1fr_180px_220px_140px_56px] items-center px-3 text-xs transition hover:bg-gray-50 max-[1220px]:grid-cols-[1fr_160px_180px_130px_56px] max-[920px]:grid-cols-[1fr_140px_0px_120px_56px] dark:hover:bg-slate-700/60",
                          "min-h-[52px] py-2",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-[20px] min-w-[32px] items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tracking-wide",
                                meta.pillClass,
                              )}
                            >
                              {meta.pillText}
                            </span>

                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-gray-950 dark:text-slate-100">{f.name}</div>
                              <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-slate-400">
                                {meta.label}
                                {f.sizeLabel !== "—" ? ` • ${f.sizeLabel}` : ""}
                                {f.documentStatus && f.documentStatus !== "available" ? ` • ${f.documentStatus}` : ""}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 truncate text-xs text-gray-700 dark:text-slate-300">
                          {f.projectCode ?? "—"}
                        </div>
                        <div className="truncate text-xs text-gray-700 max-[920px]:hidden dark:text-slate-300">
                          {f.createdBy}
                        </div>
                        <div className="whitespace-nowrap text-xs text-gray-700 dark:text-slate-300">
                          {formatDateISO(f.dateISO)}
                        </div>

                        <ActionMenu
                          isOpen={openMenuKey === key}
                          onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                          onClose={() => setOpenMenuKey(null)}
                        >
                          <MenuItemBtn
                            icon={<Info className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />}
                            label="View Content"
                            onClick={() => openViewFile(f)}
                          />
                          <MenuItemBtn
                            icon={<Download className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />}
                            label="Download"
                            onClick={() => actionDownloadFile(f)}
                          />
                        </ActionMenu>
                      </div>
                    )
                  })
                ) : (
                  <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-3 py-8 text-center">
                    <div className="mx-auto grid h-9 w-9 place-items-center rounded-md bg-gray-50 dark:bg-slate-700">
                      <FileText className="h-4 w-4 text-gray-400 dark:text-slate-400" />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-gray-950 dark:text-slate-100">
                      No matching documents
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                      Try changing your search, filters, or sort option.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={viewOpen}
        title={viewFile?.name ?? "Document Preview"}
        onClose={() => setViewOpen(false)}
        size="wide"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
              <span>{viewFile?.fileName ?? "—"}</span>
              <span>•</span>
              <span>{viewFile?.contentType ?? "application/pdf"}</span>
              <span>•</span>
              <span>{viewFile?.sizeLabel ?? "—"}</span>
              {viewFile?.projectCode ? (
                <>
                  <span>•</span>
                  <span>Project {viewFile.projectCode}</span>
                </>
              ) : null}
            </div>
            <span className="rounded-full border border-[#00c065]/20 bg-[#00c065]/10 px-2 py-0.5 text-[11px] font-semibold text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
              {viewFile?.typeLabel ?? "Document"}
            </span>
          </div>

          <div className="h-[68vh] overflow-hidden rounded-md border border-gray-200 bg-gray-100 shadow-inner dark:border-slate-700 dark:bg-slate-950/40">
            {viewFile?.signedUrl ? (
              <iframe
                title={viewFile?.name ?? "Document Preview"}
                src={viewFile.signedUrl}
                className="h-full w-full bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-500 dark:text-slate-400">
                No preview URL available for this file.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {viewFile && (
              <button className={btnBase} type="button" onClick={() => actionDownloadFile(viewFile)}>
                <Download className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                Download
              </button>
            )}
            <button className={btnBase} type="button" onClick={() => setViewOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
