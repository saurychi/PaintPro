"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import type {
  EmployeeManagementFinishPayload,
  EmployeePerformanceRatingState,
  EmployeePerformanceRatingValue,
  EmployeeReviewItem,
  EmployeeTaskReview,
} from "@/lib/planning/employeePerformance";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";

type Props = {
  open: boolean;
  employees: EmployeeReviewItem[];
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onFinish: (payload: EmployeeManagementFinishPayload) => Promise<void> | void;
};

type SectionView = "tasks" | "rating";

const ratingColumns: Array<{ key: EmployeePerformanceRatingValue; label: string }> = [
  { key: "great", label: "Great" },
  { key: "good", label: "Good" },
  { key: "bad", label: "Bad" },
  { key: "awful", label: "Awful" },
];

const ratingRows: Array<{
  key: keyof EmployeePerformanceRatingState;
  label: string;
}> = [
  { key: "timeEfficiency", label: "Time Efficiency" },
  { key: "workQuality", label: "Work Quality" },
  { key: "teamwork", label: "Teamwork" },
  { key: "workEthic", label: "Work Ethic" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value?: number | null) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function getTaskTone(task: EmployeeTaskReview) {
  if (task.status === "done") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (task.status === "late") return "text-amber-700 bg-amber-50 border-amber-200";
  if (task.status === "missed") return "text-red-700 bg-red-50 border-red-200";
  return "text-gray-600 bg-gray-50 border-gray-200";
}

function getTaskStatusLabel(task: EmployeeTaskReview) {
  if (task.status === "done") return "Done";
  if (task.status === "late") return "Late";
  if (task.status === "missed") return "Missed";
  return "Pending";
}

export default function EmployeeManagementModal({
  open,
  employees,
  loading = false,
  saving = false,
  onClose,
  onFinish,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [rating, setRating] = useState<EmployeePerformanceRatingState>({
    timeEfficiency: "",
    workQuality: "",
    teamwork: "",
    workEthic: "",
  });
  // Single section now toggles between the task log and the rating
  // grid so the modal stays inside its own bounds without outer
  // scroll. Default to "tasks" so the admin reviews work history
  // before scoring.
  const [view, setView] = useState<SectionView>("tasks");
  // Track which employees the admin has already saved a review for in
  // this session. Without this gate, "Next" lets the admin skip past
  // unrated employees and the unrated ones never have their performance
  // recorded — yet "Finish" on the last employee still advances the
  // project as if everyone was reviewed.
  const [submittedUserIds, setSubmittedUserIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Local saving state so the "Save Review" button shows a spinner
  // while onFinish is in-flight even when the parent isn't pumping the
  // `saving` prop (e.g. the cancellation flow only flips `saving` for
  // the final phase-advance, not per-employee writes).
  const [internalSaving, setInternalSaving] = useState(false);
  const isSaving = saving || internalSaving;
  // Remember each saved rating so navigating back to a previously-
  // saved employee restores their inputs instead of dropping them.
  const [savedReviews, setSavedReviews] = useState<
    Map<string, EmployeePerformanceRatingState>
  >(() => new Map());

  // Reset session state when the modal is re-opened so a fresh review
  // pass starts at the first employee with no carry-over from a prior
  // open. Employee changes (e.g. data refresh) reset the submitted set
  // too — those records may reflect a different roster.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    setSubmittedUserIds(new Set());
    setSavedReviews(new Map());
    setView("tasks");
    setRating({
      timeEfficiency: "",
      workQuality: "",
      teamwork: "",
      workEthic: "",
    });
  }, [open, employees]);

  const activeEmployee = employees[activeIndex] ?? null;

  const completedTaskCount = useMemo(() => {
    return activeEmployee?.tasks.filter((task) => task.status === "done").length ?? 0;
  }, [activeEmployee]);

  const totalTaskCount = activeEmployee?.tasks.length ?? 0;

  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < employees.length - 1;

  const allRatingsSelected = ratingRows.every((row) => Boolean(rating[row.key]));
  const activeEmployeeSubmitted = activeEmployee
    ? submittedUserIds.has(activeEmployee.userId)
    : false;
  const otherEmployeesPending = employees.some(
    (employee) =>
      employee.userId !== activeEmployee?.userId &&
      !submittedUserIds.has(employee.userId),
  );

  function resetReviewForm() {
    setRating({
      timeEfficiency: "",
      workQuality: "",
      teamwork: "",
      workEthic: "",
    });
  }

  // Populate the form with whatever was saved for the employee at the
  // given index. If the employee hasn't been reviewed yet this session
  // (or there's no employee at that index), clear the form.
  function loadReviewForIndex(index: number) {
    const employee = employees[index];
    if (!employee) {
      resetReviewForm();
      return;
    }
    const saved = savedReviews.get(employee.userId);
    if (saved) {
      setRating(saved);
    } else {
      resetReviewForm();
    }
  }

  function goPrevious() {
    if (!canGoPrevious) return;
    const newIndex = activeIndex - 1;
    setActiveIndex(newIndex);
    loadReviewForIndex(newIndex);
    // Default each employee back to the task view so the admin
    // doesn't accidentally rate before seeing what the new person
    // actually did.
    setView("tasks");
  }

  function goNext() {
    if (!canGoNext) return;
    const newIndex = activeIndex + 1;
    setActiveIndex(newIndex);
    loadReviewForIndex(newIndex);
    setView("tasks");
  }

  async function handleFinish() {
    if (!activeEmployee || !allRatingsSelected || isSaving) return;

    // Last-employee submit is only allowed once every other employee has
    // already been saved. Belt-and-braces with the disabled state on the
    // button — if someone hits Enter etc., bail out.
    const isLastEmployeeSubmit = !canGoNext;
    if (isLastEmployeeSubmit && otherEmployeesPending) return;

    try {
      setInternalSaving(true);
      await onFinish({
        employeeId: activeEmployee.userId,
        // Notes were removed from the UI; pass an empty string so the
        // existing endpoint signature keeps working without a parallel
        // backend change.
        note: "",
        rating,
        isLastEmployee: isLastEmployeeSubmit,
      });

      // Snapshot the rating so navigating back restores these values
      // instead of an empty form.
      setSavedReviews((prev) => {
        const next = new Map(prev);
        next.set(activeEmployee.userId, { ...rating });
        return next;
      });

      setSubmittedUserIds((prev) => {
        const next = new Set(prev);
        next.add(activeEmployee.userId);
        return next;
      });

      if (canGoNext) {
        goNext();
      }
      // Last-employee save: keep the form filled in with the saved values
      // so the admin sees what they just submitted. The "Finish" path
      // also fires onFinish with isLastEmployee=true which advances the
      // project, so the modal will close from the parent shortly anyway.
    } finally {
      setInternalSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => {
        // Click outside the inner card dismisses the modal — but only
        // when nothing's mid-save, otherwise the user could close the
        // dialog while a network request is still racing to record
        // their review.
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        className="flex h-[92vh] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Employee Management
            </h2>
            <p className="mt-1 text-[11px] text-gray-500">
              Review employee work and submit post-project ratings.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {employees.length > 0 ? (
              <span
                className={[
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold",
                  submittedUserIds.size === employees.length
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700",
                ].join(" ")}
              >
                {submittedUserIds.size} / {employees.length} reviewed
              </span>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:bg-gray-50 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body. NO outer scroll — the inner section is the only
            scrollable region. Aside and main share the remaining
            height with min-h-0 so they can shrink as needed. */}
        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-500" />
              <p className="mt-3 text-xs text-gray-500">
                Loading employee review data...
              </p>
            </div>
          </div>
        ) : !activeEmployee ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            <div>
              <UserRound className="mx-auto h-9 w-9 text-gray-300" />
              <p className="mt-3 text-xs font-semibold text-gray-900">
                No employees found
              </p>
              <p className="mt-1 text-xs text-gray-500">
                There are no assigned employees to review for this project.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 px-6 py-5 lg:grid-cols-[280px_1fr]">
            <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
              <div className="shrink-0 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="h-28 w-28 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                    {activeEmployee.profileImageUrl ? (
                      <img
                        src={activeEmployee.profileImageUrl}
                        alt={activeEmployee.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <UserRound className="h-10 w-10" />
                      </div>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-gray-900">
                    {activeEmployee.username}
                  </h3>

                  {activeEmployee.role ? (
                    <span className="mt-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {activeEmployee.role}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2.5 rounded-md border border-gray-100 bg-gray-50 p-3">
                  <div className="flex gap-2 text-[11px] text-gray-600">
                    <Mail className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                    <span className="min-w-0 wrap-break-word">
                      {activeEmployee.email || "No email"}
                    </span>
                  </div>

                  <div className="flex gap-2 text-[11px] text-gray-600">
                    <Phone className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                    <span>{activeEmployee.phone || "No phone"}</span>
                  </div>

                  <div className="text-[11px] text-gray-600">
                    <span className="font-semibold text-gray-800">
                      Date Joined:
                    </span>{" "}
                    {activeEmployee.dateJoined
                      ? formatDateTime(activeEmployee.dateJoined)
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="shrink-0 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-900">
                  Salary / Pay Estimate
                </p>
                <p className="mt-2 text-lg font-bold text-[#00c065]">
                  {formatCurrency(activeEmployee.salaryAmount)}
                </p>
              </div>
            </aside>

            {/* Single section with a Tasks / Rating toggle. Flex
                column with min-h-0 so the body region can scroll
                independently while the header stays fixed. */}
            <section className="flex min-h-0 min-w-0 flex-col rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-gray-900">
                    Performance Review
                  </h3>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {view === "tasks"
                      ? `${completedTaskCount} of ${totalTaskCount} tasks completed.`
                      : "Rate the employee's post-project performance."}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5"
                    role="tablist"
                    aria-label="Performance view"
                  >
                    {(
                      [
                        { key: "tasks", label: "Tasks" },
                        { key: "rating", label: "Rating" },
                      ] as Array<{ key: SectionView; label: string }>
                    ).map((tab) => {
                      const active = view === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setView(tab.key)}
                          className={[
                            "inline-flex h-7 items-center rounded-sm px-3 text-[11px] font-semibold transition",
                            active
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-700",
                          ].join(" ")}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600">
                    {activeIndex + 1} / {employees.length}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {view === "tasks" ? (
                  <>
                    <div className="hidden grid-cols-12 gap-3 border-b border-gray-100 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
                      <div className="col-span-2">Status</div>
                      <div className="col-span-4">Task</div>
                      <div className="col-span-3">Start Date & Time</div>
                      <div className="col-span-3">End Date & Time</div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {activeEmployee.tasks.length === 0 ? (
                        <div className="py-8 text-center text-xs text-gray-500">
                          No task records found for this employee.
                        </div>
                      ) : (
                        activeEmployee.tasks.map((task) => (
                          <div
                            key={task.projectSubTaskId}
                            className="grid grid-cols-1 gap-2 py-3 text-xs md:grid-cols-12 md:gap-3"
                          >
                            <div className="md:col-span-2">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  getTaskTone(task),
                                ].join(" ")}
                              >
                                {getTaskStatusLabel(task)}
                              </span>
                            </div>

                            <div className="min-w-0 font-medium text-gray-900 md:col-span-4">
                              {task.title}
                              {task.timingLabel ? (
                                <p className="mt-0.5 text-[10px] text-amber-600">
                                  {task.timingLabel}
                                </p>
                              ) : null}
                            </div>

                            <div className="text-[11px] text-gray-600 md:col-span-3">
                              {formatDateTime(task.scheduledStart)}
                            </div>

                            <div className="text-[11px] text-gray-600 md:col-span-3">
                              {task.completedAt
                                ? formatDateTime(task.completedAt)
                                : formatDateTime(task.scheduledEnd)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] border-b border-gray-100 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      <div>Performance Criteria</div>
                      {ratingColumns.map((column) => (
                        <div key={column.key} className="text-center">
                          {column.label}
                        </div>
                      ))}
                    </div>

                    <div className="divide-y divide-gray-100">
                      {ratingRows.map((row) => (
                        <div
                          key={row.key}
                          className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center py-3"
                        >
                          <div className="text-xs font-medium text-gray-700">
                            {row.label}
                          </div>

                          {ratingColumns.map((column) => {
                            const selected = rating[row.key] === column.key;

                            return (
                              <label
                                key={column.key}
                                className="flex cursor-pointer items-center justify-center"
                              >
                                <input
                                  type="radio"
                                  name={`${activeEmployee.userId}-${row.key}`}
                                  value={column.key}
                                  checked={selected}
                                  onChange={() =>
                                    setRating((prev) => ({
                                      ...prev,
                                      [row.key]: column.key,
                                    }))
                                  }
                                  className="sr-only"
                                />
                                <span
                                  className={[
                                    "h-4 w-4 rounded-full border transition",
                                    selected
                                      ? "border-[#00c065] bg-[#00c065] ring-4 ring-[#00c065]/15"
                                      : "border-gray-300 bg-white hover:border-[#00c065]",
                                  ].join(" ")}
                                />
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={goPrevious}
            disabled={!canGoPrevious || isSaving}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            {canGoNext ? (
              <button
                type="button"
                onClick={goNext}
                disabled={isSaving || !activeEmployeeSubmitted}
                title={
                  !activeEmployeeSubmitted
                    ? "Save this employee's review before moving on."
                    : undefined
                }
                className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleFinish}
              disabled={
                !activeEmployee ||
                !allRatingsSelected ||
                isSaving ||
                (!canGoNext && otherEmployeesPending)
              }
              title={
                !canGoNext && otherEmployeesPending
                  ? "Every employee must have a saved review before you can finish."
                  : undefined
              }
              className="inline-flex h-9 min-w-[140px] items-center justify-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              style={{ backgroundColor: isSaving ? ACCENT : undefined }}
              onMouseEnter={(event) => {
                if (
                  !isSaving &&
                  allRatingsSelected &&
                  !(!canGoNext && otherEmployeesPending)
                ) {
                  event.currentTarget.style.backgroundColor = ACCENT_HOVER;
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = ACCENT;
              }}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {isSaving ? "Saving..." : canGoNext ? "Save Review" : "Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
