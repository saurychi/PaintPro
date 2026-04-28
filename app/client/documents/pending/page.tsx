"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Download,
  FileText,
  Loader2,
  PenLine,
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
  if (status === "quotation_pending" || status === "ready_to_start") {
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

  const projectId = searchParams.get("projectId") || sessionProjectId || "";

  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [signatureErr, setSignatureErr] = useState<string | null>(null);

  const projectStatus = String(project?.status || "").trim();
  const documentType = getDocumentType(projectStatus);

  const isPendingQuotation = projectStatus === "quotation_pending";
  const isPendingInvoiceAgreement = projectStatus === "invoice_agreement_pending";
  const isQuotationApproved = projectStatus === "ready_to_start";
  const isInvoiceAccepted = projectStatus === "payment_pending";

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

    return `/api/quotation/html?projectId=${encodeURIComponent(projectId)}`;
  }, [projectId, documentType]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    async function loadProject() {
      try {
        setLoading(true);

        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
            projectId,
          )}`,
        );

        const data = (await response.json()) as ProjectOverviewResponse;

        if (!response.ok) {
          throw new Error(readError(data, "Failed to load pending document."));
        }

        setProject(data.project ?? null);
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

      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: "ready_to_start",
            }
          : prev,
      );

      signatureRef.current.clear();

      toast.success("Quotation signed.", {
        description: "The project is now ready to start.",
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
    <div className="h-screen overflow-hidden bg-gray-50">
      <div className="flex h-full min-h-0 flex-col gap-4 p-6">
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
              {isPendingQuotation || isPendingInvoiceAgreement ? (
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

              {documentType === "quotation" ? (
                <button
                  type="button"
                  onClick={signQuotation}
                  disabled={
                    !projectId || loading || approving || !isPendingQuotation
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                  {approving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5" />
                  )}
                  {isQuotationApproved ? "Already Signed" : "Sign Quotation"}
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
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                  {approving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5" />
                  )}
                  {isInvoiceAccepted ? "Already Signed" : "Sign Invoice"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 overflow-hidden">
          <div className="col-span-12 min-h-0 overflow-hidden lg:col-span-8">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  {documentLabel} Preview
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  This preview uses the generated {documentLabel.toLowerCase()}{" "}
                  document.
                </p>
              </div>

              <div className="min-h-0 flex-1 p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                      <p className="mt-2 text-xs text-gray-500">
                        Loading {documentLabel.toLowerCase()} preview...
                      </p>
                    </div>
                  </div>
                ) : !projectId ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
                    Missing project ID.
                  </div>
                ) : !previewSrc ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
                    No document is available for this project right now.
                  </div>
                ) : (
                  <iframe
                    key={`${documentType}-${projectStatus}-${projectId}`}
                    src={previewSrc}
                    title={`${documentLabel} Preview`}
                    className="h-full w-full rounded-lg border border-gray-200 bg-white"
                  />
                )}
              </div>
            </div>
          </div>

          <aside className="col-span-12 min-h-0 overflow-hidden lg:col-span-4">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
                          {documentType === "quotation"
                            ? "Estimated Payment"
                            : "Estimated Budget"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {formatCurrency(project?.estimated_budget)}
                        </p>
                      </div>

                      {documentType === "invoice" ? (
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            Estimated Cost
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatCurrency(project?.estimated_cost)}
                          </p>
                        </div>
                      ) : null}
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

                          <div className="mt-1 overflow-hidden rounded-lg border border-emerald-200 bg-white">
                            <SignatureCanvas
                              ref={signatureRef}
                              penColor="black"
                              canvasProps={{
                                className: "h-[130px] w-full bg-white",
                              }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              signatureRef.current?.clear();
                              setSignatureErr(null);
                            }}
                            className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                            Clear Signature
                          </button>
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
