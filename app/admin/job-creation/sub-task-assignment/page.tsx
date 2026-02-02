"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight} from "lucide-react";
import { useRouter } from "next/navigation";

type StepStatus = "done" | "active" | "pending";

export type ServiceStep = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  assignedTo?: string;
};

export type ServiceGroup = {
  id: string;
  title: string;
  scheduledAt?: string;
  finishedAt?: string;
  status: StepStatus;
  children: ServiceStep[];
};

const GREEN = "#7ED957";
const GREEN_SOFT = "#DFF6D5";
const BORDER = "border-gray-300";

type EditDraft = {
  assignedTo: string;
  description: string;
  payment: string;
  scheduledISO: string; // datetime-local value: "YYYY-MM-DDTHH:mm"
};

const SERVICES: ServiceGroup[] = [
  {
    id: "svc-spray",
    title: "Spray or Brush Roll Finish",
    scheduledAt: "01 July 2024, 9:30 AM",
    finishedAt: undefined,
    status: "active",
    children: [
      {
        id: "svc-spray-1",
        title: "Prepare paint needed",
        scheduledAt: "01 July 2024, 9:30 AM",
        finishedAt: "01 July 2024, 9:45 AM",
        assignedTo: "Marco Dela Cruz",
        status: "done",
      },
      {
        id: "svc-spray-2",
        title: "Apply base coat on left side wall",
        scheduledAt: "01 July 2024, 9:45 AM",
        finishedAt: "01 July 2024, 10:10 AM",
        assignedTo: "Marco Dela Cruz",
        status: "done",
      },
      {
        id: "svc-spray-3",
        title: "Apply second coat on left side wall",
        scheduledAt: "01 July 2024, 10:10 AM",
        finishedAt: undefined,
        status: "active",
        assignedTo: "Marco Dela Cruz",
      },
      {
        id: "svc-spray-4",
        title: "Clean and prep tools post-application",
        scheduledAt: "01 July 2024, 10:30 AM",
        finishedAt: undefined,
        status: "pending",
      },
    ],
  },
  {
    id: "svc-wallpaper",
    title: "Wallpapering",
    scheduledAt: "01 July 2024, 11:15 AM",
    finishedAt: undefined,
    status: "pending",
    children: [
      {
        id: "svc-wallpaper-1",
        title: "Measure and mark wall for wallpaper alignment",
        scheduledAt: "01 July 2024, 11:15 AM",
        finishedAt: undefined,
        status: "pending",
      },
      {
        id: "svc-wallpaper-2",
        title: "Apply wallpaper to left side wall section",
        scheduledAt: "01 July 2024, 11:40 AM",
        finishedAt: undefined,
        status: "pending",
      },
      {
        id: "svc-wallpaper-3",
        title: "Trim edges and seal corners",
        scheduledAt: "01 July 2024, 12:05 PM",
        finishedAt: undefined,
        status: "pending",
      },
    ],
  },
  {
    id: "svc-prep",
    title: "Surface Preparation",
    scheduledAt: "01 July 2024, 8:15 AM",
    finishedAt: undefined,
    status: "done",
    children: [
      {
        id: "svc-prep-1",
        title: "Cover floor and furniture with drop cloths",
        scheduledAt: "01 July 2024, 8:15 AM",
        finishedAt: "01 July 2024, 8:30 AM",
        assignedTo: "Marco Dela Cruz",
        status: "done",
      },
      {
        id: "svc-prep-2",
        title: "Patch small wall holes and sand smooth",
        scheduledAt: "01 July 2024, 8:30 AM",
        finishedAt: "01 July 2024, 9:10 AM",
        assignedTo: "Marco Dela Cruz",
        status: "done",
      },
    ],
  },
  {
    id: "svc-cleanup",
    title: "Cleanup and Handover",
    scheduledAt: "01 July 2024, 4:30 PM",
    finishedAt: undefined,
    status: "pending",
    children: [
      {
        id: "svc-cleanup-1",
        title: "Remove masking tape and protective covers",
        scheduledAt: "01 July 2024, 4:30 PM",
        finishedAt: undefined,
        status: "pending",
      },
      {
        id: "svc-cleanup-2",
        title: "Final inspection and client walkthrough",
        scheduledAt: "01 July 2024, 5:00 PM",
        finishedAt: undefined,
        status: "pending",
      },
    ],
  },
];

