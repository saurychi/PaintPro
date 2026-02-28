"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

type StepStatus = "done" | "active" | "pending";

type SubTask = {
  id: string;
  assignedTo: string;
  description: string;
  cost: string;
  scheduled: string;
  status: StepStatus;
};

type MaterialItem = {
  id: string;
  name: string;
  idNo: string;
  quantity: number;
  unitCost: string;
  totalCost: string;
  imageUrl: string;
};

type MainTask = {
  id: string;
  title: string;
  materials: MaterialItem[];
  subtasks: SubTask[];
};

const GREEN = "#7ED957";
const GREEN_SOFT = "#DFF6D5";
const BORDER = "border-gray-300";

const DEMO_JOB = {
  jobNo: "#0000002A-2024",
  siteName: "Emu House",
};

// “Added Main Tasks” chips (based on screenshot)
const ADDED_MAIN_TASKS = [
  "Wallpapering",
  "Spray or Brush Roll Finish",
  "Decking Staining & Coating",
  "Surface Preparation",
  "Cleanup and Handover",
];


// Placeholder images (swap to Firebase later)
const IMG_PAINT_CAN =
  "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=240&q=70";
const IMG_BOTTLES =
  "https://images.unsplash.com/photo-1580915411954-282cb1a5d780?auto=format&fit=crop&w=240&q=70";

const TASKS: MainTask[] = [
  {
    id: "t-wallpaper",
    title: "Wallpapering",
    materials: [
      {
        id: "m-1",
        name: "Taubmans Endure Interior – Native Ivy (4L)",
        idNo: "#001-005-05A-001",
        quantity: 2,
        unitCost: "$25",
        totalCost: "$50",
        imageUrl: IMG_PAINT_CAN,
      },
      {
        id: "m-2",
        name: "Gilly’s Liquid Beeswax Polish (250ml)",
        idNo: "#001-008-00B-002",
        quantity: 2,
        unitCost: "$50",
        totalCost: "$100",
        imageUrl: IMG_BOTTLES,
      },
    ],
    subtasks: [
      {
        id: "s-1",
        assignedTo: "Marco Dela Cruz",
        description:
          "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
        cost: "$50.99",
        scheduled: "7/20/2025-10:30 PM",
        status: "done",
      },
      {
        id: "s-2",
        assignedTo: "Marco Dela Cruz",
        description:
          "Final alignment check and seal wallpaper edges.",
        cost: "$35.00",
        scheduled: "7/20/2025-11:15 PM",
        status: "pending",
      },
    ],
  },

  {
    id: "t-spray",
    title: "Spray or Brush Roll Finish",
    materials: [
      {
        id: "m-3",
        name: "Boysen Latex Paint – Meadow Green (4L)",
        idNo: "#002-100-03G-120",
        quantity: 3,
        unitCost: "$21",
        totalCost: "$63",
        imageUrl: IMG_PAINT_CAN,
      },
      {
        id: "m-4",
        name: "Roller Set – 9 inch with Tray",
        idNo: "#003-301-09R-001",
        quantity: 1,
        unitCost: "$15",
        totalCost: "$15",
        imageUrl: IMG_BOTTLES,
      },
    ],
    subtasks: [
      {
        id: "s-3",
        assignedTo: "Juan Ramos",
        description: "Apply base coat on all exposed walls.",
        cost: "$60.00",
        scheduled: "7/21/2025-09:00 AM",
        status: "active",
      },
      {
        id: "s-4",
        assignedTo: "Juan Ramos",
        description: "Apply second coat and smooth finish.",
        cost: "$60.00",
        scheduled: "7/21/2025-11:30 AM",
        status: "pending",
      },
    ],
  },

  {
    id: "t-decking",
    title: "Decking Staining & Coating",
    materials: [
      {
        id: "m-5",
        name: "Decking Oil – Natural Finish (5L)",
        idNo: "#005-550-DO-009",
        quantity: 1,
        unitCost: "$75",
        totalCost: "$75",
        imageUrl: IMG_PAINT_CAN,
      },
      {
        id: "m-6",
        name: "Wood Cleaner Concentrate (1L)",
        idNo: "#005-551-WC-002",
        quantity: 1,
        unitCost: "$18",
        totalCost: "$18",
        imageUrl: IMG_BOTTLES,
      },
    ],
    subtasks: [
      {
        id: "s-5",
        assignedTo: "Paolo Reyes",
        description: "Clean and prep decking surface.",
        cost: "$40.00",
        scheduled: "7/22/2025-08:30 AM",
        status: "pending",
      },
      {
        id: "s-6",
        assignedTo: "Paolo Reyes",
        description: "Apply first coat of decking stain.",
        cost: "$55.00",
        scheduled: "7/22/2025-10:00 AM",
        status: "pending",
      },
    ],
  },

  {
    id: "t-prep",
    title: "Surface Preparation",
    materials: [
      {
        id: "m-7",
        name: "Wall Putty – Quick Dry (2kg)",
        idNo: "#004-410-02P-020",
        quantity: 2,
        unitCost: "$6",
        totalCost: "$12",
        imageUrl: IMG_PAINT_CAN,
      },
      {
        id: "m-8",
        name: "Sandpaper Pack – 120 Grit (10 pcs)",
        idNo: "#004-412-SP-010",
        quantity: 1,
        unitCost: "$5",
        totalCost: "$5",
        imageUrl: IMG_BOTTLES,
      },
    ],
    subtasks: [
      {
        id: "s-7",
        assignedTo: "Marco Dela Cruz",
        description: "Patch wall holes and sand surfaces smooth.",
        cost: "$45.00",
        scheduled: "7/20/2025-08:30 AM",
        status: "done",
      },
    ],
  },

  {
    id: "t-cleanup",
    title: "Cleanup and Handover",
    materials: [
      {
        id: "m-9",
        name: "Heavy Duty Trash Bags (Pack)",
        idNo: "#008-900-TB-001",
        quantity: 1,
        unitCost: "$8",
        totalCost: "$8",
        imageUrl: IMG_BOTTLES,
      },
    ],
    subtasks: [
      {
        id: "s-8",
        assignedTo: "Juan Ramos",
        description: "Final cleanup and waste disposal.",
        cost: "$30.00",
        scheduled: "7/23/2025-03:30 PM",
        status: "pending",
      },
      {
        id: "s-9",
        assignedTo: "Site Supervisor",
        description: "Client walkthrough and handover.",
        cost: "$0.00",
        scheduled: "7/23/2025-04:30 PM",
        status: "pending",
      },
    ],
  },
];

