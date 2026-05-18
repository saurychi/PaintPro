"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Dedicated page for the post-cancellation "Document" wrap-up step.
// Mirrors /admin/projects/invoice-generation: preview on the left,
// project + settlement details on the right, primary action button at
// the bottom of the right column. Replaces the old in-modal flow that
// used to live behind the cancellation step button on the dashboard.

type ProjectOverviewResponse = {
  project: {
    project_id: string;
    project_code: string | null;
    title: string | null;
    description: string | null;
    site_address: string | null;
    status: string | null;
    cancellation_phase: string | null;
    estimated_budget: number | null;
    estimated_cost: number | null;
    estimated_profit: number | null;
    downpayment: number | null;
  };
};

type AgreementStatusResponse = {
  documentStatus?: string;
  signedAt?: string | null;
  signedName?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
};

type SettlementResponse = {
  settlement?: {
    earnedRevenue?: number | null;
    earnedCost?: number | null;
    balance?: number | null;
  };
};

// Tracked internally as a 3-state for the action button logic, but the
// pill displays only "Signed" vs "Not yet Signed" — matches the
// quotation page's pattern of pending-vs-approved.
type StatusType = "Not yet Sent" | "Sent" | "Signed";
type DisplayStatus = "Signed" | "Not yet Signed";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deriveAgreementStatus(documentStatus: string | null | undefined): StatusType {
  const normalized = String(documentStatus ?? "").toLowerCase();
  if (normalized === "signed") return "Signed";
  if (normalized === "sent" || normalized === "generated") return "Sent";
  return "Not yet Sent";
}

