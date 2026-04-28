import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CostEstimationResponse = {
  project: {
    project_id: string;
    project_code: string | null;
    title: string | null;
    description: string | null;
    site_address: string | null;
    status: string | null;
  };
  client: {
    client_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  markupRate: number;
  mainTasks: Array<{
    projectTaskId: string;
    mainTaskId: string;
    title: string;
    sortOrder: number;
    basePrice: number;
    materialTotal: number;
    laborTotal: number;
    totalCost: number;
    materials: Array<{
      projectTaskMaterialId: string;
      materialId: string;
      name: string;
      unit: string | null;
      estimatedQuantity: number;
      unitCost: number;
      estimatedCost: number;
    }>;
    subtasks: Array<{
      projectSubTaskId: string;
      subTaskId: string;
      title: string;
      estimatedHours: number;
      hourlyWageTotal: number;
      laborCost: number;
      scheduledStartDatetime?: string | null;
      scheduledEndDatetime?: string | null;
      assignedStaff: Array<{
        id: string;
        name: string;
        hourlyWage: number;
      }>;
    }>;
  }>;
  summary: {
    basePriceTotal: number;
    materialTotal: number;
    laborTotal: number;
    totalCost: number;
    profitAmount: number;
    quotationTotal: number;
  };
  error?: string;
  details?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function todayString() {
  return new Date().toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function getAdminSignatureInfo(projectId: string) {
  const { data: projectRow, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("created_by")
    .eq("project_id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Failed to load project creator:", projectError);
    return {
      signatureDataUrl: null as string | null,
      username: null as string | null,
    };
  }

  const createdBy = projectRow?.created_by;

  if (!createdBy) {
    return {
      signatureDataUrl: null as string | null,
      username: null as string | null,
    };
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("username, signature_url")
    .eq("id", createdBy)
    .maybeSingle();

  if (userError) {
    console.error("Failed to load admin signature info:", userError);
    return {
      signatureDataUrl: null as string | null,
      username: null as string | null,
    };
  }

  const username =
    typeof userRow?.username === "string" && userRow.username.trim()
      ? userRow.username.trim()
      : null;

  const signaturePath = userRow?.signature_url;

  if (!signaturePath) {
    return {
      signatureDataUrl: null,
      username,
    };
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("signatures")
    .download(signaturePath);

  if (downloadError || !fileData) {
    console.error("Failed to download admin signature:", downloadError);
    return {
      signatureDataUrl: null,
      username,
    };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return {
    signatureDataUrl: `data:${fileData.type || "image/png"};base64,${base64}`,
    username,
  };
}

async function getClientQuotationSignatureInfo(projectId: string) {
  const { data: projectRow, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("client_id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Failed to load project client:", projectError);
  }

  let clientName: string | null = null;

  if (projectRow?.client_id) {
    const { data: clientRow, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("full_name")
      .eq("client_id", projectRow.client_id)
      .maybeSingle();

    if (clientError) {
      console.error("Failed to load client name:", clientError);
    }

    clientName =
      typeof clientRow?.full_name === "string" && clientRow.full_name.trim()
        ? clientRow.full_name.trim()
        : null;
  }

  const { data: documentRow, error: documentError } = await supabaseAdmin
    .from("project_documents")
    .select("signed_name, client_signature_path")
    .eq("project_id", projectId)
    .eq("document_type", "quotation")
    .neq("document_status", "void")
    .maybeSingle();

  if (documentError) {
    console.error("Failed to load client quotation signature:", documentError);
    return {
      signatureDataUrl: null as string | null,
      signedName: clientName,
    };
  }

  const signedName =
    typeof documentRow?.signed_name === "string" && documentRow.signed_name.trim()
      ? documentRow.signed_name.trim()
      : clientName;

  const signaturePath = documentRow?.client_signature_path;

  if (!signaturePath) {
    return {
      signatureDataUrl: null,
      signedName,
    };
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("signatures")
    .download(signaturePath);

  if (downloadError || !fileData) {
    console.error(
      "Failed to download client quotation signature:",
      downloadError,
    );

    return {
      signatureDataUrl: null,
      signedName,
    };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return {
    signatureDataUrl: `data:${fileData.type || "image/png"};base64,${base64}`,
    signedName,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const markupRate = url.searchParams.get("markupRate")?.trim() || "30";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const origin = url.origin;

    const estimationResponse = await fetch(
      `${origin}/api/planning/getProjectCostEstimation?projectId=${encodeURIComponent(
        projectId,
      )}&markupRate=${encodeURIComponent(markupRate)}`,
      { cache: "no-store" },
    );

    const data = (await estimationResponse.json()) as CostEstimationResponse;

    if (!estimationResponse.ok) {
      return NextResponse.json(
        {
          error: data?.error || "Failed to load quotation data.",
          details: data?.details || null,
        },
        { status: 500 },
      );
    }

    const project = data.project;
    const client = data.client;
    const mainTasks = Array.isArray(data.mainTasks) ? data.mainTasks : [];
    const summary = data.summary;

    const adminSignatureInfo = await getAdminSignatureInfo(projectId);
    const clientQuotationSignatureInfo =
      await getClientQuotationSignatureInfo(projectId);

    const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Quotation ${escapeHtml(project.project_code || "")}</title>
    <style>
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        background: #f5f7f6;
        color: #1f2937;
        font-family: Arial, Helvetica, sans-serif;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: white;
        padding: 18mm 16mm;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 16px;
        border-bottom: 2px solid #111827;
      }
      .brand-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 0.02em;
        color: #111827;
      }
      .brand-sub {
        margin-top: 4px;
        font-size: 12px;
        color: #6b7280;
      }
      .doc-title {
        text-align: right;
      }
      .doc-title h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        color: #111827;
      }
      .doc-meta {
        margin-top: 6px;
        font-size: 12px;
        color: #6b7280;
        line-height: 1.5;
      }
      .section {
        margin-top: 18px;
      }
      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px 14px;
      }
      .label {
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
      }
      .value {
        margin-top: 5px;
        font-size: 13px;
        color: #111827;
        font-weight: 600;
        line-height: 1.5;
      }
      .heading {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
      }
      .scope-list {
        margin: 0;
        padding-left: 18px;
      }
      .scope-list li {
        font-size: 12px;
        margin: 4px 0;
        line-height: 1.5;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 9px 6px;
        font-size: 12px;
        vertical-align: top;
      }
      th {
        text-align: left;
        color: #6b7280;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .text-right {
        text-align: right;
      }
      .summary-box {
        margin-left: auto;
        width: 340px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        font-size: 12px;
        border-bottom: 1px solid #e5e7eb;
      }
      .summary-row.total {
        font-size: 14px;
        font-weight: 800;
        color: #111827;
        border-top: 2px solid #111827;
        border-bottom: none;
        margin-top: 8px;
        padding-top: 10px;
      }
      .muted {
        color: #6b7280;
      }
      .terms {
        font-size: 12px;
        color: #374151;
        line-height: 1.6;
      }
      .signature {
        margin-top: 28px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 28px;
      }
      .sig-box {
        min-height: 86px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .sig-image-wrap {
        height: 48px;
        display: flex;
        align-items: flex-end;
        justify-content: flex-start;
        margin-bottom: 6px;
      }
      .sig-image {
        max-height: 48px;
        max-width: 180px;
        object-fit: contain;
      }
      .sig-line {
        border-top: 1px solid #111827;
        padding-top: 6px;
        font-size: 12px;
        color: #6b7280;
      }
      .sig-name {
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        color: #111827;
      }
      @page {
        size: A4;
        margin: 12mm;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="topbar">
        <div>
          <div class="brand-title">PaintPro</div>
          <div class="brand-sub">Field Service Management and Business Intelligence Suite</div>
        </div>

        <div class="doc-title">
          <h1>Quotation</h1>
          <div class="doc-meta">
            Quote No: ${escapeHtml(project.project_code || "N/A")}<br />
            Date: ${escapeHtml(todayString())}
          </div>
        </div>
      </div>

      <div class="section grid-2">
        <div class="card">
          <div class="label">Prepared For</div>
          <div class="value">
            ${escapeHtml(client?.full_name || "Client")}<br />
            ${escapeHtml(client?.address || project.site_address || "No address")}<br />
            ${escapeHtml(client?.email || "")}
            ${client?.email && client?.phone ? "<br />" : ""}
            ${escapeHtml(client?.phone || "")}
          </div>
        </div>

        <div class="card">
          <div class="label">Project Details</div>
          <div class="value">
            ${escapeHtml(project.title || "Untitled Project")}<br />
            ${escapeHtml(project.site_address || "No site address")}<br />
            ${escapeHtml(project.description || "No project description")}
          </div>
        </div>
      </div>

      <div class="section card">
        <div class="heading">Scope of Work</div>
        <ul class="scope-list">
          ${mainTasks
            .map(
              (task) => `
                <li>
                  <strong>${escapeHtml(task.title)}</strong>
                  ${task.subtasks.length > 0
                    ? ` - ${escapeHtml(task.subtasks.map((sub) => sub.title).join(", "))}`
                    : ""}
                </li>
              `,
            )
            .join("")}
        </ul>
      </div>

      <div class="section card">
        <div class="heading">Cost Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Main Task</th>
              <th class="text-right">Base Price</th>
              <th class="text-right">Materials</th>
              <th class="text-right">Labor</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${mainTasks
              .map(
                (task) => `
                  <tr>
                    <td>${escapeHtml(task.title)}</td>
                    <td class="text-right">${escapeHtml(formatCurrency(task.basePrice))}</td>
                    <td class="text-right">${escapeHtml(formatCurrency(task.materialTotal))}</td>
                    <td class="text-right">${escapeHtml(formatCurrency(task.laborTotal))}</td>
                    <td class="text-right">${escapeHtml(formatCurrency(task.totalCost))}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="summary-box">
          <div class="summary-row">
            <span>Main Task Base Total</span>
            <span>${escapeHtml(formatCurrency(summary.basePriceTotal))}</span>
          </div>
          <div class="summary-row">
            <span>Materials Total</span>
            <span>${escapeHtml(formatCurrency(summary.materialTotal))}</span>
          </div>
          <div class="summary-row">
            <span>Labor Total</span>
            <span>${escapeHtml(formatCurrency(summary.laborTotal))}</span>
          </div>
          <div class="summary-row">
            <span>Cost Total</span>
            <span>${escapeHtml(formatCurrency(summary.totalCost))}</span>
          </div>
          <div class="summary-row">
            <span>Markup / Profit</span>
            <span>${escapeHtml(formatCurrency(summary.profitAmount))}</span>
          </div>
          <div class="summary-row total">
            <span>Total Quotation</span>
            <span>${escapeHtml(formatCurrency(summary.quotationTotal))}</span>
          </div>
        </div>
      </div>

      <div class="section card">
        <div class="heading">Terms and Conditions</div>
        <div class="terms">
          1. This quotation is based on the current project scope and estimated quantities.<br />
          2. Any variation in scope, materials, or labor requirements may affect the final price.<br />
          3. Payment terms and work schedule are subject to final approval.<br />
          4. This quotation is for review and confirmation before project execution.
        </div>
      </div>

      <div class="signature">
        <div class="sig-box">
          <div class="sig-image-wrap">
            ${
              adminSignatureInfo.signatureDataUrl
                ? `<img src="${adminSignatureInfo.signatureDataUrl}" alt="Prepared by signature" class="sig-image" />`
                : ""
            }
          </div>
          <div class="sig-line">Prepared By</div>
          ${
            adminSignatureInfo.username
              ? `<div class="sig-name">${escapeHtml(adminSignatureInfo.username)}</div>`
              : ""
          }
        </div>
        <div class="sig-box">
          <div class="sig-image-wrap">
            ${
              clientQuotationSignatureInfo.signatureDataUrl
                ? `<img src="${clientQuotationSignatureInfo.signatureDataUrl}" alt="Client signature" class="sig-image" />`
                : ""
            }
          </div>
          <div class="sig-line">Approved By / Client Signature</div>
          ${
            clientQuotationSignatureInfo.signedName
              ? `<div class="sig-name">${escapeHtml(clientQuotationSignatureInfo.signedName)}</div>`
              : ""
          }
        </div>
      </div>
    </div>
  </body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
