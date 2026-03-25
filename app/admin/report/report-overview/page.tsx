"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
  Legend,
} from "recharts"
import { ChevronRight } from "lucide-react"

type ReportView = "weekly" | "monthly" | "yearly"

type RevenuePoint = {
  period: string
  revenue: number
  cost: number
  profit: number
}

type CostSpreadAmountItem = {
  name: string
  amount: number
  percent: number
}

type StaffPerfRow = {
  category: string
  Marco: number
  Francis: number
  Paul: number
}

type StaffRevenueRow = {
  period: string
  [staffKey: string]: string | number
}

function formatPercentRounded(n: number) {
  return `${Math.round(n)}%`
}

function formatCurrencyPHP(n: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n)
}

type TooltipPayloadItem = {
  name?: string
  value?: number | string
  payload?: any
}

type BasicTooltipProps = {
  active?: boolean
  label?: string
  payload?: TooltipPayloadItem[]
}

function TooltipShell({
  title,
  rows,
}: {
  title: string
  rows: { name: string; value: string }[]
}) {
  return (
    <div className="min-w-[190px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
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
  )
}

function RevenueLineTooltip(props: BasicTooltipProps) {
  const active = props.active
  const label = props.label
  const payload = props.payload ?? []
  if (!active || payload.length === 0) return null

  return (
    <TooltipShell
      title={label ?? "Period"}
      rows={payload.map((p) => {
        const name = p.name ?? "Value"
        const v = Number(p.value ?? 0)
        return { name, value: formatCurrencyPHP(v) }
      })}
    />
  )
}

function StaffBarTooltip(props: BasicTooltipProps) {
  const active = props.active
  const label = props.label
  const payload = props.payload ?? []
  if (!active || payload.length === 0) return null

  return (
    <TooltipShell
      title={label ?? "Period"}
      rows={payload.map((p) => ({
        name: p.name ?? "Staff",
        value: formatCurrencyPHP(Number(p.value ?? 0)),
      }))}
    />
  )
}

function CostPieTooltip(props: BasicTooltipProps) {
  const active = props.active
  const payload = props.payload ?? []
  if (!active || payload.length === 0) return null

  const first = payload[0]
  const p = first.payload as CostSpreadAmountItem | undefined

  const name = first.name ?? p?.name ?? "Cost"
  const amount =
    typeof p?.amount === "number" ? p.amount : Number(first.value ?? 0)
  const percent = typeof p?.percent === "number" ? p.percent : 0

  return (
    <TooltipShell
      title={name}
      rows={[
        { name: "Amount", value: formatCurrencyPHP(amount) },
        { name: "Share", value: `${percent}%` },
      ]}
    />
  )
}

function PerfTooltip(props: BasicTooltipProps) {
  const active = props.active
  const label = props.label
  const payload = props.payload ?? []
  if (!active || payload.length === 0) return null

  return (
    <TooltipShell
      title={label ?? "Category"}
      rows={payload.map((p) => ({
        name: p.name ?? "Staff",
        value: `${Math.round(Number(p.value ?? 0))} / 100`,
      }))}
    />
  )
}

const COST_COLORS: Record<string, string> = {
  "Labor Cost": "#00c065",
  "Services Cost": "#3b82f6",
  "Materials Cost": "#f59e0b",
  "Transportation Cost": "#8b5cf6",
}

const STAFF_COLORS: Record<string, string> = {
  Marco: "#00c065",
  Francis: "#3b82f6",
  Paul: "#f59e0b",
}

function StaffRevenueLegend() {
  const items = [
    { key: "Marco", color: STAFF_COLORS.Marco },
    { key: "Francis", color: STAFF_COLORS.Francis },
    { key: "Paul", color: STAFF_COLORS.Paul },
  ]

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-5 text-xs font-semibold">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span className="text-gray-700">{item.key}</span>
        </div>
      ))}
    </div>
  )
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getWeekRange(today: Date) {
  const d = startOfDay(today)
  const day = d.getDay()
  const diffToMonday = (day + 6) % 7
  const start = new Date(d)
  start.setDate(d.getDate() - diffToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

function getMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start, end }
}

