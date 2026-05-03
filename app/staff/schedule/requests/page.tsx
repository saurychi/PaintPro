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
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmitted(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
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

  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
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

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate) {
      toast.error("Please select a start date.");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Please provide a reason.");
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
          startDatetime: new Date(form.startDate).toISOString(),
          endDatetime: form.endDate
            ? new Date(form.endDate).toISOString()
            : null,
          reason: form.reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit request.");

      toast.success("Leave request submitted.");
      setShowModal(false);
      setForm({ startDate: "", endDate: "", reason: "" });
      await loadRequests();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to submit request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex h-[calc(100vh-var(--admin-header-offset,0px))] min-h-0 w-full flex-col bg-gray-50 px-4 py-3">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Link
          href="/staff/schedule"
          className="text-xl font-semibold text-gray-900 transition hover:text-[#00a054]"
        >
          Schedule
        </Link>
        <ChevronRight className="h-5 w-5 text-gray-300" aria-hidden />
        <div className="text-xl font-semibold text-gray-900">Requests</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
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
                        Date
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-gray-800">
                        {formatDate(request.startDatetime)}
                        {request.endDatetime &&
                        request.endDatetime !== request.startDatetime
                          ? ` — ${formatDate(request.endDatetime)}`
                          : ""}
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
                  setForm({ startDate: "", endDate: "", reason: "" });
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-medium text-gray-700">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  End Date{" "}
                  <span className="text-[11px] font-normal text-gray-400">
                    (optional, if more than one day)
                  </span>
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endDate: e.target.value }))
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
                    setForm({ startDate: "", endDate: "", reason: "" });
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
