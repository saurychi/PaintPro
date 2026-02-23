"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  MoreVertical,
  Download,
  Eye,
  Plus,
  FileText,
  ChevronRight,
} from "lucide-react";

type ReportType = "JOB" | "EMP";
type ReportStatus = "DRAFT" | "GENERATED" | "ARCHIVED";
type SortKey = "date_desc" | "date_asc" | "name_asc" | "name_desc";

type ReportItem = {
  id: string;
  type: ReportType;
  title: string;
  createdBy: string;
  createdAtISO: string;
  periodLabel: string;
  status: ReportStatus;
  format: "PDF" | "CSV";
};

const typeMeta: Record<ReportType, { label: string; className: string }> = {
  JOB: {
    label: "Job Report",
    className: "bg-emerald-50 text-emerald-900 border-emerald-100",
  },
  EMP: {
    label: "Employee Report",
    className: "bg-blue-50 text-blue-900 border-blue-100",
  },
};

const statusMeta: Record<ReportStatus, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-amber-50 text-amber-900 border-amber-100",
  },
  GENERATED: {
    label: "Generated",
    className: "bg-emerald-50 text-emerald-900 border-emerald-100",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-gray-50 text-gray-900 border-gray-200",
  },
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
          const hay =
            `${r.title} ${r.createdBy} ${r.periodLabel} ${r.format}`.toLowerCase();
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

  function actionView(report: ReportItem) {
    console.log("view report", report.id);
    setOpenRowMenuId(null);
  }

  function actionDownload(report: ReportItem) {
    console.log("download report", report.id);
    setOpenRowMenuId(null);
  }

  function actionArchive(report: ReportItem) {
    console.log("archive report", report.id);
    setOpenRowMenuId(null);
  }

  const btnBase =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50";
  const btnPrimary =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-[#00c065] bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054]";
  const menuBase =
    "absolute left-0 top-[calc(100%+10px)] z-50 min-w-[240px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm";
  const menuItem =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50";
  const menuLabel = "px-2.5 pb-1 pt-2 text-xs font-semibold text-gray-500";
  const menuDivider = "my-2 h-px bg-gray-100";

  return (
    <div className="p-6" onClick={closeAllPopups}>
      {/* breadcrumb title */}
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Link
          href="/admin/report"
          className="rounded-md px-1.5 py-1 text-[#00c065] hover:bg-gray-50 hover:text-[#00a054]"
          onClick={(e) => e.stopPropagation()}
        >
          Report
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <span className="text-gray-900">Report List</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative h-9 w-[280px] max-w-full rounded-lg border border-gray-200 bg-white shadow-sm max-[820px]:w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-full w-full bg-transparent pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
              placeholder="Search reports"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* NEW */}
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
              <Plus className="h-4 w-4" />
              New
            </button>

            {newOpen && (
              <div className={menuBase}>
                <button
                  className={menuItem}
                  onClick={() => console.log("new job report")}
                  type="button"
                >
                  <FileText className="h-4 w-4 text-gray-500" />
                  Job Report
                </button>
                <button
                  className={menuItem}
                  onClick={() => console.log("new employee report")}
                  type="button"
                >
                  <FileText className="h-4 w-4 text-gray-500" />
                  Employee Report
                </button>
              </div>
            )}
          </div>

          {/* FILTERS */}
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
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>

            {filtersOpen && (
              <div className={menuBase}>
                <div className={menuLabel}>Report Type</div>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                  <input
                    className="h-4 w-4 rounded border-gray-300 accent-[#00c065]"
                    type="checkbox"
                    checked={filterJob}
                    onChange={(e) => setFilterJob(e.target.checked)}
                  />
                  <span>Job Reports</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                  <input
                    className="h-4 w-4 rounded border-gray-300 accent-[#00c065]"
                    type="checkbox"
                    checked={filterEmp}
                    onChange={(e) => setFilterEmp(e.target.checked)}
                  />
                  <span>Employee Reports</span>
                </label>

                <div className={menuDivider} />

                <div className={menuLabel}>Status</div>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                  <input
                    className="h-4 w-4 rounded border-gray-300 accent-[#00c065]"
                    type="checkbox"
                    checked={filterDraft}
                    onChange={(e) => setFilterDraft(e.target.checked)}
                  />
                  <span>Draft</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                  <input
                    className="h-4 w-4 rounded border-gray-300 accent-[#00c065]"
                    type="checkbox"
                    checked={filterGenerated}
                    onChange={(e) => setFilterGenerated(e.target.checked)}
                  />
                  <span>Generated</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                  <input
                    className="h-4 w-4 rounded border-gray-300 accent-[#00c065]"
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
              <span className="text-sm font-semibold text-gray-900">Sort by:</span>
              <span className="ml-1 font-semibold text-gray-900">
                {sortKey === "date_desc"
                  ? "Newest"
                  : sortKey === "date_asc"
                  ? "Oldest"
                  : sortKey === "name_asc"
                  ? "Name A–Z"
                  : "Name Z–A"}
              </span>
              <ArrowUpDown className="h-4 w-4" />
            </button>

            {sortOpen && (
              <div className={menuBase}>
                <button className={menuItem} type="button" onClick={() => setSortKey("date_desc")}>
                  Newest
                </button>
                <button className={menuItem} type="button" onClick={() => setSortKey("date_asc")}>
                  Oldest
                </button>
                <button className={menuItem} type="button" onClick={() => setSortKey("name_asc")}>
                  Name A–Z
                </button>
                <button className={menuItem} type="button" onClick={() => setSortKey("name_desc")}>
                  Name Z–A
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6" onClick={(e) => e.stopPropagation()}>
        {/* Table */}
        <section>
          <div className="text-xs font-semibold text-gray-500">All Reports</div>

          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1.6fr_220px_140px_260px_190px_140px_60px] items-center border-b border-gray-200 px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 max-[1200px]:grid-cols-[1.6fr_200px_120px_0px_170px_130px_60px] max-[820px]:grid-cols-[1fr_180px_0px_0px_160px_120px_60px]">
              <div className="min-w-0">TITLE</div>
              <div className="min-w-0">TYPE</div>
              <div className="min-w-0 max-[820px]:hidden">PERIOD</div>
              <div className="min-w-0 max-[1200px]:hidden">CREATED BY</div>
              <div className="min-w-0">DATE</div>
              <div className="min-w-0">STATUS</div>
              <div />
            </div>

            {filteredReports.map((r) => {
              const t = typeMeta[r.type];
              const s = statusMeta[r.status];

              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[1.6fr_220px_140px_260px_190px_140px_60px] items-center border-b border-gray-100 px-3 py-3 text-sm text-gray-900 max-[1200px]:grid-cols-[1.6fr_200px_120px_0px_170px_130px_60px] max-[820px]:grid-cols-[1fr_180px_0px_0px_160px_120px_60px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">{r.title}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      Format: {r.format} • ID: {r.id}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span
                      className={[
                        "inline-flex h-6 items-center justify-center rounded-lg border px-3 text-xs font-semibold",
                        t.className,
                      ].join(" ")}
                    >
                      {t.label}
                    </span>
                  </div>

                  <div className="min-w-0 text-sm text-gray-700 max-[820px]:hidden">
                    <span className="truncate">{r.periodLabel}</span>
                  </div>

                  <div className="min-w-0 text-sm text-gray-700 max-[1200px]:hidden">
                    <span className="truncate">{r.createdBy}</span>
                  </div>

                  <div className="min-w-0 text-sm text-gray-700">
                    <span className="truncate">{formatDateLabel(r.createdAtISO)}</span>
                  </div>

                  <div className="min-w-0">
                    <span
                      className={[
                        "inline-flex h-6 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold",
                        s.className,
                      ].join(" ")}
                    >
                      {s.label}
                    </span>
                  </div>

                  <div className="relative flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent hover:bg-gray-50"
                      type="button"
                      onClick={() => setOpenRowMenuId((prev) => (prev === r.id ? null : r.id))}
                      aria-label="Row actions"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-500" />
                    </button>

                    {openRowMenuId === r.id && (
                      <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                        <button className={menuItem} type="button" onClick={() => actionView(r)}>
                          <Eye className="h-4 w-4 text-gray-500" />
                          View
                        </button>
                        <button className={menuItem} type="button" onClick={() => actionDownload(r)}>
                          <Download className="h-4 w-4 text-gray-500" />
                          Download
                        </button>
                        <button className={menuItem} type="button" onClick={() => actionArchive(r)}>
                          <FileText className="h-4 w-4 text-gray-500" />
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredReports.length === 0 && (
              <div className="px-3 py-8 text-center">
                <div className="text-sm font-semibold text-gray-900">No matching reports</div>
                <div className="mt-1 text-sm text-gray-500">
                  Try changing your search, filters, or sort option.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
