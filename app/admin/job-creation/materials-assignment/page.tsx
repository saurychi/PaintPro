"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

type StepStatus = "done" | "active" | "pending";

type MaterialItem = {
  id: string;
  status: StepStatus;

  // view card
  name: string;
  idNo: string;
  quantity: number;
  unitCost: string;
  totalCost: string;
  imageUrl: string;

  // edit card fields
  materialLabel: string;
  editQuantity: number;
  editTotalCost: string;
  editImageUrl: string;
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  children: MaterialItem[];
};

const GREEN = "#7ED957";
const GREEN_SOFT = "#DFF6D5";
const BORDER = "border-gray-300";

type EditDraft = {
  materialLabel: string;
  quantity: number;
};

const SERVICES: ServiceGroup[] = [
  {
    id: "svc-wallpaper",
    title: "Wallpapering",
    status: "active",
    children: [
      {
        id: "mat-wall-1",
        status: "done",
        name: "Taubmans Endure Interior – Native Ivy (4L)",
        idNo: "#001-005-05A-001",
        quantity: 2,
        unitCost: "$25",
        totalCost: "$50",
        imageUrl:
          "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Gilly’s Liquid Beeswax Polish (250ml)",
        editQuantity: 2,
        editTotalCost: "$100",
        editImageUrl:
          "https://images.unsplash.com/photo-1580915411954-282cb1a5d780?auto=format&fit=crop&w=240&q=70",
      },
      {
        id: "mat-wall-2",
        status: "pending",
        name: "Dulux Wash & Wear – White on White (10L)",
        idNo: "#001-006-11B-009",
        quantity: 1,
        unitCost: "$89",
        totalCost: "$89",
        imageUrl:
          "https://images.unsplash.com/photo-1616628188550-808b75d69d0b?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Wallpaper Adhesive – Heavy Duty (5kg)",
        editQuantity: 1,
        editTotalCost: "$35",
        editImageUrl:
          "https://images.unsplash.com/photo-1615485737651-580a6f2d8d5c?auto=format&fit=crop&w=240&q=70",
      },
      {
        id: "mat-wall-3",
        status: "active",
        name: "Painter’s Masking Tape – 48mm (3 rolls)",
        idNo: "#009-221-77T-013",
        quantity: 1,
        unitCost: "$12",
        totalCost: "$12",
        imageUrl:
          "https://images.unsplash.com/photo-1611095564985-8970c5d3a9e4?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Edge Sealer – Clear (500ml)",
        editQuantity: 1,
        editTotalCost: "$18",
        editImageUrl:
          "https://images.unsplash.com/photo-1586201375761-83865001e31b?auto=format&fit=crop&w=240&q=70",
      },
    ],
  },
  {
    id: "svc-spray",
    title: "Spray or Brush Roll Finish",
    status: "pending",
    children: [
      {
        id: "mat-spray-1",
        status: "pending",
        name: "Boysen Latex Paint – Meadow Green (4L)",
        idNo: "#002-100-03G-120",
        quantity: 3,
        unitCost: "$21",
        totalCost: "$63",
        imageUrl:
          "https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Paint Thinner (1L)",
        editQuantity: 1,
        editTotalCost: "$7",
        editImageUrl:
          "https://images.unsplash.com/photo-1616627988040-6e2f615e8c2e?auto=format&fit=crop&w=240&q=70",
      },
      {
        id: "mat-spray-2",
        status: "pending",
        name: "Roller Set – 9 inch (with tray)",
        idNo: "#003-301-09R-001",
        quantity: 1,
        unitCost: "$15",
        totalCost: "$15",
        imageUrl:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Extension Pole – 2m",
        editQuantity: 1,
        editTotalCost: "$14",
        editImageUrl:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=240&q=70",
      },
    ],
  },
  {
    id: "svc-prep",
    title: "Surface Preparation",
    status: "done",
    children: [
      {
        id: "mat-prep-1",
        status: "done",
        name: "Wall Putty – Quick Dry (2kg)",
        idNo: "#004-410-02P-020",
        quantity: 2,
        unitCost: "$6",
        totalCost: "$12",
        imageUrl:
          "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Sandpaper Pack – 120 grit (10 pcs)",
        editQuantity: 1,
        editTotalCost: "$5",
        editImageUrl:
          "https://images.unsplash.com/photo-1581579186898-2c32f1d7a1a3?auto=format&fit=crop&w=240&q=70",
      },
      {
        id: "mat-prep-2",
        status: "done",
        name: "Drop Cloth – Heavy Duty (3x4m)",
        idNo: "#004-420-DC-002",
        quantity: 1,
        unitCost: "$10",
        totalCost: "$10",
        imageUrl:
          "https://images.unsplash.com/photo-1616628188550-808b75d69d0b?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Painter’s Gloves (pair)",
        editQuantity: 2,
        editTotalCost: "$4",
        editImageUrl:
          "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=240&q=70",
      },
    ],
  },
  {
    id: "svc-cleanup",
    title: "Cleanup and Handover",
    status: "pending",
    children: [
      {
        id: "mat-clean-1",
        status: "pending",
        name: "Trash Bags – Contractor Grade (pack)",
        idNo: "#008-900-TB-001",
        quantity: 1,
        unitCost: "$8",
        totalCost: "$8",
        imageUrl:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=240&q=70",
        materialLabel: "Floor Cleaner Concentrate (1L)",
        editQuantity: 1,
        editTotalCost: "$9",
        editImageUrl:
          "https://images.unsplash.com/photo-1586201375761-83865001e31b?auto=format&fit=crop&w=240&q=70",
      },
    ],
  },
];

