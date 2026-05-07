"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Key,
  Loader2,
  PlayCircle,
  Send,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import { ensureWizardCacheHydrated } from "@/lib/wizardCache";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  useEffect(() => {
    router.prefetch("/admin/job-creation/overview");
    router.prefetch("/admin");
  }, [router]);

  const [status, setStatus] = useState<StatusType>("Not yet Approved");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [notifyingClient, setNotifyingClient] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [startingProgress, setStartingProgress] = useState(false);
  const [project, setProject] = useState<ProjectOverviewResponse["project"] | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  // True when the bucket has no quotation PDF for this project. Surfaces a
  // "Generate Quotation" CTA in the right column so the admin can create one
  // without going back to the overview page.
  const [quotationMissing, setQuotationMissing] = useState(false);
  const [generatingQuotation, setGeneratingQuotation] = useState(false);
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelInput, setCancelInput] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // Cache-busting token appended to the iframe src to force a reload after
  // (re)generation without dropping focus / scroll.
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
      await ensureWizardCacheHydrated(projectId);

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

        // Treat the post-sign state ("client_quotation_done") and any later
        // status as Approved so the page badge flips the moment the client
        // signs, even though the admin still has to advance the project.
        const projectStatus = String(data.project?.status ?? "").trim();
        const APPROVED_STATUSES = new Set([
          "client_quotation_done",
          "downpayment_pending",
          "ready_to_start",
          "in_progress",
          "review_pending",
          "invoice_pending",
          "invoice_agreement_pending",
          "payment_pending",
          "employee_management_pending",
          "conclude_job_pending",
          "completed",
        ]);
        setStatus(
          APPROVED_STATUSES.has(projectStatus) ? "Approved" : "Not yet Approved",
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

  // Probe the bucket endpoint to see whether a quotation PDF actually exists
  // for this project. We do this with a HEAD request via fetch so we don't
  // pull the whole PDF body just to find out it's missing. If from-bucket
  // returns 404, surface the "Generate Quotation" CTA.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/quotation/from-bucket?projectId=${encodeURIComponent(projectId)}`,
          { method: "HEAD", cache: "no-store" },
        );
        if (cancelled) return;
        setQuotationMissing(res.status === 404);
      } catch {
        if (!cancelled) setQuotationMissing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, previewVersion]);

  async function handleGenerateQuotationFromPage() {
    if (!projectId || generatingQuotation) return;
    try {
      setGeneratingQuotation(true);
      const response = await fetch("/api/quotation/save-generated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to generate quotation.",
        );
      }
      toast.success("Quotation generated.");
      setQuotationMissing(false);
      // Bump the preview version so the iframe re-fetches the freshly-uploaded
      // PDF from the bucket.
      setPreviewVersion((v) => v + 1);
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate quotation.");
    } finally {
      setGeneratingQuotation(false);
    }
  }

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
        `/api/quotation/from-bucket?projectId=${encodeURIComponent(projectId)}&download=1`,
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

  function handleStartProgress() {
    if (!projectId || startingProgress) return;
    if (project?.status !== "client_quotation_done") return;

    setStartingProgress(true);
    setOptimisticProjectStatus(projectId, "downpayment_pending");
    toast.success("Project moved to downpayment.", {
      description: "Heading back to your dashboard.",
    });
    router.push("/admin");
    void updateProjectStatus("downpayment_pending").catch((error: any) => {
      toast.error(error?.message || "Failed to update project status.");
    });
  }

  async function handleCancelProject() {
    if (!projectId || cancelling) return;
    if ((project?.project_code ?? "").trim() !== cancelInput.trim()) return;

    try {
      setCancelling(true);
      const response = await fetch("/api/planning/deleteProject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectCode: cancelInput.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details, data?.hint]
            .filter(Boolean)
            .join(" — ") || "Failed to cancel project.",
        );
      }

      toast.success("Project cancelled and deleted.");
      router.push("/admin/projects");
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel project.");
      setCancelling(false);
    }
  }

  async function handleGrantAccess() {
    if (
      !projectId ||
      grantingAccess ||
      project?.status !== "quotation_pending"
    ) {
      return;
    }

    try {
      setGrantingAccess(true);
      await updateProjectStatus("grant_access_quotation");
      // Reflect immediately so the gating logic flips without a refetch.
      setProject((prev) =>
        prev ? { ...prev, status: "grant_access_quotation" } : prev,
      );
      toast.success("Access granted.", {
        description: "The client can now sign this quotation.",
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to grant client access.");
    } finally {
      setGrantingAccess(false);
    }
  }

  async function handleNotifyClient() {
    if (
      !projectId ||
      notifyingClient ||
      (project?.status !== "quotation_pending" &&
        project?.status !== "grant_access_quotation")
    ) {
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

  // The quotation PDF was rendered + uploaded to the bucket back when the
  // user clicked "Generate Quotation" on the overview page. The page now
  // streams the file straight from storage instead of regenerating the HTML
  // preview every visit.
  // PDF viewer URL fragment — `navpanes=0` collapses the thumbnail/bookmark
  // sidebar by default, and `zoom=95` opens the document at 95% so the page
  // fits the iframe without horizontal scrolling. These are PDF Open
  // Parameters honoured by Chrome / Edge / Adobe Reader.
  const previewSrc = projectId
    ? `/api/quotation/from-bucket?projectId=${encodeURIComponent(projectId)}&v=${previewVersion}#navpanes=0&zoom=95`
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
            {/* Project Details — sits at the top of the right column so its
                top edge aligns with the quotation preview's top edge on the
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

            <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Quotation Details
              </div>

              {loading ? (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
                    <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                      Loading quotation details...
                    </div>
                  </div>
                </div>
              ) : (
                <>
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

              {/* Download PDF only after the client has signed — before that
                  the only thing the admin can do is nudge the client. */}
              {project && project.status !== "quotation_pending" ? (
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
              ) : null}

              {/* Once the client has signed (client_quotation_done) the admin
                  can advance the project to downpayment from here. Doing so
                  moves on to the dashboard so the next stage is visible. */}
              {project?.status === "client_quotation_done" ? (
                <button
                  type="button"
                  onClick={handleStartProgress}
                  disabled={startingProgress || !projectId}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-[#00c065] text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {startingProgress ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Start Progress
                    </>
                  )}
                </button>
              ) : null}

              {/* Only surface "Save to Documents" once the client has signed
                  the quotation. Both quotation_pending and
                  grant_access_quotation are pre-signature states — saving
                  then would persist the unsigned preview. */}
              {project &&
              project.status !== "quotation_pending" &&
              project.status !== "grant_access_quotation" ? (
                <button
                  type="button"
                  onClick={handleSaveQuotationDocument}
                  disabled={savingDocument || !projectId}
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
              ) : null}

              {/* If the bucket has no quotation PDF yet (e.g. the admin
                  navigated here directly without going through overview's
                  Generate Quotation), surface a CTA that runs the same
                  save-generated flow from this page. */}
              {quotationMissing ? (
                <button
                  type="button"
                  onClick={handleGenerateQuotationFromPage}
                  disabled={generatingQuotation || !projectId}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: ACCENT }}
                >
                  {generatingQuotation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FilePlus2 className="h-4 w-4" />
                      Generate Quotation
                    </>
                  )}
                </button>
              ) : null}

              {/* Notify Client is available while we're still waiting on the
                  client to sign — that includes both quotation_pending (admin
                  is reviewing) and grant_access_quotation (client can now
                  sign). Hidden once the client has signed. */}
              {project?.status === "quotation_pending" ||
              project?.status === "grant_access_quotation" ? (
                <button
                  type="button"
                  onClick={handleNotifyClient}
                  disabled={notifyingClient || !projectId}
                  className={`${quotationMissing ? "mt-2" : "mt-5"} inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/25`}
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
              ) : null}

              {/* Grant Access — sits below Notify Client. Only shown while
                  the project is still in quotation_pending; clicking it
                  advances status to grant_access_quotation and unlocks the
                  client's sign-quotation flow. */}
              {project?.status === "quotation_pending" ? (
                <button
                  type="button"
                  onClick={handleGrantAccess}
                  disabled={grantingAccess || !projectId}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 text-[13px] font-semibold text-amber-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:border-amber-400/50 dark:hover:bg-amber-500/25"
                >
                  {grantingAccess ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Granting access...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      Grant Access to Sign
                    </>
                  )}
                </button>
              ) : null}

              {/* Once access has been granted, surface a small acknowledgment
                  so the manager knows the client can sign. */}
              {project?.status === "grant_access_quotation" ? (
                <div className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Check className="h-4 w-4" />
                  Client can now sign this quotation
                </div>
              ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          {/* Cancel Project — destructive. Only available while the client
              hasn't signed yet (quotation_pending / grant_access_quotation).
              Once they sign there's a downpayment / contract trail and this
              should not be a one-click action anymore. */}
          {project &&
          (project.status === "quotation_pending" ||
            project.status === "grant_access_quotation") ? (
            <button
              type="button"
              onClick={() => {
                setCancelInput("");
                setCancelOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-[13px] font-semibold text-red-700 transition duration-150 hover:border-red-300 hover:bg-red-100 active:scale-95 dark:border-red-500/35 dark:bg-red-500/15 dark:text-red-300 dark:hover:border-red-400/50 dark:hover:bg-red-500/25"
            >
              <Trash2 className="h-4 w-4" />
              Cancel Project
            </button>
          ) : (
            <span />
          )}

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

        <Dialog
          open={cancelOpen}
          onOpenChange={(open) => {
            // Block close while the delete request is in flight.
            if (cancelling) return;
            setCancelOpen(open);
            if (!open) setCancelInput("");
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-700 dark:text-red-400">
                Cancel and delete this project?
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-[13px] text-slate-700 dark:text-slate-300">
              <p>
                This will{" "}
                <span className="font-semibold text-red-700 dark:text-red-400">
                  permanently delete the entire project
                </span>{" "}
                — wizard data, schedule, employee assignments, materials,
                quotation PDF, and all uploaded documents in the storage
                bucket. This cannot be undone.
              </p>

              <p>
                To confirm, type the project code{" "}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {project?.project_code ?? "—"}
                </span>{" "}
                below:
              </p>

              <input
                type="text"
                autoFocus
                value={cancelInput}
                onChange={(e) => setCancelInput(e.target.value)}
                placeholder="Type project code"
                disabled={cancelling}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (cancelling) return;
                  setCancelOpen(false);
                  setCancelInput("");
                }}
                disabled={cancelling}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Keep project
              </button>

              <button
                type="button"
                onClick={handleCancelProject}
                disabled={
                  cancelling ||
                  !project?.project_code ||
                  cancelInput.trim() !== project.project_code.trim()
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete project
                  </>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
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