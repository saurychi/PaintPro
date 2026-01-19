"use client";

import { useMemo, useState } from "react";
import styles from "./attendance.module.css";
import { cn } from "@/lib/utils";
import {
  Search,
  CalendarDays,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE";

type AttendanceRow = {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  dateISO: string; // "2026-01-08"
  timeIn?: string; // "08:05 AM"
  timeOut?: string; // "05:12 PM"
  status: AttendanceStatus;
  hoursWorked?: number; // decimal hours
  notes?: string;
};

type StatusFilter = "ALL" | AttendanceStatus;

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  LEAVE: "On Leave",
};

const MOCK_ROWS: AttendanceRow[] = [
  {
    id: "a1",
    staffId: "S-1001",
    staffName: "Paul Jackman",
    role: "Manager",
    dateISO: "2026-01-08",
    timeIn: "08:03 AM",
    timeOut: "05:14 PM",
    status: "PRESENT",
    hoursWorked: 8.9,
  },
  {
    id: "a2",
    staffId: "S-1002",
    staffName: "Trent Guevara",
    role: "Technician",
    dateISO: "2026-01-08",
    timeIn: "08:27 AM",
    timeOut: "05:05 PM",
    status: "LATE",
    hoursWorked: 8.3,
    notes: "Traffic delay",
  },
  {
    id: "a3",
    staffId: "S-1003",
    staffName: "Walter Caballero",
    role: "Technician",
    dateISO: "2026-01-08",
    status: "ABSENT",
    notes: "No show",
  },
  {
    id: "a4",
    staffId: "S-1004",
    staffName: "Denzel Lawas",
    role: "Staff",
    dateISO: "2026-01-08",
    status: "LEAVE",
    notes: "Sick leave",
  },
  {
    id: "a5",
    staffId: "S-1002",
    staffName: "Trent Guevara",
    role: "Technician",
    dateISO: "2026-01-07",
    timeIn: "08:06 AM",
    timeOut: "05:01 PM",
    status: "PRESENT",
    hoursWorked: 8.6,
  },
];

function formatHours(n?: number) {
  if (n == null) return "—";
  return `${n.toFixed(1)}h`;
}

