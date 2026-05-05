"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Eye,
  FileText,
  Folder,
  Info,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientProject } from "../ClientShellClient";

type DocType = "INV" | "PAY" | "RCP" | "QTE";
type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc";
type FolderKey = "all" | DocType;

type ClientDocument = {
  id: string;
  type: DocType;
  typeLabel: string;
  name: string;
  fileName: string;
  createdBy: string;
  dateISO: string;
  sizeLabel: string;
  contentType: string;
  originalFilename: string | null;
  documentStatus: string;
  signedAt: string | null;
  signedName: string | null;
  storageBucket: string;
  storagePath: string;
  signedUrl: string | null;
};

type ProjectInfo = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  client_id: string | null;
};

type Toast = { id: string; message: string; tone?: "default" | "success" | "danger" };

const typeMeta: Record<DocType, { label: string; pillText: string; pillClass: string; folderName: string }> = {
  INV: {
    label: "Invoice",
    pillText: "INV",
    folderName: "Invoices",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  PAY: {
    label: "Payroll",
    pillText: "PAY",
    folderName: "Payroll",
    pillClass:
      "border border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
  },
  RCP: {
    label: "Receipt",
    pillText: "RCP",
    folderName: "Receipts",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
  QTE: {
    label: "Quote",
    pillText: "QTE",
    folderName: "Quotations",
    pillClass:
      "border border-[#00c065]/20 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
  },
};

const cardShell =
  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-800 dark:shadow-slate-950/20";
const cardAccent = "before:block before:h-1 before:w-full before:bg-[#00c065]";
const btnBase =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
const btnPrimary =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98]";
const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-gray-500 transition-all duration-200 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 active:scale-[0.98] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100";
const menuBox =
  "min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/60 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40";
const menuItem =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700";
const inputBase =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-400";

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatDateISO(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function statusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Available";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function MenuItemBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={menuItem} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-[250] flex w-[92vw] max-w-[380px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-slate-950/40",
            toast.tone === "success" &&
              "border-[#00c065]/25 bg-[#00c065]/10 text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300",
            toast.tone === "danger" &&
              "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300",
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
  size = "default",
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "default" | "wide";
}) {
  if (!open) return null;

  const widthClass = size === "wide" ? "max-w-[1120px]" : "max-w-[560px]";

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "absolute left-1/2 top-1/2 w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/15 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/50",
          widthClass,
        )}
      >
        <div className="h-1 w-full bg-[#00c065]" />
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
              {title}
            </div>
          </div>
          <button className={iconBtn} type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function PortalMenu<T extends HTMLElement>({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<T | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 240;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.right - width));
      const top = Math.min(window.innerHeight - 12, r.bottom + 10);
      setPos({ top, left });
    }

    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open, anchorRef, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed z-[300]"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={menuRef} className={menuBox}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ActionMenu({
  isOpen,
  onToggle,
  onClose,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button ref={buttonRef} className={iconBtn} type="button" onClick={onToggle} aria-label="Actions">
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>
      <PortalMenu open={isOpen} anchorRef={buttonRef} onClose={onClose}>
        {children}
      </PortalMenu>
    </div>
  );
}

