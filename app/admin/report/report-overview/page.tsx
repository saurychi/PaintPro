"use client";

import { useMemo } from "react";
import styles from "./reportOverview.module.css";

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
  BarChart,
  Bar,
} from "recharts";

import { ChevronRight } from "lucide-react";

/* -----------------------------
   TYPES (backend-ready shape)
------------------------------ */
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

/* -----------------------------
   SMALL HELPERS
------------------------------ */
function formatPercent(n: number) {
  return `${n}%`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

/* -----------------------------
   TOOLTIP TYPES (NO recharts TooltipProps)
   This matches what recharts passes to Tooltip content
------------------------------ */
type TooltipPayloadItem = {
  name?: string;
  value?: number | string;
};

type BasicTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
};

/* -----------------------------
   TOOLTIP COMPONENTS
------------------------------ */
function LineTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const label = props.label;
  const payload = props.payload ?? [];

  if (!active || payload.length === 0) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{label}</div>
      <div className={styles.tooltipList}>
        {payload.map((p, idx) => (
          <div key={idx} className={styles.tooltipRow}>
            <span className={styles.tooltipName}>{p.name ?? "Value"}</span>
            <span className={styles.tooltipValue}>
              {formatNumber(Number(p.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const payload = props.payload ?? [];

  if (!active || payload.length === 0) return null;

  const first = payload[0];

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{first.name ?? "Share"}</div>
      <div className={styles.tooltipList}>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipName}>Share</span>
          <span className={styles.tooltipValue}>
            {formatPercent(Number(first.value ?? 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

function BarTooltip(props: BasicTooltipProps) {
  const active = props.active;
  const label = props.label;
  const payload = props.payload ?? [];

  if (!active || payload.length === 0) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{label}</div>
      <div className={styles.tooltipList}>
        {payload.map((p, idx) => (
          <div key={idx} className={styles.tooltipRow}>
            <span className={styles.tooltipName}>{p.name ?? "Value"}</span>
            <span className={styles.tooltipValue}>
              {formatNumber(Number(p.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -----------------------------
   PAGE
------------------------------ */
export default function ReportOverviewPage() {
  const data = useMemo(() => {
    // Replace later with API results
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

    return { roi, costSpread, employeePerformance, costTotal };
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Report Overview</h1>

      <div className={styles.topGrid}>
        {/* ROI */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Return Investment</div>
              <div className={styles.cardSubtitle}>2023-present</div>
            </div>
          </div>

          <div className={styles.chartWrapLg}>
            <ResponsiveContainer width="100%" height={280}>
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

          <div className={styles.seeMoreWrap}>
            <button className={styles.seeMoreBtn} type="button">
              see more
            </button>
          </div>
        </section>

        {/* Right column */}
        <div className={styles.rightCol}>
          {/* Manual Reports */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Manual Reports</div>
            </div>

            <div className={styles.manualList}>
              <button className={styles.manualItem} type="button">
                <span className={styles.manualText}>Job Reports</span>
                <span className={styles.manualGo}>
                  <ChevronRight size={18} />
                </span>
              </button>

              <button className={styles.manualItem} type="button">
                <span className={styles.manualText}>Employee Reports</span>
                <span className={styles.manualGo}>
                  <ChevronRight size={18} />
                </span>
              </button>
            </div>
          </section>

          {/* Donut */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Average Job Cost Spread</div>
            </div>

            <div className={styles.donutArea}>
              <div className={styles.donutChartWrap}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Tooltip content={<PieTooltip />} />
                    <Pie
                      data={data.costSpread}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={2}
                      isAnimationActive={false}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className={styles.donutCenter}>
                  <div className={styles.donutCenterTop}>Total</div>
                  <div className={styles.donutCenterBottom}>
                    {formatPercent(data.costTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.spreadList}>
                {data.costSpread.map((it) => (
                  <div key={it.name} className={styles.spreadRow}>
                    <div className={styles.spreadLeft}>
                      <span className={styles.dot} aria-hidden="true" />
                      <span className={styles.spreadName}>{it.name}</span>
                    </div>
                    <div className={styles.spreadValue}>
                      {formatPercent(it.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Employee Performance */}
      <section className={styles.cardWide}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Employee Performance</div>
            <div className={styles.cardSubtitle}>2023-present</div>
          </div>
        </div>

        <div className={styles.chartWrapWide}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data.employeePerformance}
              margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />

              <Tooltip content={<BarTooltip />} />

              <Bar dataKey="average" name="Average" />
              <Bar dataKey="highest" name="Highest" />
              <Bar dataKey="lowest" name="Lowest" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.seeMoreWrap}>
          <button className={styles.seeMoreBtn} type="button">
            see more
          </button>
        </div>
      </section>
    </div>
  );
}
