"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Loader2, Send } from "lucide-react";
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
    <div className="h-screen w-full overflow-hidden bg-white">
      <div className="flex h-full flex-col gap-4 overflow-hidden px-6 pb-5 pt-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold text-gray-900">
            <span>Project</span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-gray-300"
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

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-5">
          <div className="col-span-12 min-h-0 lg:col-span-8">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="h-full min-h-0 p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-[#F7F7F7]">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                      <div className="mt-2 text-[12px] text-gray-500">
                        Loading invoice preview...
                      </div>
                    </div>
                  </div>
                ) : !projectId ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-[#F7F7F7] text-[12px] text-gray-500">
                    Missing project ID.
                  </div>
                ) : (
                  <iframe
                    src={previewSrc}
                    title="Invoice Preview"
                    className="h-full w-full rounded-lg border border-gray-200 bg-white"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col gap-5 lg:col-span-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-[13px] font-semibold text-gray-900">
                Invoice Details
              </div>

              <div className="mt-4 space-y-3 text-[12px] text-gray-600">
                <div>
                  <div className="text-gray-500">Project Code</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {project?.project_code || "No Code"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500">Project Title</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {project?.title || "Untitled Project"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500">Site Address</div>
                  <div className="mt-1 break-words font-semibold text-gray-900">
                    {project?.site_address || "No site address"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500">Final Invoice Amount</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCurrency(project?.estimated_budget)}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500">Estimated Cost</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCurrency(project?.estimated_cost)}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500">Estimated Profit</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCurrency(project?.estimated_profit)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloading || !projectId}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-sm active:translate-y-0 disabled:opacity-70"
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
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
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
            className="inline-flex h-10 min-w-[220px] items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-5 text-[13px] font-semibold text-[#4FAE2A] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70">
            {isGoingBack ? "Going Back..." : "Go Back"}
          </button>
        </div>
      </div>
    </div>
  );
}
