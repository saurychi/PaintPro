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

export type ProjectPriority = "low" | "medium" | "high"

export type ReportProjectRow = {
  projectId: string
  projectCode: string
  title: string
  description: string
  clientId: string | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string | null
  siteAddress: string
  status: string
  priority: ProjectPriority
  startDatetime: string | null
  endDatetime: string | null
  estimatedBudget: number
  estimatedCost: number
  estimatedProfit: number
  markupRate: number
  notes: string
  dimensions: unknown
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
}

export type GetReportProjectsParams = {
  rangeStartISO?: string
  rangeEndISO?: string
  status?: string
  sort?: string
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed")
  }

  return data as T
}

export async function getReportProjects(
  params: GetReportProjectsParams = {}
): Promise<ReportProjectRow[]> {
  const searchParams = new URLSearchParams()

  if (params.rangeStartISO) {
    searchParams.set("rangeStartISO", params.rangeStartISO)
  }

  if (params.rangeEndISO) {
    searchParams.set("rangeEndISO", params.rangeEndISO)
  }

  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status)
  }

  if (params.sort) {
    searchParams.set("sort", params.sort)
  }

  const queryString = searchParams.toString()
  const response = await fetch(`/api/reports/projects${queryString ? `?${queryString}` : ""}`, {
    method: "GET",
    cache: "no-store",
  })

  const data = await parseResponse<{ projects: ReportProjectRow[] }>(response)

  return data.projects ?? []
}

export async function getReportSummary(params: {
  view: ReportView
  rangeStartISO: string
  rangeEndISO: string
}): Promise<ReportSummary> {
  const projects = await getReportProjects({
    rangeStartISO: params.rangeStartISO,
    rangeEndISO: params.rangeEndISO,
  })

  return projects.reduce(
    (summary, project) => {
      summary.totalJobs += 1
      summary.totalRevenue += project.estimatedBudget
      summary.totalCost += project.estimatedCost
      summary.netProfit += project.estimatedProfit

      return summary
    },
    {
      totalJobs: 0,
      totalRevenue: 0,
      totalCost: 0,
      netProfit: 0,
    }
  )
}

export async function getReportQuickLinks(): Promise<QuickLink[]> {
  return [
    {
      id: "r1",
      title: "Revenue Summary",
      desc: "Line chart overview and KPIs",
      href: "/admin/report/report-overview",
    },
    {
      id: "r2",
      title: "Project Report List",
      desc: "View project records and financial estimates",
      href: "/admin/report/report-list",
    },
  ]
}