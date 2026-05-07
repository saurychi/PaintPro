"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Check,
  Download,
  FileText,
  Loader2,
  PenLine,
  Send,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useClientProject } from "../../ClientShellClient";

type ProjectOverviewResponse = {
  project?: {
    project_id?: string | null;
    project_code?: string | null;
    title?: string | null;
    description?: string | null;
    site_address?: string | null;
    status?: string | null;
    estimated_budget?: number | null;
    estimated_cost?: number | null;
    estimated_profit?: number | null;
  };
  error?: string;
  details?: string;
};

type CostEstimationResponse = {
  summary?: {
    materialTotal?: number | null;
    laborTotal?: number | null;
    totalCost?: number | null;
    profitAmount?: number | null;
    quotationTotal?: number | null;
  };
  error?: string;
  details?: string;
};

type DocumentType = "quotation" | "invoice" | "none";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function readError(data: ProjectOverviewResponse | null, fallback: string) {
  return [data?.error, data?.details].filter(Boolean).join(": ") || fallback;
}

function getDocumentType(status: string): DocumentType {
  if (
    status === "quotation_pending" ||
    status === "grant_access_quotation" ||
    status === "client_quotation_done" ||
    status === "ready_to_start"
  ) {
    return "quotation";
  }

  if (status === "invoice_agreement_pending" || status === "payment_pending") {
    return "invoice";
  }

  return "none";
}