function formatDateLabel(dateISO: string) {
  // Keep simple (backend-ready). Replace with real formatting later.
  // Example: 2026-01-08 -> Jan 08, 2026
  const [y, m, d] = dateISO.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[(m ?? 1) - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}

export default function StaffAttendanceReportPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  // date range (backend-ready): store ISO strings
  const [fromISO, setFromISO] = useState("2026-01-01");
  const [toISO, setToISO] = useState("2026-01-31");

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // kebab
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const inRange = MOCK_ROWS.filter((r) => {
      if (fromISO && r.dateISO < fromISO) return false;
      if (toISO && r.dateISO > toISO) return false;
      return true;
    });

    const byStatus =
      status === "ALL" ? inRange : inRange.filter((r) => r.status === status);

    const bySearch = !q
      ? byStatus
      : byStatus.filter((r) => {
          const hay = `${r.staffName} ${r.staffId} ${r.role} ${r.status} ${r.dateISO}`.toLowerCase();
          return hay.includes(q);
        });

    // newest first
    return [...bySearch].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [query, status, fromISO, toISO]);

  const totals = useMemo(() => {
    const base = filtered;
    const count = (s: AttendanceStatus) => base.filter((r) => r.status === s).length;
    return {
      present: count("PRESENT"),
      late: count("LATE"),
      absent: count("ABSENT"),
      leave: count("LEAVE"),
      total: base.length,
    };
  }, [filtered]);

  const pageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / pageSize));
  }, [filtered.length]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  function closeAllMenus() {
    setOpenRowMenuId(null);
  }

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }
  function goNext() {
    setPage((p) => Math.min(pageCount, p + 1));
  }

  // keep page valid when filters change
  useMemo(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // placeholder actions
  function viewDetails(row: AttendanceRow) {
    console.log("view attendance details", row);
    setOpenRowMenuId(null);
  }
  function exportRow(row: AttendanceRow) {
    console.log("export row", row);
    setOpenRowMenuId(null);
  }

  return (
    <div className={styles.page} onClick={closeAllMenus}>
      <div className={styles.headerRow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Attendance</h1>
          <div className={styles.subtitle}>
            Staff report • Backend-ready UI
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search staff, role, status..."
            />
          </div>

          <div className={styles.rangeWrap}>
            <div className={styles.rangeLabel}>
              <CalendarDays className={styles.rangeIcon} />
              Date range
            </div>
            <div className={styles.rangeInputs}>
              <input
                className={styles.dateInput}
                type="date"
                value={fromISO}
                onChange={(e) => setFromISO(e.target.value)}
              />
              <span className={styles.rangeSep}>to</span>
              <input
                className={styles.dateInput}
                type="date"
                value={toISO}
                onChange={(e) => setToISO(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.statusWrap}>
            <div className={styles.statusLabel}>
              <Filter className={styles.rangeIcon} />
              Status
            </div>
            <select
              className={styles.select}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="ALL">All</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="LEAVE">On Leave</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <section className={styles.cards}>
        <div className={cn(styles.card, styles.cardGood)}>
          <div className={styles.cardLabel}>Present</div>
          <div className={styles.cardValue}>{totals.present}</div>
        </div>

        <div className={cn(styles.card, styles.cardWarn)}>
          <div className={styles.cardLabel}>Late</div>
          <div className={styles.cardValue}>{totals.late}</div>
        </div>

        <div className={cn(styles.card, styles.cardBad)}>
          <div className={styles.cardLabel}>Absent</div>
          <div className={styles.cardValue}>{totals.absent}</div>
        </div>

        <div className={cn(styles.card, styles.cardNeutral)}>
          <div className={styles.cardLabel}>On Leave</div>
          <div className={styles.cardValue}>{totals.leave}</div>
        </div>
      </section>

      {/* Table */}
      <section className={styles.tableSection}>
        <div className={styles.tableTop}>
          <div className={styles.tableTitle}>Attendance Log</div>
          <div className={styles.tableMeta}>
            Showing <b>{pageRows.length}</b> of <b>{filtered.length}</b>
          </div>
        </div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.cellStaff}>STAFF</div>
            <div className={styles.cellDate}>DATE</div>
            <div className={styles.cellStatus}>STATUS</div>
            <div className={styles.cellTime}>TIME IN</div>
            <div className={styles.cellTime}>TIME OUT</div>
            <div className={styles.cellHours}>HOURS</div>
            <div className={styles.cellActions} />
          </div>

          {pageRows.map((r) => (
            <div key={r.id} className={styles.tableRow} onClick={(e) => e.stopPropagation()}>
              <div className={styles.cellStaff}>
                <div className={styles.staffName}>{r.staffName}</div>
                <div className={styles.staffSub}>
                  {r.staffId} • {r.role}
                </div>
              </div>

              <div className={styles.cellDate}>{formatDateLabel(r.dateISO)}</div>

              <div className={styles.cellStatus}>
                <span
                  className={cn(
                    styles.statusPill,
                    r.status === "PRESENT" && styles.pillPresent,
                    r.status === "LATE" && styles.pillLate,
                    r.status === "ABSENT" && styles.pillAbsent,
                    r.status === "LEAVE" && styles.pillLeave
                  )}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <div className={styles.cellTime}>{r.timeIn ?? "—"}</div>
              <div className={styles.cellTime}>{r.timeOut ?? "—"}</div>
              <div className={styles.cellHours}>{formatHours(r.hoursWorked)}</div>

              <div className={styles.cellActions}>
                <button
                  className={styles.kebabBtn}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenRowMenuId((prev) => (prev === r.id ? null : r.id));
                  }}
                  aria-label="Row actions"
                >
                  <MoreVertical className={styles.kebabIcon} />
                </button>

                {openRowMenuId === r.id && (
                  <div className={styles.menu}>
                    <button className={styles.menuItem} onClick={() => viewDetails(r)}>
                      View details
                    </button>
                    <button className={styles.menuItem} onClick={() => exportRow(r)}>
                      Export
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>No results</div>
              <div className={styles.emptyText}>Try adjusting filters or date range.</div>
            </div>
          )}
        </div>

        <div className={styles.pagination}>
          <button className={styles.pageBtn} type="button" onClick={goPrev} disabled={page <= 1}>
            <ChevronLeft className={styles.pageIcon} />
            Prev
          </button>

          <div className={styles.pageInfo}>
            Page <b>{page}</b> of <b>{pageCount}</b>
          </div>

          <button
            className={styles.pageBtn}
            type="button"
            onClick={goNext}
            disabled={page >= pageCount}
          >
            Next
            <ChevronRight className={styles.pageIcon} />
          </button>
        </div>
      </section>
    </div>
  );
}

