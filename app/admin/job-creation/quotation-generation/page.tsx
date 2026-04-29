"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Loader2, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type StatusType = "Not yet Approved" | "Approved";

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

export default function JobQuotation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [status, setStatus] = useState<StatusType>("Not yet Approved");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [notifyingClient, setNotifyingClient] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [project, setProject] = useState<ProjectOverviewResponse["project"] | null>(null);

  const statusStyles = useMemo(() => {
    if (status === "Approved") {
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
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(projectId)}`,
        );

        const data = (await response.json()) as ProjectOverviewResponse & {
          error?: string;
          details?: string;
        };

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load quotation project data.",
          );
        }

        setProject(data.project);

        setStatus(
          data.project?.status === "ready_to_start"
            ? "Approved"
            : "Not yet Approved",
        );
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "Failed to load quotation project data.");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  async function handleSaveQuotationDocument() {
    if (!projectId || !project || savingDocument) return;

    try {
      setSavingDocument(true);

      const response = await fetch("/api/quotation/save-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          projectCode: project.project_code,
          projectTitle: project.title,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to save quotation document.",
        );
      }

      toast.success(
        data?.mode === "updated"
          ? "Quotation document updated in Documents."
          : "Quotation document saved to Documents.",
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to save quotation document.");
    } finally {
      setSavingDocument(false);
    }
  }

  async function handleDownloadPdf() {
    if (!projectId) return;

    try {
      setDownloading(true);

      const response = await fetch(
        `/api/quotation/pdf?projectId=${encodeURIComponent(projectId)}&download=1`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to download quotation PDF.",
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `quotation-${projectId}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to download quotation PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleNotifyClient() {
    if (!projectId || notifyingClient || project?.status !== "quotation_pending") {
      return;
    }

    try {
      setNotifyingClient(true);

      const response = await fetch("/api/planning/notifyQuotationClient", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to notify client about the quotation.",
        );
      }

      toast.success("Client notified.", {
        description: "A quotation reminder was sent in the project messages.",
      });
    } catch (error: any) {
      toast.error(
        error?.message || "Failed to notify client about the quotation.",
      );
    } finally {
      setNotifyingClient(false);
    }
  }

  const previewSrc = projectId
    ? `/api/quotation/html?projectId=${encodeURIComponent(projectId)}`
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
            <span>Quotation</span>
          </div>

          <div
            className="inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold"
            style={{
              backgroundColor: statusStyles.bg,
              borderColor: statusStyles.border,
              color: statusStyles.text,
            }}
          >
            {status}
          </div>
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
                        Loading quotation preview...
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
                    title="Quotation Preview"
                    className="h-full w-full rounded-lg border border-gray-200 bg-white"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col gap-5 lg:col-span-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-[13px] font-semibold text-gray-900">
                Quotation Details
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
                  <div className="text-gray-500">Estimated Payment</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCurrency(project?.estimated_budget)}
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
                onClick={handleNotifyClient}
                disabled={
                  notifyingClient ||
                  !projectId ||
                  project?.status !== "quotation_pending"
                }
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
                {notifyingClient ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Notifying...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Notify Client
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

                await updateProjectStatus("overview_pending");

                router.push(
                  `/admin/job-creation/overview?projectId=${projectId}`,
                );
              } catch (error: any) {
                toast.error(error?.message || "Failed to go back.");
                setIsGoingBack(false);
              }
            }}
            disabled={isGoingBack}
            className="inline-flex h-10 min-w-[220px] items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-5 text-[13px] font-semibold text-[#4FAE2A] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isGoingBack ? "Going Back..." : "Go Back"}
          </button>
        </div>
      </div>
    </div>
  );
}