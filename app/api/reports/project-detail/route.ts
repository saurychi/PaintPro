import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type ProjectRow = {
  project_id: string
  project_code: string | null
  title: string | null
  description: string | null
  site_address: string | null
  status: string | null
  priority: string | null
  scheduled_start_datetime: string | null
  scheduled_end_datetime: string | null
  estimated_budget: number | string | null
  estimated_cost: number | string | null
  estimated_profit: number | string | null
  materials_cost: number | string | null
  labor_cost: number | string | null
  markup_rate: number | string | null
  downpayment: number | string | null
  notes: string | null
  dimensions: unknown
  created_at: string | null
  updated_at: string | null
  client_id: string | null
  created_by: string | null
}

type ClientRow = {
  client_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

type UserRow = {
  id: string
  username: string | null
  email: string | null
  role: string | null
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")?.trim() || ""

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select(
        [
          "project_id",
          "project_code",
          "title",
          "description",
          "site_address",
          "status",
          "priority",
          "scheduled_start_datetime",
          "scheduled_end_datetime",
          "estimated_budget",
          "estimated_cost",
          "estimated_profit",
          "materials_cost",
          "labor_cost",
          "markup_rate",
          "downpayment",
          "notes",
          "dimensions",
          "created_at",
          "updated_at",
          "client_id",
          "created_by",
        ].join(", "),
      )
      .eq("project_id", projectId)
      .maybeSingle<ProjectRow>()

    if (projectError) {
      return NextResponse.json(
        { error: "Failed to load project.", details: projectError.message },
        { status: 500 },
      )
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 })
    }

    let client: ClientRow | null = null
    if (project.client_id) {
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("client_id, full_name, phone, email, address, notes")
        .eq("client_id", project.client_id)
        .maybeSingle<ClientRow>()

      if (clientError) {
        return NextResponse.json(
          { error: "Failed to load client.", details: clientError.message },
          { status: 500 },
        )
      }

      client = clientData ?? null
    }

    let creator: UserRow | null = null
    if (project.created_by) {
      const { data: userData, error: userError } = await supabaseAdmin
        .from("users")
        .select("id, username, email, role")
        .eq("id", project.created_by)
        .maybeSingle<UserRow>()

      if (userError) {
        return NextResponse.json(
          { error: "Failed to load creator.", details: userError.message },
          { status: 500 },
        )
      }

      creator = userData ?? null
    }

    return NextResponse.json({
      project: {
        projectId: project.project_id,
        projectCode: project.project_code,
        title: project.title,
        description: project.description,
        siteAddress: project.site_address,
        status: project.status,
        priority: project.priority,
        scheduledStartDatetime: project.scheduled_start_datetime,
        scheduledEndDatetime: project.scheduled_end_datetime,
        estimatedBudget: toNumber(project.estimated_budget),
        estimatedCost: toNumber(project.estimated_cost),
        estimatedProfit: toNumber(project.estimated_profit),
        materialsCost: toNumber(project.materials_cost),
        laborCost: toNumber(project.labor_cost),
        markupRate: toNumber(project.markup_rate),
        downpayment: toNumber(project.downpayment),
        notes: project.notes,
        dimensions: project.dimensions,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
      client: client
        ? {
            clientId: client.client_id,
            fullName: client.full_name,
            phone: client.phone,
            email: client.email,
            address: client.address,
            notes: client.notes,
          }
        : null,
      creator: creator
        ? {
            id: creator.id,
            username: creator.username,
            email: creator.email,
            role: creator.role,
          }
        : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Unexpected server error.", details: message },
      { status: 500 },
    )
  }
}
