import { fakeDelay } from "./_shared"

export type ReportView = "weekly" | "monthly" | "yearly"

export type ReportSummary = {
  totalJobs: number
  totalRevenue: number
  totalCost: number
  netProfit: number
}

export type QuickLink = {
  id: string
  title: string
  desc: string
  href: string
}

export async function getReportSummary(_params: {
  view: ReportView
  rangeStartISO: string
  rangeEndISO: string
}): Promise<ReportSummary> {
  await fakeDelay(250)

  // Dummy values (later: swap to Supabase query results)
  return {
    totalJobs: 128,
    totalRevenue: 245_300,
    totalCost: 176_400,
    netProfit: 68_900,
  }
}

export async function getReportQuickLinks(): Promise<QuickLink[]> {
  await fakeDelay(150)
  return [
    {
      id: "r1",
      title: "Revenue Summary",
      desc: "Line chart overview and KPIs",
      href: "/admin/report/report-overview",
    },
    {
      id: "r2",
      title: "Report List",
      desc: "View generated reports and history",
      href: "/admin/report/report-list",
    },
  ]
}