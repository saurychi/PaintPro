"use client";

import { useMemo, useState } from "react";
import styles from "./documents.module.css";
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

type FolderItem = {
  id: string;
  name: string;
  fileCount: number;
  sizeLabel: string;
};

type FileItem = {
  id: string;
  type: DocType;
  name: string;
  createdBy: string;
  dateLabel: string;
  sizeLabel: string;
  folderId?: string;
};

const typeMeta: Record<
  DocType,
  { label: string; pill: string; pillText: string }
> = {
  INV: { label: "Invoice", pill: styles.pillInv, pillText: "INV" },
  PAY: { label: "Payroll", pill: styles.pillPay, pillText: "PAY" },
  RCP: { label: "Receipt", pill: styles.pillRcp, pillText: "RCP" },
  QTE: { label: "Quote", pill: styles.pillQte, pillText: "QTE" },
};

const MOCK_FOLDERS: FolderItem[] = [
  { id: "f1", name: "Job Invoices", fileCount: 23, sizeLabel: "137 MB" },
  { id: "f2", name: "Material Receipts", fileCount: 8, sizeLabel: "55 MB" },
  { id: "f3", name: "Payroll Records", fileCount: 37, sizeLabel: "92 MB" },
  { id: "f4", name: "Job Quotations", fileCount: 29, sizeLabel: "104 MB" },
];

const MOCK_RECENT: FileItem[] = [
  {
    id: "r1",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "manhhackhct108@gmail.com",
    dateLabel: "July 1, 2026",
    sizeLabel: "17 MB",
    folderId: "f1",
  },
  {
    id: "r2",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "trungkienpsknt@gmail.com",
    dateLabel: "June 2, 2026",
    sizeLabel: "21 MB",
    folderId: "f1",
  },
  {
    id: "r3",
    type: "PAY",
    name: "Invoice 681E73DA-0017",
    createdBy: "danghoang87@gmail.com",
    dateLabel: "August 5, 2025",
    sizeLabel: "26 MB",
    folderId: "f3",
  },
];

const MOCK_FILES: FileItem[] = [
  {
    id: "a1",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "manhhackhct108@gmail.com",
    dateLabel: "Dec 30, 09:42 PM",
    sizeLabel: "92 MB",
    folderId: "f1",
  },
  {
    id: "a2",
    type: "PAY",
    name: "Invoice 681E73DA-0017",
    createdBy: "trungkienpsknt@gmail.com",
    dateLabel: "Dec 29, 09:42 PM",
    sizeLabel: "92 MB",
    folderId: "f3",
  },
  {
    id: "a3",
    type: "INV",
    name: "Invoice 681E73DA-0017",
    createdBy: "danghoang87@gmail.com",
    dateLabel: "Dec 28, 11:14 PM",
    sizeLabel: "92 MB",
    folderId: "f1",
  },
  {
    id: "a4",
    type: "RCP",
    name: "Invoice 681E73DA-0017",
    createdBy: "ckctm12@gmail.com",
    dateLabel: "Dec 26, 07:52 AM",
    sizeLabel: "92 MB",
    folderId: "f2",
  },
  {
    id: "a5",
    type: "QTE",
    name: "Quote - Living Room Repaint",
    createdBy: "manager@paintpro.com",
    dateLabel: "Jan 08, 10:12 AM",
    sizeLabel: "—",
    folderId: "f4",
  },
];

function formatFolderMeta(count: number, size: string) {
  return `${count} files  •  ${size}`;
}

