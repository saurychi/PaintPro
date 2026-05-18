"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

export type DraftSummary = {
  draft_id: string;
  draft_code: string;
  project_name: string | null;
  description: string | null;
  client_full_name: string | null;
  client_email: string | null;
  site_address: string | null;
  scheduled_start_datetime: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPickDraft: (draftId: string) => Promise<void> | void;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DraftsModal({ open, onClose, onPickDraft }: Props) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch("/api/planning/listDrafts", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as {
          drafts?: DraftSummary[];
          error?: string;
        } | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(data?.error || "Failed to load drafts.");
          setDrafts([]);
        } else {
          setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load drafts.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function handlePick(draftId: string) {
    if (pickingId) return;
    setPickingId(draftId);
    try {
      await onPickDraft(draftId);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="h-1 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Saved Drafts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading drafts...
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center py-10 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : drafts.length === 0 ? (
            <div className="m-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-800/40">
              <div>
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:ring-emerald-900/50">
                  <FileText className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  No drafts saved yet
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Click "Save Draft" on the basic-details page to stash the
                  current wizard state.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {drafts.map((draft) => {
                const title = draft.project_name?.trim() || "Untitled draft";
                const subtitle = [
                  draft.client_full_name,
                  draft.site_address,
                  draft.scheduled_start_datetime
                    ? new Date(
                        draft.scheduled_start_datetime,
                      ).toLocaleDateString()
                    : null,
                ]
                  .filter(Boolean)
                  .join(" - ");
                const isPicking = pickingId === draft.draft_id;
                return (
                  <li key={draft.draft_id}>
                    <button
                      type="button"
                      onClick={() => void handlePick(draft.draft_id)}
                      disabled={isPicking}
                      className="flex w-full flex-col gap-1 rounded-md border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-[#00c065] hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-[#00c065] dark:hover:bg-emerald-950/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {title}
                        </span>
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#00a054] dark:border-[#00c065]/30 dark:bg-[#00c065]/10 dark:text-emerald-300">
                          {draft.draft_code}
                        </span>
                      </div>
                      {subtitle ? (
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {subtitle}
                        </div>
                      ) : null}
                      {draft.description ? (
                        <div className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {draft.description}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          Updated {relativeTime(draft.updated_at)}
                        </span>
                        {isPicking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00c065]" />
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
