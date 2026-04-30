"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Loader2,
  Plus,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type StaffInfo = {
  id: string;
  username: string | null;
  email: string | null;
  role: string | null;
  profileImageUrl: string | null;
};

type LeaveRequest = {
  id: string;
  userId: string;
  startDatetime: string | null;
  endDatetime: string | null;
  reason: string | null;
  status: string;
  createdAt: string | null;
  staff: StaffInfo;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
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
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
  }
  return formatDate(value);
}

function staffDisplayName(staff: StaffInfo) {
  return staff.username || staff.email?.split("@")[0] || "Unknown";
}

export default function ScheduleRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/schedule/getLeaveRequests");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load requests.");
        setRequests(Array.isArray(data?.requests) ? data.requests : []);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load requests.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const counts = useMemo(() => {
    return {
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
    };
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const name = staffDisplayName(r.staff).toLowerCase();
        const role = (r.staff.role ?? "").toLowerCase();
        const reason = (r.reason ?? "").toLowerCase();
        if (!name.includes(q) && !role.includes(q) && !reason.includes(q)) return false;
      }
      return true;
    });
  }, [requests, search, statusFilter]);

  async function handleAction(id: string, status: "approved" | "rejected") {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/schedule/updateLeaveRequest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unavailabilityId: id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update request.");

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      toast.success(status === "approved" ? "Request approved." : "Request rejected.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update request.");
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <div className="p-6 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          Schedule Requests
        </h1>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6">
        <section className="grid shrink-0 gap-3 md:grid-cols-3">
          <SummaryCard
            title="Pending Requests"
            value={String(counts.pending)}
            color="amber"
            icon={<Clock className="h-4 w-4" />}
          />
          <SummaryCard
            title="Approved Leaves"
            value={String(counts.approved)}
            color="green"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <SummaryCard
            title="Rejected Requests"
            value={String(counts.rejected)}
            color="red"
            icon={<XCircle className="h-4 w-4" />}
          />
        </section>

        <section className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-gray-200 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Leave Requests
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Review staff leave of absence requests.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none transition placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 sm:w-56"
                  />
                </div>

                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-xs font-medium text-gray-700 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <Filter className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                {requests.length === 0
                  ? "No leave requests yet."
                  : "No requests match your search."}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((request) => {
                  const isUpdating = Boolean(updating[request.id]);
                  const isPending = request.status === "pending";
                  const displayName = staffDisplayName(request.staff);

                  return (
                    <div
                      key={request.id}
                      className="grid gap-3 p-3 transition hover:bg-gray-50 lg:grid-cols-[1.2fr_0.8fr_1fr_auto]"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                          <UserRound className="h-4 w-4" />
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="text-xs font-semibold text-gray-900">
                              {displayName}
                            </h3>
                            <span className="text-[11px] text-gray-400">•</span>
                            <span className="text-[11px] capitalize text-gray-500">
                              {request.staff.role ?? "Staff"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            Submitted {formatSubmitted(request.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          Requested Date
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
                          Reason
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
                          <FileText className="h-3.5 w-3.5 text-gray-400" />
                          {request.reason || "—"}
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-2 lg:items-end">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                            STATUS_STYLES[request.status] ?? "border-gray-200 bg-gray-50 text-gray-600"
                          }`}
                        >
                          {request.status}
                        </span>

                        {isPending && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAction(request.id, "rejected")}
                              className="inline-flex h-7 items-center justify-center rounded-lg border border-gray-200 px-2.5 text-[11px] font-medium text-gray-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Reject"
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAction(request.id, "approved")}
                              className="inline-flex h-7 items-center justify-center rounded-lg bg-[#00c065] px-2.5 text-[11px] font-medium text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Approve"
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: "amber" | "green" | "red";
}) {
  const styles = {
    amber: {
      bar: "bg-amber-500",
      icon: "bg-amber-50 text-amber-600",
    },
    green: {
      bar: "bg-[#00c065]",
      icon: "bg-green-50 text-[#00c065]",
    },
    red: {
      bar: "bg-rose-500",
      icon: "bg-rose-50 text-rose-600",
    },
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className={`mb-3 h-1 w-10 rounded-full ${styles[color].bar}`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles[color].icon}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