export default function Overview() {
  const router = useRouter();

  // Expand all main tasks at start (like your other pages)
  const [expandedMain, setExpandedMain] = useState<Set<string>>(
    () => new Set(TASKS.map((t) => t.id))
  );

  // Materials/Subtasks sections are open at start (matches screenshot)
  const [openSections, setOpenSections] = useState<Record<string, { materials: boolean; subtasks: boolean }>>(
    () =>
      Object.fromEntries(
        TASKS.map((t) => [t.id, { materials: true, subtasks: true }])
      )
  );

  const toggleMain = (id: string) => {
    setExpandedMain((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (taskId: string, key: "materials" | "subtasks") => {
    setOpenSections((prev) => ({
      ...prev,
      [taskId]: {
        materials: prev[taskId]?.materials ?? true,
        subtasks: prev[taskId]?.subtasks ?? true,
        [key]: !(prev[taskId]?.[key] ?? true),
      },
    }));
  };

  const chips = useMemo(() => ADDED_MAIN_TASKS, []);

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* Header breadcrumb */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Job</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Overview</span>
        </div>

        {/* Top row cards */}
        <div className="grid grid-cols-12 gap-4">
          {/* Current Job */}
          <div className="col-span-12 lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="text-[12px] font-semibold text-gray-700 mb-3">Current Job</div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-[16px] font-semibold text-gray-900">{DEMO_JOB.jobNo}</div>
              <div className="text-[12px] text-gray-500 mt-1">{DEMO_JOB.siteName}</div>
            </div>
          </div>

          {/* Added Main Tasks */}
          <div className="col-span-12 lg:col-span-9 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="text-[12px] font-semibold text-gray-700 mb-3">Added Main Tasks</div>

            <div className="flex flex-wrap gap-3">
              {chips.map((c, idx) => (
                <span
                  key={`${c}-${idx}`}
                  className="px-6 py-2 rounded-full text-[12px] font-semibold border border-[#CFEAC2]"
                  style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tasks main card (scroll inside) */}
        <div className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 pt-4 pb-3">
            <div className="text-[14px] font-semibold text-gray-900">Tasks</div>
          </div>

          <div className="flex-1 min-h-0 px-6 pb-4 overflow-hidden">
            <div className="h-full overflow-y-auto pr-3 green-scrollbar">
              <div className="space-y-3">
                {TASKS.map((task) => {
                  const isOpen = expandedMain.has(task.id);
                  const sec = openSections[task.id] ?? { materials: true, subtasks: true };

                  return (
                    <div key={task.id} className={`rounded-md border ${BORDER} bg-white overflow-hidden`}>
                      {/* Main task header */}
                      <button
                        type="button"
                        onClick={() => toggleMain(task.id)}
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
                                {task.title}
                              </span>

                              {isOpen && (
                                <span className="text-[10px] font-bold text-gray-700 bg-white border border-gray-200 rounded px-2 py-[2px]">
                                  MAIN TASK
                                </span>
                              )}
                            </div>
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

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="px-5 pb-4 space-y-4">
                          {/* Materials section */}
                          <div>
                            <div className="flex items-center justify-between py-2">
                              <div className="text-[12px] font-semibold text-gray-700">Materials:</div>

                              <button
                                type="button"
                                onClick={() => toggleSection(task.id, "materials")}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md"
                                style={{ backgroundColor: GREEN_SOFT }}
                                aria-label="Toggle materials"
                              >
                                {sec.materials ? (
                                  <ChevronUp className="h-4 w-4 text-gray-800" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-800" />
                                )}
                              </button>
                            </div>

                            {sec.materials && (
                              <div className="space-y-3">
                                {task.materials.map((m) => (
                                  <div key={m.id} className={`rounded-md border ${BORDER} bg-white px-5 py-4`}>
                                    <div className="flex items-start gap-5">
                                      <div className="h-20 w-20 rounded-md border border-gray-200 bg-white overflow-hidden shrink-0">
                                        <img
                                          src={m.imageUrl}
                                          alt={m.name}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>

                                      <div className="grid grid-cols-[90px_1fr] gap-y-2 gap-x-5 text-[13px]">
                                        <Label>Name:</Label>
                                        <Value className="max-w-[520px]">{m.name}</Value>

                                        <Label>ID#:</Label>
                                        <Value>{m.idNo}</Value>

                                        <Label>Quantity:</Label>
                                        <Value>{String(m.quantity)}</Value>

                                        <Label>Unit Cost:</Label>
                                        <Value>{m.unitCost}</Value>

                                        <Label>Total Cost:</Label>
                                        <Value>{m.totalCost}</Value>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {task.materials.length === 0 && (
                                  <div className="text-[13px] text-gray-400">No materials yet.</div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Subtasks section */}
                          <div>
                            <div className="flex items-center justify-between py-2">
                              <div className="text-[12px] font-semibold text-gray-700">SubTasks:</div>

                              <button
                                type="button"
                                onClick={() => toggleSection(task.id, "subtasks")}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md"
                                style={{ backgroundColor: GREEN_SOFT }}
                                aria-label="Toggle subtasks"
                              >
                                {sec.subtasks ? (
                                  <ChevronUp className="h-4 w-4 text-gray-800" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-800" />
                                )}
                              </button>
                            </div>

                            {sec.subtasks && (
                              <div className="space-y-3">
                                {task.subtasks.map((s) => (
                                  <div key={s.id} className={`rounded-md border ${BORDER} bg-white px-5 py-4`}>
                                    <div className="grid grid-cols-[140px_1fr] gap-y-2 gap-x-6 text-[13px]">
                                      <Label>Assigned to:</Label>
                                      <Value>{s.assignedTo}</Value>

                                      <Label>Description:</Label>
                                      <Value className="max-w-[650px]">{s.description}</Value>

                                      <Label>Cost:</Label>
                                      <Value>{s.cost}</Value>

                                      <Label>Scheduled Date &amp; Time:</Label>
                                      <Value>{s.scheduled}</Value>
                                    </div>
                                  </div>
                                ))}

                                {task.subtasks.length === 0 && (
                                  <div className="text-[13px] text-gray-400">No subtasks yet.</div>
                                )}
                              </div>
                            )}
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

        {/* Bottom actions */}
        <div className="shrink-0 flex items-center justify-end gap-5">
          <button
            type="button"
            onClick={() => router.push("/admin/job-creation/job-quotation")}
            className="h-10 w-[260px] rounded-md text-[13px] font-semibold"
            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
          >
            Generate Quotation
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 w-[260px] rounded-md bg-[#E9E9E9] text-[13px] font-semibold text-gray-700"
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

function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`text-[13px] font-semibold text-gray-700 ${className}`}>{children}</div>;
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
