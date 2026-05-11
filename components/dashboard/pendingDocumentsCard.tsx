"use client";

import { memo, useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Loader2, RefreshCw } from "lucide-react";

type ProjectStatus = string;

export type PendingDocumentProject = {
  project_id: string;
  project_code?: string | null;
  title?: string | null;
  status: ProjectStatus;
  updated_at?: string | null;
  created_at?: string | null;
};

type Props = {
  title?: string;
  projects?: PendingDocumentProject[];
  selectedProject?: PendingDocumentProject | null;
  loading?: boolean;
  // When provided, renders a refresh icon button next to the title. Caller
  // is responsible for re-fetching the project data and (optionally)
  // notifying any sidebar badges that depend on the same status.
  onRefresh?: () => void | Promise<void>;
  className?: string;
};

type SizeMode = "mini" | "compact" | "normal";

function getSizeMode(width: number, height: number): SizeMode {
  if (width < 320 || height < 150) return "mini";
  if (width < 430 || height < 230) return "compact";
  return "normal";
}

function PendingDocumentsCard({
  title = "Pending Documents",
  projects = [],
  selectedProject = null,
  loading = false,
  onRefresh,
  className = "",
}: Props) {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;

      setSize({
        width: rect.width,
        height: rect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const mode = useMemo(
    () => getSizeMode(size.width, size.height),
    [size.width, size.height],
  );

  const pendingProjects = useMemo(() => {
    const source = selectedProject ? [selectedProject] : projects;

    return source.filter(
      (project) =>
        project.status === "quotation_pending" ||
        project.status === "grant_access_quotation" ||
        project.status === "invoice_agreement_pending",
    );
  }, [projects, selectedProject]);

  const isMini = mode === "mini";
  const isCompact = mode === "compact" || mode === "mini";

  function getDocumentLabel(status: ProjectStatus) {
    if (status === "invoice_agreement_pending") return "Invoice signature";
    return "Quotation signature";
  }

  function openDocument() {
    router.push(`/client/documents/pending`);
  }

  return (
    <section
      ref={sectionRef}
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900",
        className,
      ].join(" ")}>
      <div className="h-1 w-full shrink-0 bg-[#00c065]" />

      <div className="shrink-0 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">
              {title}
            </h3>

            {!isMini ? (
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                {pendingProjects.length} document signature
                {pendingProjects.length === 1 ? "" : "s"} pending
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
            ) : pendingProjects.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                Needs signature
              </span>
            ) : null}
            {onRefresh ? (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                title="Refresh pending documents"
                aria-label="Refresh pending documents"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
                <RefreshCw
                  className={[
                    "h-3.5 w-3.5",
                    refreshing || loading ? "animate-spin" : "",
                  ].join(" ")}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={[
              // `items-start` (not `items-center`) — when there's a
              // single document the row should sit at the top of the
              // body, not float in the middle of all the empty space.
              // The empty-state below has its own `items-center` so it
              // still self-centers when there's nothing to show.
              "flex h-full min-h-0 flex-1 items-start overflow-y-auto",
              isCompact ? "px-4 py-2" : "px-4 py-3",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar-track]:bg-transparent",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
              "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
              "dark:[&::-webkit-scrollbar-thumb]:bg-emerald-500/80",
              "dark:[&::-webkit-scrollbar-thumb]:hover:bg-emerald-400",
            ].join(" ")}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#10B981 transparent",
            }}>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: isMini ? 2 : 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-0 py-2.5 last:border-b-0">
                    <div className="h-10 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
                    <div className="h-7 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  </div>
                ))}
              </div>
            ) : pendingProjects.length === 0 ? (
              <div className="flex h-full min-h-20 items-center justify-center px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                No pending documents.
              </div>
            ) : (
              <div className="w-full">
                {pendingProjects.slice(0, 1).map((project) => {
                  return (
                    <div
                      key={project.project_id}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={[
                            "flex shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-600 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300",
                            isCompact ? "h-8 w-8" : "h-9 w-9",
                          ].join(" ")}>
                          <FileText className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={[
                              "truncate font-semibold text-slate-900 dark:text-slate-100",
                              isCompact ? "text-[13px]" : "text-sm",
                            ].join(" ")}>
                            {getDocumentLabel(project.status)}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={openDocument}
                          className="rounded-full bg-[#00c065] px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
                          Review
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(PendingDocumentsCard);
