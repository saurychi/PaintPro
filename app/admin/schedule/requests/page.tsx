"use client";

import {
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Plus,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";

const requests = [
  {
    id: "REQ-001",
    staff: "Miguel Santos",
    role: "Painter",
    date: "May 06, 2026",
    reason: "Personal appointment",
    status: "Pending",
    submitted: "Today, 9:24 AM",
  },
  {
    id: "REQ-002",
    staff: "Carlo Reyes",
    role: "Senior Painter",
    date: "May 08, 2026",
    reason: "Family matter",
    status: "Approved",
    submitted: "Yesterday, 3:12 PM",
  },
  {
    id: "REQ-003",
    staff: "Anna Cruz",
    role: "Staff",
    date: "May 10, 2026",
    reason: "Medical checkup",
    status: "Rejected",
    submitted: "Apr 27, 2026",
  },
];

const statusStyles: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function ScheduleRequestsPage() {
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
            value="1"
            color="amber"
            icon={<Clock className="h-4 w-4" />}
          />
          <SummaryCard
            title="Approved Leaves"
            value="1"
            color="green"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <SummaryCard
            title="Rejected Requests"
            value="1"
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
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none transition placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 sm:w-56"
                  />
                </div>

                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                </button>

                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#00c065] px-3 text-xs font-medium text-white shadow-sm transition hover:bg-[#00a054]">
                  <Plus className="h-3.5 w-3.5" />
                  New Request
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="divide-y divide-gray-100">
              {requests.map((request) => (
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
                          {request.staff}
                        </h3>
                        <span className="text-[11px] text-gray-400">•</span>
                        <span className="text-[11px] text-gray-500">
                          {request.role}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Submitted {request.submitted}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Requested Date
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-gray-800">
                      {request.date}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Reason
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      {request.reason}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        statusStyles[request.status]
                      }`}
                    >
                      {request.status}
                    </span>

                    <div className="flex gap-1.5">
                      <button className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-white hover:shadow-sm">
                        View
                      </button>
                      <button className="rounded-lg bg-[#00c065] px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#00a054]">
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