export default function MaterialsAssignment() {
  const router = useRouter();

  const [services, setServices] = useState<ServiceGroup[]>(SERVICES);

  // expanded by default
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(services.map((s) => s.id))
  );

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});

  const materialOptions = useMemo(() => {
    const s = new Set<string>();
    services.forEach((g) => g.children.forEach((c) => s.add(c.materialLabel)));
    return Array.from(s);
  }, [services]);

  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setEditingStepId(null);
  };

  const startEdit = (item: MaterialItem) => {
    setEditingStepId(item.id);
    setDrafts((prev) => {
      if (prev[item.id]) return prev;
      return {
        ...prev,
        [item.id]: {
          materialLabel: item.materialLabel,
          quantity: item.editQuantity,
        },
      };
    });
  };

  const setDraft = (id: string, patch: Partial<EditDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        materialLabel: prev[id]?.materialLabel ?? "",
        quantity: prev[id]?.quantity ?? 1,
        ...patch,
      },
    }));
  };

  const doneEditUI = () => setEditingStepId(null);

  const deleteItemUI = (id: string) => {
    // UI only: remove from state so it feels real
    setServices((prev) =>
      prev.map((g) => ({ ...g, children: g.children.filter((c) => c.id !== id) }))
    );
    setEditingStepId(null);
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Job</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Main Task Materials</span>
        </div>

        {/* main card - SAME as Sub Task page */}
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
                      {/* main task header (unchanged) */}
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
                                {g.children.length} item{g.children.length === 1 ? "" : "s"}
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

                      {/* items */}
                      {isOpen && (
                        <div className="px-5 pb-4">
                          <div className="space-y-3">
                            {g.children.map((item) => {
                              const isEditing = editingStepId === item.id;
                              const draft = drafts[item.id];

                              return (
                                <div key={item.id} className="pl-8">
                                  {!isEditing ? (
                                    // VIEW CARD (same spacing + image)
                                    <div className={`rounded-md border ${BORDER} bg-white px-5 py-4`}>
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-5">
                                          <div className="h-20 w-20 rounded-md border border-gray-200 bg-white overflow-hidden shrink-0">
                                            <img
                                              src={item.imageUrl}
                                              alt={item.name}
                                              className="h-full w-full object-cover"
                                            />
                                          </div>

                                          <div className="grid grid-cols-[90px_1fr_110px_1fr] gap-y-2 gap-x-6 text-[13px]">
                                            <Label>Name:</Label>
                                            <Value className="max-w-[360px]">{item.name}</Value>

                                            <Label>ID#:</Label>
                                            <Value>{item.idNo}</Value>

                                            <Label>Quantity:</Label>
                                            <Value>{String(item.quantity)}</Value>

                                            <Label>Unit Cost:</Label>
                                            <Value>{item.unitCost}</Value>

                                            <Label>Total Cost:</Label>
                                            <Value>{item.totalCost}</Value>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => startEdit(item)}
                                          className="h-8 w-[200px] rounded-md text-[13px] font-semibold shrink-0 self-end"
                                          style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    // EDIT CARD (same style + image)
                                    <div className={`rounded-md border ${BORDER} bg-white px-6 py-5`}>
                                      <div className="flex items-start gap-6">
                                        <div className="h-24 w-24 rounded-md border border-gray-200 bg-white overflow-hidden shrink-0">
                                          <img
                                            src={item.editImageUrl}
                                            alt={item.materialLabel}
                                            className="h-full w-full object-cover"
                                          />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                            <div className="col-span-2 flex items-center gap-4">
                                              <Label className="w-[90px]">Material:</Label>

                                              <div className="relative w-full max-w-[420px]">
                                                <select
                                                  value={draft?.materialLabel ?? item.materialLabel}
                                                  onChange={(e) =>
                                                    setDraft(item.id, { materialLabel: e.target.value })
                                                  }
                                                  className="appearance-none h-10 w-full rounded-md border border-gray-300 bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
                                                >
                                                  {materialOptions.map((opt) => (
                                                    <option key={opt} value={opt}>
                                                      {opt}
                                                    </option>
                                                  ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                              </div>
                                            </div>

                                            <div className="col-span-1 flex items-center gap-4">
                                              <Label className="w-[90px]">Quantity:</Label>
                                              <input
                                                type="number"
                                                min={1}
                                                value={String(draft?.quantity ?? item.editQuantity)}
                                                onChange={(e) =>
                                                  setDraft(item.id, { quantity: Number(e.target.value || 1) })
                                                }
                                                className="h-10 w-[120px] rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                                              />
                                            </div>

                                            <div className="col-span-1 flex items-center gap-4">
                                              <Label className="w-[90px]">Total Cost:</Label>
                                              <Value>{item.editTotalCost}</Value>
                                            </div>

                                            <div className="col-span-2 flex items-end justify-end gap-3 pt-2">
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
                                                onClick={() => deleteItemUI(item.id)}
                                                className="h-10 w-[160px] rounded-md bg-[#FAD6D6] text-[13px] font-semibold text-[#D33A3A]"
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {g.children.length === 0 && (
                              <div className="pl-8 text-[13px] text-gray-400">No materials yet.</div>
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

        {/* bottom actions */}
        <div className="shrink-0 flex items-center justify-end gap-5">
          <button
            type="button"
            onClick={() => router.push("/admin/job-creation/overview")}
            className="h-10 w-[260px] rounded-md text-[13px] font-semibold"
            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
          >
            Next
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
