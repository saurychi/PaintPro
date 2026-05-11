"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  Download,
  Eye,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type DocType = "quotation" | "invoice" | "cancellation_agreement"

type PendingDoc = {
  id: string
  type: DocType
  fileName: string
  dateISO: string
  sizeLabel: string
  documentStatus: string
  projectId: string
  projectCode: string | null
  projectTitle: string | null
  siteAddress: string | null
  projectStatus: string | null
  projectManager: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
  signedUrl: string | null
}

type PendingResponse = {
  quotations?: PendingDoc[]
  invoices?: PendingDoc[]
  agreements?: PendingDoc[]
  error?: string
}

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20"

const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]"

const btnBase =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

function formatDate(value: string | null | undefined) {
  if (!value) return "No date"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "No date"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
}

const TYPE_META: Record<DocType, { title: string; description: string; pillClass: string; pillText: string }> = {
  quotation: {
    title: "Quotations",
    description: "Awaiting client signature.",
    pillText: "QTE",
    pillClass:
      "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300",
  },
  invoice: {
    title: "Invoices",
    description: "Awaiting client signature.",
    pillText: "INV",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  cancellation_agreement: {
    title: "Cancellation Agreements",
    description: "Awaiting client signature.",
    pillText: "AGR",
    pillClass:
      "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300",
  },
}

function PendingCard({ doc }: { doc: PendingDoc }) {
  const meta = TYPE_META[doc.type]

  async function handleDownload() {
    if (!doc.signedUrl) {
      toast.error("Storage URL is not available for this file.")
      return
    }
    try {
      const response = await fetch(doc.signedUrl)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = doc.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to download file.")
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-3 transition hover:border-gray-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-[20px] min-w-[32px] items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tracking-wide",
                meta.pillClass,
              )}
            >
              {meta.pillText}
            </span>
            <p className="truncate text-xs font-semibold text-gray-950 dark:text-slate-100">
              {doc.projectCode ?? doc.projectTitle ?? "Untitled Project"}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-slate-400">
            {doc.fileName} • {doc.sizeLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300">
          {doc.documentStatus}
        </span>
      </div>

      <div className="space-y-0.5 text-[11px] text-gray-600 dark:text-slate-300">
        {doc.clientName ? (
          <p className="truncate">
            <span className="text-gray-500 dark:text-slate-400">Client:</span>{" "}
            <span className="font-medium text-gray-900 dark:text-slate-100">{doc.clientName}</span>
          </p>
        ) : null}
        {doc.clientEmail ? (
          <p className="flex items-center gap-1 truncate">
            <Mail className="h-3 w-3 shrink-0 text-gray-400 dark:text-slate-500" />
            <span className="truncate">{doc.clientEmail}</span>
          </p>
        ) : null}
        {doc.clientPhone ? (
          <p className="flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 shrink-0 text-gray-400 dark:text-slate-500" />
            <span className="truncate">{doc.clientPhone}</span>
          </p>
        ) : null}
        <p className="text-gray-500 dark:text-slate-400">Updated {formatDate(doc.dateISO)}</p>
      </div>

      <div className="mt-1 flex items-center gap-2">
        {doc.signedUrl ? (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(btnBase, "h-7 px-2 text-[11px]")}
          >
            <Eye className="h-3 w-3 text-gray-500 dark:text-slate-400" />
            View
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleDownload}
          disabled={!doc.signedUrl}
          className={cn(btnBase, "h-7 px-2 text-[11px]")}
        >
          <Download className="h-3 w-3 text-gray-500 dark:text-slate-400" />
          Download
        </button>
      </div>
    </div>
  )
}

function PendingColumn({
  type,
  docs,
  loading,
  query,
}: {
  type: DocType
  docs: PendingDoc[]
  loading: boolean
  query: string
}) {
  const meta = TYPE_META[type]

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return docs
    return docs.filter((doc) => {
      const haystack = [
        doc.fileName,
        doc.projectCode,
        doc.projectTitle,
        doc.clientName,
        doc.clientEmail,
        doc.clientPhone,
        doc.siteAddress,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [docs, query])

  return (
    <div className={cn(cardShell, cardAccent, "flex min-h-0 flex-col lg:flex-1")}>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-slate-700/70">
        <div>
          <div className="text-xs font-semibold text-gray-950 dark:text-slate-100">{meta.title}</div>
          <div className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">{meta.description}</div>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          {filtered.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-gray-200 p-3 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-9 animate-pulse rounded-md bg-gray-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                </div>
                <div className="h-2.5 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-slate-700/60" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-slate-700/60" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-3 py-6 text-center">
            <div className="mx-auto grid h-9 w-9 place-items-center rounded-md bg-gray-50 dark:bg-slate-700">
              <FileText className="h-4 w-4 text-gray-400 dark:text-slate-400" />
            </div>
            <div className="mt-2 text-xs font-semibold text-gray-950 dark:text-slate-100">
              Nothing pending
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
              {query.trim()
                ? "No matches for your search."
                : `No ${meta.title.toLowerCase()} are awaiting signature.`}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc) => (
              <PendingCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPendingDocumentsPage() {
  const [quotations, setQuotations] = useState<PendingDoc[]>([])
  const [invoices, setInvoices] = useState<PendingDoc[]>([])
  const [agreements, setAgreements] = useState<PendingDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  async function loadPending(mode: "initial" | "refresh" = "initial") {
    try {
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setLoadError(null)

      const response = await fetch("/api/documents/pending", { cache: "no-store" })
      const data = (await response.json()) as PendingResponse

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load pending documents.")
      }

      setQuotations(data.quotations ?? [])
      setInvoices(data.invoices ?? [])
      setAgreements(data.agreements ?? [])
    } catch (error: any) {
      const message = error?.message ?? "Failed to load pending documents."
      setLoadError(message)
      toast.error("Could not load pending documents", { description: message })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadPending("initial")
  }, [])

  const totalPending = quotations.length + invoices.length + agreements.length

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto bg-[#f7f8fa] px-3 pb-3 pt-3 text-gray-900 dark:bg-slate-700 dark:text-slate-100 sm:px-4 lg:h-screen lg:overflow-hidden lg:pb-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[#00a054] transition-colors hover:bg-[#00c065]/10 dark:text-emerald-300 dark:hover:bg-[#00c065]/15"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Documents
            </Link>
            <span className="text-gray-400 dark:text-slate-500">/</span>
            <span className="rounded-md px-1 py-0.5 text-gray-900 dark:text-slate-100">Pending</span>
          </div>
          <h1 className="text-2xl font-semibold leading-8 text-gray-900 dark:text-slate-100">
            Pending Documents
          </h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Quotations, invoices, and cancellation agreements awaiting client signature.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            {totalPending} pending
          </span>
          <button
            type="button"
            onClick={() => loadPending("refresh")}
            disabled={loading || refreshing}
            className={cn(btnBase, "shrink-0", refreshing && "opacity-70")}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 text-gray-500 dark:text-slate-400", refreshing && "animate-spin")}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
        <div className="shrink-0">
          <div className="relative w-full sm:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
            <input
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400"
              placeholder="Search by project code, client, file"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {loadError ? (
          <div className={cn(cardShell, "shrink-0 p-2")}>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-slate-100">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Could not load pending documents
            </div>
            <div className="mt-1 text-xs text-gray-600 dark:text-slate-300">{loadError}</div>
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
          <PendingColumn type="quotation" docs={quotations} loading={loading} query={query} />
          <PendingColumn type="invoice" docs={invoices} loading={loading} query={query} />
          <PendingColumn type="cancellation_agreement" docs={agreements} loading={loading} query={query} />
        </section>
      </div>
    </div>
  )
}