export default function CancellationAgreementGeneration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [project, setProject] = useState<
    ProjectOverviewResponse["project"] | null
  >(null);
  const [agreementStatus, setAgreementStatus] = useState<StatusType>(
    "Not yet Sent",
  );
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signedName, setSignedName] = useState<string | null>(null);
  // `documentExists` reflects whether the project_documents row has a
  // generated PDF in storage. `agreementStatus === "missing"` (no row at
  // all) and rows without a `storage_path` both count as "not generated yet"
  // — those are the cases where the iframe has nothing real to show and the
  // page should surface a Generate CTA instead.
  const [documentExists, setDocumentExists] = useState(false);
  const [settlement, setSettlement] = useState<
    SettlementResponse["settlement"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // Auto-generation runs once per page session: if the project lands here
  // without a PDF in storage we fire save-generated immediately so the
  // admin sees the rendered preview (with their pre-applied signature)
  // without having to click the manual button.
  const autoGenerateAttemptedRef = useRef(false);
  // Cache-buster appended to the iframe src. Bumped on every manual
  // refresh and whenever polling detects a client signature so the PDF
  // viewer reloads the freshly-uploaded file from storage instead of
  // showing whatever the iframe already rendered.
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

  const displayStatus: DisplayStatus =
    agreementStatus === "Signed" ? "Signed" : "Not yet Signed";

  const loadAll = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        if (mode === "refresh") setRefreshing(true);
        else setLoading(true);

        const [overviewRes, statusRes, previewRes] = await Promise.all([
          fetch(
            `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/planning/cancellationAgreementStatus?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/planning/cancellationPreview?projectId=${encodeURIComponent(
              projectId,
            )}`,
            { cache: "no-store" },
          ),
        ]);

        if (overviewRes.ok) {
          const data = (await overviewRes.json()) as ProjectOverviewResponse;
          setProject(data.project ?? null);
        }

        if (statusRes.ok) {
          const data = (await statusRes.json()) as AgreementStatusResponse;
          const nextStatus = deriveAgreementStatus(data.documentStatus);
          // Detect a Sent → Signed flip so the iframe gets a forced
          // reload the moment polling picks up the client's signature,
          // instead of relying on the cache key derivation alone.
          setAgreementStatus((prev) => {
            if (prev !== "Signed" && nextStatus === "Signed") {
              setPreviewVersion((v) => v + 1);
            }
            return nextStatus;
          });
          setSignedAt(data.signedAt ?? null);
          setSignedName(data.signedName ?? null);
          // No row in project_documents (missing) OR a row that hasn't
          // been pushed to storage yet (no storage_path) both mean
          // "nothing generated" from the admin's perspective.
          setDocumentExists(
            data.documentStatus !== "missing" &&
              Boolean(data.storagePath),
          );
        }

        if (previewRes.ok) {
          const data = (await previewRes.json()) as SettlementResponse;
          setSettlement(data.settlement ?? null);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load cancellation agreement data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadAll("initial");
  }, [loadAll]);

  // Light polling so an admin who leaves this page open while the client
  // signs in another tab/window sees the status flip without manual refresh.
  useEffect(() => {
    if (!projectId) return;
    if (agreementStatus === "Signed") return;
    const interval = window.setInterval(() => {
      void loadAll("refresh");
    }, 8000);
    return () => window.clearInterval(interval);
  }, [projectId, agreementStatus, loadAll]);

  const handleGenerate = useCallback(
    async (mode: "auto" | "manual" = "manual") => {
      if (!projectId || generating) return;

      try {
        setGenerating(true);

        const response = await fetch(
          "/api/cancellation-agreement/save-generated",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to generate cancellation agreement.",
          );
        }

        setDocumentExists(true);
        if (mode === "manual") {
          toast.success("Cancellation agreement generated.", {
            description: "PDF saved and the client has been notified.",
          });
        }

        // Re-read status so the badge / signed-by panel reflect the
        // new project_documents row instead of "missing".
        await loadAll("refresh");

        // Notify the client right after the PDF lands. Fire-and-forget:
        // a failed message ping shouldn't undo the generation, and the
        // status badge / Advance button still drive the rest of the
        // flow. Runs for both auto and manual generates because the
        // auto path only fires on first mount (gated by documentExists
        // + autoGenerateAttemptedRef), so it's not a re-spam vector.
        fetch("/api/planning/notifyCancellationAgreement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        })
          .then(() => setAgreementStatus("Sent"))
          .catch(() => {});
      } catch (error: any) {
        // Don't toast on the silent auto-generate path — the admin
        // didn't ask for it. The manual button still surfaces errors.
        if (mode === "manual") {
          toast.error(
            error?.message || "Failed to generate cancellation agreement.",
          );
        } else {
          console.error("Auto-generate cancellation agreement failed:", error);
        }
      } finally {
        setGenerating(false);
      }
    },
    [projectId, generating, loadAll],
  );

  // Auto-generate the PDF the first time the page settles into a "no
  // document yet" state. Runs once per page session — even if the admin
  // refreshes manually we don't re-trigger it (the manual Generate
  // button is right there if they want a fresh render).
  useEffect(() => {
    if (loading) return;
    if (generating) return;
    if (documentExists) return;
    if (!projectId) return;
    if (autoGenerateAttemptedRef.current) return;
    autoGenerateAttemptedRef.current = true;
    void handleGenerate("auto");
  }, [loading, generating, documentExists, projectId, handleGenerate]);

  async function handleAdvanceToPayment() {
    if (!projectId || advancing) return;
    if (agreementStatus !== "Signed") return;

    try {
      setAdvancing(true);

      const response = await fetch(
        "/api/planning/advanceCancellationPhase",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            fromPhase: "document",
            toPhase: "payment",
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to advance cancellation phase.",
        );
      }

      toast.success("Advanced to payment management.");
      // Land on the dashboard with the cancelled project pre-selected
      // and the cancellation settlement modal popped open — same UX as
      // the quotation page's Proceed to Downpayment button (?projectId
      // snaps the workday + selection; ?openCancellationPayment tells
      // the JobProgressCard to surface the modal once the phase
      // matches).
      const id = encodeURIComponent(projectId);
      router.push(`/admin?projectId=${id}&openCancellationPayment=${id}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to advance.");
    } finally {
      setAdvancing(false);
    }
  }

  function handleGoBack() {
    if (isGoingBack || !projectId) return;
    setIsGoingBack(true);
    router.push(`/admin?projectId=${encodeURIComponent(projectId)}`);
  }

  // Stream the saved PDF from storage so the iframe renders through the
  // browser's built-in PDF viewer (zoom, rotate, page nav, dark mode,
  // print). Same `from-bucket` pattern the quotation client preview
  // already uses. The hash hints (`#navpanes=0&zoom=95&toolbar=1`) collapse
  // the side rail and force the toolbar visible. We also append a
  // cache-buster keyed on `documentExists` and the signed timestamp so
  // the iframe reloads when the underlying file changes (auto-generate
  // landed, client just signed, admin re-generated, etc.).
  const previewCacheKey = `${signedAt ?? ""}|${agreementStatus}|${previewVersion}`;
  const previewSrc =
    projectId && documentExists
      ? `/api/cancellation-agreement/from-bucket?projectId=${encodeURIComponent(
          projectId,
        )}&t=${encodeURIComponent(previewCacheKey)}#navpanes=0&zoom=95&toolbar=1`
      : "";

  const balance = settlement?.balance ?? null;
  const earnedRevenue = settlement?.earnedRevenue ?? null;
  const earnedCost = settlement?.earnedCost ?? null;

  // Once the project advances past the document phase (i.e. into payment,
  // employee, conclude, or done), this page has nothing left to do here —
  // the admin should be on the dashboard managing the next cancellation
  // step. Show a compact "you're done" view with one button instead of
  // the full preview + sidebar UI.
  const phasesPastDocument: ReadonlySet<string> = new Set([
    "payment",
    "employee",
    "conclude",
    "done",
  ]);
  const isPastDocumentPhase =
    !!project?.cancellation_phase &&
    phasesPastDocument.has(project.cancellation_phase);

  function handleGoToDashboard() {
    if (!projectId) {
      router.push("/admin");
      return;
    }
    router.push(`/admin?projectId=${encodeURIComponent(projectId)}`);
  }

  if (!loading && isPastDocumentPhase) {
    return (
      <div className="h-screen w-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex h-full items-center justify-center px-6">
          <div className="w-full max-w-md overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="h-1 w-full bg-[#00c065]" aria-hidden />
            <div className="px-6 py-6 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] dark:bg-[#00c065]/15 dark:text-emerald-300">
                <Check className="h-5 w-5" />
              </span>
              <h1 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Cancellation agreement complete
              </h1>
              <p className="mt-2 text-[13px] leading-5 text-slate-600 dark:text-slate-300">
                This project has moved on to the next cancellation step.
                Continue from the dashboard.
              </p>
              <button
                type="button"
                onClick={handleGoToDashboard}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md active:translate-y-0"
                style={{ backgroundColor: "#00c065" }}
              >
                <ArrowRight className="h-4 w-4" />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <span>Cancellation Agreement</span>
          </div>

          <div
            className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold ${
              displayStatus === "Signed"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300"
            }`}
            aria-label="Cancellation agreement status"
          >
            {displayStatus}
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
                        Loading cancellation agreement preview...
                      </div>
                    </div>
                  </div>
                ) : !projectId ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
                    Missing project ID.
                  </div>
                ) : !documentExists ? (
                  // Slim placeholder while save-generated is in flight or
                  // hasn't been run yet — keeps the preview area focused
                  // on the document. The Generate CTA lives in the
                  // sidebar so there's only one action surface at a time.
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70">
                    <div className="text-center">
                      {generating ? (
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
                      ) : (
                        <FileText className="mx-auto h-5 w-5 text-slate-400 dark:text-slate-500" />
                      )}
                      <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                        {generating
                          ? "Generating cancellation agreement..."
                          : "No cancellation agreement yet — click Generate to render."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                    <iframe
                      key={previewSrc}
                      src={previewSrc}
                      title="Cancellation Agreement Preview"
                      scrolling="yes"
                      className="cancellation-agreement-preview-frame block h-full w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-4">
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  Cancellation Details
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewVersion((v) => v + 1);
                    void loadAll("refresh");
                  }}
                  disabled={refreshing || loading}
                  title="Refresh cancellation details"
                  aria-label="Refresh cancellation details"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
                  <RefreshCw
                    className={[
                      "h-3.5 w-3.5",
                      refreshing || loading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                </button>
              </div>

              {loading ? (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
                    <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                      Loading cancellation details...
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
                        {typeof balance === "number" && balance > 0
                          ? "Refund to Client"
                          : typeof balance === "number" && balance < 0
                            ? "Bill Client"
                            : "Settlement"}
                      </div>
                      <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                        {typeof balance === "number"
                          ? formatCurrency(Math.abs(balance))
                          : "—"}
                      </div>
                    </div>

                    {agreementStatus === "Signed" && (signedName || signedAt) ? (
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">
                          Signed By
                        </div>
                        <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                          {signedName ?? "Client"}
                          {formatDateTime(signedAt)
                            ? ` · ${formatDateTime(signedAt)}`
                            : ""}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Single CTA at any given moment so the admin has one
                      obvious next step. Gates on whether the PDF exists
                      in storage and whether it's been signed yet. */}
                  {!documentExists ? (
                    <button
                      type="button"
                      onClick={() => handleGenerate("manual")}
                      disabled={generating || !projectId}
                      className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ backgroundColor: "#00c065" }}
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Generate Cancellation Agreement
                        </>
                      )}
                    </button>
                  ) : agreementStatus === "Signed" ? (
                    <button
                      type="button"
                      onClick={handleAdvanceToPayment}
                      disabled={advancing || !projectId}
                      className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-[#00c065] text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {advancing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Advancing...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4" />
                          Advance to Payment Management
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Check className="h-4 w-4" />
                      Awaiting client signature
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
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

      {/* Blocking overlay while the PDF is being generated. Whether the
          admin clicked Generate manually or the page auto-fired it on
          mount, the wait can take a couple of seconds (Playwright spin
          up + render + upload), so we surface a clear modal instead of
          leaving the admin staring at the placeholder. Non-dismissible
          by design — there's no useful action to take mid-generation. */}
      {generating ? (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-[1px] dark:bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="h-1 w-full bg-[#00c065]" aria-hidden />
            <div className="flex items-start gap-3 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] dark:bg-[#00c065]/15 dark:text-emerald-300">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  Generating cancellation agreement document
                </div>
                <div className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                  Rendering the PDF and uploading it to storage. This usually
                  takes a few seconds — please don't close this page.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Match the quotation preview iframe — overflow lock to kill
          horizontal scrollbars and the same green PaintPro accent on
          the vertical scrollbar so the two pages look identical. */}
      <style jsx global>{`
        .cancellation-agreement-preview-frame {
          overflow-x: hidden;
          overflow-y: auto;
          scrollbar-width: thin;
        }

        .cancellation-agreement-preview-frame::-webkit-scrollbar {
          width: 10px;
          height: 0;
        }

        .cancellation-agreement-preview-frame::-webkit-scrollbar-track {
          background: #eaf7e4;
        }

        .dark .cancellation-agreement-preview-frame::-webkit-scrollbar-track {
          background: #0f172a;
        }

        .cancellation-agreement-preview-frame::-webkit-scrollbar-thumb {
          background: #00c065;
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }

        .dark .cancellation-agreement-preview-frame::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }
      `}</style>
    </div>
  );
}
