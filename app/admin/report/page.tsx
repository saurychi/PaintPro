"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

export default function AdminReportPage() {
  const kpi = useMemo(() => {
    return {
      rangeLabel: "2023-present",
      totalJobs: 128,
      totalRevenue: 245_300,
      totalCost: 176_400,
      netProfit: 68_900,
    }
  }, [])

  const profitMargin = useMemo(() => {
    if (kpi.totalRevenue <= 0) return 0
    return Math.round((kpi.netProfit / kpi.totalRevenue) * 100)
  }, [kpi])

  const currency = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n)

  return (
    <div className="p-6">
      {/* H1 consistent with Dashboard */}
      <h1 className="text-2xl font-semibold text-gray-900">Report</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* LEFT: KPI / Overview */}
        <section className="lg:col-span-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Report Overview</div>
              <div className="mt-0.5 text-xs text-gray-500">Insights and summaries • {kpi.rangeLabel}</div>
            </div>

            <Link
              href="/admin/report/report-overview"
              className="inline-flex items-center gap-2 rounded-lg bg-[#00c065] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054]"
            >
              Open Overview
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Jobs</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{kpi.totalJobs}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.totalRevenue)}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Total Cost</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.totalCost)}</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-xs font-medium text-gray-500">Net Profit</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{currency(kpi.netProfit)}</div>
            </div>

            <div className="sm:col-span-2 rounded-lg border border-[#00c065]/25 bg-[#00c065]/10 p-3">
              <div className="text-xs font-medium text-gray-600">Profit Margin</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{profitMargin}%</div>
              <div className="mt-1 text-xs font-medium text-[#166534]">
                Placeholder KPI. Replace with real values from backend later.
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/report/report-list"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
            >
              View Reports List
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </Link>

            <Link
              href="/admin/report/report-overview"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
            >
              View Dashboard Charts
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </Link>
          </div>
        </section>

        {/* RIGHT: Manual Reports */}
        <section className="lg:col-span-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-gray-900">Manual Reports</div>
            <div className="mt-0.5 text-xs text-gray-500">Generate or open report modules</div>
          </div>

          <div className="mt-4 space-y-2">
            <Link
              href="/admin/report/report-list"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
            >
              <span>Report List</span>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                <ChevronRight className="h-4 w-4 text-[#00a054]" />
              </span>
            </Link>

            <Link
              href="/admin/report/report-overview"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
            >
              <span>Report Overview</span>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00c065]/10">
                <ChevronRight className="h-4 w-4 text-[#00a054]" />
              </span>
            </Link>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <div className="text-xs font-semibold text-gray-900">Backend-ready note</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-600">
              This page uses placeholder KPI data. When your API is ready, replace the hardcoded values with a fetch call and update the KPIs.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