export default function ClientPendingDocumentsPage() {
  const searchParams = useSearchParams();
  const { projectId: sessionProjectId } = useClientProject();

  const signatureRef = useRef<SignatureCanvas | null>(null);
  const signatureWrapRef = useRef<HTMLDivElement | null>(null);

  const projectId = searchParams.get("projectId") || sessionProjectId || "";

  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [costSummary, setCostSummary] = useState<
    CostEstimationResponse["summary"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Tracks whether the bucket PDF has finished loading inside the iframe so
  // we can keep a spinner over it until the document is actually visible.
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const [signatureErr, setSignatureErr] = useState<string | null>(null);

  // Local-only flags for the "client signed; status not yet advanced" state.
  // The signature endpoint persists the signed PDF but intentionally leaves
  // projects.status alone, so we drive the post-sign UI from these refs.
  const [justSignedQuotation, setJustSignedQuotation] = useState(false);
  const [notifyingPM, setNotifyingPM] = useState(false);
  const [pmNotified, setPmNotified] = useState(false);

  const projectStatus = String(project?.status || "").trim();
  const documentType = getDocumentType(projectStatus);

  // Client can only sign once the manager has explicitly granted access
  // (grant_access_quotation). Before that (quotation_pending) the client
  // can preview the document but the signature controls are disabled.
  const isPendingQuotation = projectStatus === "grant_access_quotation";
  const isAwaitingAccess = projectStatus === "quotation_pending";
  const isPendingInvoiceAgreement = projectStatus === "invoice_agreement_pending";
  const isClientQuotationDone = projectStatus === "client_quotation_done";
  const isQuotationApproved = projectStatus === "ready_to_start";
  const isInvoiceAccepted = projectStatus === "payment_pending";

  const documentLabel =
    documentType === "invoice"
      ? "Invoice"
      : documentType === "quotation"
        ? "Quotation"
        : "Document";

  const pageTitle =
    isPendingQuotation || isPendingInvoiceAgreement || isAwaitingAccess
      ? `Pending ${documentLabel}`
      : documentType === "none"
        ? "Project Document"
        : `${documentLabel} Document`;

  const pageSubtitle = isPendingInvoiceAgreement
    ? "Review and sign your project invoice agreement."
    : isPendingQuotation
      ? "Review and sign your project quotation."
      : isAwaitingAccess
        ? "The project manager hasn't released this quotation for signing yet. You can preview it below."
        : isInvoiceAccepted
        ? "Your signed invoice agreement has been recorded."
        : isQuotationApproved
          ? "Your signed quotation has been recorded."
          : "Review your project document.";

  const previewSrc = useMemo(() => {
    if (!projectId || documentType === "none") return "";

    if (documentType === "invoice") {
      return `/api/invoice/html?projectId=${encodeURIComponent(projectId)}`;
    }

    // Quotation: stream the PDF straight from the bucket (pre-generated when
    // the admin clicked Generate Quotation on overview). The URL fragment
    // collapses the PDF viewer's sidebar (`navpanes=0`) and opens at 95%
    // zoom — same defaults the admin's quotation-generation page uses.
    return `/api/quotation/from-bucket?projectId=${encodeURIComponent(projectId)}#navpanes=0&zoom=95`;
  }, [projectId, documentType]);

  // Reset the iframe-loaded gate whenever the source changes, so the spinner
  // shows again while the next document is fetched.
  useEffect(() => {
    setPreviewLoaded(false);
  }, [previewSrc]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    async function loadProject() {
      try {
        setLoading(true);

        const [overviewRes, costRes] = await Promise.all([
          fetch(
            `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
              projectId,
            )}`,
          ),
          fetch(
            `/api/planning/getProjectCostEstimation?projectId=${encodeURIComponent(
              projectId,
            )}`,
          ),
        ]);

        const overviewData =
          (await overviewRes.json()) as ProjectOverviewResponse;

        if (!overviewRes.ok) {
          throw new Error(
            readError(overviewData, "Failed to load pending document."),
          );
        }

        setProject(overviewData.project ?? null);

        if (costRes.ok) {
          const costData = (await costRes.json()) as CostEstimationResponse;
          setCostSummary(costData.summary ?? null);
        } else {
          setCostSummary(null);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load pending document.";

        console.error(error);
        toast.error("Could not load document", {
          description: message,
        });
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  // react-signature-canvas defaults the canvas's intrinsic bitmap to 300x150
  // even when CSS stretches it to 100% width — so on a phone, touch points
  // map to the wrong pixels and ink lands offset from the user's finger
  // (which reads as "the signature isn't working"). Resize the canvas to its
  // wrapper's actual size, scaled by devicePixelRatio for crispness, and
  // re-run on viewport changes (rotation, address-bar collapse, keyboard).
  useEffect(() => {
    const wrap = signatureWrapRef.current;
    const sigPad = signatureRef.current;
    if (!wrap || !sigPad) return;

    function resize() {
      const pad = signatureRef.current;
      const node = signatureWrapRef.current;
      if (!pad || !node) return;

      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = node.getBoundingClientRect();

      // Preserve any in-progress signature across the resize so a phone
      // rotation or scrollbar showing up doesn't wipe what the user drew.
      const data =
        typeof pad.toData === "function" ? pad.toData() : null;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      ctx?.scale(ratio, ratio);

      if (data && typeof pad.fromData === "function") {
        pad.fromData(data);
      } else {
        pad.clear();
      }
    }

    resize();

    const observer = new ResizeObserver(() => resize());
    observer.observe(wrap);
    window.addEventListener("orientationchange", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
    // Re-run when the signature panel is mounted/unmounted as the project
    // status changes — without this dep, the effect would attach to a stale
    // canvas after a re-render swaps the panel in.
  }, [isPendingQuotation, isPendingInvoiceAgreement]);

  async function signQuotation() {
    if (!projectId || approving) return;

    setSignatureErr(null);

    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setSignatureErr("Please draw your signature.");
      return;
    }

    try {
      setApproving(true);

      const signatureDataUrl = signatureRef.current
        .getTrimmedCanvas()
        .toDataURL("image/png");

      const response = await fetch("/api/client/documents/quotation-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          projectCode: project?.project_code,
          signatureDataUrl,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to sign quotation.",
        );
      }

      // Reflect the new server-side status locally so the post-sign UI sticks
      // even after a refresh — the signature endpoint flips the project to
      // "client_quotation_done".
      setProject((prev) =>
        prev ? { ...prev, status: "client_quotation_done" } : prev,
      );
      setJustSignedQuotation(true);
      setPmNotified(false);
      signatureRef.current.clear();

      toast.success("Quotation signed.", {
        description:
          "Notify the project manager to let them know the quotation is agreed.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sign quotation.";

      console.error(error);
      toast.error("Signature failed", {
        description: message,
      });
    } finally {
      setApproving(false);
    }
  }

  async function notifyProjectManager() {
    if (!projectId || notifyingPM) return;

    try {
      setNotifyingPM(true);

      const response = await fetch("/api/client/messages/notify-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectCode: project?.project_code ?? "",
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to notify project manager.",
        );
      }

      setPmNotified(true);
      toast.success("Project manager notified.", {
        description:
          "A message has been sent in the project conversation. They will review and update the project from their side.",
      });
    } catch (error) {
      toast.error("Couldn't notify project manager", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to notify project manager.",
      });
    } finally {
      setNotifyingPM(false);
    }
  }

  async function acceptInvoiceAgreement() {
    if (!projectId || approving) return;

    setSignatureErr(null);

    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setSignatureErr("Please draw your signature.");
      return;
    }

    try {
      setApproving(true);

      const signatureDataUrl = signatureRef.current
        .getTrimmedCanvas()
        .toDataURL("image/png");

      const response = await fetch("/api/client/documents/invoice-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          projectCode: project?.project_code,
          signatureDataUrl,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to accept invoice.",
        );
      }

      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: "payment_pending",
            }
          : prev,
      );

      signatureRef.current.clear();

      toast.success("Invoice accepted.", {
        description: "The project is now pending payment.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to accept invoice.";

      console.error(error);
      toast.error("Invoice acceptance failed", {
        description: message,
      });
    } finally {
      setApproving(false);
    }
  }

  async function downloadDocumentPdf() {
    if (!projectId || downloading || documentType === "none") return;

    try {
      setDownloading(true);

      const endpoint =
        documentType === "invoice" ? "/api/invoice/pdf" : "/api/quotation/pdf";

      const response = await fetch(
        `${endpoint}?projectId=${encodeURIComponent(projectId)}&download=1`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            `Failed to download ${documentLabel.toLowerCase()} PDF.`,
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${documentLabel.toLowerCase()}-${projectId}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to download ${documentLabel.toLowerCase()} PDF.`;

      console.error(error);
      toast.error("Download failed", {
        description: message,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    // Below lg: natural-flow scroll so the document and the sidebar stack
    // vertically. lg+: keep the locked-screen split layout.
    <div className="lg:h-screen lg:overflow-hidden bg-gray-50">
      <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:h-full lg:min-h-0 lg:p-6">
        <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="h-1 w-full rounded-t-xl bg-[#00c065]" />

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100">
                  <FileText className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold text-gray-900">
                    {pageTitle}
                  </h1>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {pageSubtitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(justSignedQuotation || isClientQuotationDone) &&
              documentType === "quotation" ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  Signed — awaiting project manager
                </span>
              ) : isPendingQuotation || isPendingInvoiceAgreement ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  Needs signature
                </span>
              ) : isQuotationApproved || isInvoiceAccepted ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  {documentType === "invoice" ? "Accepted" : "Signed"}
                </span>
              ) : (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                  {projectStatus || "No status"}
                </span>
              )}

              <button
                type="button"
                onClick={downloadDocumentPdf}
                disabled={
                  !projectId ||
                  downloading ||
                  loading ||
                  documentType === "none"
                }
                className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download PDF
              </button>

              {documentType === "quotation" &&
              (justSignedQuotation || isClientQuotationDone) ? (
                <button
                  type="button"
                  onClick={notifyProjectManager}
                  disabled={!projectId || notifyingPM || pmNotified}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {notifyingPM ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : pmNotified ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {pmNotified
                    ? "Project Manager Notified"
                    : "Notify Project Manager"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <div className="col-span-12 lg:col-span-8 lg:min-h-0 lg:overflow-hidden">
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
              <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  {documentLabel} Preview
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  This preview uses the generated {documentLabel.toLowerCase()}{" "}
                  document.
                </p>
              </div>

              {/* Below lg the parent isn't a fixed-height flex, so flex-1 would
                  collapse the iframe. Fall back to a generous viewport-based
                  min-height on mobile and resume the flex-fill behavior at lg+. */}
              <div className="p-3 sm:p-4 min-h-[60vh] lg:min-h-0 lg:flex-1">
                {loading ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 min-h-[60vh] lg:min-h-0">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                      <p className="mt-2 text-xs text-gray-500">
                        Loading {documentLabel.toLowerCase()} preview...
                      </p>
                    </div>
                  </div>
                ) : !projectId ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500 min-h-[60vh] lg:min-h-0">
                    Missing project ID.
                  </div>
                ) : !previewSrc ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500 min-h-[60vh] lg:min-h-0">
                    No document is available for this project right now.
                  </div>
                ) : (
                  <div className="relative h-full min-h-[60vh] w-full lg:min-h-0">
                    {!previewLoaded ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                          <p className="mt-2 text-xs text-gray-500">
                            Loading {documentLabel.toLowerCase()} preview...
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <iframe
                      key={`${documentType}-${projectStatus}-${projectId}`}
                      src={previewSrc}
                      title={`${documentLabel} Preview`}
                      onLoad={() => setPreviewLoaded(true)}
                      className="h-full w-full rounded-lg border border-gray-200 bg-white min-h-[60vh] lg:min-h-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="col-span-12 lg:col-span-4 lg:min-h-0 lg:overflow-hidden">
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
              <div className="h-1 w-full shrink-0 bg-[#00c065]" />

              <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  {documentLabel} Details
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Project summary and document status.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 animate-pulse rounded-lg bg-gray-100"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[11px] font-medium text-gray-500">
                        Project
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {project?.title || "Untitled Project"}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[11px] font-medium text-gray-500">
                        Project Code
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-gray-900">
                        {project?.project_code || "—"}
                      </p>
                    </div>

                    {documentType === "invoice" ? (
                      <>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            Site Address
                          </p>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {project?.site_address || "No address provided"}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                            <p className="text-[11px] font-medium text-gray-500">
                              Estimated Budget
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {formatCurrency(
                                costSummary?.quotationTotal ??
                                  project?.estimated_budget,
                              )}
                            </p>
                          </div>

                          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                            <p className="text-[11px] font-medium text-gray-500">
                              Estimated Cost
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {formatCurrency(
                                costSummary?.totalCost ??
                                  project?.estimated_cost,
                              )}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {isPendingQuotation || isPendingInvoiceAgreement ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Client signature required
                        </p>

                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          Please review the {documentLabel.toLowerCase()} preview,
                          draw your signature, then click{" "}
                          {documentType === "invoice"
                            ? "Sign Invoice"
                            : "Sign Quotation"}
                          .
                        </p>

                        <div className="mt-3">
                          <label className="text-[11px] font-semibold text-emerald-900">
                            Signature
                          </label>

                          {/* Wrapper has explicit height so the resize effect
                              can read getBoundingClientRect() and size the
                              underlying canvas — h-[160px] on phones gives
                              more room for finger drawing, h-[130px] at sm+
                              keeps the desktop sidebar compact. */}
                          <div
                            ref={signatureWrapRef}
                            className="mt-1 h-40 sm:h-[130px] overflow-hidden rounded-lg border border-emerald-200 bg-white touch-none">
                            <SignatureCanvas
                              ref={signatureRef}
                              penColor="black"
                              canvasProps={{
                                className: "block h-full w-full bg-white",
                              }}
                            />
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                signatureRef.current?.clear();
                                setSignatureErr(null);
                              }}
                              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                              Clear Signature
                            </button>

                            {documentType === "quotation" ? (
                              <button
                                type="button"
                                onClick={signQuotation}
                                disabled={
                                  !projectId ||
                                  loading ||
                                  approving ||
                                  !isPendingQuotation
                                }
                                className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                                {approving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <PenLine className="h-3.5 w-3.5" />
                                )}
                                Sign Quotation
                              </button>
                            ) : null}

                            {documentType === "invoice" ? (
                              <button
                                type="button"
                                onClick={acceptInvoiceAgreement}
                                disabled={
                                  !projectId ||
                                  loading ||
                                  approving ||
                                  !isPendingInvoiceAgreement
                                }
                                className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                                {approving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <PenLine className="h-3.5 w-3.5" />
                                )}
                                Sign Invoice
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {signatureErr ? (
                          <p className="mt-2 text-xs font-semibold text-red-600">
                            {signatureErr}
                          </p>
                        ) : null}
                      </div>
                    ) : isQuotationApproved ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Quotation signed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          This signed quotation is complete, and the project is
                          now ready to start.
                        </p>
                      </div>
                    ) : isInvoiceAccepted ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Invoice signed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          Your signed invoice agreement has been recorded and is
                          now pending payment.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style jsx global>{`
        canvas {
          touch-action: none;
        }
      `}</style>
    </div>
  );
}
