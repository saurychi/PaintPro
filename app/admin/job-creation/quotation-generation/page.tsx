"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, Download, FileText, Loader2, Send } from "lucide-react";
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

const ACCENT = "#00c065";

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
        {
          description:
            data?.source === "signed-pdf-bucket"
              ? "The signed PDF from the documents bucket was saved."
              : "The rendered HTML preview was saved.",
        },
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
    <div className="h-screen w-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold text-slate-900 dark:text-slate-100">
            <span>Project</span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-500"
              aria-hidden
            />
            <span>Quotation</span>
          </div>

          <div
            className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold ${
              status === "Approved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300"
            }`}
          >
            {status}
          </div>
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
                        Loading quotation preview...
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
                      title="Quotation Preview"
                      scrolling="yes"
                      className="quotation-preview-frame block h-full w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Quotation Details
              </div>

              <div className="mt-4 space-y-3 text-[12px] text-slate-600 dark:text-slate-300">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Project Code
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {project?.project_code || "No Code"}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Project Title
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {project?.title || "Untitled Project"}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Estimated Payment
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(project?.estimated_budget)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloading || !projectId}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-sm active:translate-y-0 disabled:opacity-70"
                style={{ backgroundColor: ACCENT }}
              >
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
                onClick={handleSaveQuotationDocument}
                disabled={savingDocument || !projectId || !project}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-[13px] font-semibold text-[#047857] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/25"
              >
                {savingDocument ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Save to Documents
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
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/25"
              >
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

        <div className="flex shrink-0 items-center justify-end gap-2">
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
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isGoingBack ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .quotation-preview-frame {
          overflow-x: hidden;
          overflow-y: auto;
          scrollbar-width: thin;
        }

        .quotation-preview-frame::-webkit-scrollbar {
          width: 10px;
          height: 0;
        }

        .quotation-preview-frame::-webkit-scrollbar-track {
          background: #eaf7e4;
        }

        .dark .quotation-preview-frame::-webkit-scrollbar-track {
          background: #0f172a;
        }

        .quotation-preview-frame::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }

        .dark .quotation-preview-frame::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }
      `}</style>
    </div>
  );
}