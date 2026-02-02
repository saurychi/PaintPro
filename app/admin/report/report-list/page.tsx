"use client";

import { useMemo, useState } from "react";
import styles from "./reportList.module.css";

import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  MoreVertical,
  Download,
  Eye,
  Plus,
  FileText,
} from "lucide-react";

type ReportType = "JOB" | "EMP";
type ReportStatus = "DRAFT" | "GENERATED" | "ARCHIVED";
type SortKey = "date_desc" | "date_asc" | "name_asc" | "name_desc";

type ReportItem = {
  id: string;
  type: ReportType;
  title: string;
  createdBy: string;
  createdAtISO: string; // backend-ready: keep ISO for sorting
  periodLabel: string; // e.g. "Jan 2026"
  status: ReportStatus;
  format: "PDF" | "CSV";
};

const typeMeta: Record<ReportType, { label: string; pillClass: string }> = {
  JOB: { label: "Job Report", pillClass: styles.pillJob },
  EMP: { label: "Employee Report", pillClass: styles.pillEmp },
};

const statusMeta: Record<ReportStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: styles.statusDraft },
  GENERATED: { label: "Generated", className: styles.statusGenerated },
  ARCHIVED: { label: "Archived", className: styles.statusArchived },
};

const MOCK_REPORTS: ReportItem[] = [
  {
    id: "rpt_001",
    type: "JOB",
    title: "Job Summary Report",
    createdBy: "admin@paintpro.com",
    createdAtISO: "2026-01-10T09:10:00Z",
    periodLabel: "Jan 2026",
    status: "GENERATED",
    format: "PDF",
  },
  {
    id: "rpt_002",
    type: "EMP",
    title: "Employee Performance Report",
    createdBy: "admin@paintpro.com",
    createdAtISO: "2026-01-08T14:45:00Z",
    periodLabel: "2023–Present",
    status: "GENERATED",
    format: "PDF",
  },
  {
    id: "rpt_003",
    type: "JOB",
    title: "Average Job Cost Spread",
    createdBy: "manager@paintpro.com",
    createdAtISO: "2026-01-06T11:05:00Z",
    periodLabel: "Dec 2025",
    status: "DRAFT",
    format: "CSV",
  },
  {
    id: "rpt_004",
    type: "EMP",
    title: "Attendance Summary",
    createdBy: "hr@paintpro.com",
    createdAtISO: "2025-12-29T18:00:00Z",
    periodLabel: "Dec 2025",
    status: "ARCHIVED",
    format: "PDF",
  },
];

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportListPage() {
  const [query, setQuery] = useState("");

  // filters
  const [filterJob, setFilterJob] = useState(true);
  const [filterEmp, setFilterEmp] = useState(true);

  const [filterDraft, setFilterDraft] = useState(true);
  const [filterGenerated, setFilterGenerated] = useState(true);
  const [filterArchived, setFilterArchived] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  // dropdowns
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  const typeAllowed = useMemo(() => {
    return {
      JOB: filterJob,
      EMP: filterEmp,
    } satisfies Record<ReportType, boolean>;
  }, [filterJob, filterEmp]);

  const statusAllowed = useMemo(() => {
    return {
      DRAFT: filterDraft,
      GENERATED: filterGenerated,
      ARCHIVED: filterArchived,
    } satisfies Record<ReportStatus, boolean>;
  }, [filterDraft, filterGenerated, filterArchived]);

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = MOCK_REPORTS.filter(
      (r) => typeAllowed[r.type] && statusAllowed[r.status]
    );

    const searched = !q
      ? base
      : base.filter((r) => {
          const hay = `${r.title} ${r.createdBy} ${r.periodLabel} ${r.format}`.toLowerCase();
          return hay.includes(q);
        });

    const sorted = [...searched].sort((a, b) => {
      if (sortKey === "name_asc") return a.title.localeCompare(b.title);
      if (sortKey === "name_desc") return b.title.localeCompare(a.title);
      if (sortKey === "date_asc") return a.createdAtISO.localeCompare(b.createdAtISO);
      return b.createdAtISO.localeCompare(a.createdAtISO);
    });

    return sorted;
  }, [query, sortKey, statusAllowed, typeAllowed]);

  function closeAllPopups() {
    setFiltersOpen(false);
    setSortOpen(false);
    setNewOpen(false);
    setOpenRowMenuId(null);
  }

  // placeholder actions (backend-ready)
  function actionView(report: ReportItem) {
    console.log("view report", report.id);
    setOpenRowMenuId(null);
    // later: router.push(`/admin/report/report-view/${report.id}`)
  }

  function actionDownload(report: ReportItem) {
    console.log("download report", report.id);
    setOpenRowMenuId(null);
    // later: window.location.href = report.downloadUrl
  }

  function actionArchive(report: ReportItem) {
    console.log("archive report", report.id);
    setOpenRowMenuId(null);
    // later: call API PATCH /reports/:id { status: "ARCHIVED" }
  }

  return (
    <div className={styles.page} onClick={closeAllPopups}>
      {/* Header */}
      <div className={styles.headerRow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Reports</h1>
          <div className={styles.subtitle}>
            View generated reports and manage exports.
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search reports"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* NEW */}
          <div className={styles.ddWrap}>
            <button
              className={styles.btnGreen}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNewOpen((v) => !v);
                setFiltersOpen(false);
                setSortOpen(false);
              }}
            >
              <Plus className={styles.btnIcon} />
              New
            </button>

            {newOpen && (
              <div className={styles.menu}>
                <button
                  className={styles.menuItem}
                  onClick={() => console.log("new job report")}
                  type="button"
                >
                  <FileText className={styles.menuIcon} />
                  Job Report
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => console.log("new employee report")}
                  type="button"
                >
                  <FileText className={styles.menuIcon} />
                  Employee Report
                </button>
              </div>
            )}
          </div>

          {/* FILTERS */}
          <div className={styles.ddWrap}>
            <button
              className={styles.btnOutline}
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
                <div className={styles.menuLabel}>Report Type</div>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterJob}
                    onChange={(e) => setFilterJob(e.target.checked)}
                  />
                  <span>Job Reports</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterEmp}
                    onChange={(e) => setFilterEmp(e.target.checked)}
                  />
                  <span>Employee Reports</span>
                </label>

                <div className={styles.menuDivider} />

                <div className={styles.menuLabel}>Status</div>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterDraft}
                    onChange={(e) => setFilterDraft(e.target.checked)}
                  />
                  <span>Draft</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterGenerated}
                    onChange={(e) => setFilterGenerated(e.target.checked)}
                  />
                  <span>Generated</span>
                </label>

                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filterArchived}
                    onChange={(e) => setFilterArchived(e.target.checked)}
                  />
                  <span>Archived</span>
                </label>
              </div>
            )}
          </div>

          {/* SORT */}
          <div className={styles.ddWrap}>
            <button
              className={styles.btnOutline}
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
                <button className={styles.menuItem} type="button" onClick={() => setSortKey("date_desc")}>
                  Newest
                </button>
                <button className={styles.menuItem} type="button" onClick={() => setSortKey("date_asc")}>
                  Oldest
                </button>
                <button className={styles.menuItem} type="button" onClick={() => setSortKey("name_asc")}>
                  Name A–Z
                </button>
                <button className={styles.menuItem} type="button" onClick={() => setSortKey("name_desc")}>
                  Name Z–A
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>All Reports</div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.cellTitle}>TITLE</div>
            <div className={styles.cellType}>TYPE</div>
            <div className={styles.cellPeriod}>PERIOD</div>
            <div className={styles.cellCreatedBy}>CREATED BY</div>
            <div className={styles.cellDate}>DATE</div>
            <div className={styles.cellStatus}>STATUS</div>
            <div className={styles.cellActions} />
          </div>

          {filteredReports.map((r) => {
            const t = typeMeta[r.type];
            const s = statusMeta[r.status];

            return (
              <div key={r.id} className={styles.tableRow}>
                <div className={styles.cellTitle}>
                  <div className={styles.titleBlock}>
                    <div className={styles.reportTitle}>{r.title}</div>
                    <div className={styles.reportSub}>
                      Format: {r.format} • ID: {r.id}
                    </div>
                  </div>
                </div>

                <div className={styles.cellType}>
                  <span className={`${styles.pill} ${t.pillClass}`}>{t.label}</span>
                </div>

                <div className={styles.cellPeriod}>{r.periodLabel}</div>
                <div className={styles.cellCreatedBy}>{r.createdBy}</div>
                <div className={styles.cellDate}>{formatDateLabel(r.createdAtISO)}</div>

                <div className={styles.cellStatus}>
                  <span className={`${styles.status} ${s.className}`}>{s.label}</span>
                </div>

                <div className={styles.cellActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.kebabBtn}
                    type="button"
                    onClick={() =>
                      setOpenRowMenuId((prev) => (prev === r.id ? null : r.id))
                    }
                    aria-label="Row actions"
                  >
                    <MoreVertical className={styles.kebabIcon} />
                  </button>

                  {openRowMenuId === r.id && (
                    <div className={`${styles.menu} ${styles.menuRight}`}>
                      <button className={styles.menuItem} type="button" onClick={() => actionView(r)}>
                        <Eye className={styles.menuIcon} />
                        View
                      </button>
                      <button className={styles.menuItem} type="button" onClick={() => actionDownload(r)}>
                        <Download className={styles.menuIcon} />
                        Download
                      </button>
                      <button className={styles.menuItem} type="button" onClick={() => actionArchive(r)}>
                        <FileText className={styles.menuIcon} />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredReports.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No matching reports</div>
              <div className={styles.emptyText}>
                Try changing your search, filters, or sort option.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
