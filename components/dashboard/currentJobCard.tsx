"use client";

import { memo } from "react";
import { AlertTriangle, Copy, Plus } from "lucide-react";
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
  // Resets the workday to "today" — if a simulated reference time is set
  // (admin/settings), the parent should pass that instead of the real
  // wall clock so the button matches the dashboard's notion of "now".
  onJumpToToday?: () => void;
  // The parent's notion of "today" (real or simulated) formatted the
  // same way as `selectedDate`. When the workday already matches this
  // value the Today button is disabled; otherwise it renders as a
  // green call-to-action.
  todayDate?: string;
  onProjectChange?: (projectId: string) => void;
  onCreateJob?: () => void;
  // When provided, renders a red Cancel button next to Create Project
  // that lets the admin cancel the currently-selected project. The
  // dashboard only passes this callback when the project's status is
  // mid-lifecycle (post-quotation-signing, pre-completion).
  onCancelProject?: () => void;
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
  onJumpToToday,
  todayDate,
  onProjectChange,
  onCreateJob,
  onCancelProject,
}: CurrentJobProps) {
  const hasMultipleProjects = projects.length >= 2;
  const hasAction = Boolean(onCreateJob);
  // Already-on-today only when the parent told us what "today" is AND
  // the selected workday matches it exactly. Without `todayDate` we
  // can't know, so fall back to "not on today" so the button stays
  // green and active rather than misleadingly disabled.
  const isOnToday = Boolean(todayDate) && selectedDate === todayDate;

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
          // Column count must equal (headers rendered) = (values rendered)
          // per row, otherwise CSS grid auto-flow wraps the first value
          // into the leftover header-row slot and shifts everything by
          // one. Mapping below:
          //   1 project, no action  → 4 (Current/Code/Name/Workday)
          //   1 project + action    → 5 (+ Action)
          //   2+ projects, no action → 5 (+ Project dropdown)
          //   2+ projects + action  → 6 (+ Project dropdown + Action)
          hasMultipleProjects
            ? hasAction
              ? // Action column is sized to its content (Cancel + Create
                // Project buttons ≈ 220-260px). The freed percentage goes
                // to the project name so the action area no longer has a
                // visible gap on its left.
                "lg:grid-cols-[10%_12%_minmax(0,1fr)_15%_minmax(0,20%)_minmax(220px,max-content)]"
              : "lg:grid-cols-[10%_12%_minmax(0,36%)_15%_minmax(0,27%)]"
            : hasAction
              ? "lg:grid-cols-[10%_12%_minmax(0,1fr)_17%_minmax(220px,max-content)]"
              : "lg:grid-cols-[10%_12%_minmax(0,1fr)_17%]",
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
          <div className="hidden truncate text-[9px] font-medium uppercase tracking-[0.12em] text-gray-400 lg:block lg:text-right">
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
          <div className="flex items-center gap-1.5">
            {onJumpToToday ? (
              <button
                type="button"
                onClick={onJumpToToday}
                disabled={isOnToday}
                title={isOnToday ? "Already on today" : "Jump to today"}
                aria-pressed={isOnToday}
                className={
                  isOnToday
                    ? "inline-flex h-8 shrink-0 cursor-not-allowed items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-2 text-[11px] font-semibold text-gray-400"
                    : "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[#00c065] bg-[#00c065] px-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]"
                }
              >
                Today
              </button>
            ) : null}
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => onDateChange(event.target.value)}
              className="h-8 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2.5 text-[12px] text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100"
            />
          </div>
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
          <div className="flex min-w-0 items-center gap-2 self-start lg:justify-end">
            {onCancelProject ? (
              <button
                type="button"
                onClick={onCancelProject}
                title="Cancel selected project"
                aria-label="Cancel selected project"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-rose-500 px-2.5 text-[11px] font-semibold text-white shadow-sm ring-1 ring-rose-600/20 transition hover:bg-rose-600 active:scale-[0.98]">
                <AlertTriangle className="h-3.5 w-3.5" />
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCreateJob}
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#00c065] px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] lg:max-w-[135px]"
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
