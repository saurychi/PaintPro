"use client";

import { useMemo, useState } from "react";
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

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value?: number | null) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
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
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<EmployeePerformanceRatingState>({
    timeEfficiency: "",
    workQuality: "",
    teamwork: "",
    workEthic: "",
  });

  const activeEmployee = employees[activeIndex] ?? null;

  const completedTaskCount = useMemo(() => {
    return activeEmployee?.tasks.filter((task) => task.status === "done").length ?? 0;
  }, [activeEmployee]);

  const totalTaskCount = activeEmployee?.tasks.length ?? 0;

  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < employees.length - 1;

  const allRatingsSelected = ratingRows.every((row) => Boolean(rating[row.key]));

  function resetReviewForm() {
    setNote("");
    setRating({
      timeEfficiency: "",
      workQuality: "",
      teamwork: "",
      workEthic: "",
    });
  }

  function goPrevious() {
    if (!canGoPrevious) return;
    setActiveIndex((prev) => prev - 1);
    resetReviewForm();
  }

  function goNext() {
    if (!canGoNext) return;
    setActiveIndex((prev) => prev + 1);
    resetReviewForm();
  }

  async function handleFinish() {
    if (!activeEmployee || !allRatingsSelected || saving) return;

    await onFinish({
      employeeId: activeEmployee.userId,
      note,
      rating,
      isLastEmployee: !canGoNext,
    });

    if (canGoNext) {
      goNext();
    } else {
      resetReviewForm();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-gray-900">
              Employee Management
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Review employee work, record notes, and submit post-project ratings.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[520px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-500" />
              <p className="mt-3 text-sm text-gray-500">
                Loading employee review data...
              </p>
            </div>
          </div>
        ) : !activeEmployee ? (
          <div className="flex min-h-[520px] items-center justify-center px-6 text-center">
            <div>
              <UserRound className="mx-auto h-9 w-9 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-gray-900">
                No employees found
              </p>
              <p className="mt-1 text-sm text-gray-500">
                There are no assigned employees to review for this project.
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <aside className="min-w-0">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-32 w-32 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                      {activeEmployee.profileImageUrl ? (
                        <img
                          src={activeEmployee.profileImageUrl}
                          alt={activeEmployee.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <UserRound className="h-12 w-12" />
                        </div>
                      )}
                    </div>

                    <h3 className="mt-4 text-base font-semibold text-gray-900">
                      {activeEmployee.username}
                    </h3>

                    {activeEmployee.role ? (
                      <span className="mt-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                        {activeEmployee.role}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex gap-2 text-xs text-gray-600">
                      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0 break-words">
                        {activeEmployee.email || "No email"}
                      </span>
                    </div>

                    <div className="flex gap-2 text-xs text-gray-600">
                      <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{activeEmployee.phone || "No phone"}</span>
                    </div>

                    <div className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">
                        Date Joined:
                      </span>{" "}
                      {activeEmployee.dateJoined
                        ? formatDateTime(activeEmployee.dateJoined)
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-gray-900">Notes</p>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add a note about this employee's work..."
                    className="mt-3 min-h-[100px] w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                  />
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-gray-900">
                    Salary / Pay Estimate
                  </p>
                  <p className="mt-3 text-2xl font-bold text-[#00c065]">
                    {formatCurrency(activeEmployee.salaryAmount)}
                  </p>
                </div>
              </aside>

              <main className="min-w-0 space-y-5">
                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        Tasks
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {completedTaskCount} of {totalTaskCount} tasks completed.
                      </p>
                    </div>

                    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600">
                      {activeIndex + 1} / {employees.length}
                    </span>
                  </div>

                  <div className="max-h-[260px] overflow-y-auto px-5 py-3">
                    <div className="hidden grid-cols-12 gap-3 border-b border-gray-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
                      <div className="col-span-2">Status</div>
                      <div className="col-span-4">Task</div>
                      <div className="col-span-3">Start Date & Time</div>
                      <div className="col-span-3">End Date & Time</div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {activeEmployee.tasks.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-500">
                          No task records found for this employee.
                        </div>
                      ) : (
                        activeEmployee.tasks.map((task) => (
                          <div
                            key={task.projectSubTaskId}
                            className="grid grid-cols-1 gap-2 py-3 text-sm md:grid-cols-12 md:gap-3"
                          >
                            <div className="md:col-span-2">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                  getTaskTone(task),
                                ].join(" ")}
                              >
                                {getTaskStatusLabel(task)}
                              </span>
                            </div>

                            <div className="min-w-0 font-medium text-gray-900 md:col-span-4">
                              {task.title}
                              {task.timingLabel ? (
                                <p className="mt-0.5 text-[11px] text-amber-600">
                                  {task.timingLabel}
                                </p>
                              ) : null}
                            </div>

                            <div className="text-xs text-gray-600 md:col-span-3">
                              {formatDateTime(task.scheduledStart)}
                            </div>

                            <div className="text-xs text-gray-600 md:col-span-3">
                              {task.completedAt
                                ? formatDateTime(task.completedAt)
                                : formatDateTime(task.scheduledEnd)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Rating
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Rate the employee’s post-project performance.
                    </p>
                  </div>

                  <div className="overflow-x-auto px-5 py-4">
                    <div className="min-w-[560px]">
                      <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] border-b border-gray-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
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
                            <div className="text-sm font-medium text-gray-700">
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
                                    name={row.key}
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
                  </div>
                </section>
              </main>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={goPrevious}
            disabled={!canGoPrevious || saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            {canGoNext ? (
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleFinish}
              disabled={!activeEmployee || !allRatingsSelected || saving}
              className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-lg bg-[#00c065] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: saving ? ACCENT : undefined }}
              onMouseEnter={(event) => {
                if (!saving && allRatingsSelected) {
                  event.currentTarget.style.backgroundColor = ACCENT_HOVER;
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = ACCENT;
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving..." : canGoNext ? "Save Review" : "Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
