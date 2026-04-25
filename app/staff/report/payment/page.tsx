"use client";

import { useMemo, useState } from "react";
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
  periodLabel: string;
  issuedLabel: string;
  dueLabel: string;
  amount: number;
};

const STATUS_META: Record<
  PayStatus,
  { label: string; pill: string; accent: string }
> = {
  PAID: {
    label: "Paid",
    pill:
      "border border-green-500/20 bg-green-500/15 text-green-950",
    accent:
      "border-green-500/25 bg-green-500/[0.06]",
  },
  PENDING: {
    label: "Pending",
    pill:
      "border border-amber-500/20 bg-amber-500/15 text-orange-950",
    accent:
      "border-amber-500/25 bg-amber-500/[0.08]",
  },
  OVERDUE: {
    label: "Overdue",
    pill:
      "border border-red-500/20 bg-red-500/[0.12] text-red-950",
    accent:
      "border-red-500/25 bg-red-500/[0.06]",
  },
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
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState(addDays("2026-01-01", 30));
  const [status, setStatus] = useState<"ALL" | PayStatus>("ALL");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const pageSize = 6;
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = MOCK_ROWS.filter((r) =>
      status === "ALL" ? true : r.status === status
    );

    const searched = !q
      ? base
      : base.filter((r) => {
          const hay =
            `${r.payNo} ${r.staffName} ${r.staffId} ${r.role} ${r.periodLabel}`.toLowerCase();
          return hay.includes(q);
        });

    return [...searched];
  }, [query, status]);

  const stats = useMemo(() => {
    const paid = filtered.filter((r) => r.status === "PAID").length;
    const pending = filtered.filter((r) => r.status === "PENDING").length;
    const overdue = filtered.filter((r) => r.status === "OVERDUE").length;

    return {
      paid,
      pending,
      overdue,
      total: filtered.length,
    };
  }, [filtered]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length]
  );

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
    <div
      className="p-[18px_16px] text-gray-900 antialiased min-[561px]:p-[22px_26px]"
      onClick={closeMenus}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-start justify-between gap-[14px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-[260px] flex-col gap-1.5">
          <h1 className="m-0 text-[34px] font-bold tracking-[-0.02em] text-gray-900 min-[561px]:text-[44px]">
            Payment
          </h1>
          <div className="mt-0.5 text-xs font-normal text-black/55">
            Staff report • Backend-ready UI
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative h-[42px] w-[240px] rounded-full border border-gray-200 bg-white min-[921px]:w-[290px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-full w-full border-none bg-transparent px-3.5 pl-[34px] text-sm font-normal text-gray-900 outline-none"
              placeholder="Search staff, pay no, role..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Date range
            </div>

            <div className="flex items-center gap-2.5">
              <input
                className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-xs font-normal text-gray-400">to</span>
              <input
                className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
              <Filter className="h-3.5 w-3.5" />
              Status
            </div>

            <select
              className="h-9 min-w-[180px] rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-900 outline-none"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "ALL" | PayStatus);
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
      <div className="mt-3.5 grid grid-cols-1 gap-3 min-[561px]:grid-cols-2 min-[1221px]:grid-cols-4">
        <div className={`min-h-[88px] rounded-[14px] border bg-white p-3.5 ${STATUS_META.PAID.accent}`}>
          <div className="text-xs font-medium text-gray-900/70">Paid</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {stats.paid}
          </div>
        </div>

        <div className={`min-h-[88px] rounded-[14px] border bg-white p-3.5 ${STATUS_META.PENDING.accent}`}>
          <div className="text-xs font-medium text-gray-900/70">Pending</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {stats.pending}
          </div>
        </div>

        <div className={`min-h-[88px] rounded-[14px] border bg-white p-3.5 ${STATUS_META.OVERDUE.accent}`}>
          <div className="text-xs font-medium text-gray-900/70">Overdue</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {stats.overdue}
          </div>
        </div>

        <div className="min-h-[88px] rounded-[14px] border border-gray-200 bg-white p-3.5">
          <div className="text-xs font-medium text-gray-900/70">Total</div>
          <div className="mt-2.5 text-3xl font-semibold text-gray-900">
            {stats.total}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-[14px]">
        <div className="text-sm font-semibold text-gray-900">Payment Log</div>
        <div className="text-xs font-normal text-gray-500">
          Showing {pageRows.length} of {filtered.length}
        </div>
      </div>

      <div className="mt-2.5 overflow-hidden rounded-[14px] border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0px_0px_0.7fr_60px] items-center border-b border-gray-200 px-3 py-3 text-xs font-medium tracking-[0.02em] text-gray-500 min-[561px]:grid-cols-[1.2fr_0.9fr_0.7fr_0.9fr_0px_0.7fr_60px] min-[921px]:grid-cols-[1.2fr_0.9fr_0.7fr_0.9fr_0.8fr_0.7fr_60px]">
          <div className="min-w-0">STAFF</div>
          <div className="min-w-0">PAY NO</div>
          <div>STATUS</div>
          <div className="hidden min-[561px]:block">PERIOD</div>
          <div className="hidden min-[921px]:block">DUE</div>
          <div className="text-right">AMOUNT</div>
          <div />
        </div>

        {pageRows.map((r) => {
          const meta = STATUS_META[r.status];

          return (
            <div
              key={r.id}
              className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0px_0px_0.7fr_60px] items-center border-b border-slate-100 px-3 py-3.5 text-sm font-normal last:border-b-0 min-[561px]:grid-cols-[1.2fr_0.9fr_0.7fr_0.9fr_0px_0.7fr_60px] min-[921px]:grid-cols-[1.2fr_0.9fr_0.7fr_0.9fr_0.8fr_0.7fr_60px]"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">
                  {r.staffName}
                </div>
                <div className="mt-1 truncate text-xs font-normal text-gray-500">
                  {r.staffId} • {r.role}
                </div>
              </div>

              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">
                  {r.payNo}
                </div>
                <div className="mt-1 truncate text-xs font-normal text-gray-500">
                  Issued {r.issuedLabel}
                </div>
              </div>

              <div>
                <span
                  className={`inline-flex h-6 items-center justify-center rounded-full px-3 text-xs font-semibold tracking-[0.02em] ${meta.pill}`}
                >
                  {meta.label}
                </span>
              </div>

              <div className="hidden truncate text-[13px] font-normal text-gray-700 min-[561px]:block">
                {r.periodLabel}
              </div>

              <div className="hidden truncate text-[13px] font-normal text-gray-700 min-[921px]:block">
                {r.dueLabel}
              </div>

              <div className="truncate text-right text-[13px] font-normal text-gray-700">
                {formatMoney(r.amount)}
              </div>

              <div
                className="relative flex justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-[10px] border border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-100"
                  type="button"
                  onClick={() =>
                    setOpenMenuId((prev) => (prev === r.id ? null : r.id))
                  }
                  aria-label="Row actions"
                >
                  <MoreVertical className="h-[18px] w-[18px] text-gray-900/55" />
                </button>

                {openMenuId === r.id && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-[0_10px_30px_rgba(0,0,0,0.1)]">
                    <button
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent p-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                      onClick={() => actionView(r)}
                      type="button"
                    >
                      <Eye className="h-4 w-4 text-gray-900/70" />
                      View
                    </button>

                    <button
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent p-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                      onClick={() => actionDownloadPayslip(r)}
                      type="button"
                    >
                      <Download className="h-4 w-4 text-gray-900/70" />
                      Download payslip
                    </button>

                    <button
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent p-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                      onClick={() => actionOpenReceipt(r)}
                      type="button"
                    >
                      <Receipt className="h-4 w-4 text-gray-900/70" />
                      Open receipt
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center">
            <div className="text-[15px] font-semibold text-gray-900">
              No matching records
            </div>
            <div className="mt-1.5 text-[13px] font-normal text-gray-500">
              Try changing your search, filters, or date range.
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-3.5 flex items-center justify-end gap-3">
        <button
          className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        <div className="text-[13px] font-normal text-gray-700">
          Page <b>{safePage}</b> of <b>{totalPages}</b>
        </div>

        <button
          className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
