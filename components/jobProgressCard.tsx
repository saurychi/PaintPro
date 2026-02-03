"use client";

import React, { Fragment, useMemo } from "react";
import { Disclosure, Transition } from "@headlessui/react";
import { ChevronDown, Plus } from "lucide-react";

export type StepStatus = "done" | "active" | "pending";

export type ServiceStep = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  assignedTo?: string;
  materialsNeeded?: string;
  actionLabel?: string;
};

export type ServiceGroup = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  children: ServiceStep[];
};

type EmbeddedHandlers = {
  onDownpayment?: () => void;
  onStartJob?: () => void;
  onCreateInvoice?: () => void;
  onAddPayment?: () => void;
  onEmployeeManagement?: () => void;
  onConcludeJob?: () => void;
};

type Props = EmbeddedHandlers & {
  title?: string;
  services: ServiceGroup[];
  onSeeMore?: (stepId: string) => void;
};

const GREEN = "#7ED957";
const SCROLL_TRACK = "#EAF7E4";

function statusLabel(status: StepStatus) {
  if (status === "done") return "Completed";
  if (status === "active") return "Working on it...";
  return "Not started";
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span
        className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: GREEN }}>
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="h-5 w-5 rounded-full border-2 bg-white"
        style={{ borderColor: GREEN }}
      />
    );
  }
  return (
    <span className="h-5 w-5 rounded-full border-2 border-gray-300 bg-white" />
  );
}

function GroupProgressRing({
  status,
  doneCount,
  totalCount,
}: {
  status: StepStatus;
  doneCount: number;
  totalCount: number;
}) {
  const size = 22;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const raw = totalCount <= 0 ? 0 : doneCount / totalCount;
  const clamped = Math.max(0, Math.min(1, raw));
  const pct = status === "done" ? 1 : status === "pending" ? 0 : clamped;

  const dash = pct * c;
  const gap = c - dash;

  const track = "#E5E7EB";

  return (
    <div className="relative h-[22px] w-[22px]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GREEN}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      {status === "done" ? (
        <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-white">
          <span
            className="grid h-[18px] w-[18px] place-items-center rounded-full"
            style={{ backgroundColor: GREEN }}>
            ✓
          </span>
        </span>
      ) : null}
    </div>
  );
}

type Group = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  children: ServiceStep[];
  embedded?: boolean;
};