export default function AdminDocuments() {
  const [query, setQuery] = useState("");

  // Folder navigation
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return MOCK_FOLDERS.find((f) => f.id === activeFolderId) ?? null;
  }, [activeFolderId]);

  // filters
  const [filterINV, setFilterINV] = useState(true);
  const [filterPAY, setFilterPAY] = useState(true);
  const [filterRCP, setFilterRCP] = useState(true);
  const [filterQTE, setFilterQTE] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  // menus
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const typeAllowed = useMemo(() => {
    return {
      INV: filterINV,
      PAY: filterPAY,
      RCP: filterRCP,
      QTE: filterQTE,
    } satisfies Record<DocType, boolean>;
  }, [filterINV, filterPAY, filterRCP, filterQTE]);

  const scopedFiles = useMemo(() => {
    if (!activeFolderId) return MOCK_FILES;
    return MOCK_FILES.filter((f) => f.folderId === activeFolderId);
  }, [activeFolderId]);

  const scopedRecent = useMemo(() => {
    if (!activeFolderId) return MOCK_RECENT;
    return MOCK_RECENT.filter((f) => f.folderId === activeFolderId);
  }, [activeFolderId]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = scopedFiles.filter((f) => typeAllowed[f.type]);
    const searched = !q
      ? base
      : base.filter((f) => {
          const hay = `${f.name} ${f.createdBy} ${f.dateLabel}`.toLowerCase();
          return hay.includes(q);
        });

    const sorted = [...searched].sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);
      if (sortKey === "date_asc") return a.dateLabel.localeCompare(b.dateLabel);
      return b.dateLabel.localeCompare(a.dateLabel);
    });

    return sorted;
  }, [query, sortKey, scopedFiles, typeAllowed]);

  const filteredRecent = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = scopedRecent.filter((f) => typeAllowed[f.type]);
    if (!q) return base;

    return base.filter((f) => {
      const hay = `${f.name} ${f.createdBy} ${f.dateLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, scopedRecent, typeAllowed]);

  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );

  const allCheckedOnScreen = useMemo(() => {
    if (filteredFiles.length === 0) return false;
    return filteredFiles.every((f) => Boolean(selectedIds[f.id]));
  }, [filteredFiles, selectedIds]);

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleSelectAllOnScreen(checked: boolean) {
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

  // folder navigation
  function openFolder(folderId: string) {
    setActiveFolderId(folderId);
    setQuery("");
    setSelectedIds({});
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
  }

  function goBackToRoot() {
    setActiveFolderId(null);
    setQuery("");
    setSelectedIds({});
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
  }

  // folders actions
  function folderRename(folder: FolderItem) {
    console.log("rename folder", folder);
    setOpenFolderMenuId(null);
  }
  function folderArchive(folder: FolderItem) {
    console.log("archive folder", folder);
    setOpenFolderMenuId(null);
  }

  function closeAllPopups() {
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
    setFiltersOpen(false);
    setSortOpen(false);
    setNewOpen(false);
  }

  return (
    <div className={styles.page} onClick={closeAllPopups}>
      <div className={styles.headerRow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Documents</h1>

          {activeFolder && (
            <div className={styles.breadcrumb}>
              <button
                className={styles.breadcrumbLink}
                onClick={goBackToRoot}
                type="button"
              >
                Folders
              </button>
              <span className={styles.breadcrumbSep}>›</span>
              <span className={styles.breadcrumbCurrent}>{activeFolder.name}</span>

              <button className={styles.backBtn} onClick={goBackToRoot} type="button">
                <ChevronLeft className={styles.backIcon} />
                Back
              </button>
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* NEW */}
          <div className={styles.ddWrap}>
            <button
              className={cn(styles.btn, styles.btnGreen)}
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
            {newOpen && (
              <div className={styles.menu}>
                <button className={styles.menuItem} onClick={() => console.log("new folder")}>
                  <Folder className={styles.menuIcon} />
                  New Folder
                </button>
                <button className={styles.menuItem} onClick={() => console.log("file upload")}>
                  <FileText className={styles.menuIcon} />
                  File Upload
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => console.log("folder upload")}
                >
                  <Folder className={styles.menuIcon} />
                  Folder Upload
                </button>
              </div>
            )}
          </div>

          {/* FILTERS */}
          <div className={styles.ddWrap}>
            <button
              className={cn(styles.btn, styles.btnOutline)}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFiltersOpen((v) => !v);
                setSortOpen(false);
                setNewOpen(false);
              }}
            >
              <SlidersHorizontal className={styles.btnIcon} />
              Filters
            </button>
            {filtersOpen && (
              <div className={styles.menu}>
                <div className={styles.menuLabel}>Document Type</div>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterINV}
                    onChange={(e) => setFilterINV(e.target.checked)}
                  />
                  <span>Invoices (INV)</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterPAY}
                    onChange={(e) => setFilterPAY(e.target.checked)}
                  />
                  <span>Payroll (PAY)</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterRCP}
                    onChange={(e) => setFilterRCP(e.target.checked)}
                  />
                  <span>Receipts (RCP)</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterQTE}
                    onChange={(e) => setFilterQTE(e.target.checked)}
                  />
                  <span>Quotes (QTE)</span>
                </label>
              </div>
            )}
          </div>

          {/* SORT */}
          <div className={styles.ddWrap}>
            <button
              className={cn(styles.btn, styles.btnOutline)}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSortOpen((v) => !v);
                setFiltersOpen(false);
                setNewOpen(false);
              }}
            >
              Sort by:
              <span className={styles.sortValue}>
                {sortKey === "date_desc"
                  ? "Newest"
                  : sortKey === "date_asc"
                  ? "Oldest"
                  : sortKey === "name_asc"
                  ? "Name A–Z"
                  : "Name Z–A"}
              </span>
              <ArrowUpDown className={styles.btnIcon} />
            </button>

            {sortOpen && (
              <div className={styles.menu}>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setSortKey("date_desc");
                    setSortOpen(false);
                  }}
                >
                  Newest
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setSortKey("date_asc");
                    setSortOpen(false);
                  }}
                >
                  Oldest
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setSortKey("name_asc");
                    setSortOpen(false);
                  }}
                >
                  Name A–Z
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setSortKey("name_desc");
                    setSortOpen(false);
                  }}
                >
                  Name Z–A
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!activeFolder && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Folders</div>

          <div className={styles.foldersGrid}>
            {MOCK_FOLDERS.map((folder) => (
              <div key={folder.id} className={styles.folderCard}>
                <div className={styles.folderLeft} onClick={() => openFolder(folder.id)}>
                  <div className={styles.folderIconWrap}>
                    <Folder className={styles.folderIcon} />
                  </div>
                  <div className={styles.folderText}>
                    <div className={styles.folderName}>{folder.name}</div>
                    <div className={styles.folderMeta}>
                      {formatFolderMeta(folder.fileCount, folder.sizeLabel)}
                    </div>
                  </div>
                </div>

                <div className={styles.kebabWrap} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.kebabBtn}
                    type="button"
                    onClick={() =>
                      setOpenFolderMenuId((prev) => (prev === folder.id ? null : folder.id))
                    }
                    aria-label="Folder actions"
                  >
                    <MoreVertical className={styles.kebabIcon} />
                  </button>

                  {openFolderMenuId === folder.id && (
                    <div className={cn(styles.menu, styles.menuRight)}>
                      <button className={styles.menuItem} onClick={() => openFolder(folder.id)}>
                        <Folder className={styles.menuIcon} />
                        Open
                      </button>
                      <button className={styles.menuItem} onClick={() => folderRename(folder)}>
                        <Pencil className={styles.menuIcon} />
                        Rename
                      </button>
                      <button className={styles.menuItem} onClick={() => folderArchive(folder)}>
                        <Archive className={styles.menuIcon} />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Recent</div>

        <div className={styles.recentList}>
          {filteredRecent.map((f) => {
            const meta = typeMeta[f.type];
            return (
              <div key={f.id} className={styles.recentRow}>
                <div className={styles.recentLeft}>
                  <span className={cn(styles.pill, meta.pill)}>{meta.pillText}</span>
                  <div className={styles.recentText}>
                    <div className={styles.recentName}>{f.name}</div>
                    <div className={styles.recentMeta}>
                      {f.dateLabel} &nbsp;•&nbsp; {f.sizeLabel}
                    </div>
                  </div>
                </div>

                <div className={styles.kebabWrap} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.kebabBtn}
                    type="button"
                    onClick={() => setOpenMenuId((prev) => (prev === f.id ? null : f.id))}
                    aria-label="File actions"
                  >
                    <MoreVertical className={styles.kebabIcon} />
                  </button>

                  {openMenuId === f.id && (
                    <div className={cn(styles.menu, styles.menuRight)}>
                      <button className={styles.menuItem} onClick={() => actionDownload(f)}>
                        <Download className={styles.menuIcon} />
                        Download
                      </button>
                      <button className={styles.menuItem} onClick={() => actionRename(f)}>
                        <Pencil className={styles.menuIcon} />
                        Rename
                      </button>
                      <button className={styles.menuItem} onClick={() => actionArchive(f)}>
                        <Archive className={styles.menuIcon} />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTopRow}>
          <div className={styles.sectionLabel}>All Files</div>

          {selectedCount > 0 && (
            <div className={styles.bulkBar}>
              <div className={styles.bulkLeft}>
                <span className={styles.bulkCount}>{selectedCount} selected</span>
                <button className={styles.bulkGhost} onClick={clearSelection} type="button">
                  <X className={styles.bulkIcon} />
                  Clear
                </button>
              </div>

              <div className={styles.bulkActions}>
                <button className={styles.bulkBtn} type="button" onClick={bulkDownload}>
                  <Download className={styles.bulkIcon} />
                  Download
                </button>
                <button className={styles.bulkBtn} type="button" onClick={bulkArchive}>
                  <Archive className={styles.bulkIcon} />
                  Archive
                </button>
                <button
                  className={cn(styles.bulkBtn, styles.bulkDanger)}
                  type="button"
                  onClick={bulkDelete}
                >
                  <Trash2 className={styles.bulkIcon} />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.cellCheck}>
              <input
                type="checkbox"
                checked={allCheckedOnScreen}
                onChange={(e) => toggleSelectAllOnScreen(e.target.checked)}
                aria-label="Select all"
              />
            </div>
            <div className={styles.cellName}>NAME</div>
            <div className={styles.cellCreatedBy}>CREATED BY</div>
            <div className={styles.cellDate}>DATE</div>
            <div className={styles.cellActions} />
          </div>

          {filteredFiles.map((f) => {
            const meta = typeMeta[f.type];
            const checked = Boolean(selectedIds[f.id]);

            return (
              <div key={f.id} className={cn(styles.tableRow, checked && styles.rowSelected)}>
                <div className={styles.cellCheck}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleOne(f.id, e.target.checked)}
                    aria-label={`Select ${f.name}`}
                  />
                </div>

                <div className={styles.cellName}>
                  <div className={styles.nameWrap}>
                    <span className={cn(styles.pill, meta.pill)}>{meta.pillText}</span>
                    <div className={styles.nameText}>
                      <div className={styles.fileName}>{f.name}</div>
                      <div className={styles.fileSub}>
                        {meta.label}
                        {f.sizeLabel !== "—" ? `  •  ${f.sizeLabel}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.cellCreatedBy}>{f.createdBy}</div>
                <div className={styles.cellDate}>{f.dateLabel}</div>

                <div className={styles.cellActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.kebabBtn}
                    type="button"
                    onClick={() => setOpenMenuId((prev) => (prev === f.id ? null : f.id))}
                    aria-label="File actions"
                  >
                    <MoreVertical className={styles.kebabIcon} />
                  </button>

                  {openMenuId === f.id && (
                    <div className={cn(styles.menu, styles.menuRight)}>
                      <button className={styles.menuItem} onClick={() => actionDownload(f)}>
                        <Download className={styles.menuIcon} />
                        Download
                      </button>
                      <button className={styles.menuItem} onClick={() => actionRename(f)}>
                        <Pencil className={styles.menuIcon} />
                        Rename
                      </button>
                      <button className={styles.menuItem} onClick={() => actionArchive(f)}>
                        <Archive className={styles.menuIcon} />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredFiles.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No matching documents</div>
              <div className={styles.emptyText}>Try changing your search, filters, or sort option.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
