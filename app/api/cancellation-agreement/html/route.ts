import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/cancellation-agreement/html?projectId=...
//
// Server-rendered HTML for both the admin preview iframe and the PDF
// generator. Layout, typography, and the signature-block markup mirror
// /api/invoice/html so the cancellation agreement displays through the
// same iframe pipeline as the invoice — A4 page container, PaintPro
// topbar, two-column billing/project cards, settlement summary box, and
// inline base64 signature data URLs (no remote image fetches at PDF-
// render time, so Playwright doesn't need network-idle to wait on them).

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Generated documents render amounts in AUD to match the rest of
// the app. Locale is en-AU so the currency symbol/formatting follows
// Australian conventions on both the in-browser preview and the
// generated PDF.
function formatCurrency(value: number | null | undefined) {
  const safe = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safe);
}

function todayString() {
  return new Date().toLocaleDateString("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "—";
  return String(status)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Mirrors /api/invoice/html#getAdminSignatureInfo. Pulls the project's
// `created_by` user, downloads their saved signature from the signatures
// bucket, and returns it as an inline data URL plus their username so
// the agreement can pre-sign on PaintPro's behalf.
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
    return { signatureDataUrl: null, username };
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("project-signatures")
    .download(signaturePath);

  if (downloadError || !fileData) {
    console.error("Failed to download admin signature:", downloadError);
    return { signatureDataUrl: null, username };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    signatureDataUrl: `data:${fileData.type || "image/png"};base64,${base64}`,
    username,
  };
}

// Mirrors /api/invoice/html#getClientInvoiceSignatureInfo but for the
// cancellation_agreement document type. Returns the client's signature as
// an inline data URL (downloaded server-side) so the iframe and the
// PDF render path don't need network-idle to embed the image.
async function getClientCancellationAgreementSignatureInfo(projectId: string) {
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
    .select("signed_name, signed_at, client_signature_path")
    .eq("project_id", projectId)
    .eq("document_type", "cancellation_agreement")
    .neq("document_status", "void")
    .maybeSingle();

  if (documentError) {
    console.error(
      "Failed to load client cancellation agreement signature:",
      documentError,
    );
    return {
      signatureDataUrl: null as string | null,
      signedName: clientName,
      signedAt: null as string | null,
    };
  }

  const signedName =
    typeof documentRow?.signed_name === "string" && documentRow.signed_name.trim()
      ? documentRow.signed_name.trim()
      : clientName;
  const signedAt = documentRow?.signed_at ?? null;

  const signaturePath = documentRow?.client_signature_path;
  if (!signaturePath) {
    return { signatureDataUrl: null, signedName, signedAt };
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("project-signatures")
    .download(signaturePath);

  if (downloadError || !fileData) {
    console.error(
      "Failed to download client cancellation agreement signature:",
      downloadError,
    );
    return { signatureDataUrl: null, signedName, signedAt };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    signatureDataUrl: `data:${fileData.type || "image/png"};base64,${base64}`,
    signedName,
    signedAt,
  };
}

/**
 * Render-only helper. Used by:
 *   1. The GET handler below (iframe preview — no client signature yet).
 *   2. The cancellation-agreement signature endpoint, which calls this
 *      directly with the freshly-drawn client signature passed in as
 *      `clientSignatureDataUrl`. Inlining the signature here is what
 *      keeps the raw PNG out of the `signatures` bucket — it never gets
 *      written to disk, it just rides along in this single render.
 *
 * Throws on any DB / lookup error so the caller can decide whether to
 * surface a 500 response or fail the signature flow.
 */
export async function renderCancellationAgreementHtml(args: {
  projectId: string;
  /** Inline client signature data URL — bypasses storage lookup. */
  clientSignatureDataUrl?: string;
  /** Override the rendered client name (e.g. the signature endpoint
   *  has the canonical client full_name already). */
  clientSignedName?: string;
  /** ISO timestamp shown beneath the client signature line. */
  clientSignedAt?: string;
}): Promise<string> {
  const {
    projectId,
    clientSignatureDataUrl,
    clientSignedName,
    clientSignedAt,
  } = args;

  if (!projectId) {
    throw new Error("Missing projectId.");
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select(
      `
      project_id,
      project_code,
      title,
      description,
      site_address,
      cancelled_at,
      cancelled_from_status,
      cancellation_earned_cost,
      cancellation_earned_revenue,
      cancellation_balance,
      downpayment,
      client_id
    `,
    )
    .eq("project_id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  if (!project) {
    throw new Error("Project not found.");
  }

  let clientName = "Client";
  let clientEmail = "";
  let clientPhone = "";
  let clientAddress = "";
  if (project.client_id) {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("full_name, email, phone, address")
      .eq("client_id", project.client_id)
      .maybeSingle();
    if (client) {
      clientName = client.full_name || clientName;
      clientEmail = client.email || "";
      clientPhone = client.phone || "";
      clientAddress = client.address || "";
    }
  }

  const adminSignatureInfo = await getAdminSignatureInfo(projectId);
  // If the caller (signature endpoint) already has the client's
  // freshly-drawn signature in memory, prefer that over going to storage
  // — that's the whole point of this refactor. Otherwise fall back to
  // the legacy storage lookup, which will harmlessly return nulls now
  // that we no longer save client signatures.
  const clientSignatureInfo = clientSignatureDataUrl
    ? {
        signatureDataUrl: clientSignatureDataUrl,
        signedName: clientSignedName ?? clientName,
        signedAt: clientSignedAt ?? null,
      }
    : await getClientCancellationAgreementSignatureInfo(projectId);

    const earnedRevenue = Number(project.cancellation_earned_revenue ?? 0);
    const earnedCost = Number(project.cancellation_earned_cost ?? 0);
    const downpaymentValue = Math.max(0, Number(project.downpayment ?? 0));
    const balance = Number(project.cancellation_balance ?? 0);
    const balanceLabel =
      balance > 0
        ? "Refund Payable to Client"
        : balance < 0
          ? "Outstanding Balance Owed by Client"
          : "Settled — No Further Payment";

    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Cancellation Agreement ${escapeHtml(project.project_code || "")}</title>
          <style>
            /* Monochrome by request — every foreground is plain black,
               every divider is black. The visual hierarchy comes from
               font weight / size, not color, so the printed PDF reads
               cleanly on a B&W printer too. */
            * { box-sizing: border-box; }
            html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body {
              margin: 0;
              background: #ffffff;
              color: #000000;
              font-family: Arial, Helvetica, sans-serif;
            }
            .page {
              width: 100%;
              max-width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              padding: clamp(14px, 4vw, 18mm) clamp(12px, 4vw, 16mm);
            }
            .topbar {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              padding-bottom: 16px;
              border-bottom: 2px solid #000;
              flex-wrap: wrap;
            }
            .brand-title {
              font-size: clamp(22px, 5vw, 28px);
              font-weight: 800;
              letter-spacing: 0.02em;
              color: #000;
            }
            .brand-sub {
              margin-top: 4px;
              font-size: 12px;
              color: #000;
            }
            .doc-title {
              text-align: right;
            }
            .doc-title h1 {
              margin: 0;
              font-size: clamp(20px, 5vw, 26px);
              font-weight: 800;
              color: #000;
            }
            .doc-meta {
              margin-top: 6px;
              font-size: 12px;
              color: #000;
              line-height: 1.5;
            }
            .section { margin-top: 18px; }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px;
            }
            .card {
              border: 1px solid #000;
              border-radius: 10px;
              padding: 12px 14px;
            }
            .label {
              font-size: 11px;
              color: #000;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              font-weight: 700;
            }
            .value {
              margin-top: 5px;
              font-size: 13px;
              color: #000;
              font-weight: 600;
              line-height: 1.5;
            }
            .heading {
              margin: 0 0 10px;
              font-size: 14px;
              font-weight: 700;
              color: #000;
            }
            .summary-box {
              margin-left: auto;
              width: 100%;
              max-width: 340px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              padding: 7px 0;
              font-size: 12px;
              color: #000;
              border-bottom: 1px solid #000;
            }
            .summary-row.total {
              font-size: 14px;
              font-weight: 800;
              color: #000;
              border-top: 2px solid #000;
              border-bottom: none;
              margin-top: 8px;
              padding-top: 10px;
            }
            /* No more red/green emphasis on refund vs bill — keeps it
               monochrome. The label ("Refund payable" / "Outstanding
               balance") already conveys direction in plain English. */
            .terms {
              font-size: 12px;
              color: #000;
              line-height: 1.6;
            }

            /* Both signature columns mirror each other exactly. Equal
               grid rows pin the divider line, label, and name to the
               same y position regardless of whether either side has a
               signature image yet — so the right column never floats
               higher than the left when only one party has signed. */
            .signature {
              margin-top: 28px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 56px auto auto;
              column-gap: 28px;
              row-gap: 0;
              align-items: end;
            }
            .sig-image-wrap {
              grid-row: 1;
              height: 56px;
              overflow: hidden;
              display: flex;
              align-items: flex-end;
              justify-content: flex-start;
            }
            .sig-image-wrap.left { grid-column: 1; }
            .sig-image-wrap.right { grid-column: 2; }
            .sig-image {
              display: block;
              max-height: 56px;
              max-width: 180px;
              width: auto;
              height: auto;
              object-fit: contain;
            }
            .sig-line {
              grid-row: 2;
              border-top: 1px solid #000;
              padding-top: 6px;
              font-size: 12px;
              color: #000;
            }
            .sig-line.left { grid-column: 1; }
            .sig-line.right { grid-column: 2; }
            .sig-name {
              grid-row: 3;
              margin-top: 4px;
              font-size: 12px;
              font-weight: 700;
              color: #000;
              min-height: 16px;
            }
            .sig-name.left { grid-column: 1; }
            .sig-name.right { grid-column: 2; }
            @page {
              size: A4;
              margin: 12mm;
            }
            @media (max-width: 640px) {
              .grid-2 {
                grid-template-columns: 1fr;
                gap: 12px;
              }
              .signature {
                grid-template-columns: 1fr;
                grid-template-rows: 56px auto auto 56px auto auto;
              }
              .sig-image-wrap.left { grid-column: 1; grid-row: 1; }
              .sig-line.left { grid-column: 1; grid-row: 2; }
              .sig-name.left { grid-column: 1; grid-row: 3; }
              .sig-image-wrap.right { grid-column: 1; grid-row: 4; }
              .sig-line.right { grid-column: 1; grid-row: 5; }
              .sig-name.right { grid-column: 1; grid-row: 6; }
              .topbar { gap: 12px; }
              .doc-title { text-align: left; }
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
                <h1>Cancellation Agreement</h1>
                <div class="doc-meta">
                  Agreement No: ${escapeHtml(project.project_code || "N/A")}<br />
                  Date: ${escapeHtml(formatDateOnly(project.cancelled_at) !== "—" ? formatDateOnly(project.cancelled_at) : todayString())}
                </div>
              </div>
            </div>

            <div class="section grid-2">
              <div class="card">
                <div class="label">Prepared For</div>
                <div class="value">
                  ${escapeHtml(clientName)}<br />
                  ${escapeHtml(clientAddress || project.site_address || "No address")}<br />
                  ${escapeHtml(clientEmail)}
                  ${clientEmail && clientPhone ? "<br />" : ""}
                  ${escapeHtml(clientPhone)}
                </div>
              </div>

              <div class="card">
                <div class="label">Project Details</div>
                <div class="value">
                  ${escapeHtml(project.title || "Untitled Project")}<br />
                  ${escapeHtml(project.site_address || "No site address")}<br />
                  Cancelled From: ${escapeHtml(formatStatus(project.cancelled_from_status))}
                </div>
              </div>
            </div>

            <div class="section card">
              <div class="heading">Reason for Cancellation</div>
              <div class="terms">
                ${escapeHtml(project.description || "No additional cancellation reason was recorded for this project.")}
              </div>
            </div>

            <div class="section">
              <div class="summary-box">
                <div class="summary-row">
                  <span>Earned Revenue (Work Completed)</span>
                  <span>${escapeHtml(formatCurrency(earnedRevenue))}</span>
                </div>

                <div class="summary-row">
                  <span>Earned Cost (Materials &amp; Labour)</span>
                  <span>${escapeHtml(formatCurrency(earnedCost))}</span>
                </div>

                <div class="summary-row">
                  <span>Downpayment Collected</span>
                  <span>${escapeHtml(formatCurrency(downpaymentValue))}</span>
                </div>

                <div class="summary-row total">
                  <span>${escapeHtml(balanceLabel)}</span>
                  <span class="amount">${escapeHtml(formatCurrency(Math.abs(balance)))}</span>
                </div>
              </div>
            </div>

            <div class="section card">
              <div class="heading">Mutual Release</div>
              <div class="terms">
                1. Both parties acknowledge that the project identified above is being cancelled effective on the date shown.<br />
                2. Upon settlement of the balance stated in this agreement, neither party shall have any further claim against the other with respect to the cancelled project.<br />
                3. All signed documents and audit records remain on file for both parties' reference.<br />
                4. This agreement supersedes any prior verbal understanding regarding the cancellation of this project.
              </div>
            </div>

            <div class="signature">
              <div class="sig-image-wrap left">
                ${
                  adminSignatureInfo.signatureDataUrl
                    ? `<img src="${adminSignatureInfo.signatureDataUrl}" alt="Project manager signature" class="sig-image" />`
                    : ""
                }
              </div>
              <div class="sig-image-wrap right">
                ${
                  clientSignatureInfo.signatureDataUrl
                    ? `<img src="${clientSignatureInfo.signatureDataUrl}" alt="Client signature" class="sig-image" />`
                    : ""
                }
              </div>

              <div class="sig-line left">For PaintPro</div>
              <div class="sig-line right">For Client</div>

              <div class="sig-name left">${escapeHtml(
                adminSignatureInfo.username ?? "PaintPro Project Manager",
              )}</div>
              <div class="sig-name right">${escapeHtml(
                clientSignatureInfo.signedName ?? clientName,
              )}</div>
            </div>
          </div>
        </body>
      </html>
    `;

  return html;
}

// Thin wrapper around the render function — serves the iframe preview
// (admin generation page + client pending page pre-sign). The signature
// endpoint bypasses this and calls renderCancellationAgreementHtml
// directly so the client signature can ride along in-memory.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const html = await renderCancellationAgreementHtml({ projectId });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    const status = message === "Project not found." ? 404 : 500;
    return NextResponse.json(
      {
        error: "Failed to render cancellation agreement HTML.",
        details: message,
      },
      { status },
    );
  }
}
