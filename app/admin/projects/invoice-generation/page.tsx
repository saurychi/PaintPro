"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Download, Loader2, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type StatusType = "Not yet Issued" | "Issued";

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

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [codeCopied, setCodeCopied] = useState(false);

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

  useEffect(() => {
    async function loadProject() {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
            projectId,
          )}`,
        );

        const data = (await response.json()) as ProjectOverviewResponse & {
          error?: string;
          details?: string;
        };

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load invoice project data.",
          );
        }

        setProject(data.project);

        setStatus(
          data.project?.status === "payment_pending"
            ? "Issued"
            : "Not yet Issued",
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to load invoice project data.");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  async function toggleStatus() {
    if (!projectId || updatingStatus) return;

    const nextUiStatus: StatusType =
      status === "Issued" ? "Not yet Issued" : "Issued";

    const nextProjectStatus =
      nextUiStatus === "Issued" ? "payment_pending" : "invoice_pending";

    try {
      setUpdatingStatus(true);

      await updateProjectStatus(nextProjectStatus);

      setStatus(nextUiStatus);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: nextProjectStatus,
            }
          : prev,
      );

      toast.success("Invoice status updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update invoice status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

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

      toast.success("Invoice sent to client.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to send invoice to client.");
    } finally {
      setSendingToClient(false);
    }
  }

  const previewSrc = projectId
    ? `/api/invoice/html?projectId=${encodeURIComponent(projectId)}`
    : "";

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

          <button
            type="button"
            onClick={toggleStatus}
            disabled={updatingStatus || !projectId}
            className="inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              backgroundColor: statusStyles.bg,
              borderColor: statusStyles.border,
              color: statusStyles.text,
            }}
            aria-label="Toggle invoice status">
            {updatingStatus ? "Updating..." : status}
          </button>
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
                  <div className="h-full w-full overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                    <iframe
                      src={previewSrc}
                      title="Invoice Preview"
                      scrolling="yes"
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

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Invoice Details
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
                    -{formatCurrency(project?.downpayment)}
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

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={
                  downloading ||
                  !projectId ||
                  project?.status === "invoice_pending"
                }
                title={
                  project?.status === "invoice_pending"
                    ? "Issue the invoice before downloading the PDF."
                    : undefined
                }
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: "#00c065" }}>
                {downloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSendToClient}
                disabled={
                  sendingToClient ||
                  !projectId ||
                  project?.status === "invoice_agreement_pending" ||
                  project?.status === "payment_pending"
                }
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/25">
                {sendingToClient ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {project?.status === "invoice_agreement_pending" ||
                    project?.status === "payment_pending"
                      ? "Sent to Client"
                      : "Send to Client"}
                  </>
                )}
              </button>
            </div>

            <div className="hidden flex-1 lg:block" />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end">
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

      <style jsx global>{`
        .invoice-preview-frame {
          overflow-x: hidden;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
