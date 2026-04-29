import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  description: string | null
  site_address: string | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
  status: string | null
  priority: string | null
  estimated_budget: number | string | null
  estimated_cost: number | string | null
  estimated_profit: number | string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  client_id: string | null
  created_by: string | null
  dimensions: unknown
  markup_rate: number | string | null
}

type ClientRow = {
  client_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function safeText(value: string | null | undefined, fallback = "—") {
  const text = String(value ?? "").trim()
  return text || fallback
}

function normalizePriority(value: string | null | undefined) {
  const priority = String(value ?? "").toLowerCase()

  if (priority === "high") return "high"
  if (priority === "medium") return "medium"
  if (priority === "low") return "low"

  return "medium"
}

function normalizeStatus(value: string | null | undefined) {
  const status = String(value ?? "").trim()

  return status || "main_task_pending"
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)

    const rangeStartISO = url.searchParams.get("rangeStartISO")
    const rangeEndISO = url.searchParams.get("rangeEndISO")
    const status = url.searchParams.get("status")
    const query = url.searchParams.get("query")?.trim() ?? ""
    const sort = url.searchParams.get("sort") ?? "updated_desc"

    let projectsQuery = supabaseAdmin
      .from("projects")
      .select(
        [
          "project_id",
          "project_code",
          "title",
          "description",
          "site_address",
          "scheduled_start_datetime",
          "scheduled_end_datetime",
          "status",
          "priority",
          "estimated_budget",
          "estimated_cost",
          "estimated_profit",
          "notes",
          "created_at",
          "updated_at",
          "client_id",
          "created_by",
          "dimensions",
          "markup_rate",
        ].join(", ")
      )

    if (rangeStartISO) {
      projectsQuery = projectsQuery.gte("updated_at", rangeStartISO)
    }

    if (rangeEndISO) {
      projectsQuery = projectsQuery.lte("updated_at", rangeEndISO)
    }

    if (status && status !== "all") {
      projectsQuery = projectsQuery.eq("status", status)
    }

    if (query) {
      const safeQuery = query.replaceAll("%", "\\%").replaceAll("_", "\\_")

      projectsQuery = projectsQuery.or(
        [
          `project_code.ilike.%${safeQuery}%`,
          `title.ilike.%${safeQuery}%`,
          `site_address.ilike.%${safeQuery}%`,
          `status.ilike.%${safeQuery}%`,
        ].join(",")
      )
    }

    if (sort === "updated_asc") {
      projectsQuery = projectsQuery.order("updated_at", { ascending: true, nullsFirst: false })
    } else if (sort === "title_asc") {
      projectsQuery = projectsQuery.order("title", { ascending: true, nullsFirst: false })
    } else if (sort === "title_desc") {
      projectsQuery = projectsQuery.order("title", { ascending: false, nullsFirst: false })
    } else if (sort === "budget_desc") {
      projectsQuery = projectsQuery.order("estimated_budget", {
        ascending: false,
        nullsFirst: false,
      })
    } else if (sort === "profit_desc") {
      projectsQuery = projectsQuery.order("estimated_profit", {
        ascending: false,
        nullsFirst: false,
      })
    } else {
      projectsQuery = projectsQuery.order("updated_at", { ascending: false, nullsFirst: false })
    }

    const { data: projects, error: projectsError } = await projectsQuery

    if (projectsError) {
      return NextResponse.json({ error: projectsError.message }, { status: 500 })
    }

    const projectRows = (projects ?? []) as unknown as ProjectRow[]

    const clientIds = Array.from(
      new Set(
        projectRows
          .map((project) => project.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    )

    let clientsById = new Map<string, ClientRow>()

    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabaseAdmin
        .from("clients")
        .select("client_id, full_name, phone, email, address, notes")
        .in("client_id", clientIds)

      if (clientsError) {
        return NextResponse.json({ error: clientsError.message }, { status: 500 })
      }

      clientsById = new Map(
        ((clients ?? []) as ClientRow[]).map((client) => [client.client_id, client])
      )
    }

    const rows = projectRows.map((project) => {
      const client = project.client_id ? clientsById.get(project.client_id) : null

      return {
        projectId: project.project_id,
        projectCode: safeText(project.project_code),
        title: safeText(project.title, "Untitled Project"),
        description: project.description ?? "",
        clientId: project.client_id,
        clientName: safeText(client?.full_name, "No client assigned"),
        clientEmail: client?.email ?? null,
        clientPhone: client?.phone ?? null,
        clientAddress: client?.address ?? null,
        siteAddress: safeText(project.site_address),
        status: normalizeStatus(project.status),
        priority: normalizePriority(project.priority),
        startDatetime: project.scheduled_start_datetime,
        endDatetime: project.scheduled_end_datetime,
        estimatedBudget: toNumber(project.estimated_budget),
        estimatedCost: toNumber(project.estimated_cost),
        estimatedProfit: toNumber(project.estimated_profit),
        markupRate: toNumber(project.markup_rate),
        notes: project.notes ?? "",
        dimensions: project.dimensions ?? null,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
      }
    })

    return NextResponse.json({ projects: rows })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch report projects" },
      { status: 500 }
    )
  }
}