function monthToIndex(m: string) {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return months[m.toLowerCase()] ?? 0;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// "01 July 2024, 11:15 AM" -> "2024-07-01T11:15"
function prettyToISO(pretty?: string) {
  if (!pretty) return "";
  const parts = pretty.split(",");
  if (parts.length < 2) return "";
  const left = parts[0].trim();
  const right = parts[1].trim();

  const leftParts = left.split(" ").filter(Boolean);
  if (leftParts.length < 3) return "";
  const day = Number(leftParts[0]);
  const month = monthToIndex(leftParts[1]);
  const year = Number(leftParts[2]);

  const timeParts = right.split(" ").filter(Boolean);
  if (timeParts.length < 2) return "";
  const hm = timeParts[0];
  const ampm = timeParts[1].toUpperCase();
  const hmParts = hm.split(":");
  if (hmParts.length < 2) return "";

  let hour = Number(hmParts[0]);
  const minute = Number(hmParts[1]);

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  if (!year || !month || !day) return "";
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";

  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

// "2024-07-01T11:15" -> "01 July 2024, 11:15 AM"
function isoToPretty(iso?: string) {
  if (!iso) return "";
  const [datePart, timePart] = iso.split("T");
  if (!datePart || !timePart) return "";

  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  const [hh, mm] = timePart.split(":").map((v) => Number(v));
  if (!y || !m || !d) return "";

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  let hour12 = hh;
  let ampm = "AM";
  if (hh === 0) {
    hour12 = 12;
    ampm = "AM";
  } else if (hh === 12) {
    hour12 = 12;
    ampm = "PM";
  } else if (hh > 12) {
    hour12 = hh - 12;
    ampm = "PM";
  }

  return `${pad2(d)} ${monthNames[m - 1]} ${y}, ${hour12}:${pad2(mm)} ${ampm}`;
}

export default function SubTaskAssignment() {
  const router = useRouter();

  const [services] = useState<ServiceGroup[]>(SERVICES);

  // Expanded by default
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(services.map((s) => s.id))
  );

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});

  // Only names that exist in data
  const peopleOptions = useMemo(() => {
    const s = new Set<string>();
    services.forEach((g) =>
      g.children.forEach((c) => {
        if (c.assignedTo) s.add(c.assignedTo);
      })
    );
    return Array.from(s);
  }, [services]);

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setEditingStepId(null);
  }

  function startEdit(step: ServiceStep) {
    setEditingStepId(step.id);
    setDrafts((prev) => {
      if (prev[step.id]) return prev;
      return {
        ...prev,
        [step.id]: {
          assignedTo: step.assignedTo ?? "",
          description: step.title ?? "",
          payment: "",
          scheduledISO: prettyToISO(step.scheduledAt),
        },
      };
    });
  }

  function setDraft(stepId: string, patch: Partial<EditDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [stepId]: {
        assignedTo: prev[stepId]?.assignedTo ?? "",
        description: prev[stepId]?.description ?? "",
        payment: prev[stepId]?.payment ?? "",
        scheduledISO: prev[stepId]?.scheduledISO ?? "",
        ...patch,
      },
    }));
  }

  function doneEditUI() {
    setEditingStepId(null);
  }

  function deleteSubtaskUI(stepId: string) {
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[stepId];
      return copy;
    });
    setEditingStepId(null);
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Job</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Sub Task Assignment</span>
        </div>

        {/* main card */}
        <div className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 pt-4 pb-3">
            <div className="text-[14px] font-semibold text-gray-900">Sub Task Assignment</div>
          </div>

          {/* scroll area inside card */}
          <div className="flex-1 min-h-0 px-6 pb-4 overflow-hidden">
            <div className="h-full overflow-y-auto pr-3 green-scrollbar">
              <div className="space-y-3">
                {services.map((g) => {
                  const isOpen = expanded.has(g.id);

                  return (
                    <div key={g.id} className={`rounded-md border ${BORDER} bg-white overflow-hidden`}>
                      {/* main task header with emphasis when open */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={`w-full flex items-center justify-between px-5 py-3 text-left ${
                          isOpen ? "bg-[#F7FBF5]" : "bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-9 w-[4px] rounded-full ${isOpen ? "opacity-100" : "opacity-0"}`}
                            style={{ backgroundColor: GREEN }}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-gray-900 truncate">
                                {g.title}
                              </span>

                              {isOpen && (
                                <span className="text-[10px] font-bold text-gray-700 bg-white border border-gray-200 rounded px-2 py-[2px]">
                                  MAIN TASK
                                </span>
                              )}
                            </div>

                            {isOpen && (
                              <div className="text-[11px] text-gray-500 mt-[2px]">
                                {g.children.length} sub task{g.children.length === 1 ? "" : "s"}
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md shrink-0"
                          style={{ backgroundColor: GREEN_SOFT }}
                        >
                          {isOpen ? (
                            <ChevronUp className="h-5 w-5 text-gray-800" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-800" />
                          )}
                        </span>
                      </button>

                      {/* subtasks */}
                      {isOpen && (
                        <div className="px-5 pb-4">
                          <div className="space-y-3">
                            {g.children.map((step) => {
                              const isEditing = editingStepId === step.id;
                              const draft = drafts[step.id];

                              const assignedTo = step.assignedTo ?? "";
                              const description = step.title ?? "";
                              const scheduledPretty = step.scheduledAt ?? "";

                              return (
                                <div key={step.id} className="pl-8">
                                  {!isEditing ? (
                                    <div className={`rounded-md border ${BORDER} bg-white px-5 py-4`}>
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="grid grid-cols-[140px_1fr_180px_1fr] gap-y-2 gap-x-6 text-[13px]">
                                          <Label>Assigned to:</Label>
                                          <Value>{assignedTo}</Value>

                                          <Label>Description:</Label>
                                          <Value className="max-w-[520px]">{description}</Value>

                                          <Label>Cost:</Label>
                                          <Value />

                                          <Label>Scheduled Date &amp; Time:</Label>
                                          <Value>{scheduledPretty}</Value>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => startEdit(step)}
                                          className="h-8 w-[200px] rounded-md text-[13px] font-semibold shrink-0"
                                          style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={`rounded-md border ${BORDER} bg-white px-6 py-5`}>
                                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        <div className="col-span-1">
                                          <Label>Assigned to:</Label>
                                          <div className="relative mt-1 w-full max-w-[320px]">
                                            <select
                                              value={draft?.assignedTo ?? ""}
                                              onChange={(e) =>
                                                setDraft(step.id, { assignedTo: e.target.value })
                                              }
                                              className="appearance-none h-10 w-full rounded-md border border-gray-300 bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
                                            >
                                              <option value="" />
                                              {peopleOptions.map((p) => (
                                                <option key={p} value={p}>
                                                  {p}
                                                </option>
                                              ))}
                                            </select>
                                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                          </div>
                                        </div>

                                        <div className="col-span-1">
                                          <Label>Scheduled Date &amp; Time</Label>
                                          <div className="mt-1 w-full max-w-[340px]">
                                            <input
                                              type="datetime-local"
                                              value={draft?.scheduledISO ?? ""}
                                              onChange={(e) =>
                                                setDraft(step.id, { scheduledISO: e.target.value })
                                              }
                                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                                            />
                                            <div className="text-[11px] text-gray-500 mt-1">
                                              Preview:{" "}
                                              <span className="text-gray-700">
                                                {isoToPretty(draft?.scheduledISO) || scheduledPretty}
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="col-span-2">
                                          <Label>Description:</Label>
                                          <textarea
                                            value={draft?.description ?? description}
                                            onChange={(e) =>
                                              setDraft(step.id, { description: e.target.value })
                                            }
                                            className="mt-1 h-[90px] w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none"
                                          />
                                        </div>

                                        <div className="col-span-1">
                                          <Label>Payment:</Label>
                                          <input
                                            value={draft?.payment ?? ""}
                                            onChange={(e) =>
                                              setDraft(step.id, { payment: e.target.value })
                                            }
                                            className="mt-1 h-10 w-full max-w-[340px] rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                                            placeholder=""
                                          />
                                        </div>

                                        <div className="col-span-1 flex items-end justify-end gap-3">
                                          <button
                                            type="button"
                                            onClick={doneEditUI}
                                            className="h-10 w-[140px] rounded-md text-[13px] font-semibold"
                                            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                                          >
                                            Done
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => deleteSubtaskUI(step.id)}
                                            className="h-10 w-[160px] rounded-md bg-[#FAD6D6] text-[13px] font-semibold text-[#D33A3A]"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="h-6" />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-5">
          <button
            type="button"
            onClick={() => router.push("/admin/job-creation/materials-assignment")}
            className="h-10 w-[220px] rounded-md text-[13px] font-semibold"
            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
          >
            Next
          </button>

          <button
            type="button"
            onClick={() => history.back()}
            className="h-10 w-[220px] rounded-md bg-[#E9E9E9] text-[13px] font-semibold text-gray-700"
          >
            Go Back
          </button>
        </div>
      </div>

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${GREEN};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .green-scrollbar {
          scrollbar-color: ${GREEN} #eaf7e4;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-gray-700">{children}</div>;
}

function Value({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <div className={`text-[13px] text-gray-400 ${className}`}>{children ?? ""}</div>;
}
