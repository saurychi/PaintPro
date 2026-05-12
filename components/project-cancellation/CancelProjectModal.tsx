"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  projectId: string;
  projectCode: string | null;
  projectStatus: string | null;
  // Optional: only used to skip the settlement preview fetch entirely. If
  // omitted, the modal still renders the destructive flow correctly.
  downpayment?: number | null;
  onClose: () => void;
  // Fired after a successful cancel/delete. Parent decides what to do
  // (refresh list, redirect, etc.).
  onDone: (result: {
    mode: "delete" | "cancel";
    projectId: string;
  }) => void;
};

type SettlementPreview = {
  earnedCost: number;
  earnedRevenue: number;
  downpayment: number;
  balance: number;
  completedSubtaskCount: number;
  completedMainTaskCount: number;
};

// Statuses where hard-delete is still the right thing — must mirror
// PRE_CLIENT_STATUSES in lib/planning/projectCancellation.ts.
const HARD_DELETE_STATUSES = new Set([
  "main_task_pending",
  "sub_task_pending",
  "materials_pending",
  "equipment_pending",
  "schedule_pending",
  "employee_assignment_pending",
  "cost_estimation_pending",
  "overview_pending",
  "quotation_pending",
]);

function aud(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function CancelProjectModal({
  open,
  projectId,
  projectCode,
  projectStatus,
  onClose,
  onDone,
}: Props) {
  const mode: "delete" | "cancel" = useMemo(() => {
    const normalized = String(projectStatus ?? "").trim().toLowerCase();
    return HARD_DELETE_STATUSES.has(normalized) ? "delete" : "cancel";
  }, [projectStatus]);

  const [stage, setStage] = useState<"form" | "confirm">("form");
  const [codeInput, setCodeInput] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStage("form");
      setCodeInput("");
      setNote("");
      setSubmitting(false);
      setPreview(null);
      setPreviewError(null);
      return;
    }

    if (mode !== "cancel") return;
    if (!projectId) return;

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    fetch(
      `/api/planning/cancellationPreview?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load settlement preview.",
          );
          return;
        }
        setPreview(data.settlement as SettlementPreview);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err?.message ?? "Failed to load settlement preview.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, projectId]);

  const codeMatches =
    Boolean(projectCode?.trim()) &&
    codeInput.trim() === projectCode!.trim();

  async function handleSubmit() {
    if (!codeMatches || submitting) return;

    try {
      setSubmitting(true);

      if (mode === "delete") {
        const res = await fetch("/api/planning/deleteProject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            projectCode: codeInput.trim(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            [data?.error, data?.details, data?.hint]
              .filter(Boolean)
              .join(" — ") || "Failed to delete project.",
          );
        }
        toast.success("Project deleted.");
      } else {
        const res = await fetch("/api/planning/cancelProject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            projectCode: codeInput.trim(),
            note: note.trim(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            [data?.error, data?.details, data?.hint]
              .filter(Boolean)
              .join(" — ") || "Failed to cancel project.",
          );
        }
        toast.success("Project cancelled.");

        // Best-effort client notification — don't fail the cancel if this
        // errors. The cancel itself is already committed.
        fetch("/api/planning/notifyProjectCancelled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        }).catch(() => {});
      }

      onDone({ mode, projectId });
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel project.");
      setSubmitting(false);
    }
  }

  const verb = mode === "delete" ? "delete" : "cancel";
  const headerLabel =
    stage === "form"
      ? mode === "delete"
        ? "Delete this project?"
        : "Cancel this project?"
      : "Are you absolutely sure?";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) onClose();
      }}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-md border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="h-1 w-full bg-rose-500" aria-hidden />

        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
                {mode === "delete" ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </span>
              {headerLabel}
            </DialogTitle>
          </DialogHeader>
        </div>

        {stage === "form" ? (
          <div className="space-y-3 px-5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
            {mode === "delete" ? (
              <p>
                This will{" "}
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  permanently delete the entire project
                </span>
                , including wizard data, schedule, employee assignments,
                materials, and any uploaded documents. This action cannot be
                undone.
              </p>
            ) : (
              <>
                <p>
                  The project will be marked as{" "}
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    cancelled
                  </span>
                  . Signed documents and history are preserved for audit. The
                  client will be notified.
                </p>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Settlement preview
                  </div>
                  {previewLoading ? (
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Calculating…
                    </div>
                  ) : previewError ? (
                    <div className="mt-1 text-[12px] text-rose-600 dark:text-rose-300">
                      {previewError}
                    </div>
                  ) : preview ? (
                    <div className="mt-1 space-y-0.5 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">
                          Earned ({preview.completedSubtaskCount} subtask
                          {preview.completedSubtaskCount === 1 ? "" : "s"})
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {aud(preview.earnedRevenue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">
                          Downpayment collected
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {aud(preview.downpayment)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-200 pt-1 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400">
                          {preview.balance > 0
                            ? "Refund to client"
                            : preview.balance < 0
                              ? "Bill client"
                              : "Settled"}
                        </span>
                        <span
                          className={[
                            "font-semibold",
                            preview.balance > 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : preview.balance < 0
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-slate-900 dark:text-slate-100",
                          ].join(" ")}>
                          {aud(Math.abs(preview.balance))}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Admin-only note. Goes onto projects.notes (prefixed
                    with the cancel date), not into any client-facing
                    message — keep details candid. */}
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Note (optional, saved to project notes)
                  </span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Client paused project — may resume Q3"
                    disabled={submitting}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </>
            )}

            <p>
              To confirm, type the project code{" "}
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                {projectCode ?? "(no code)"}
              </span>{" "}
              below:
            </p>

            <input
              type="text"
              autoFocus
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Type project code"
              disabled={submitting}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        ) : (
          <div className="space-y-3 px-5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
            <p>
              You are about to {verb}{" "}
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                {projectCode ?? "(no code)"}
              </span>
              .
            </p>
            <p className="text-rose-700 dark:text-rose-400">
              {mode === "delete"
                ? "Once you confirm, the project and all of its files will be permanently removed."
                : "Once you confirm, the project status flips to cancelled and the client is notified."}
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          {stage === "form" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                Keep project
              </button>
              <button
                type="button"
                onClick={() => setStage("confirm")}
                disabled={!codeMatches}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-rose-500 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                {mode === "delete" ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setStage("form");
                }}
                disabled={submitting}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                Go back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !codeMatches}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-rose-500 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "delete" ? "Deleting…" : "Cancelling…"}
                  </>
                ) : (
                  <>
                    {mode === "delete" ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {mode === "delete"
                      ? "Yes, delete project"
                      : "Yes, cancel project"}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
