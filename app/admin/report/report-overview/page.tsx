"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { ChevronRight } from "lucide-react";

type RoiPoint = {
  month: string;
  netProfit: number;
  totalCost: number;
  totalPayment: number;
};

type CostSpreadItem = {
  name: string;
  value: number;
};

type EmployeePerfItem = {
  category: string;
  lowest: number;
  average: number;
  highest: number;
};

function formatPercent(n: number) {
  return `${n}%`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

type TooltipPayloadItem = {
  name?: string;
  value?: number | string;
};

type BasicTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
};

function TooltipShell({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; value: string }[];
}) {
  return (
    <div className="min-w-[160px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <div className="mb-1 text-xs font-semibold text-gray-900">{title}</div>
      <div className="grid gap-1.5">
        {rows.map((r, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-500">{r.name}</span>
            <span className="text-xs font-semibold text-gray-900">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const label = props.label;
  const payload = props.payload ?? [];
  if (!active || payload.length === 0) return null;

  return (
    <TooltipShell
      title={label ?? "Month"}
      rows={payload.map((p) => ({
        name: p.name ?? "Value",
        value: formatNumber(Number(p.value ?? 0)),
      }))}
    />
  );
}

function PieTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const payload = props.payload ?? [];
  if (!active || payload.length === 0) return null;

  const first = payload[0];

  return (
    <TooltipShell
      title={first.name ?? "Share"}
      rows={[
        {
          name: "Share",
          value: formatPercent(Number(first.value ?? 0)),
        },
      ]}
    />
  );
}

function BarTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const label = props.label;
  const payload = props.payload ?? [];
  if (!active || payload.length === 0) return null;

  return (
    <TooltipShell
      title={label ?? "Category"}
      rows={payload.map((p) => ({
        name: p.name ?? "Value",
        value: formatNumber(Number(p.value ?? 0)),
      }))}
    />
  );
}

const COST_COLORS: Record<string, string> = {
  "Labor Cost": "#00c065",
  "Services Cost": "#3b82f6",
  "Materials Cost": "#f59e0b",
  "Transportation Cost": "#8b5cf6",
};

export default function ReportOverviewPage() {
  const data = useMemo(() => {
    const roi: RoiPoint[] = [
      { month: "January", netProfit: 25, totalCost: 95, totalPayment: 80 },
      { month: "February", netProfit: 28, totalCost: 100, totalPayment: 86 },
      { month: "March", netProfit: 30, totalCost: 108, totalPayment: 92 },
      { month: "April", netProfit: 40, totalCost: 145, totalPayment: 120 },
      { month: "May", netProfit: 36, totalCost: 138, totalPayment: 112 },
      { month: "June", netProfit: 48, totalCost: 158, totalPayment: 135 },
      { month: "July", netProfit: 55, totalCost: 160, totalPayment: 145 },
    ];

    const costSpread: CostSpreadItem[] = [
      { name: "Labor Cost", value: 30 },
      { name: "Services Cost", value: 35 },
      { name: "Materials Cost", value: 25 },
      { name: "Transportation Cost", value: 10 },
    ];

    const employeePerformance: EmployeePerfItem[] = [
      { category: "WorkQuality", lowest: 60, average: 80, highest: 95 },
      { category: "TimeEfficiency", lowest: 55, average: 78, highest: 96 },
      { category: "Teamwork", lowest: 50, average: 75, highest: 90 },
      { category: "WorkEthic", lowest: 58, average: 82, highest: 93 },
      { category: "Compliance", lowest: 57, average: 79, highest: 98 },
    ];

    const costTotal = costSpread.reduce((acc, it) => acc + it.value, 0);
    const biggest = costSpread.reduce((best, cur) =>
      cur.value > best.value ? cur : best
    );

    return { roi, costSpread, employeePerformance, costTotal, biggest };
  }, []);

  const card = "rounded-lg border border-gray-200 bg-white p-4 shadow-sm";
  const cardHeader = "mb-3 flex items-start justify-between gap-3";
  const cardTitle = "text-sm font-semibold text-gray-900";
  const cardSubtitle = "mt-1 text-xs text-gray-500";

  const btnSoft =
    "inline-flex h-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 px-4 text-xs font-semibold text-emerald-900 hover:bg-emerald-100";

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Link
          href="/admin/report"
          className="rounded-md px-1.5 py-1 text-[#00c065] hover:bg-gray-50 hover:text-[#00a054]"
        >
          Report
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <span className="text-gray-900">Report Overview</span>
      </div>

      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Report Overview</h1>

      <div className="mt-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_420px]">
          {/* ROI */}
          <section className={card}>
            <div className={cardHeader}>
              <div>
                <div className={cardTitle}>Return Investment</div>
                <div className={cardSubtitle}>2023-present</div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.roi}
                    margin={{ top: 8, right: 10, left: 10, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<LineTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="netProfit"
                      name="Net Profit"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalCost"
                      name="Total Cost"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalPayment"
                      name="Total Payment"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex justify-center">
                <button className={btnSoft} type="button">
                  see more
                </button>
              </div>
            </div>
          </section>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Manual Reports */}
            <section className={card}>
              <div className={cardHeader}>
                <div className={cardTitle}>Manual Reports</div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                  type="button"
                >
                  <span className="text-sm font-semibold text-gray-900">Job Reports</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-900">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>

                <button
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                  type="button"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    Employee Reports
                  </span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-900">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </section>

            {/* Cost Spread (kept compact; pushed down when there is extra room) */}
            <section className={card}>
              <div className={cardHeader}>
                <div className={cardTitle}>Average Job Cost Spread</div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center">
                <div className="relative h-[160px] w-full sm:w-[160px]">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Tooltip content={<PieTooltip />} />
                      <Pie
                        data={data.costSpread}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={72}
                        paddingAngle={2}
                        isAnimationActive={false}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {data.costSpread.map((it) => (
                          <Cell
                            key={it.name}
                            fill={COST_COLORS[it.name] ?? "#9ca3af"}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div className="text-xs font-semibold text-gray-500">Total</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {formatPercent(data.costTotal)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {data.costSpread.map((it) => (
                    <div
                      key={it.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: COST_COLORS[it.name] ?? "#9ca3af",
                          }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-xs font-semibold text-gray-900">
                          {it.name}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-gray-900">
                        {formatPercent(it.value)}
                      </div>
                    </div>
                  ))}

                  <div className="mt-1 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
                    Biggest share:{" "}
                    <span className="font-semibold text-gray-900">
                      {data.biggest.name}
                    </span>{" "}
                    ({formatPercent(data.biggest.value)})
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Employee Performance */}
        <section className={`mt-4 ${card}`}>
          <div className={cardHeader}>
            <div>
              <div className={cardTitle}>Employee Performance</div>
              <div className={cardSubtitle}>2023-present</div>
            </div>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data.employeePerformance}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="average" name="Average" fill="#00c065" />
                <Bar dataKey="highest" name="Highest" fill="#3b82f6" />
                <Bar dataKey="lowest" name="Lowest" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex justify-center">
            <button className={btnSoft} type="button">
              see more
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
