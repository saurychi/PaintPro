"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

type LeaveRequest = {
  id: string;
  startDatetime: string | null;
  endDatetime: string | null;
  reason: string | null;
  status: string;
  createdAt: string | null;
};

type AssignmentWindow = {
  subtaskId: string;
  projectId: string;
  projectTitle: string | null;
  projectCode: string | null;
  subtaskTitle: string;
  startDatetime: string;
  endDatetime: string;
};

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if (
    Number.isNaN(aS) ||
    Number.isNaN(aE) ||
    Number.isNaN(bS) ||
    Number.isNaN(bE)
  ) {
    return false;
  }
  return aS < bE && aE > bS;
}

// When the user leaves End blank, default to 17:00 on the start's local
// day so the block lines up with the 9-5 work window. If start is at or
// after 17:00, fall back to start + 1 hour so end > start always holds
// (the DB enforces this via staff_unavailability_valid_range).
function defaultEndForStart(startLocal: string): string {
  const start = new Date(startLocal);
  const end = new Date(startLocal);
  end.setHours(17, 0, 0, 0);
  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + 60 * 60 * 1000);
  }
  return end.toISOString();
}

const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Full-day-ish" = both ends sit on a midnight boundary, which is what
// the legacy date-only picker produced. Anything else came from the
// datetime-local picker and should surface time-of-day to be useful.
function isFullDayBoundary(iso: string | null) {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  return (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  );
}

function formatRequestRange(start: string | null, end: string | null) {
  const startIsMidnight = isFullDayBoundary(start);
  const endIsMidnight = end ? isFullDayBoundary(end) : true;
  const isDateOnly = startIsMidnight && endIsMidnight;
  const startLabel = isDateOnly ? formatDate(start) : formatDateTime(start);

  if (!end || end === start) return startLabel;
  const endLabel = isDateOnly ? formatDate(end) : formatDateTime(end);
  if (endLabel === startLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
}

function formatSubmitted(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
  }
  return formatDate(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function StaffLeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentWindow[]>([]);

  // startDatetime / endDatetime hold the `datetime-local` value strings
  // (YYYY-MM-DDTHH:MM). `new Date(value).toISOString()` converts them
  // to the UTC timestamps the API + DB expect.
  const [form, setForm] = useState({
    startDatetime: "",
    endDatetime: "",
    reason: "",
  });

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/schedule/getMyLeaveRequests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load requests.");
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load requests."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/schedule/getMyAssignedWindows", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return;
      setAssignments(Array.isArray(data?.windows) ? data.windows : []);
    } catch {
      // Pre-check is best-effort; server-side validation is authoritative.
    }
  }, []);

  useEffect(() => {
    void loadRequests();
    void loadAssignments();
  }, [loadRequests, loadAssignments]);

  useEffect(() => {
    if (showModal) void loadAssignments();
  }, [showModal, loadAssignments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDatetime) {
      toast.error("Please select a start date and time.");
      return;
    }
    if (
      form.endDatetime &&
      new Date(form.endDatetime).getTime() <
        new Date(form.startDatetime).getTime()
    ) {
      toast.error("End must be on or after start.");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }

    const requestStartIso = new Date(form.startDatetime).toISOString();
    const requestEndIso = form.endDatetime
      ? new Date(form.endDatetime).toISOString()
      : defaultEndForStart(form.startDatetime);
    const conflict = assignments.find((a) =>
      rangesOverlap(
        a.startDatetime,
        a.endDatetime,
        requestStartIso,
        requestEndIso,
      ),
    );
    if (conflict) {
      const label =
        conflict.projectCode || conflict.projectTitle || "an assignment";
      toast.error(
        `You're assigned to ${label} during this window. Pick a time with no assignments.`,
      );
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch("/api/schedule/createLeaveRequest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startDatetime: requestStartIso,
          endDatetime: requestEndIso,
          reason: form.reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit request.");

      toast.success("Leave request submitted.");
      setShowModal(false);
      setForm({ startDatetime: "", endDatetime: "", reason: "" });
      await loadRequests();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to submit request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-var(--admin-header-offset,0px))] w-full flex-col bg-gray-50 px-3 py-3 sm:px-4 lg:h-[calc(100vh-var(--admin-header-offset,0px))] lg:min-h-0">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Link
          href="/staff/schedule"
          className="text-lg font-semibold text-gray-900 transition hover:text-[#00a054] sm:text-xl"
        >
          Schedule
        </Link>
        <ChevronRight className="h-5 w-5 text-gray-300" aria-hidden />
        <div className="text-lg font-semibold text-gray-900 sm:text-xl">Requests</div>
      </div>

      <div className="flex flex-1 flex-col lg:min-h-0">
        <section className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm lg:min-h-0">
          <div className="shrink-0 border-b border-gray-200 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Leave Requests
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Submit and track your leave of absence requests.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white shadow-sm transition hover:bg-[#00a054]"
              >
                <Plus className="h-3.5 w-3.5" />
                New Request
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <CalendarDays className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">
                  No leave requests yet.
                </p>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white transition hover:bg-[#00a054]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Submit a Request
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="grid gap-3 p-4 transition hover:bg-gray-50 sm:grid-cols-[1fr_0.8fr_1fr_auto]"
                  >
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        When
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-gray-800">
                        {formatRequestRange(
                          request.startDatetime,
                          request.endDatetime,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Submitted
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {formatSubmitted(request.createdAt)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Reason
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        {request.reason || "—"}
                      </div>
                    </div>

                    <div className="flex items-start justify-end">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                          STATUS_STYLES[request.status] ??
                          "border-gray-200 bg-gray-50 text-gray-600"
                        }`}
                      >
                        {STATUS_ICONS[request.status]}
                        {request.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                New Leave Request
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setForm({ startDatetime: "", endDatetime: "", reason: "" });
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-medium text-gray-700">
                  Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.startDatetime}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      startDatetime: e.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  End{" "}
                  <span className="text-[11px] font-normal text-gray-400">
                    (optional, defaults to 5pm same day)
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={form.endDatetime}
                  min={form.startDatetime}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      endDatetime: e.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="e.g. Medical appointment, family matter..."
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setForm({
                      startDatetime: "",
                      endDatetime: "",
                      reason: "",
                    });
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
