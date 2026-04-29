"use client";

import { memo, useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Loader2 } from "lucide-react";

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
  className = "",
}: Props) {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement | null>(null);

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

    return source.filter((project) => project.status === "quotation_pending");
  }, [projects, selectedProject]);

  const isMini = mode === "mini";
  const isCompact = mode === "compact" || mode === "mini";

  function openQuotation(projectId: string) {
    router.push(
      `/admin/job-creation/quotation-generation?projectId=${projectId}`,
    );
  }

  return (
    <section
      ref={sectionRef}
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
        className,
      ].join(" ")}>
      <div className="h-1 w-full shrink-0 bg-[#00c065]" />

      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-gray-900">
              {title}
            </h3>

            {!isMini ? (
              <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                {pendingProjects.length} quotation signature
                {pendingProjects.length === 1 ? "" : "s"} pending
              </p>
            ) : null}
          </div>

          {loading ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400" />
          ) : pendingProjects.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Needs signature
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={[
              "flex h-full min-h-0 flex-1 items-center overflow-y-auto",
              isCompact ? "px-4 py-3" : "px-4 py-4",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar-track]:bg-transparent",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
              "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
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
                    className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 border-b border-gray-100 px-0 py-2.5 last:border-b-0">
                    <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
                    <div className="h-7 animate-pulse rounded-full bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : pendingProjects.length === 0 ? (
              <div className="flex h-full min-h-20 items-center justify-center px-3 text-center text-xs text-gray-500">
                No pending documents.
              </div>
            ) : (
              <div className="w-full">
                {pendingProjects.slice(0, 1).map((project) => {
                  return (
                    <div
                      key={project.project_id}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={[
                            "flex shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-600",
                            isCompact ? "h-8 w-8" : "h-9 w-9",
                          ].join(" ")}>
                          <FileText className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={[
                              "truncate font-semibold text-gray-900",
                              isCompact ? "text-[13px]" : "text-sm",
                            ].join(" ")}>
                            Quotation signature
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openQuotation(project.project_id)}
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
