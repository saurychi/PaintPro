"use client";

import { memo } from "react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";

export type CurrentJobOption = {
  id: string;
  title: string;
  projectCode?: string | null;
  project_code?: string | null;
};

type CurrentJobProps = {
  statusLabel: string;
  jobNo: string;
  siteName: string;
  selectedDate: string;
  projects?: CurrentJobOption[];
  selectedProjectId?: string | null;
  onDateChange: (date: string) => void;
  onProjectChange?: (projectId: string) => void;
  onCreateJob?: () => void;
};

function getProjectLabel(project: CurrentJobOption) {
  const code = project.projectCode || project.project_code || "No Code";
  return `${code} • ${project.title || "Untitled Project"}`;
}

function CurrentJobCard({
  statusLabel,
  jobNo,
  siteName,
  selectedDate,
  projects = [],
  selectedProjectId = null,
  onDateChange,
  onProjectChange,
  onCreateJob,
}: CurrentJobProps) {
  const hasMultipleProjects = projects.length >= 2;
  const hasAction = Boolean(onCreateJob);

  async function handleCopyCode() {
    if (!jobNo || jobNo === "No project code") {
      toast.warning("No project code to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(jobNo);
      toast.success("Project code copied.");
    } catch (error) {
      console.error("Failed to copy project code:", error);
      toast.error("Failed to copy project code.");
    }
  }

  return (
    <section className="grid min-h-0 grid-rows-[4px_minmax(0,1fr)] rounded-xl border border-gray-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
      <div className="bg-[#00c065]" />

      <div
        className={[
          "flex flex-col gap-3 p-4 lg:grid lg:min-h-0 lg:grid-rows-[18px_minmax(0,1fr)] lg:items-center lg:gap-x-[1.2%] lg:gap-y-0 lg:px-[1.4%] lg:py-[0.55%]",
          hasMultipleProjects
            ? hasAction
              ? "lg:grid-cols-[10%_12%_minmax(0,31%)_15%_minmax(0,20%)_10%]"
              : "lg:grid-cols-[10%_12%_minmax(0,36%)_15%_minmax(0,27%)]"
            : hasAction
              ? "lg:grid-cols-[10%_12%_minmax(0,39%)_17%_minmax(120px,14%)]"
              : "lg:grid-cols-[10%_12%_minmax(0,45%)_17%_auto]",
        ].join(" ")}
      >
        {/* Header row — hidden on mobile, shown as grid header on lg+ */}
        <div className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
          Current Job
        </div>

        <div className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
          Project Code
        </div>

        <div className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
          Project Name
        </div>

        <label className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
          Workday
        </label>

        {hasMultipleProjects ? (
          <label className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
            Project
          </label>
        ) : null}

        {hasAction && (
          <div className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block">
            Action
          </div>
        )}

        {/* Value row */}
        <div className="min-w-0 self-start">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:hidden">
            Current Job
          </p>
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium leading-4 text-emerald-700 ring-1 ring-emerald-100">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#00c065]" />
            <span className="truncate">{statusLabel}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 self-start lg:flex-row lg:items-center lg:gap-1.5">
          <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:hidden">
            Project Code
          </p>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold leading-8 text-gray-900">
              {jobNo}
            </span>

            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:border-[#00c065] hover:text-[#00c065]"
              title="Copy project code"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="min-w-0 self-start">
          <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:hidden">
            Project Name
          </p>
          <div className="truncate text-[12px] leading-8 text-gray-600">
            {siteName}
          </div>
        </div>

        <div className="min-w-0 self-start">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:hidden">
            Workday
          </p>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[12px] text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        {hasMultipleProjects ? (
          <div className="min-w-0 self-start">
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:hidden">
              Project
            </p>
            <select
              value={selectedProjectId || ""}
              onChange={(event) => onProjectChange?.(event.target.value)}
              className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[12px] text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {getProjectLabel(project)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {hasAction && (
          <div className="flex min-w-0 justify-start self-start lg:justify-end">
            <button
              type="button"
              onClick={onCreateJob}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#00c065] px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] lg:max-w-[135px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Project
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(CurrentJobCard);