export default function JobProgressCard({
  title = "Progress",
  services,
  onSeeMore,

  onDownpayment,
  onStartJob,
  onCreateInvoice,
  onAddPayment,
  onEmployeeManagement,
  onConcludeJob,
}: Props) {
  const embedded: Group[] = useMemo(
    () => [
      {
        id: "start-of-work",
        title: "Start of Work",
        status: "done",
        scheduledAt: "01 July 2024, 9:00 AM",
        finishedAt: "01 July 2024, 9:30 AM",
        embedded: true,
        children: [
          {
            id: "start-downpayment",
            title: "Manage Downpayment",
            status: "done",
            scheduledAt: "01 July 2024, 9:00 AM",
            finishedAt: "01 July 2024, 9:10 AM",
            actionLabel: "Change",
          },
          {
            id: "start-job",
            title: "Start Job",
            status: "done",
            scheduledAt: "01 July 2024, 9:15 AM",
            finishedAt: "01 July 2024, 9:30 AM",
            actionLabel: "Start Job",
          },
        ],
      },
      {
        id: "manage-end-of-work",
        title: "Manage End of Work",
        status: "pending",
        scheduledAt: "01 July 2024, 2:45 PM",
        finishedAt: "Working on it...",
        embedded: true,
        children: [
          {
            id: "end-invoice",
            title: "Invoice Generation",
            status: "active",
            scheduledAt: "01 July 2024, 2:45 PM",
            finishedAt: "Working on it...",
            actionLabel: "Create Invoice",
          },
          {
            id: "end-payment",
            title: "Receiving Payment",
            status: "pending",
            scheduledAt: "01 July 2024, 2:55 PM",
            finishedAt: "Working on it...",
            actionLabel: "Add Payment",
          },
          {
            id: "end-employees",
            title: "Employee Management",
            status: "pending",
            scheduledAt: "01 July 2024, 3:05 PM",
            finishedAt: "Working on it...",
            actionLabel: "See More",
          },
        ],
      },
      {
        id: "conclude-job",
        title: "Conclude Job",
        status: "pending",
        scheduledAt: "01 July 2024, 3:15 PM",
        finishedAt: "Working on it...",
        embedded: true,
        children: [
          {
            id: "conclude-final",
            title: "Conclude Job",
            status: "pending",
            scheduledAt: "01 July 2024, 3:15 PM",
            finishedAt: "Working on it...",
            actionLabel: "Conclude Job",
          },
        ],
      },
    ],
    [],
  );

  const groups: Group[] = useMemo(() => {
    const serviceGroups: Group[] = (services ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      scheduledAt: s.scheduledAt,
      finishedAt: s.finishedAt,
      status: s.status,
      children: s.children ?? [],
      embedded: false,
    }));

    return [embedded[0], ...serviceGroups, embedded[1], embedded[2]];
  }, [services, embedded]);

  function runEmbedded(stepId: string) {
    if (stepId === "start-downpayment") return onDownpayment?.();
    if (stepId === "start-job") return onStartJob?.();
    if (stepId === "end-invoice") return onCreateInvoice?.();
    if (stepId === "end-payment") return onAddPayment?.();
    if (stepId === "end-employees") return onEmployeeManagement?.();
    if (stepId === "conclude-final") return onConcludeJob?.();
    return undefined;
  }

  return (
    <section className="h-full min-h-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>

      <div className="mt-3 hidden grid-cols-12 gap-2 text-xs font-semibold text-gray-300 md:grid">
        <div className="col-span-1">Status</div>
        <div className="col-span-5">Service</div>
        <div className="col-span-3">Scheduled Date &amp; Time</div>
        <div className="col-span-3">Finished Date &amp; Time</div>
      </div>

      <div className="mt-2 flex-1 min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className={[
            "h-full min-h-0 overflow-y-auto",
            "px-3 py-2",
            "[&::-webkit-scrollbar]:w-2",
            "[&::-webkit-scrollbar-track]:rounded-full",
            "[&::-webkit-scrollbar-track]:bg-[#EAF7E4]",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-[#7ED957]",
          ].join(" ")}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: `${GREEN} ${SCROLL_TRACK}`,
          }}>
          <div className="divide-y divide-gray-100">
            {groups.map((g, gIdx) => {
              const hasChildren = (g.children?.length ?? 0) > 0;
              const doneCount = (g.children ?? []).filter(
                (x) => x.status === "done",
              ).length;
              const totalCount = (g.children ?? []).length;

              return (
                <Disclosure key={g.id} defaultOpen={gIdx === 0}>
                  {({ open }) => (
                    <div className="py-2">
                      <Disclosure.Button
                        disabled={!hasChildren}
                        className={[
                          "w-full text-left rounded-lg hover:bg-gray-50",
                          hasChildren ? "cursor-pointer" : "cursor-default",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                          "px-2 py-2",
                        ].join(" ")}
                        style={
                          hasChildren
                            ? ({
                                "--tw-ring-color": GREEN,
                              } as React.CSSProperties)
                            : undefined
                        }>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
                          <div className="md:col-span-1">
                            <div className="relative h-6">
                              <div className="absolute left-0 top-0">
                                <GroupProgressRing
                                  status={g.status}
                                  doneCount={doneCount}
                                  totalCount={totalCount}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 md:col-span-5">
                            <div className="flex items-start gap-2">
                              {hasChildren ? (
                                <ChevronDown
                                  className={[
                                    "mt-0.5 h-4 w-4 text-gray-300 transition-transform",
                                    open ? "rotate-0" : "-rotate-90",
                                  ].join(" ")}
                                  aria-hidden
                                />
                              ) : (
                                <span className="mt-0.5 h-4 w-4" aria-hidden />
                              )}

                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div
                                    className={[
                                      "truncate text-sm font-medium",
                                      g.status === "pending"
                                        ? "text-gray-700"
                                        : "text-gray-900",
                                    ].join(" ")}>
                                    {g.title}
                                  </div>

                                  <span className="shrink-0 text-xs text-gray-400">
                                    {statusLabel(g.status)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <div className="text-xs text-gray-900">
                              {g.scheduledAt ?? "-"}
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <div className="text-xs text-gray-900">
                              {g.finishedAt ?? "-"}
                            </div>
                          </div>
                        </div>
                      </Disclosure.Button>

                      <Transition
                        as={Fragment}
                        show={open && hasChildren}
                        enter="transition duration-150 ease-out"
                        enterFrom="opacity-0 -translate-y-1"
                        enterTo="opacity-100 translate-y-0"
                        leave="transition duration-100 ease-in"
                        leaveFrom="opacity-100 translate-y-0"
                        leaveTo="opacity-0 -translate-y-1">
                        <Disclosure.Panel static>
                          <div className="mt-1 space-y-0">
                            {g.children.map((c) => {
                              const dim = c.status === "done";

                              return (
                                <Disclosure
                                  key={c.id}
                                  as="div"
                                  defaultOpen={false}>
                                  {({ open: childOpen }) => (
                                    <div className="relative">
                                      <Disclosure.Button
                                        className={[
                                          "w-full text-left",
                                          "rounded-lg hover:bg-gray-50",
                                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                                          "px-2 py-3",
                                          "pl-9 pr-2 box-border",
                                        ].join(" ")}
                                        style={
                                          {
                                            "--tw-ring-color": GREEN,
                                          } as React.CSSProperties
                                        }>
                                        <div className="grid grid-cols-12 items-center gap-3">
                                          <div className="col-span-1">
                                            <div className="relative flex h-full w-10 items-center justify-center">
                                              <span className="relative z-10 grid place-items-center rounded-full bg-white p-0.5">
                                                <StepIcon status={c.status} />
                                              </span>
                                            </div>
                                          </div>

                                          <div className="col-span-5 min-w-0">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <div
                                                className={[
                                                  "truncate text-sm font-medium",
                                                  dim
                                                    ? "text-gray-300"
                                                    : "text-gray-800",
                                                ].join(" ")}>
                                                {c.title}
                                              </div>

                                              <span
                                                className={[
                                                  "shrink-0 text-xs",
                                                  dim
                                                    ? "text-gray-200"
                                                    : "text-gray-400",
                                                ].join(" ")}>
                                                {statusLabel(c.status)}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="col-span-3">
                                            <div
                                              className={[
                                                "text-xs",
                                                dim
                                                  ? "text-gray-200"
                                                  : "text-gray-700",
                                              ].join(" ")}>
                                              {c.scheduledAt ?? "-"}
                                            </div>
                                          </div>

                                          <div className="col-span-3">
                                            <div
                                              className={[
                                                "text-xs",
                                                dim
                                                  ? "text-gray-200"
                                                  : "text-gray-700",
                                              ].join(" ")}>
                                              {c.finishedAt ??
                                                "Working on it..."}
                                            </div>
                                          </div>
                                        </div>
                                      </Disclosure.Button>

                                      <Transition
                                        as={Fragment}
                                        show={childOpen}
                                        enter="transition duration-150 ease-out"
                                        enterFrom="opacity-0 -translate-y-1"
                                        enterTo="opacity-100 translate-y-0"
                                        leave="transition duration-100 ease-in"
                                        leaveFrom="opacity-100 translate-y-0"
                                        leaveTo="opacity-0 -translate-y-1">
                                        <Disclosure.Panel static>
                                          <div className="grid grid-cols-12 gap-3 pl-9 pr-2 pb-2">
                                            <div className="col-span-1 relative" />
                                            <div className="col-span-11">
                                              <div
                                                className={
                                                  g.embedded
                                                    ? "p-1"
                                                    : "rounded-lg border border-gray-200 bg-white p-2"
                                                }>
                                                {g.embedded ? (
                                                  // has buttons not materials and assigned to
                                                  <div className="flex items-center justify-start">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()

                                                        const did = runEmbedded(c.id)
                                                        if (did !== undefined) return

                                                        console.log("Embedded action clicked:", c.id)
                                                      }}
                                                      className={[
                                                        "inline-flex items-center gap-2",
                                                        "rounded-md px-5 py-3",
                                                        "text-xs font-semibold",
                                                        "shadow-sm",
                                                        "bg-[#BFEFB0]",
                                                        dim ? "text-white" : "text-gray-900",
                                                        "hover:bg-[#B2E7A3] active:bg-[#A6DE97]",
                                                      ].join(" ")}
                                                    >
                                                      {c.id === "start-downpayment" ? <Plus className="h-4 w-4" aria-hidden /> : null}
                                                      <p>{c.actionLabel ?? "Action"}</p>
                                                    </button>
                                                  </div>
                                                ) : (
                                                  // has metrials and assignto; no button
                                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    {c.assignedTo ? (
                                                      <span
                                                        className={[
                                                          "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs",
                                                          dim ? "text-gray-400 opacity-70" : "text-gray-700",
                                                        ].join(" ")}
                                                      >
                                                        Assigned to:{" "}
                                                        <span
                                                          className={[
                                                            "font-semibold",
                                                            dim ? "text-gray-400 opacity-70" : "text-gray-900",
                                                          ].join(" ")}
                                                        >
                                                          {c.assignedTo}
                                                        </span>
                                                      </span>
                                                    ) : null}

                                                    {c.materialsNeeded ? (
                                                      <span
                                                        className={[
                                                          "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs",
                                                          dim ? "text-gray-400 opacity-70" : "text-gray-700",
                                                        ].join(" ")}
                                                      >
                                                        Materials Needed:{" "}
                                                        <span
                                                          className={[
                                                            "font-semibold",
                                                            dim ? "text-gray-400 opacity-70" : "text-gray-900",
                                                          ].join(" ")}
                                                        >
                                                          {c.materialsNeeded}
                                                        </span>
                                                      </span>
                                                    ) : null}

                                                    {!c.assignedTo &&
                                                    !c.materialsNeeded ? (
                                                      <span className="text-xs text-gray-400">
                                                        No details available.
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </Disclosure.Panel>
                                      </Transition>
                                    </div>
                                  )}
                                </Disclosure>
                              );
                            })}
                          </div>
                        </Disclosure.Panel>
                      </Transition>
                    </div>
                  )}
                </Disclosure>
              );
            })}
          </div>

          {groups.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">
              No progress steps yet.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
