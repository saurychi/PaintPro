"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

type PendingQuotationProject = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  description: string | null;
  site_address: string | null;
  status: string | null;
  estimated_budget: number | null;
  estimated_cost: number | null;
  estimated_profit: number | null;
  created_at: string | null;
  updated_at: string | null;
  client_id: string | null;
  clients?:
    | {
        client_id: string | null;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | null;
};

type PendingQuotationsResponse = {
  projects?: PendingQuotationProject[];
  error?: string;
  details?: string;
};

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getClientName(project: PendingQuotationProject) {
  return project.clients?.full_name?.trim() || "No client name";
}

function getProjectTitle(project: PendingQuotationProject) {
  return project.title?.trim() || "Untitled Project";
}

function getProjectCode(project: PendingQuotationProject) {
  return project.project_code?.trim() || "No project code";
}

export default function AdminPendingDocumentsPage() {
  const [projects, setProjects] = useState<PendingQuotationProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState("");

  const selectedProject = useMemo(() => {
    return (
      projects.find((project) => project.project_id === selectedProjectId) ??
      projects[0] ??
      null
    );
  }, [projects, selectedProjectId]);

  const selectedProjectSafeId = selectedProject?.project_id ?? "";

  const filteredProjects = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return projects;

    return projects.filter((project) => {
      const text = [
        project.title,
        project.project_code,
        project.site_address,
        project.clients?.full_name,
        project.clients?.email,
        project.clients?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });
  }, [projects, query]);

  const previewSrc = useMemo(() => {
    if (!selectedProjectSafeId) return "";

    return `/api/quotation/html?projectId=${encodeURIComponent(
      selectedProjectSafeId,
    )}`;
  }, [selectedProjectSafeId]);

  async function loadPendingQuotations() {
    try {
      setLoading(true);

      const response = await fetch("/api/documents/getPendingQuotations", {
        cache: "no-store",
      });

      const data = (await response.json()) as PendingQuotationsResponse;

      if (!response.ok) {
        throw new Error(
          [data.error, data.details].filter(Boolean).join(": ") ||
            "Failed to load pending quotations.",
        );
      }

      const nextProjects = data.projects ?? [];

      setProjects(nextProjects);

      setSelectedProjectId((current) => {
        if (
          current &&
          nextProjects.some((project) => project.project_id === current)
        ) {
          return current;
        }

        return nextProjects[0]?.project_id ?? "";
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load pending quotations.";

      console.error(error);

      toast.error("Could not load pending quotations", {
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPendingQuotations();
  }, []);

  async function downloadQuotationPdf() {
    if (!selectedProjectSafeId || downloading) return;

    try {
      setDownloading(true);

      const response = await fetch(
        `/api/quotation/pdf?projectId=${encodeURIComponent(
          selectedProjectSafeId,
        )}&download=1`,
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
      anchor.download = `quotation-${selectedProjectSafeId}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to download quotation PDF.";

      console.error(error);

      toast.error("Download failed", {
        description: message,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-gray-50 p-6">
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-1 w-full rounded-t-xl bg-[#00c065]" />

        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100">
                <FileText className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-gray-900">
                  Pending Quotations
                </h1>
                <p className="mt-0.5 text-xs text-gray-500">
                  Review quotation documents waiting for client approval.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {projects.length} pending
            </span>

            <button
              type="button"
              onClick={loadPendingQuotations}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>

            <button
              type="button"
              onClick={downloadQuotationPdf}
              disabled={!selectedProjectSafeId || downloading || loading}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download PDF
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-12 gap-4 overflow-hidden">
        <aside className="col-span-12 min-h-0 overflow-hidden lg:col-span-4 xl:col-span-3">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-100 px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search project or client..."
                  className="h-10 w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 animate-pulse rounded-lg bg-gray-100"
                    />
                  ))}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500">
                  No pending quotations found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProjects.map((project) => {
                    const isSelected =
                      selectedProject?.project_id === project.project_id;

                    return (
                      <button
                        key={project.project_id}
                        type="button"
                        onClick={() =>
                          setSelectedProjectId(project.project_id)
                        }
                        className={[
                          "w-full rounded-lg border px-3 py-3 text-left transition",
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/70"
                            : "border-gray-200 bg-white hover:border-emerald-100 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {getProjectTitle(project)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {getProjectCode(project)}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                            Pending
                          </span>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-gray-500">
                          <p className="truncate">
                            Client:{" "}
                            <span className="font-medium text-gray-700">
                              {getClientName(project)}
                            </span>
                          </p>

                          <p className="truncate">
                            Updated: {formatDate(project.updated_at)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="col-span-12 min-h-0 overflow-hidden lg:col-span-8 xl:col-span-9">
          <div className="grid h-full min-h-0 grid-cols-12 gap-4 overflow-hidden">
            <section className="col-span-12 min-h-0 overflow-hidden xl:col-span-8">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Quotation Preview
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Preview of the selected pending quotation.
                  </p>
                </div>

                <div className="min-h-0 flex-1 p-4">
                  {loading ? (
                    <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                      <div className="text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                        <p className="mt-2 text-xs text-gray-500">
                          Loading quotation preview...
                        </p>
                      </div>
                    </div>
                  ) : !selectedProjectSafeId ? (
                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500">
                      Select a pending quotation to preview.
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
            </section>

            <section className="col-span-12 min-h-0 overflow-hidden xl:col-span-4">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="h-1 w-full shrink-0 bg-[#00c065]" />

                <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Project Details
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Selected quotation summary.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  {!selectedProject ? (
                    <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500">
                      No quotation selected.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="text-[11px] font-medium text-gray-500">
                          Project
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {getProjectTitle(selectedProject)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="text-[11px] font-medium text-gray-500">
                          Project Code
                        </p>
                        <p className="mt-1 font-mono text-sm font-semibold text-gray-900">
                          {getProjectCode(selectedProject)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="text-[11px] font-medium text-gray-500">
                          Client
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {getClientName(selectedProject)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {selectedProject.clients?.email || "No email"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="text-[11px] font-medium text-gray-500">
                          Site Address
                        </p>
                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {selectedProject.site_address ||
                            "No address provided"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                        <p className="text-xs font-semibold text-amber-800">
                          Waiting for client approval
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-700">
                          This quotation is still pending. Once the client
                          approves it, the project status should become ready to
                          start.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="rounded-lg border border-gray-100 bg-white px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            Estimated Budget
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatCurrency(
                              selectedProject.estimated_budget,
                            )}
                          </p>
                        </div>

                        <div className="rounded-lg border border-gray-100 bg-white px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            Estimated Cost
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatCurrency(selectedProject.estimated_cost)}
                          </p>
                        </div>

                        <div className="rounded-lg border border-gray-100 bg-white px-3 py-3">
                          <p className="text-[11px] font-medium text-gray-500">
                            Estimated Profit
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatCurrency(
                              selectedProject.estimated_profit,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
