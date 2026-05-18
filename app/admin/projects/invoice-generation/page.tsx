"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import CancelProjectModal from "@/components/project-cancellation/CancelProjectModal";

type StatusType = "Not yet Issued" | "Issued";

// "Issued" = the invoice has left admin's hands. From the moment the
// project moves to invoice_agreement_pending (sent to client), through
// signing and payment, the badge stays Issued. The badge is read-only —
// transitions are driven by the in-page action buttons (Send to Client,
// Proceed to Payment, etc.), not by clicking the badge.
const ISSUED_PROJECT_STATUSES: ReadonlySet<string> = new Set([
  "invoice_agreement_pending",
  "invoice_signed",
  "payment_pending",
  "payment_complete",
  "review_pending",
  "completed",
]);

function deriveInvoiceStatus(projectStatus: string | null | undefined): StatusType {
  return ISSUED_PROJECT_STATUSES.has(projectStatus ?? "") ? "Issued" : "Not yet Issued";
}

type ProjectOverviewResponse = {
  project: {
    project_id: string;
    project_code: string | null;
    title: string | null;
    description: string | null;
    site_address: string | null;
    status: string | null;
    estimated_budget: number | null;
    estimated_cost: number | null;
    estimated_profit: number | null;
    downpayment: number | null;
  };
};

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export default function JobInvoice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [status, setStatus] = useState<StatusType>("Not yet Issued");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [proceedingToPayment, setProceedingToPayment] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [codeCopied, setCodeCopied] = useState(false);
  // Separate spinner state for the in-card refresh button so it doesn't
  // re-trigger the full-page loading skeleton.
  const [refreshing, setRefreshing] = useState(false);
  // Tracks whether the iframe has finished loading the invoice HTML.
  // The iframe streams the render in — without this we'd see a flash
  // of empty white frame while the server is still building the HTML.
  // Flips false when `previewSrc` changes (new project, force refresh)
  // and true on the iframe's onLoad.
  const [previewReady, setPreviewReady] = useState(false);
  // `null` while we're still checking; `true` if a signed PDF exists
  // in the bucket (use from-bucket so the client signature is
  // preserved); `false` if we should fall back to live HTML render.
  const [savedPdfAvailable, setSavedPdfAvailable] = useState<boolean | null>(
    null,
  );
  // Bumped on refresh to bust the iframe / PDF viewer cache so a
  // newly-signed invoice replaces the stale unsigned (or previously
  // signed) view. The URL is otherwise identical so the browser
  // would happily serve the old response.
  const [previewVersion, setPreviewVersion] = useState(0);

  async function handleCopyProjectCode() {
    const code = project?.project_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy project code.");
    }
  }

  const statusStyles = useMemo(() => {
    if (status === "Issued") {
      return { bg: "#E6F9DD", border: "#BDE7AF", text: "#4FAE2A" };
    }

    return { bg: "#FAD6D6", border: "#F3A7A7", text: "#D33A3A" };
  }, [status]);

  async function updateProjectStatus(nextStatus: string) {
    const response = await fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        status: nextStatus,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        [data?.error, data?.details].filter(Boolean).join(": ") ||
          "Failed to update project status.",
      );
    }
  }

  // Probes /api/invoice/from-bucket to decide whether the iframe
  // should stream the saved PDF (post-sign) or fall back to a live
  // HTML render (pre-sign). Returns the resolved availability so the
  // refresh handler can wait on it before bumping the cache-buster.
  const probeSavedPdf = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    try {
      const res = await fetch(
        `/api/invoice/from-bucket?projectId=${encodeURIComponent(projectId)}`,
        { method: "HEAD", cache: "no-store" },
      );
      return res.ok;
    } catch {
      return false;
    }
  }, [projectId]);

  // Loader is hoisted out of the effect so the in-card refresh button
  // can re-fetch on demand without re-triggering the full-page
  // skeleton. Pass mode="refresh" to reload silently (only the
  // refresh button's spinner). Refresh also re-probes the bucket and
  // bumps `previewVersion` so the iframe / PDF viewer drops its
  // cached copy and pulls the freshly-signed invoice.
  const loadProject = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        if (mode === "refresh") setRefreshing(true);
        else setLoading(true);

        const [overviewResponse, pdfAvailable] = await Promise.all([
          fetch(
            `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
          ),
          mode === "refresh" ? probeSavedPdf() : Promise.resolve<
            boolean | null
          >(null),
        ]);

        const data = (await overviewResponse.json()) as ProjectOverviewResponse & {
          error?: string;
          details?: string;
        };

        if (!overviewResponse.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load invoice project data.",
          );
        }

        setProject(data.project);

        setStatus(deriveInvoiceStatus(data.project?.status));

        if (mode === "refresh") {
          // Apply the freshly-probed availability and bump the
          // version so the iframe url changes even when the path
          // stays the same.
          setSavedPdfAvailable(Boolean(pdfAvailable));
          setPreviewVersion((v) => v + 1);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load invoice project data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, probeSavedPdf],
  );

  useEffect(() => {
    void loadProject("initial");
  }, [loadProject]);

  async function handleDownloadPdf() {
    if (!projectId) return;

    try {
      setDownloading(true);

      const response = await fetch(
        `/api/invoice/pdf?projectId=${encodeURIComponent(projectId)}&download=1`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to download invoice PDF.",
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `invoice-${projectId}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error("Failed to download invoice PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleProceedToPayment() {
    if (!projectId || proceedingToPayment) return;
    if (project?.status !== "invoice_signed") return;

    try {
      setProceedingToPayment(true);

      await updateProjectStatus("payment_pending");

      setProject((prev) =>
        prev ? { ...prev, status: "payment_pending" } : prev,
      );
      setStatus("Issued");

      // Land on the dashboard with this project pre-selected and the
      // FinalPaymentModal popped open — same UX the old "Go to
      // Payment" button used. ?projectId snaps the workday picker
      // and selection; ?openPayment tells the JobProgressCard to
      // surface the modal once the status matches. The handler in
      // jobProgressCard strips both params after firing so a refresh
      // doesn't re-pop the modal.
      const id = encodeURIComponent(projectId);
      router.push(`/admin?projectId=${id}&openPayment=${id}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to proceed to payment.");
      setProceedingToPayment(false);
    }
  }

  async function handleSendToClient() {
    if (!projectId || sendingToClient) return;

    try {
      setSendingToClient(true);

      const response = await fetch("/api/planning/sendToClient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to send invoice to client.",
        );
      }

      setProject((prev) =>
        prev ? { ...prev, status: "invoice_agreement_pending" } : prev,
      );
      setStatus("Issued");

      toast.success("Invoice sent to client.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to send invoice to client.");
    } finally {
      setSendingToClient(false);
    }
  }

  // Probe the bucket on mount / project change. If a signed invoice
  // PDF exists, we'll stream that (preserves the client signature
  // baked into the PDF). Otherwise we render fresh HTML via
  // /api/invoice/html — used pre-signing and as a safety fallback.
  useEffect(() => {
    if (!projectId) {
      setSavedPdfAvailable(false);
      return;
    }
    let cancelled = false;
    setSavedPdfAvailable(null);
    (async () => {
      const ok = await probeSavedPdf();
      if (!cancelled) setSavedPdfAvailable(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, probeSavedPdf]);

  // Cache-buster query param. Stays on the URL even before the first
  // refresh so the iframe key path is stable, and `previewVersion`
  // changing forces a fresh fetch from the PDF viewer / browser.
  const previewSrc = projectId
    ? savedPdfAvailable
      ? `/api/invoice/from-bucket?projectId=${encodeURIComponent(projectId)}&v=${previewVersion}#navpanes=0&zoom=95&toolbar=1`
      : savedPdfAvailable === false
        ? `/api/invoice/html?projectId=${encodeURIComponent(projectId)}&v=${previewVersion}`
        : ""
    : "";

  // Reset the iframe's ready state every time the src changes — same
  // iframe element gets reused so we can't rely on onLoad alone.
  useEffect(() => {
    setPreviewReady(false);
  }, [previewSrc]);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold text-slate-900 dark:text-slate-100">
            <span>Project</span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-500"
              aria-hidden
            />
            <span>Invoice</span>
          </div>

          {/* Status badge. Stays in a neutral "Loading..." state while
              the project overview fetch is in flight so the user
              never sees a flash of "Not yet Issued" on an already-
              issued invoice. */}
          {loading ? (
            <span
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              aria-label="Invoice status loading"
              aria-busy="true"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            <span
              className="inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold"
              style={{
                backgroundColor: statusStyles.bg,
                borderColor: statusStyles.border,
                color: statusStyles.text,
              }}
              aria-label="Invoice status"
            >
              {status}
            </span>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
          <div className="col-span-12 min-h-0 overflow-hidden lg:col-span-8">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="h-full min-h-0 overflow-hidden p-3">
                {loading ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
                      <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                        Loading invoice preview...
                      </div>
                    </div>
                  </div>
                ) : !projectId ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
                    Missing project ID.
                  </div>
                ) : (
                  <div className="relative h-full w-full overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                    {/* Overlay spinner while the iframe streams the
                        HTML in. Fades out the moment the iframe fires
                        onLoad. Sits absolutely over the frame so we
                        don't shift layout between loading and loaded
                        states. */}
                    {!previewReady ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-[1px] dark:bg-slate-950/85">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#00c065]" />
                          <div className="mt-2 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                            Generating invoice preview...
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Rendering line items, totals, and signature block.
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <iframe
                      src={previewSrc}
                      title="Invoice Preview"
                      scrolling="yes"
                      onLoad={() => setPreviewReady(true)}
                      className="invoice-preview-frame block h-full w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-4">
            {/* Project Details — sits at the top of the right column so its
                top edge aligns with the invoice preview's top edge on the
                left. The project code is one-click copyable. */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Project Details
              </div>

              <div className="mt-4 space-y-3 text-[12px] text-slate-600 dark:text-slate-300">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Project Title
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {project?.title || (loading ? "Loading…" : "Untitled Project")}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Project Code
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyProjectCode}
                    disabled={!project?.project_code}
                    title={
                      project?.project_code
                        ? "Copy project code"
                        : "No project code yet"
                    }
                    className="mt-1 inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 font-mono text-[12px] font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <span className="truncate">
                      {project?.project_code || "No code"}
                    </span>
                    {codeCopied ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="Copied"
                      />
                    ) : (
                      <Copy
                        className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400"
                        aria-label="Copy project code"
                      />
                    )}
                  </button>
                  {codeCopied ? (
                    <div className="mt-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Copied to clipboard
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  Invoice Details
                </div>
                <button
                  type="button"
                  onClick={() => loadProject("refresh")}
                  disabled={refreshing || loading}
                  title="Refresh invoice details"
                  aria-label="Refresh invoice details"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  <RefreshCw
                    className={[
                      "h-3.5 w-3.5",
                      refreshing || loading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-[12px] text-slate-600 dark:text-slate-300">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Initial Cost
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.estimated_budget)}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Downpayment
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.downpayment)}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">
                    Total Cost
                  </div>
                  <div className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(
                      Math.max(
                        0,
                        Number(project?.estimated_budget ?? 0) -
                          Number(project?.downpayment ?? 0),
                      ),
                    )}
                  </div>
                </div>
              </div>

              {/* mt-auto pushes the action buttons to the bottom of the
                  card. Combined with `flex-1` on the card itself, the
                  card stretches to fill the remaining vertical space in
                  the right column — so its bottom edge lines up with
                  the bottom of the invoice preview on the left. */}
              <div className="mt-auto pt-5">
                {/* "Go to file" replaces the old Download PDF button —
                    sends the admin to /admin/documents with deep-link
                    params so the matching invoice opens in place.
                    Visible whenever the project has reached
                    invoice_signed or beyond, since at that point the
                    PDF exists in the documents bucket. */}
                {project?.status === "invoice_signed" ||
                project?.status === "payment_pending" ||
                project?.status === "employee_management_pending" ||
                project?.status === "conclude_job_pending" ||
                project?.status === "completed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const code = project?.project_code?.trim() ?? "";
                      const params = new URLSearchParams({ openType: "INV" });
                      if (code) params.set("projectCode", code);
                      router.push(`/admin/documents?${params.toString()}`);
                    }}
                    disabled={!projectId}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/35 dark:bg-slate-900/40 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
                    <ExternalLink className="h-4 w-4" />
                    Go to file
                  </button>
                ) : null}

                {/* Proceed to Payment shows only on invoice_signed —
                    the client has signed and the admin still has to
                    flip the project into payment_pending. */}
                {project?.status === "invoice_signed" ? (
                  <button
                    type="button"
                    onClick={handleProceedToPayment}
                    disabled={proceedingToPayment || !projectId}
                    className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-[13px] font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/25">
                    {proceedingToPayment ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Proceeding...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Proceed to Payment
                      </>
                    )}
                  </button>
                ) : null}

                {/* Send to Client only renders during invoice_pending —
                    the prep stage before the invoice has been sent.
                    Once it advances (invoice_agreement_pending and
                    beyond), this button disappears entirely. */}
                {project?.status === "invoice_pending" ? (
                <button
                  type="button"
                  onClick={handleSendToClient}
                  disabled={sendingToClient || !projectId}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/25">
                  {sendingToClient ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send to Client
                    </>
                  )}
                </button>
                ) : null}

                {/* Awaiting-signature acknowledgment. Shown after Send
                    to Client has flipped the project to
                    invoice_agreement_pending and we're holding until
                    the client signs. Mirrors the banner on
                    /quotation-generation so the admin sees the same
                    "we're parked waiting on the client" treatment for
                    both document flows. */}
                {project?.status === "invoice_agreement_pending" ? (
                  <div className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check className="h-4 w-4" />
                    Awaiting client signature
                  </div>
                ) : null}

                {/* Fallback for statuses outside the invoice flow (e.g.
                    landed here from a stale link while the project is
                    still in an earlier stage, or after employee_management
                    /completed). None of the action buttons above apply,
                    so we surface a single way out: back to the dashboard. */}
                {project?.status &&
                project.status !== "invoice_pending" &&
                project.status !== "invoice_agreement_pending" &&
                project.status !== "invoice_signed" &&
                project.status !== "payment_pending" ? (
                  <button
                    type="button"
                    onClick={() => router.push("/admin")}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm active:translate-y-0 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                    <ArrowLeft className="h-4 w-4" />
                    Go Back to Dashboard
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {/* Cancel is only meaningful while there's still active work
              to walk away from. Once the project advances to review or
              beyond (all subtasks done, admin in wrap-up), cancellation
              is hidden — the project is already past the point where
              halting the work makes sense. Plus completed/cancelled
              never show cancel either. */}
          {project?.status === "downpayment_pending" ||
          project?.status === "ready_to_start" ||
          project?.status === "in_progress" ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 text-[13px] font-medium text-rose-600 transition duration-150 hover:bg-rose-50 active:scale-95 dark:border-rose-500/35 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/15">
              <X className="h-4 w-4" />
              Cancel Project
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              if (!projectId || isGoingBack) return;

              try {
                setIsGoingBack(true);

                router.push(`/admin/projects`);
              } catch (error: any) {
                toast.error(error?.message || "Failed to go back.");
                setIsGoingBack(false);
              }
            }}
            disabled={isGoingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            {isGoingBack ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>
        </div>
      </div>

      <CancelProjectModal
        open={cancelOpen}
        projectId={projectId}
        projectCode={project?.project_code ?? null}
        projectStatus={project?.status ?? null}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false);
          router.push("/admin/projects");
        }}
      />

      <style jsx global>{`
        .invoice-preview-frame {
          overflow-x: hidden;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
