"use client";

import {
  CalendarDays,
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
    type: "Leave of Absence",
    reason: "Personal appointment",
    status: "Pending",
    submitted: "Today, 9:24 AM",
  },
  {
    id: "REQ-002",
    staff: "Carlo Reyes",
    role: "Senior Painter",
    date: "May 08, 2026",
    type: "Leave of Absence",
    reason: "Family matter",
    status: "Approved",
    submitted: "Yesterday, 3:12 PM",
  },
  {
    id: "REQ-003",
    staff: "Anna Cruz",
    role: "Staff",
    date: "May 10, 2026",
    type: "Leave of Absence",
    reason: "Medical checkup",
    status: "Rejected",
    submitted: "Apr 27, 2026",
  },
];

const statusStyles: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
};

export default function ScheduleRequestsPage() {
  return (
    <main className="flex h-full min-h-screen flex-col bg-gray-50 p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#00c065]">
            <CalendarDays className="h-4 w-4" />
            Schedule Management
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Schedule Requests
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and manage staff leave of absence requests.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00c065] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#00a054]">
          <Plus className="h-4 w-4" />
          New Request
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Pending Requests"
          value="1"
          icon={<Clock className="h-5 w-5" />}
        />
        <SummaryCard
          title="Approved Leaves"
          value="1"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <SummaryCard
          title="Rejected Requests"
          value="1"
          icon={<XCircle className="h-5 w-5" />}
        />
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Leave of Absence Requests
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Staff can request unavailable days. Admins can approve or reject
                requests.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/10 sm:w-64"
                />
              </div>

              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {requests.map((request) => (
            <div
              key={request.id}
              className="grid gap-4 p-4 transition hover:bg-gray-50 lg:grid-cols-[1.3fr_1fr_1fr_auto]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-[#00c065]">
                  <UserRound className="h-5 w-5" />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {request.staff}
                    </h3>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      {request.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Submitted {request.submitted}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Requested Date
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {request.date}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Reason
                </p>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                  <FileText className="h-4 w-4 text-gray-400" />
                  {request.reason}
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 lg:items-end">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    statusStyles[request.status]
                  }`}
                >
                  {request.status}
                </span>

                <div className="flex gap-2">
                  <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-white hover:shadow-sm">
                    View
                  </button>
                  <button className="rounded-lg bg-[#00c065] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#00a054]">
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 h-1 w-12 rounded-full bg-[#00c065]" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-[#00c065]">
          {icon}
        </div>
      </div>
    </div>
  );
}