function getYearRange(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1)
  const end = new Date(today.getFullYear(), 11, 31)
  return { start, end }
}

function getRange(view: ReportView, today: Date) {
  if (view === "weekly") return getWeekRange(today)
  if (view === "yearly") return getYearRange(today)
  return getMonthRange(today)
}

function viewLabel(view: ReportView) {
  if (view === "weekly") return "Weekly"
  if (view === "yearly") return "Yearly"
  return "Monthly"
}

function staffBreakdownLabel(view: ReportView) {
  if (view === "weekly") return "Daily breakdown of staff contribution"
  if (view === "monthly") return "Weekly breakdown of staff contribution"
  return "Monthly breakdown of staff contribution"
}

function formatRangeLabel(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${fmt.format(start)} to ${fmt.format(end)}`
}

function useAsOfTime() {
  const [asOf, setAsOf] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setAsOf(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(asOf)
  }, [asOf])
}

function buildRevenueSeries(view: ReportView): RevenuePoint[] {
  if (view === "weekly") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return days.map((d, i) => {
      const revenue = 24000 + i * 1800 + (i === 4 ? 4500 : 0)
      const cost = 15800 + i * 900 + (i === 2 ? 1200 : 0)
      return { period: d, revenue, cost, profit: Math.max(0, revenue - cost) }
    })
  }

  if (view === "monthly") {
    const weeks = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
    return weeks.map((w, i) => {
      const revenue = 118000 + i * 13500 + (i === 2 ? 9000 : 0)
      const cost = 76000 + i * 8200 + (i === 1 ? 3500 : 0)
      return { period: w, revenue, cost, profit: Math.max(0, revenue - cost) }
    })
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return months.map((m, i) => {
    const revenue = 520000 + i * 22000 + (i % 4 === 0 ? 18000 : 0)
    const cost = 338000 + i * 14000 + (i % 5 === 0 ? 7000 : 0)
    return { period: m, revenue, cost, profit: Math.max(0, revenue - cost) }
  })
}

function buildStaffRevenue(view: ReportView): {
  staffKeys: string[]
  rows: StaffRevenueRow[]
} {
  const staffKeys = ["Marco", "Francis", "Paul"]

  if (view === "weekly") {
    const periods = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const rows = periods.map((p, i) => ({
      period: p,
      Marco: 8200 + i * 320 + (i === 4 ? 1400 : 0),
      Francis: 7600 + i * 280,
      Paul: 6200 + i * 240,
    }))
    return { staffKeys, rows }
  }

  if (view === "monthly") {
    const periods = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
    const rows = periods.map((p, i) => ({
      period: p,
      Marco: 42000 + i * 1800 + (i === 2 ? 2500 : 0),
      Francis: 39000 + i * 1650,
      Paul: 32000 + i * 1400,
    }))
    return { staffKeys, rows }
  }

  const periods = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const rows = periods.map((p, i) => ({
    period: p,
    Marco: 186000 + i * 4200,
    Francis: 170000 + i * 3800,
    Paul: 142000 + i * 3200,
  }))
  return { staffKeys, rows }
}

function buildStaffPerformance(): StaffPerfRow[] {
  return [
    { category: "Work Quality", Marco: 89, Francis: 86, Paul: 83 },
    { category: "Time Efficiency", Marco: 82, Francis: 85, Paul: 79 },
    { category: "Teamwork", Marco: 84, Francis: 88, Paul: 82 },
    { category: "Work Ethic", Marco: 91, Francis: 87, Paul: 85 },
    { category: "Compliance", Marco: 88, Francis: 90, Paul: 86 },
  ]
}

function calcSummary(revenueSeries: RevenuePoint[]) {
  const totalRevenue = revenueSeries.reduce((acc, p) => acc + p.revenue, 0)
  const totalCost = revenueSeries.reduce((acc, p) => acc + p.cost, 0)
  const totalProfit = Math.max(0, totalRevenue - totalCost)
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  return { totalRevenue, totalCost, totalProfit, margin }
}

function computeRoundedPercents(amounts: { name: string; amount: number }[]) {
  const total = amounts.reduce((a, it) => a + it.amount, 0) || 1

  const withExact = amounts.map((it) => {
    const exact = (it.amount / total) * 100
    const floored = Math.floor(exact)
    const frac = exact - floored
    return { ...it, floored, frac }
  })

  const baseSum = withExact.reduce((a, it) => a + it.floored, 0)
  let remaining = 100 - baseSum

  const sorted = [...withExact].sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    sorted[i].floored += 1
    remaining -= 1
  }

  const map = new Map(sorted.map((it) => [it.name, it.floored]))
  return amounts.map((it) => ({
    name: it.name,
    amount: it.amount,
    percent: map.get(it.name) ?? 0,
  }))
}

function buildCostSpreadFromTotalCost(totalCost: number): CostSpreadAmountItem[] {
  const raw = [
    { name: "Labor Cost", amount: Math.round(totalCost * 0.42) },
    { name: "Materials Cost", amount: Math.round(totalCost * 0.28) },
    { name: "Services Cost", amount: Math.round(totalCost * 0.22) },
    { name: "Transportation Cost", amount: Math.round(totalCost * 0.08) },
  ]
  return computeRoundedPercents(raw)
}

export default function ReportOverviewPage() {
  const [view, setView] = useState<ReportView>("weekly")
  const asOfTime = useAsOfTime()

  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => getRange(view, today), [view, today])
  const rangeText = useMemo(
    () => formatRangeLabel(range.start, range.end),
    [range.start, range.end]
  )

  const data = useMemo(() => {
    const revenueSeries = buildRevenueSeries(view)
    const staffRevenue = buildStaffRevenue(view)
    const summary = calcSummary(revenueSeries)

    const costSpread = buildCostSpreadFromTotalCost(summary.totalCost)
    const biggest = costSpread.reduce((best, cur) =>
      cur.amount > best.amount ? cur : best
    )

    const staffPerformance = buildStaffPerformance()

    return {
      revenueSeries,
      staffRevenue,
      costSpread,
      biggest,
      staffPerformance,
      summary,
    }
  }, [view])

  const card = "rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
  const cardHeader = "mb-3 flex items-start justify-between gap-3"
  const cardTitle = "text-sm font-semibold text-gray-900"
  const kpiBox = "rounded-lg border border-gray-200 bg-gray-50/60 p-3"

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Link
            href="/admin/report"
            className="rounded-md px-1.5 py-1 text-[#00c065] transition-colors hover:bg-gray-50 hover:text-[#00a054]"
          >
            Report
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <span className="text-gray-900">Report Overview</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-semibold text-gray-500 sm:inline">
            View
          </span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ReportView)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00c065]/30"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>

      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Report Overview</h1>

      <div className="mt-3 inline-block rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-gray-500">Range:</span>{" "}
            <span className="font-semibold text-gray-900">{rangeText}</span>
          </div>

          <div>
            <span className="text-gray-500">View:</span>{" "}
            <span className="font-semibold text-gray-900">{viewLabel(view)}</span>
          </div>

          <div>
            <span className="text-gray-500">Last Updated:</span>{" "}
            <span className="font-semibold text-gray-900">{asOfTime}</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_420px]">
          <section className={`${card} flex min-h-[520px] flex-col`}>
            <div className={cardHeader}>
              <div>
                <div className={cardTitle}>Revenue Summary</div>
                <div className="mt-1 text-xs text-gray-500">
                  Revenue, cost, and profit for the selected {viewLabel(view).toLowerCase()} range
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="h-full min-h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.revenueSeries}
                    margin={{ top: 8, right: 10, left: 10, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip content={<RevenueLineTooltip />} />

                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      wrapperStyle={{ right: -10 }}
                      content={() => (
                        <div className="flex flex-col gap-2 text-xs font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#00c065]" />
                            <span className="text-gray-900">Revenue</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                            <span className="text-gray-900">Cost</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
                            <span className="text-gray-900">Profit</span>
                          </div>
                        </div>
                      )}
                    />

                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#00c065"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      name="Cost"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="Profit"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className={kpiBox}>
                  <div className="text-xs font-semibold text-gray-500">Total Revenue</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrencyPHP(data.summary.totalRevenue)}
                  </div>
                </div>

                <div className={kpiBox}>
                  <div className="text-xs font-semibold text-gray-500">Total Cost</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrencyPHP(data.summary.totalCost)}
                  </div>
                </div>

                <div className={kpiBox}>
                  <div className="text-xs font-semibold text-gray-500">Net Profit</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrencyPHP(data.summary.totalProfit)}
                  </div>
                </div>

                <div className={kpiBox}>
                  <div className="text-xs font-semibold text-gray-500">Profit Margin</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatPercentRounded(data.summary.margin)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <section className={card}>
              <div className={cardHeader}>
                <div>
                  <div className={cardTitle}>Revenue by Staff</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {staffBreakdownLabel(view)}
                  </div>
                </div>
              </div>

              <div className="px-1">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.staffRevenue.rows}
                      margin={{ top: 8, right: 8, left: 18, bottom: 8 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="period"
                        interval={0}
                        minTickGap={0}
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={{ stroke: "#e5e7eb" }}
                      />
                      <YAxis
                        width={40}
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={{ stroke: "#e5e7eb" }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <Tooltip content={<StaffBarTooltip />} />

                      <Bar
                        dataKey="Marco"
                        name="Marco"
                        stackId="rev"
                        fill={STAFF_COLORS.Marco}
                        radius={[0, 0, 0, 0]}
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="Francis"
                        name="Francis"
                        stackId="rev"
                        fill={STAFF_COLORS.Francis}
                        radius={[0, 0, 0, 0]}
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="Paul"
                        name="Paul"
                        stackId="rev"
                        fill={STAFF_COLORS.Paul}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={30}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <StaffRevenueLegend />
            </section>

            <section className={card}>
              <div className={cardHeader}>
                <div>
                  <div className={cardTitle}>Average Job Cost Spread</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Total cost:{" "}
                    <span className="font-semibold text-gray-900">
                      {formatCurrencyPHP(data.summary.totalCost)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center">
                <div className="h-[160px] w-full sm:w-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<CostPieTooltip />} />
                      <Pie
                        data={data.costSpread}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={0}
                        outerRadius={78}
                        paddingAngle={2}
                        isAnimationActive={false}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {data.costSpread.map((it) => (
                          <Cell key={it.name} fill={COST_COLORS[it.name] ?? "#9ca3af"} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-2">
                  {data.costSpread.map((it) => (
                    <div key={it.name} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COST_COLORS[it.name] ?? "#9ca3af" }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-xs font-semibold text-gray-900">{it.name}</span>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold text-gray-900">{it.percent}%</div>
                        <div className="text-[11px] font-semibold text-gray-500">
                          {formatCurrencyPHP(it.amount)}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-700">
                    <span className="font-semibold text-gray-900">Quick read:</span> The biggest cost driver is{" "}
                    <span className="font-semibold text-gray-900">{data.biggest.name}</span> at{" "}
                    <span className="font-semibold text-gray-900">{data.biggest.percent}%</span> (
                    {formatCurrencyPHP(data.biggest.amount)}).
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className={`mt-4 ${card}`}>
          <div className={cardHeader}>
            <div>
              <div className={cardTitle}>Employee Performance</div>
              <div className="mt-1 text-xs text-gray-500">
                Staff ratings by category (0–100) within the selected range
              </div>
            </div>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.staffPerformance} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip content={<PerfTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Marco" name="Marco" fill={STAFF_COLORS.Marco} />
                <Bar dataKey="Francis" name="Francis" fill={STAFF_COLORS.Francis} />
                <Bar dataKey="Paul" name="Paul" fill={STAFF_COLORS.Paul} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}