function PreviewContent({ file }: { file: ClientDocument }) {
  if (!file.signedUrl) {
    return (
      <div className="flex h-[65vh] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        Preview is not available for this document.
      </div>
    );
  }

  if (file.contentType?.includes("pdf")) {
    return (
      <iframe
        src={file.signedUrl}
        title={file.fileName || file.name}
        className="h-[72vh] w-full rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-950"
      />
    );
  }

  if (file.contentType?.startsWith("image/")) {
    return (
      <div className="flex max-h-[72vh] justify-center overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.signedUrl} alt={file.fileName || file.name} className="max-h-[68vh] max-w-full rounded-lg object-contain" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Preview not supported</div>
      <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Use Download to open this file on your device.
      </div>
    </div>
  );
}

export default function ClientDocumentsPage() {
  const router = useRouter();
  const { projectId } = useClientProject();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [files, setFiles] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<FolderKey>("all");
  const [filterINV, setFilterINV] = useState(true);
  const [filterPAY, setFilterPAY] = useState(true);
  const [filterRCP, setFilterRCP] = useState(true);
  const [filterQTE, setFilterQTE] = useState(true);
  const [draftSortKey, setDraftSortKey] = useState<SortKey>("date_desc");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<ClientDocument | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const types = useMemo(
    () => ({ INV: filterINV, PAY: filterPAY, RCP: filterRCP, QTE: filterQTE }),
    [filterINV, filterPAY, filterRCP, filterQTE],
  );

  const sortLabel =
    sortKey === "date_desc"
      ? "Newest"
      : sortKey === "date_asc"
        ? "Oldest"
        : sortKey === "name_asc"
          ? "Name A-Z"
          : "Name Z-A";

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  function pushToast(message: string, tone: Toast["tone"] = "default") {
    const id = makeId("toast");
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 2600);
  }

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);

      const response = await fetch(`/api/client/documents/files?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") || "Failed to load project documents.",
        );
      }

      setProject(data?.project ?? null);
      setFiles(Array.isArray(data?.documents) ? data.documents : []);
      setSelectedIds({});
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load project documents.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const countsByType = useMemo(() => {
    const counts: Record<DocType, number> = { INV: 0, PAY: 0, RCP: 0, QTE: 0 };
    for (const file of files) counts[file.type] += 1;
    return counts;
  }, [files]);

  const totalSizeLabel = useMemo(() => {
    const total = files.reduce((sum, file) => {
      const match = /([\d.]+)\s*(KB|MB)/i.exec(file.sizeLabel || "");
      if (!match) return sum;
      const value = Number(match[1]);
      if (!Number.isFinite(value)) return sum;
      return sum + (match[2].toUpperCase() === "MB" ? value * 1024 : value);
    }, 0);

    if (total <= 0) return "—";
    if (total < 1024) return `${Math.max(1, Math.round(total))} KB`;
    return `${Math.max(1, Math.round(total / 1024))} MB`;
  }, [files]);

  const folders = useMemo(
    () => [
      { id: "QTE" as const, name: typeMeta.QTE.folderName, type: "QTE" as const, count: countsByType.QTE },
      { id: "INV" as const, name: typeMeta.INV.folderName, type: "INV" as const, count: countsByType.INV },
      { id: "RCP" as const, name: typeMeta.RCP.folderName, type: "RCP" as const, count: countsByType.RCP },
      { id: "PAY" as const, name: typeMeta.PAY.folderName, type: "PAY" as const, count: countsByType.PAY },
    ],
    [countsByType],
  );

  const filteredFiles = useMemo(() => {
    const q = normalizeSearch(query);

    let rows = files.filter((file) => types[file.type] !== false);

    if (activeFolder !== "all") {
      rows = rows.filter((file) => file.type === activeFolder);
    }

    if (q) {
      rows = rows.filter((file) => {
        const haystack = [
          file.name,
          file.fileName,
          file.createdBy,
          file.typeLabel,
          statusLabel(file.documentStatus),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    rows = [...rows].sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);

      const aTime = Date.parse(a.dateISO || "") || 0;
      const bTime = Date.parse(b.dateISO || "") || 0;
      if (sortKey === "date_asc") return aTime - bTime;
      return bTime - aTime;
    });

    return rows;
  }, [files, types, activeFolder, query, sortKey]);

  const recentFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => (Date.parse(b.dateISO || "") || 0) - (Date.parse(a.dateISO || "") || 0))
      .slice(0, 3);
  }, [files]);

  const allCheckedOnScreen = useMemo(
    () => filteredFiles.length > 0 && filteredFiles.every((file) => selectedIds[file.id]),
    [filteredFiles, selectedIds],
  );

  function closeAll() {
    setFiltersOpen(false);
    setOpenMenuKey(null);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const file of filteredFiles) next[file.id] = checked;
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds({});
  }

  function selectedFiles() {
    const ids = new Set(Object.keys(selectedIds).filter((id) => selectedIds[id]));
    return filteredFiles.filter((file) => ids.has(file.id));
  }

  function downloadFile(file: ClientDocument) {
    if (!file.signedUrl) {
      pushToast("Download link is not available for this document.", "danger");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = file.signedUrl;
    anchor.download = file.fileName || file.name;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setOpenMenuKey(null);
  }

  function bulkDownload() {
    const rows = selectedFiles();
    if (!rows.length) return;

    for (const file of rows) {
      if (file.signedUrl) {
        window.open(file.signedUrl, "_blank", "noopener,noreferrer");
      }
    }

    clearSelection();
    pushToast("Selected documents opened for download.", "success");
  }

  function applyFilters() {
    setSortKey(draftSortKey);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setFilterINV(true);
    setFilterPAY(true);
    setFilterRCP(true);
    setFilterQTE(true);
    setDraftSortKey("date_desc");
    setSortKey("date_desc");
    setActiveFolder("all");
    setQuery("");
    setFiltersOpen(false);
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-slate-100" onClick={closeAll}>
      <ToastStack toasts={toasts} />

      <div className="flex h-full min-h-0 flex-col px-5 pb-4 pt-5 sm:px-6 lg:px-7">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight text-gray-950 dark:text-slate-50">
              Documents
            </h1>
            <div className="mt-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
              Files connected to {project?.project_code ? `project ${project.project_code}` : "your project"}.
            </div>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              router.push("/client/documents/pending");
            }}
            className={btnPrimary}
          >
            <FileText className="h-4 w-4" />
            Pending Documents
          </button>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4" onClick={(event) => event.stopPropagation()}>
          {activeFolder !== "all" && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                className={btnBase}
                onClick={() => {
                  setActiveFolder("all");
                  setSelectedIds({});
                }}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                Folders
              </button>
              <span className="text-sm text-gray-400 dark:text-slate-500">›</span>
              <button
                type="button"
                className="text-sm font-semibold text-[#047857] hover:underline dark:text-emerald-300"
                onClick={() => setActiveFolder(activeFolder)}
              >
                {typeMeta[activeFolder].folderName}
              </button>
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-[390px] xl:w-[460px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                placeholder="Search documents, dates, or names"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:flex-nowrap">
              <button
                type="button"
                className={btnBase}
                onClick={(event) => {
                  event.stopPropagation();
                  void loadDocuments();
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>

              <div className="relative" onClick={(event) => event.stopPropagation()}>
                <button className={btnBase} type="button" onClick={() => setFiltersOpen((value) => !value)}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  <ChevronDown className="h-4 w-4" />
                </button>

                {filtersOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[310px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl shadow-gray-200/70 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-950/40">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      Document Type
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([
                        ["QTE", filterQTE, setFilterQTE],
                        ["INV", filterINV, setFilterINV],
                        ["RCP", filterRCP, setFilterRCP],
                        ["PAY", filterPAY, setFilterPAY],
                      ] as const).map(([type, checked, setChecked]) => (
                        <label
                          key={type}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 dark:border-slate-700 dark:bg-slate-900/45 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#00c065]"
                            checked={checked}
                            onChange={(event) => setChecked(event.target.checked)}
                          />
                          <span>{typeMeta[type].folderName}</span>
                        </label>
                      ))}
                    </div>

                    <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      Sort by
                    </div>
                    <select
                      className={cn(inputBase, "mt-2")}
                      value={draftSortKey}
                      onChange={(event) => setDraftSortKey(event.target.value as SortKey)}
                    >
                      <option value="date_desc">Newest</option>
                      <option value="date_asc">Oldest</option>
                      <option value="name_asc">Name A-Z</option>
                      <option value="name_desc">Name Z-A</option>
                    </select>

                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-slate-700/70">
                      <button type="button" className={btnBase} onClick={clearFilters}>
                        Clear
                      </button>
                      <button type="button" className={btnPrimary} onClick={applyFilters}>
                        Apply filters
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <ArrowUpDown className="h-4 w-4" />
                {sortLabel}
              </div>
            </div>
          </div>

          {loadError && (
            <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-300">
              {loadError}
            </div>
          )}

          {!query.trim() && activeFolder === "all" && (
            <section className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className={cn(cardShell, cardAccent)}>
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
                  <div>
                    <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">Folders</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                      Project document groups
                    </div>
                  </div>
                  <div className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:border-slate-700 dark:text-slate-400">
                    {files.length} files
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#00c065]/35 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-[#00c065]/35"
                      onClick={() => {
                        setActiveFolder(folder.id);
                        setSelectedIds({});
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#00c065]/10 dark:bg-[#00c065]/15">
                          <Folder className="h-5 w-5 text-[#00a054] dark:text-emerald-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">
                            {folder.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            {folder.count} {folder.count === 1 ? "file" : "files"}
                          </div>
                        </div>
                      </div>
                      <span className={cn("inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", typeMeta[folder.type].pillClass)}>
                        {typeMeta[folder.type].pillText}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={cn(cardShell, cardAccent)}>
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
                  <div>
                    <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">Recent</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Latest project files</div>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">{totalSizeLabel}</div>
                </div>

                <div className="space-y-3 p-4">
                  {recentFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/70"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn("inline-flex h-[22px] min-w-[34px] shrink-0 items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", typeMeta[file.type].pillClass)}>
                          {typeMeta[file.type].pillText}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-100">{file.name}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            {formatDateISO(file.dateISO)} • {file.sizeLabel}
                          </div>
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-gray-400" />
                    </button>
                  ))}

                  {recentFiles.length === 0 && !loading && (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                      No documents are connected to this project yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className={cn(cardShell, cardAccent, "flex min-h-0 flex-1 flex-col overflow-visible")}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/70">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-gray-950 dark:text-slate-100">
                  {query.trim() ? "Search Results" : "All Files"}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">• {filteredFiles.length} results</div>
                {activeFolder !== "all" && (
                  <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                    • {typeMeta[activeFolder].folderName}
                  </div>
                )}
              </div>

              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#047857] dark:text-emerald-300">
                    {selectedCount} selected
                  </span>
                  <button className={btnBase} type="button" onClick={clearSelection}>
                    <X className="h-4 w-4" />
                    Clear
                  </button>
                  <button className={btnBase} type="button" onClick={bulkDownload}>
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              )}
            </div>

            <div className="grid shrink-0 grid-cols-[52px_1fr_220px_160px_108px_60px] items-center border-b border-gray-100 bg-gray-50/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-slate-700/70 dark:bg-slate-900/35 dark:text-slate-400 max-[1120px]:grid-cols-[52px_1fr_180px_145px_96px_54px] max-[820px]:grid-cols-[52px_1fr_0px_128px_0px_54px]">
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={allCheckedOnScreen}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all"
                  className="h-4 w-4 accent-[#00c065]"
                />
              </div>
              <div>Name</div>
              <div className="max-[820px]:hidden">Signed By</div>
              <div>Date</div>
              <div className="max-[820px]:hidden">Status</div>
              <div />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {loading ? (
                <div className="flex h-full min-h-[240px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500 dark:text-slate-400" />
                    <div className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
                      Loading project documents...
                    </div>
                  </div>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center">
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gray-100 dark:bg-slate-900/70">
                      <FileText className="h-6 w-6 text-gray-400 dark:text-slate-500" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-gray-950 dark:text-slate-100">
                      No matching documents
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                      Try changing your search or filters, or check Pending Documents.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-700/70">
                  {filteredFiles.map((file) => {
                    const meta = typeMeta[file.type];
                    const checked = Boolean(selectedIds[file.id]);
                    const key = `file:${file.id}`;

                    return (
                      <div
                        key={file.id}
                        className={cn(
                          "grid min-h-[68px] grid-cols-[52px_1fr_220px_160px_108px_60px] items-center px-3 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-700/40 max-[1120px]:grid-cols-[52px_1fr_180px_145px_96px_54px] max-[820px]:grid-cols-[52px_1fr_0px_128px_0px_54px]",
                          checked && "bg-[#00c065]/10 hover:bg-[#00c065]/10 dark:bg-[#00c065]/15 dark:hover:bg-[#00c065]/15",
                        )}
                      >
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleOne(file.id, event.target.checked)}
                            aria-label={`Select ${file.name}`}
                            className="h-4 w-4 accent-[#00c065]"
                          />
                        </div>

                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => setPreviewFile(file)}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={cn("inline-flex h-[22px] min-w-[34px] shrink-0 items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", meta.pillClass)}>
                              {meta.pillText}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-gray-950 dark:text-slate-100">{file.name}</div>
                              <div className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                                {meta.label}
                                {file.sizeLabel !== "—" ? ` • ${file.sizeLabel}` : ""}
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="truncate text-sm text-gray-700 dark:text-slate-300 max-[820px]:hidden">
                          {file.signedName || file.createdBy || "—"}
                        </div>
                        <div className="whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                          {formatDateISO(file.dateISO)}
                        </div>
                        <div className="max-[820px]:hidden">
                          <span className="inline-flex rounded-full border border-[#00c065]/20 bg-[#00c065]/10 px-2.5 py-1 text-xs font-semibold text-[#047857] dark:border-[#00c065]/25 dark:bg-[#00c065]/15 dark:text-emerald-300">
                            {statusLabel(file.documentStatus)}
                          </span>
                        </div>

                        <ActionMenu
                          isOpen={openMenuKey === key}
                          onToggle={() => setOpenMenuKey((prev) => (prev === key ? null : key))}
                          onClose={() => setOpenMenuKey(null)}
                        >
                          <MenuItemBtn
                            icon={<Eye className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                            label="Preview"
                            onClick={() => {
                              setPreviewFile(file);
                              setOpenMenuKey(null);
                            }}
                          />
                          <MenuItemBtn
                            icon={<Download className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                            label="Download"
                            onClick={() => downloadFile(file)}
                          />
                        </ActionMenu>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(previewFile)}
        title={previewFile?.fileName || previewFile?.name || "Document Preview"}
        onClose={() => setPreviewFile(null)}
        size="wide"
      >
        {previewFile ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/45">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", typeMeta[previewFile.type].pillClass)}>
                  {typeMeta[previewFile.type].pillText}
                </span>
                <div className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {previewFile.name}
                </div>
              </div>
              <button className={btnPrimary} type="button" onClick={() => downloadFile(previewFile)}>
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
            <PreviewContent file={previewFile} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
