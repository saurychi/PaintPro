"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Folder,
  FileText,
  Download,
  Pencil,
  Archive,
  X,
  Trash2,
  ChevronLeft,
} from "lucide-react";

type DocType = "INV" | "PAY" | "RCP" | "QTE";
type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc";

type FolderItem = { id: string; name: string; fileCount: number; sizeLabel: string };
type FileItem = {
  id: string;
  type: DocType;
  name: string;
  createdBy: string;
  dateLabel: string;
  sizeLabel: string;
  folderId?: string;
};

const typeMeta: Record<DocType, { label: string; pillClass: string; pillText: string }> = {
  INV: { label: "Invoice", pillText: "INV", pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20" },
  PAY: { label: "Payroll", pillText: "PAY", pillClass: "bg-red-500/10 text-red-900 border border-red-500/20" },
  RCP: { label: "Receipt", pillText: "RCP", pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20" },
  QTE: { label: "Quote", pillText: "QTE", pillClass: "bg-[#00c065]/15 text-green-900 border border-[#00c065]/20" },
};

const MOCK_FOLDERS: FolderItem[] = [
  { id: "f1", name: "Job Invoices", fileCount: 23, sizeLabel: "137 MB" },
  { id: "f2", name: "Material Receipts", fileCount: 8, sizeLabel: "55 MB" },
  { id: "f3", name: "Payroll Records", fileCount: 37, sizeLabel: "92 MB" },
  { id: "f4", name: "Job Quotations", fileCount: 29, sizeLabel: "104 MB" },
];

const MOCK_RECENT: FileItem[] = [
  { id: "r1", type: "INV", name: "Invoice 681E73DA-0017", createdBy: "manhhackhct108@gmail.com", dateLabel: "July 1, 2026", sizeLabel: "17 MB", folderId: "f1" },
  { id: "r2", type: "INV", name: "Invoice 681E73DA-0017", createdBy: "trungkienpsknt@gmail.com", dateLabel: "June 2, 2026", sizeLabel: "21 MB", folderId: "f1" },
  { id: "r3", type: "PAY", name: "Invoice 681E73DA-0017", createdBy: "danghoang87@gmail.com", dateLabel: "August 5, 2025", sizeLabel: "26 MB", folderId: "f3" },
];

const MOCK_FILES: FileItem[] = [
  { id: "a1", type: "INV", name: "Invoice 681E73DA-0017", createdBy: "manhhackhct108@gmail.com", dateLabel: "Dec 30, 09:42 PM", sizeLabel: "92 MB", folderId: "f1" },
  { id: "a2", type: "PAY", name: "Invoice 681E73DA-0017", createdBy: "trungkienpsknt@gmail.com", dateLabel: "Dec 29, 09:42 PM", sizeLabel: "92 MB", folderId: "f3" },
  { id: "a3", type: "INV", name: "Invoice 681E73DA-0017", createdBy: "danghoang87@gmail.com", dateLabel: "Dec 28, 11:14 PM", sizeLabel: "92 MB", folderId: "f1" },
  { id: "a4", type: "RCP", name: "Invoice 681E73DA-0017", createdBy: "ckctm12@gmail.com", dateLabel: "Dec 26, 07:52 AM", sizeLabel: "92 MB", folderId: "f2" },
  { id: "a5", type: "QTE", name: "Quote - Living Room Repaint", createdBy: "manager@paintpro.com", dateLabel: "Jan 08, 10:12 AM", sizeLabel: "—", folderId: "f4" },
];

// design helpers
const btnBase =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25";
const btnPrimary =
  "inline-flex h-10 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25";
const iconBtn =
  "grid h-9 w-9 place-items-center rounded-lg border border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25";
const menuBox =
  "absolute right-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm";
const menuItem =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50";

function formatFolderMeta(count: number, size: string) {
  return `${count} files  •  ${size}`;
}

function Dropdown({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return <div className={menuBox}>{children}</div>;
}

function MenuItem({
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

function ActionMenu({
  isOpen,
  onToggle,
  onDownload,
  onRename,
  onArchive,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button className={iconBtn} type="button" onClick={onToggle} aria-label="Actions">
        <MoreVertical className="h-[18px] w-[18px] text-gray-500" />
      </button>
      <Dropdown open={isOpen}>
        <MenuItem icon={<Download className="h-4 w-4 text-gray-500" />} label="Download" onClick={onDownload} />
        <MenuItem icon={<Pencil className="h-4 w-4 text-gray-500" />} label="Rename" onClick={onRename} />
        <MenuItem icon={<Archive className="h-4 w-4 text-gray-500" />} label="Archive" onClick={onArchive} />
      </Dropdown>
    </div>
  );
}

export default function AdminDocuments() {
  const [query, setQuery] = useState("");

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const activeFolder = useMemo(
    () => (activeFolderId ? MOCK_FOLDERS.find((f) => f.id === activeFolderId) ?? null : null),
    [activeFolderId]
  );

  // filters
  const [filterINV, setFilterINV] = useState(true);
  const [filterPAY, setFilterPAY] = useState(true);
  const [filterRCP, setFilterRCP] = useState(true);
  const [filterQTE, setFilterQTE] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  const FILTER_ITEMS: { id: DocType; label: string; checked: boolean; setChecked: (v: boolean) => void }[] = [
    { id: "INV", label: "Invoices (INV)", checked: filterINV, setChecked: setFilterINV },
    { id: "PAY", label: "Payroll (PAY)", checked: filterPAY, setChecked: setFilterPAY },
    { id: "RCP", label: "Receipts (RCP)", checked: filterRCP, setChecked: setFilterRCP },
    { id: "QTE", label: "Quotes (QTE)", checked: filterQTE, setChecked: setFilterQTE },
  ];

  // menus
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const typeAllowed = useMemo(
    () => ({ INV: filterINV, PAY: filterPAY, RCP: filterRCP, QTE: filterQTE } satisfies Record<DocType, boolean>),
    [filterINV, filterPAY, filterRCP, filterQTE]
  );

  const scopedFiles = useMemo(
    () => (activeFolderId ? MOCK_FILES.filter((f) => f.folderId === activeFolderId) : MOCK_FILES),
    [activeFolderId]
  );
  const scopedRecent = useMemo(
    () => (activeFolderId ? MOCK_RECENT.filter((f) => f.folderId === activeFolderId) : MOCK_RECENT),
    [activeFolderId]
  );

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = scopedFiles.filter((f) => typeAllowed[f.type]);
    const searched = !q
      ? base
      : base.filter((f) => `${f.name} ${f.createdBy} ${f.dateLabel}`.toLowerCase().includes(q));

    return searched.sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);
      if (sortKey === "date_asc") return a.dateLabel.localeCompare(b.dateLabel);
      return b.dateLabel.localeCompare(a.dateLabel);
    });
  }, [query, scopedFiles, sortKey, typeAllowed]);

  const filteredRecent = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = scopedRecent.filter((f) => typeAllowed[f.type]);
    if (!q) return base;
    return base.filter((f) => `${f.name} ${f.createdBy} ${f.dateLabel}`.toLowerCase().includes(q));
  }, [query, scopedRecent, typeAllowed]);

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  const allCheckedOnScreen = useMemo(() => {
    if (filteredFiles.length === 0) return false;
    return filteredFiles.every((f) => Boolean(selectedIds[f.id]));
  }, [filteredFiles, selectedIds]);

  const sortLabel =
    sortKey === "date_desc"
      ? "Newest"
      : sortKey === "date_asc"
      ? "Oldest"
      : sortKey === "name_asc"
      ? "Name A-Z"
      : "Name Z-A";

  function closeAll() {
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
    setFiltersOpen(false);
    setSortOpen(false);
    setNewOpen(false);
  }

  function openFolder(folderId: string) {
    setActiveFolderId(folderId);
    setQuery("");
    setSelectedIds({});
    closeAll();
  }

  function goBackToRoot() {
    setActiveFolderId(null);
    setQuery("");
    setSelectedIds({});
    closeAll();
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const f of filteredFiles) next[f.id] = checked;
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds({});
  }

  function selectedItems() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]));
    return filteredFiles.filter((f) => ids.has(f.id));
  }

  function bulkDownload() {
    console.log("bulk download", selectedItems());
    clearSelection();
  }
  function bulkArchive() {
    console.log("bulk archive", selectedItems());
    clearSelection();
  }
  function bulkDelete() {
    console.log("bulk delete", selectedItems());
    clearSelection();
  }

  // placeholder actions
  function actionDownload(file: FileItem) {
    console.log("download", file);
    setOpenMenuId(null);
  }
  function actionRename(file: FileItem) {
    console.log("rename", file);
    setOpenMenuId(null);
  }
  function actionArchive(file: FileItem) {
    console.log("archive", file);
    setOpenMenuId(null);
  }

  return (
    <div className="p-6 text-gray-900" onClick={closeAll}>
      <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>

      <div className="mt-6" onClick={(e) => e.stopPropagation()}>
        {/* Top controls */}
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
            <button className={cn(btnBase, "ml-2 px-3")} onClick={goBackToRoot} type="button">
              <ChevronLeft className="h-4 w-4 text-gray-500" />
              Back
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search (shorter) */}
          <div className="relative w-full lg:w-[360px] xl:w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Right actions (forces to the right on lg+) */}
          <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:flex-nowrap">
            {/* New */}
            <div className="relative">
              <button
                className={btnPrimary}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNewOpen((v) => !v);
                  setFiltersOpen(false);
                  setSortOpen(false);
                }}
              >
                + New
              </button>
              <Dropdown open={newOpen}>
                <MenuItem icon={<Folder className="h-4 w-4 text-gray-500" />} label="New Folder" onClick={() => console.log("new folder")} />
                <MenuItem icon={<FileText className="h-4 w-4 text-gray-500" />} label="File Upload" onClick={() => console.log("file upload")} />
                <MenuItem icon={<Folder className="h-4 w-4 text-gray-500" />} label="Folder Upload" onClick={() => console.log("folder upload")} />
              </Dropdown>
            </div>

            {/* Filters */}
            <div className="relative">
              <button
                className={btnBase}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFiltersOpen((v) => !v);
                  setSortOpen(false);
                  setNewOpen(false);
                }}
              >
                <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                Filters
              </button>

              {filtersOpen && (
                <div className={cn(menuBox, "min-w-60")}>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500">Document Type</div>
                  {FILTER_ITEMS.map((item) => (
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
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="relative">
              <button
                className={btnBase}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSortOpen((v) => !v);
                  setFiltersOpen(false);
                  setNewOpen(false);
                }}
              >
                <span>Sort by:</span>
                <span className="font-semibold text-gray-900">{sortLabel}</span>
                <ArrowUpDown className="h-4 w-4 text-gray-500" />
              </button>

              <Dropdown open={sortOpen}>
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
                      setSortKey(key);
                      setSortOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </Dropdown>
            </div>
          </div>
        </div>

        {/* Folders */}
        {!activeFolder && (
          <section className="mt-6">
            <div className="mb-3 text-xs font-semibold text-gray-500">Folders</div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {MOCK_FOLDERS.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 cursor-pointer items-center gap-3" onClick={() => openFolder(folder.id)}>
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#00c065]/10">
                      <Folder className="h-5 w-5 text-[#00a054]" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{folder.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{formatFolderMeta(folder.fileCount, folder.sizeLabel)}</div>
                    </div>
                  </div>

                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={iconBtn}
                      type="button"
                      onClick={() => setOpenFolderMenuId((prev) => (prev === folder.id ? null : folder.id))}
                      aria-label="Folder actions"
                    >
                      <MoreVertical className="h-[18px] w-[18px] text-gray-500" />
                    </button>

                    <Dropdown open={openFolderMenuId === folder.id}>
                      <MenuItem icon={<Folder className="h-4 w-4 text-gray-500" />} label="Open" onClick={() => openFolder(folder.id)} />
                      <MenuItem icon={<Pencil className="h-4 w-4 text-gray-500" />} label="Rename" onClick={() => console.log("rename folder", folder)} />
                      <MenuItem icon={<Archive className="h-4 w-4 text-gray-500" />} label="Archive" onClick={() => console.log("archive folder", folder)} />
                    </Dropdown>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent */}
        <section className="mt-6">
          <div className="mb-3 text-xs font-semibold text-gray-500">Recent</div>

          <div className="flex flex-col gap-3">
            {filteredRecent.map((f) => {
              const meta = typeMeta[f.type];
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", meta.pillClass)}>
                      {meta.pillText}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{f.name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {f.dateLabel} &nbsp;•&nbsp; {f.sizeLabel}
                      </div>
                    </div>
                  </div>

                  <ActionMenu
                    isOpen={openMenuId === f.id}
                    onToggle={() => setOpenMenuId((prev) => (prev === f.id ? null : f.id))}
                    onDownload={() => actionDownload(f)}
                    onRename={() => actionRename(f)}
                    onArchive={() => actionArchive(f)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* All Files */}
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-gray-500">All Files</div>

            {selectedCount > 0 && (
              <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-900">{selectedCount} selected</span>
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-transparent bg-transparent px-3 text-sm font-semibold text-green-900 hover:bg-[#00c065]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25"
                    onClick={clearSelection}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button className={btnBase} type="button" onClick={bulkDownload}>
                    <Download className="h-4 w-4 text-gray-500" />
                    Download
                  </button>
                  <button className={btnBase} type="button" onClick={bulkArchive}>
                    <Archive className="h-4 w-4 text-gray-500" />
                    Archive
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/25 bg-white px-4 text-sm font-semibold text-red-900 shadow-sm hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/25"
                    type="button"
                    onClick={bulkDelete}
                  >
                    <Trash2 className="h-4 w-4 text-red-700" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div
              className={cn(
                "grid items-center border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500",
                "grid-cols-[52px_1fr_280px_180px_60px]",
                "max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px]",
                "max-[920px]:grid-cols-[52px_1fr_0px_140px_60px]"
              )}
            >
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

            {filteredFiles.map((f) => {
              const meta = typeMeta[f.type];
              const checked = Boolean(selectedIds[f.id]);

              return (
                <div
                  key={f.id}
                  className={cn(
                    "grid items-center border-b border-gray-100 px-3 py-3 text-sm hover:bg-gray-50",
                    "grid-cols-[52px_1fr_280px_180px_60px]",
                    "max-[1220px]:grid-cols-[52px_1fr_220px_160px_60px]",
                    "max-[920px]:grid-cols-[52px_1fr_0px_140px_60px]",
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
                      <span className={cn("inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-2.5 text-xs font-semibold tracking-wide", meta.pillClass)}>
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
                  <div className="whitespace-nowrap text-sm text-gray-700">{f.dateLabel}</div>

                  <ActionMenu
                    isOpen={openMenuId === f.id}
                    onToggle={() => setOpenMenuId((prev) => (prev === f.id ? null : f.id))}
                    onDownload={() => actionDownload(f)}
                    onRename={() => actionRename(f)}
                    onArchive={() => actionArchive(f)}
                  />
                </div>
              );
            })}

            {filteredFiles.length === 0 && (
              <div className="px-3 py-10 text-center">
                <div className="text-sm font-semibold text-gray-900">No matching documents</div>
                <div className="mt-2 text-sm text-gray-500">Try changing your search, filters, or sort option.</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
