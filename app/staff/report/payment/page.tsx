// app/staff/report/payment/page.tsx
"use client";

import { useMemo, useState } from "react";
import styles from "./payment.module.css";
import { cn } from "@/lib/utils";
import {
  Search,
  CalendarDays,
  Filter,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Receipt,
} from "lucide-react";

type PayStatus = "PAID" | "PENDING" | "OVERDUE";

type PaymentRow = {
  id: string;
  payNo: string;
  staffName: string;
  staffId: string;
  role: string;
  status: PayStatus;
  periodLabel: string; // e.g. "Jan 01–15, 2026"
  issuedLabel: string; // e.g. "Jan 16, 2026"
  dueLabel: string; // e.g. "Jan 20, 2026"
  amount: number;
};

const STATUS_META: Record<
  PayStatus,
  { label: string; pill: string; accent: string }
> = {
  PAID: { label: "Paid", pill: styles.pillPaid, accent: styles.accentPaid },
  PENDING: {
    label: "Pending",
    pill: styles.pillPending,
    accent: styles.accentPending,
  },
  OVERDUE: { label: "Overdue", pill: styles.pillOverdue, accent: styles.accentOverdue },
};

const MOCK_ROWS: PaymentRow[] = [
  {
    id: "p1",
    payNo: "PAY-2026-0007",
    staffName: "Paul Jackman",
    staffId: "S-1001",
    role: "Manager",
    status: "PAID",
    periodLabel: "Jan 01–15, 2026",
    issuedLabel: "Jan 16, 2026",
    dueLabel: "Jan 20, 2026",
    amount: 38500,
  },
  {
    id: "p2",
    payNo: "PAY-2026-0008",
    staffName: "Trent Guevara",
    staffId: "S-1002",
    role: "Technician",
    status: "PENDING",
    periodLabel: "Jan 01–15, 2026",
    issuedLabel: "Jan 16, 2026",
    dueLabel: "Jan 20, 2026",
    amount: 16200,
  },
  {
    id: "p3",
    payNo: "PAY-2026-0009",
    staffName: "Walter Caballero",
    staffId: "S-1003",
    role: "Technician",
    status: "OVERDUE",
    periodLabel: "Dec 16–31, 2025",
    issuedLabel: "Jan 02, 2026",
    dueLabel: "Jan 06, 2026",
    amount: 15800,
  },
  {
    id: "p4",
    payNo: "PAY-2026-0010",
    staffName: "Denzel Lawas",
    staffId: "S-1004",
    role: "Staff",
    status: "PAID",
    periodLabel: "Dec 16–31, 2025",
    issuedLabel: "Jan 02, 2026",
    dueLabel: "Jan 06, 2026",
    amount: 12400,
  },
  {
    id: "p5",
    payNo: "PAY-2026-0011",
    staffName: "Trent Guevara",
    staffId: "S-1002",
    role: "Technician",
    status: "PAID",
    periodLabel: "Dec 01–15, 2025",
    issuedLabel: "Dec 16, 2025",
    dueLabel: "Dec 20, 2025",
    amount: 16050,
  },
];

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function StaffReportPaymentPage() {
  const [query, setQuery] = useState("");

  // Date range (backend-ready)
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState(addDays("2026-01-01", 30));

  // Status filter
  const [status, setStatus] = useState<"ALL" | PayStatus>("ALL");

  // Menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Pagination
  const pageSize = 6;
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = MOCK_ROWS.filter((r) => (status === "ALL" ? true : r.status === status));

    const searched = !q
      ? base
      : base.filter((r) => {
          const hay = `${r.payNo} ${r.staffName} ${r.staffId} ${r.role} ${r.periodLabel}`.toLowerCase();
          return hay.includes(q);
        });

    // Newest first by issuedLabel (string compare works with these labels only visually)
    // Backend-ready: replace with issuedAt sorting later.
    return [...searched];
  }, [query, status]);

  const stats = useMemo(() => {
    const paid = filtered.filter((r) => r.status === "PAID").length;
    const pending = filtered.filter((r) => r.status === "PENDING").length;
    const overdue = filtered.filter((r) => r.status === "OVERDUE").length;
    return { paid, pending, overdue, total: filtered.length };
  }, [filtered]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  }, [filtered, safePage]);

  function closeMenus() {
    setOpenMenuId(null);
  }

  function actionView(row: PaymentRow) {
    console.log("view", row);
    setOpenMenuId(null);
  }

  function actionDownloadPayslip(row: PaymentRow) {
    console.log("download payslip", row);
    setOpenMenuId(null);
  }

  function actionOpenReceipt(row: PaymentRow) {
    console.log("open receipt", row);
    setOpenMenuId(null);
  }

  return (
    <div className={styles.page} onClick={closeMenus}>
      {/* Header */}
      <div className={styles.headerRow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Payment</h1>
          <div className={styles.subtitle}>Staff report • Backend-ready UI</div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search staff, pay no, role..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
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
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className={styles.rangeSep}>to</span>
              <input
                className={styles.dateInput}
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.statusWrap}>
            <div className={styles.rangeLabel}>
              <Filter className={styles.rangeIcon} />
              Status
            </div>
            <select
              className={styles.select}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="ALL">All</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={cn(styles.statCard, styles.accentPaid)}>
          <div className={styles.statLabel}>Paid</div>
          <div className={styles.statValue}>{stats.paid}</div>
        </div>

        <div className={cn(styles.statCard, styles.accentPending)}>
          <div className={styles.statLabel}>Pending</div>
          <div className={styles.statValue}>{stats.pending}</div>
        </div>

        <div className={cn(styles.statCard, styles.accentOverdue)}>
          <div className={styles.statLabel}>Overdue</div>
          <div className={styles.statValue}>{stats.overdue}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
      </div>

      {/* Table */}
      <div className={styles.sectionTopRow}>
        <div className={styles.sectionLabel}>Payment Log</div>
        <div className={styles.miniMeta}>
          Showing {pageRows.length} of {filtered.length}
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <div className={styles.cellStaff}>STAFF</div>
          <div className={styles.cellPayNo}>PAY NO</div>
          <div className={styles.cellStatus}>STATUS</div>
          <div className={styles.cellPeriod}>PERIOD</div>
          <div className={styles.cellDue}>DUE</div>
          <div className={styles.cellAmount}>AMOUNT</div>
          <div className={styles.cellActions} />
        </div>

        {pageRows.map((r) => {
          const meta = STATUS_META[r.status];

          return (
            <div key={r.id} className={styles.tableRow}>
              <div className={styles.cellStaff}>
                <div className={styles.staffName}>{r.staffName}</div>
                <div className={styles.staffSub}>
                  {r.staffId} • {r.role}
                </div>
              </div>

              <div className={styles.cellPayNo}>
                <div className={styles.payNo}>{r.payNo}</div>
                <div className={styles.paySub}>Issued {r.issuedLabel}</div>
              </div>

              <div className={styles.cellStatus}>
                <span className={cn(styles.pill, meta.pill)}>{meta.label}</span>
              </div>

              <div className={styles.cellPeriod}>{r.periodLabel}</div>

              <div className={styles.cellDue}>{r.dueLabel}</div>

              <div className={styles.cellAmount}>{formatMoney(r.amount)}</div>

              <div className={styles.cellActions} onClick={(e) => e.stopPropagation()}>
                <button
                  className={styles.kebabBtn}
                  type="button"
                  onClick={() => setOpenMenuId((prev) => (prev === r.id ? null : r.id))}
                  aria-label="Row actions"
                >
                  <MoreVertical className={styles.kebabIcon} />
                </button>

                {openMenuId === r.id && (
                  <div className={cn(styles.menu, styles.menuRight)}>
                    <button className={styles.menuItem} onClick={() => actionView(r)} type="button">
                      <Eye className={styles.menuIcon} />
                      View
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => actionDownloadPayslip(r)}
                      type="button"
                    >
                      <Download className={styles.menuIcon} />
                      Download payslip
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => actionOpenReceipt(r)}
                      type="button"
                    >
                      <Receipt className={styles.menuIcon} />
                      Open receipt
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No matching records</div>
            <div className={styles.emptyText}>Try changing your search, filters, or date range.</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className={styles.pagination}>
        <button
          className={styles.pageBtn}
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
        >
          <ChevronLeft className={styles.pageIcon} />
          Prev
        </button>

        <div className={styles.pageInfo}>
          Page <b>{safePage}</b> of <b>{totalPages}</b>
        </div>

        <button
          className={styles.pageBtn}
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
        >
          Next
          <ChevronRight className={styles.pageIcon} />
        </button>
      </div>
    </div>
  );
}
