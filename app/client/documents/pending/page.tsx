"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PenLine,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
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
    cancellation_phase?: string | null;
    cancellation_balance?: number | null;
    cancellation_earned_revenue?: number | null;
    cancellation_earned_cost?: number | null;
    estimated_budget?: number | null;
    estimated_cost?: number | null;
    estimated_profit?: number | null;
    downpayment?: number | null;
    downpayment_rate?: number | null;
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

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function readError(data: ProjectOverviewResponse | null, fallback: string) {
  return [data?.error, data?.details].filter(Boolean).join(": ") || fallback;
}

function getDocumentType(status: string): DocumentType {
  if (
    status === "quotation_pending" ||
    status === "client_quotation_done" ||
    status === "ready_to_start"
  ) {
    return "quotation";
  }

  if (
    status === "invoice_agreement_pending" ||
    status === "invoice_signed" ||
    status === "payment_pending"
  ) {
    return "invoice";
  }

  return "none";
}

export default function ClientPendingDocumentsPage() {
  const searchParams = useSearchParams();
  const { projectId: sessionProjectId } = useClientProject();

  const signatureRef = useRef<SignatureCanvas | null>(null);
  const signatureWrapRef = useRef<HTMLDivElement | null>(null);
  // Separate signature canvas for the cancellation-agreement flow so the
  // resize effect that auto-fits the canvas doesn't fight with the
  // invoice/quotation canvas mounted in the main layout.
  const cancellationSignatureRef = useRef<SignatureCanvas | null>(null);
  const cancellationSignatureWrapRef = useRef<HTMLDivElement | null>(null);

  const projectId = searchParams.get("projectId") || sessionProjectId || "";

  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [costSummary, setCostSummary] = useState<
    CostEstimationResponse["summary"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Tracks whether the bucket PDF has finished loading inside the iframe so
  // we can keep a spinner over it until the document is actually visible.
  const [previewLoaded, setPreviewLoaded] = useState(false);
  // Bumped on every refresh so the iframe key changes and the viewer
  // remounts, picking up the latest bucket PDF (e.g. the just-signed
  // version) even when projectStatus hasn't advanced.
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  const [signatureErr, setSignatureErr] = useState<string | null>(null);

  // Local-only flags for the "client signed; status not yet advanced" state.
  // The signature endpoint persists the signed PDF but intentionally leaves
  // projects.status alone, so we drive the post-sign UI from these refs.
  const [justSignedQuotation, setJustSignedQuotation] = useState(false);
  const [justSignedCancellationAgreement, setJustSignedCancellationAgreement] =
    useState(false);
  const [signingCancellationAgreement, setSigningCancellationAgreement] =
    useState(false);
  const [cancellationSignatureErr, setCancellationSignatureErr] =
    useState<string | null>(null);

  const projectStatus = String(project?.status || "").trim();
  const cancellationPhase = String(project?.cancellation_phase || "")
    .trim()
    .toLowerCase();
  const documentType = getDocumentType(projectStatus);
  // Cancellation-agreement signing surfaces here when the project is
  // cancelled and the cancel-flow is parked on the "document" phase
  // (admin clicked "Notify client", which uploads the unsigned agreement
  // PDF to storage). After signing, the phase advances past "document".
  const isPendingCancellationAgreement =
    projectStatus === "cancelled" && cancellationPhase === "document";
  const isCancellationAgreementSigned =
    projectStatus === "cancelled" &&
    (justSignedCancellationAgreement ||
      (cancellationPhase !== "" && cancellationPhase !== "review" && cancellationPhase !== "document"));

  // Client can sign as soon as the quotation is in quotation_pending —
  // there's no separate "grant access" gate anymore.
  const isPendingQuotation = projectStatus === "quotation_pending";
  const isPendingInvoiceAgreement = projectStatus === "invoice_agreement_pending";
  const isClientQuotationDone = projectStatus === "client_quotation_done";
  const isQuotationApproved = projectStatus === "ready_to_start";
  // Client-signed invoice — kept distinct from payment_pending so the
  // admin can hold the project at this state until they confirm
  // "Proceed to Payment". The signed-PDF download is only offered to
  // both client and admin while the project sits in invoice_signed.
  const isInvoiceSigned = projectStatus === "invoice_signed";
  const isInvoiceAccepted =
    projectStatus === "invoice_signed" || projectStatus === "payment_pending";

  const documentLabel =
    documentType === "invoice"
      ? "Invoice"
      : documentType === "quotation"
        ? "Quotation"
        : "Document";

  const pageTitle =
    isPendingQuotation || isPendingInvoiceAgreement
      ? `Pending ${documentLabel}`
      : documentType === "none"
        ? "Project Document"
        : `${documentLabel} Document`;

  const pageSubtitle = isPendingInvoiceAgreement
    ? "Review and sign your project invoice agreement."
    : isPendingQuotation
      ? "Review and sign your project quotation."
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
    // `v=${previewRefreshKey}` busts the PDF viewer's disk cache when we
    // bump the refresh counter (e.g. right after the client signs and the
    // bucket file is replaced at the same path).
    return `/api/quotation/from-bucket?projectId=${encodeURIComponent(projectId)}&v=${previewRefreshKey}#navpanes=0&zoom=95`;
  }, [projectId, documentType, previewRefreshKey]);

  // Reset the iframe-loaded gate whenever the source changes, so the spinner
  // shows again while the next document is fetched.
  useEffect(() => {
    setPreviewLoaded(false);
  }, [previewSrc]);

  const loadProject = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        if (mode === "refresh") setRefreshing(true);
        else setLoading(true);

        const [overviewRes, costRes] = await Promise.all([
          fetch(
            `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/planning/getProjectCostEstimation?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
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
        setRefreshing(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadProject("initial");
  }, [loadProject]);

  async function handleRefresh() {
    if (refreshing || loading) return;
    // Force the PDF viewer to remount so the bucket's latest version
    // (e.g. the freshly client-signed PDF) is fetched again.
    setPreviewLoaded(false);
    setPreviewRefreshKey((k) => k + 1);
    await loadProject("refresh");
    // Same broadcast the dashboard's refresh button uses, so the sidebar
    // "pending-documents" badge re-checks in lock-step instead of waiting
    // for its next 15s poll.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("paintpro:refresh-pending-docs"));
    }
  }

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

  // Sibling effect for the cancellation-agreement signature canvas — same
  // resize/devicePixelRatio handling, but bound to the dedicated cancellation
  // refs so the two canvases don't fight over the same node.
  useEffect(() => {
    const wrap = cancellationSignatureWrapRef.current;
    const sigPad = cancellationSignatureRef.current;
    if (!wrap || !sigPad) return;

    function resize() {
      const pad = cancellationSignatureRef.current;
      const node = cancellationSignatureWrapRef.current;
      if (!pad || !node) return;

      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = node.getBoundingClientRect();

      const data = typeof pad.toData === "function" ? pad.toData() : null;

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
  }, [isPendingCancellationAgreement]);

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
      signatureRef.current.clear();
      // Force the iframe to remount AND bust the PDF viewer's URL cache so
      // it pulls the freshly-uploaded signed PDF from the bucket instead
      // of holding onto the unsigned copy at the same storage path.
      setPreviewLoaded(false);
      setPreviewRefreshKey((k) => k + 1);

      // Ping the project manager right after the signature lands. Fire-
      // and-forget so a transient messages-API failure doesn't surface
      // as a "signature failed" toast — the signature itself is already
      // safely persisted server-side.
      fetch("/api/client/messages/notify-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectCode: project?.project_code ?? "",
          documentType: "quotation",
        }),
      }).catch(() => {});

      toast.success("Quotation signed.", {
        description:
          "Your signature is recorded and the project manager has been notified.",
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
              status: "invoice_signed",
            }
          : prev,
      );

      signatureRef.current.clear();

      // Ping the project manager right after the signature lands. Same
      // fire-and-forget pattern as the quotation sign path.
      fetch("/api/client/messages/notify-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectCode: project?.project_code ?? "",
          documentType: "invoice",
        }),
      }).catch(() => {});

      toast.success("Invoice signed.", {
        description:
          "Project manager notified. They'll proceed to payment shortly.",
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

  async function signCancellationAgreement() {
    if (!projectId || signingCancellationAgreement) return;

    setCancellationSignatureErr(null);

    if (
      !cancellationSignatureRef.current ||
      cancellationSignatureRef.current.isEmpty()
    ) {
      setCancellationSignatureErr("Please draw your signature.");
      return;
    }

    try {
      setSigningCancellationAgreement(true);

      const signatureDataUrl = cancellationSignatureRef.current
        .getTrimmedCanvas()
        .toDataURL("image/png");

      const response = await fetch(
        "/api/client/documents/cancellation-agreement-signature",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            projectCode: project?.project_code,
            signatureDataUrl,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to sign cancellation agreement.",
        );
      }

      // The signature endpoint advances the project's cancellation_phase
      // past "document". Reflect that locally so the post-sign UI sticks
      // even before the next refresh.
      setProject((prev) =>
        prev ? { ...prev, cancellation_phase: "payment" } : prev,
      );
      setJustSignedCancellationAgreement(true);
      cancellationSignatureRef.current.clear();
      // Force the iframe to remount so it pulls the freshly-uploaded
      // signed PDF from the bucket instead of showing the cached
      // unsigned copy.
      setPreviewLoaded(false);
      setPreviewRefreshKey((k) => k + 1);

      toast.success("Cancellation agreement signed.", {
        description:
          "Your signed agreement has been recorded. The project manager will continue the close-out from their side.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to sign cancellation agreement.";

      console.error(error);
      toast.error("Signature failed", {
        description: message,
      });
    } finally {
      setSigningCancellationAgreement(false);
    }
  }

  async function downloadCancellationAgreementPdf() {
    if (!projectId || downloading) return;

    try {
      setDownloading(true);

      const response = await fetch(
        `/api/cancellation-agreement/from-bucket?projectId=${encodeURIComponent(
          projectId,
        )}&download=1`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to download cancellation agreement PDF.",
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `cancellation-agreement-${
        project?.project_code || projectId
      }.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to download cancellation agreement PDF.";

      console.error(error);
      toast.error("Download failed", {
        description: message,
      });
    } finally {
      setDownloading(false);
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

  // Dedicated cancellation-agreement layout — shown instead of the
  // invoice/quotation flow when the project is cancelled and currently
  // parked on the "document" cancellation phase, OR when the client has
  // just finished signing it. Mirrors the invoice layout (preview on
  // left, signature panel on right) but uses cancellation-specific copy
  // and the cancellation-agreement-signature endpoint.
  if (
    !loading &&
    project &&
    (isPendingCancellationAgreement || isCancellationAgreementSigned)
  ) {
    // Stream the saved PDF from storage instead of re-rendering from
    // HTML every load. The /pdf route reads project_documents but the
    // raw client signature is intentionally never persisted there, so
    // it always produced an unsigned-looking preview even after the
    // client signed. The signature endpoint uploads the baked-in
    // signed PDF to the same bucket path on every sign, so
    // /from-bucket reflects the latest signed (or unsigned, pre-sign)
    // copy faithfully.
    const previewUrl = projectId
      ? `/api/cancellation-agreement/from-bucket?projectId=${encodeURIComponent(
          projectId,
        )}#navpanes=0&zoom=95`
      : "";

    return (
      <div className="lg:h-screen lg:overflow-hidden bg-gray-50">
        <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:h-full lg:min-h-0 lg:p-6">
          <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="h-1 w-full rounded-t-xl bg-[#00c065]" />
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-base font-semibold text-gray-900">
                      {isCancellationAgreementSigned
                        ? "Cancellation Agreement"
                        : "Pending Cancellation Agreement"}
                    </h1>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {isCancellationAgreementSigned
                        ? "Your signed cancellation agreement has been recorded."
                        : "Review and sign the agreement to finalise the project close-out."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isCancellationAgreementSigned ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    Signed
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    Needs signature
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || loading}
                  title="Refresh document status"
                  aria-label="Refresh document status"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw
                    className={[
                      "h-3.5 w-3.5",
                      refreshing || loading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                </button>

                <button
                  type="button"
                  onClick={downloadCancellationAgreementPdf}
                  disabled={!projectId || downloading || loading}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download PDF
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="col-span-12 lg:col-span-8 lg:min-h-0 lg:overflow-hidden">
              <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
                <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Cancellation Agreement Preview
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    This preview uses the generated cancellation agreement document.
                  </p>
                </div>

                <div className="relative flex-1 overflow-hidden p-3 lg:min-h-[420px]">
                  {previewUrl ? (
                    <iframe
                      key={`${previewUrl}-${previewRefreshKey}`}
                      src={previewUrl}
                      title="Cancellation Agreement Preview"
                      onLoad={() => setPreviewLoaded(true)}
                      className="h-full w-full rounded-lg border border-gray-200 bg-white min-h-[60vh] lg:min-h-0"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">
                      No agreement available yet.
                    </div>
                  )}
                  {!previewLoaded && previewUrl ? (
                    <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg bg-white/60">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <aside className="col-span-12 lg:col-span-4 lg:min-h-0 lg:overflow-hidden">
              <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
                <div className="h-1 w-full shrink-0 bg-[#00c065]" />

                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900">
                      Cancellation Details
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Project summary and document status.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing || loading}
                    title="Refresh document details"
                    aria-label="Refresh document details"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                    <RefreshCw
                      className={[
                        "h-3.5 w-3.5",
                        refreshing || loading ? "animate-spin" : "",
                      ].join(" ")}
                    />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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

                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[11px] font-medium text-gray-500">
                        Site Address
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {project?.site_address || "No address provided"}
                      </p>
                    </div>

                    {/* Settlement — surfaces the bottom-line money the
                        client either gets back or still owes after the
                        cancellation. cancellation_balance is the source
                        of truth (positive = refund to client, negative =
                        client owes more, zero = settled). */}
                    {(() => {
                      const cancellationBalance = Number(
                        project?.cancellation_balance ?? 0,
                      );
                      const settledLabel =
                        cancellationBalance > 0
                          ? "Refund to receive"
                          : cancellationBalance < 0
                            ? "Outstanding to pay"
                            : "Fully settled";
                      const settledHint =
                        cancellationBalance > 0
                          ? "PaintPro will return this to you after the agreement is signed."
                          : cancellationBalance < 0
                            ? "Owed to PaintPro for work already completed before cancellation."
                            : "No money changes hands — completed work matched the downpayment.";
                      const settledClass =
                        cancellationBalance > 0
                          ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                          : cancellationBalance < 0
                            ? "border-rose-100 bg-rose-50 text-rose-900"
                            : "border-gray-100 bg-gray-50 text-gray-900";

                      return (
                        <>
                          <div className={`rounded-lg border px-3 py-3 ${settledClass}`}>
                            <p className="text-[11px] font-medium opacity-80">
                              {settledLabel}
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {formatCurrency(Math.abs(cancellationBalance))}
                            </p>
                            <p className="mt-1 text-[11px] leading-4 opacity-80">
                              {settledHint}
                            </p>
                          </div>
                        </>
                      );
                    })()}

                    {isCancellationAgreementSigned ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Cancellation agreement signed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          The project manager will continue the close-out
                          from their side. You can download the signed
                          agreement anytime using the button above.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Client signature required
                        </p>

                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          Please review the cancellation agreement preview,
                          draw your signature, then click Sign Agreement.
                        </p>

                        <div className="mt-3">
                          <label className="text-[11px] font-semibold text-emerald-900">
                            Signature
                          </label>

                          <div
                            ref={cancellationSignatureWrapRef}
                            className="mt-1 h-40 sm:h-[130px] overflow-hidden rounded-lg border border-emerald-200 bg-white touch-none">
                            <SignatureCanvas
                              ref={cancellationSignatureRef}
                              penColor="black"
                              canvasProps={{
                                className: "block h-full w-full bg-white",
                              }}
                            />
                          </div>

                          {cancellationSignatureErr ? (
                            <p className="mt-2 text-xs font-medium text-red-600">
                              {cancellationSignatureErr}
                            </p>
                          ) : null}

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                cancellationSignatureRef.current?.clear();
                                setCancellationSignatureErr(null);
                              }}
                              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                              Clear Signature
                            </button>

                            <button
                              type="button"
                              onClick={signCancellationAgreement}
                              disabled={
                                !projectId ||
                                loading ||
                                signingCancellationAgreement ||
                                !isPendingCancellationAgreement
                              }
                              className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                              {signingCancellationAgreement ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PenLine className="h-3.5 w-3.5" />
                              )}
                              Sign Agreement
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
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

              {/* Header refresh — re-checks whether the project has
                  advanced (e.g. quotation just signed and now pending
                  invoice instead). Same behaviour as the sidebar
                  refresh, surfaced here so the user doesn't have to
                  scroll. */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                title="Refresh document status"
                aria-label="Refresh document status"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw
                  className={[
                    "h-3.5 w-3.5",
                    refreshing || loading ? "animate-spin" : "",
                  ].join(" ")}
                />
              </button>

              {/* Download PDF only appears once the invoice is signed
                  (status: invoice_signed). Quotations follow their own
                  rule and stay downloadable across their relevant
                  statuses. */}
              {documentType === "invoice" && !isInvoiceSigned ? null : (
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
              )}

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
                      key={`${documentType}-${projectStatus}-${projectId}-${previewRefreshKey}`}
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

              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">
                    {documentLabel} Details
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Project summary and document status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || loading}
                  title="Refresh document details"
                  aria-label="Refresh document details"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw
                    className={[
                      "h-3.5 w-3.5",
                      refreshing || loading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                </button>
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
                        Project Code
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-gray-900">
                        {project?.project_code || "—"}
                      </p>
                    </div>

                    {/* Project title + site address removed from the
                        quotation/invoice sidebar — the document preview on
                        the left already shows both prominently, and the
                        project code below is enough for reference. */}

                    {documentType === "quotation" ? (() => {
                      // Required downpayment for the client to see. Derived
                      // from the stored rate × quotation total, NOT from
                      // projects.downpayment — that column is the cumulative
                      // amount the admin has already collected from the
                      // client (tracked in the DownpaymentModal).
                      const quotationTotal = Number(
                        costSummary?.quotationTotal ??
                          project?.estimated_budget ??
                          0,
                      );
                      const rate = Math.max(
                        0,
                        Math.min(100, Number(project?.downpayment_rate ?? 0)),
                      );
                      const required =
                        Math.round(((rate / 100) * quotationTotal) * 100) / 100;
                      const label = rate > 0 ? `Downpayment (${rate}%)` : "Downpayment";
                      return (
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            {label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatCurrency(required)}
                          </p>
                        </div>
                      );
                    })() : null}

                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[11px] font-medium text-gray-500">
                        Total Payment
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {formatCurrency(
                          costSummary?.quotationTotal ??
                            project?.estimated_budget ??
                            0,
                        )}
                      </p>
                    </div>

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
                    ) : documentType === "quotation" &&
                      (justSignedQuotation || isClientQuotationDone) ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Quotation signed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          Your project manager has been notified and will
                          advance the project from their side.
                        </p>

                        <Link
                          href="/client/documents?openType=QTE"
                          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Go to file
                        </Link>
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

                        <Link
                          href="/client/documents?openType=QTE"
                          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Go to file
                        </Link>
                      </div>
                    ) : isInvoiceAccepted ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-xs font-semibold text-emerald-800">
                          Invoice signed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          Your signed invoice agreement has been recorded and
                          the project manager has been notified. Payment will
                          be collected from their side.
                        </p>

                        <Link
                          href="/client/documents?openType=INV"
                          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Go to file
                        </Link>
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
