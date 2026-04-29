"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

type ExistingMaterial = {
  id: string;
  materialId: string;
  name: string;
  quantity: number;
  unitCost: number;
  estimatedCost: number;
};

type MaterialOption = {
  id: string;
  name: string;
  unitCost: number;
};

type AddMaterialModalProps = {
  open: boolean;
  mainTaskTitle: string;
  existingMaterials: ExistingMaterial[];
  materialOptions: MaterialOption[];
  loadingOptions: boolean;
  onClose: () => void;
  onAddMaterial: (material: MaterialOption, quantity: number) => void;
  onRemoveMaterial: (materialRowId: string) => void;
};

export default function AddMaterialModal({
  open,
  mainTaskTitle,
  existingMaterials,
  materialOptions,
  loadingOptions,
  onClose,
  onAddMaterial,
  onRemoveMaterial,
}: AddMaterialModalProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setSearch("");
    }
  }, [open]);

  const selectedMaterialIds = useMemo(() => {
    return new Set(
      existingMaterials
        .map((item) => item.materialId?.trim())
        .filter(Boolean),
    );
  }, [existingMaterials]);

  const availableMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();

    return materialOptions
      .filter((item) => !selectedMaterialIds.has(item.id))
      .filter((item) => {
        if (!query) return true;
        return item.name.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [materialOptions, search, selectedMaterialIds]);

  const hasSearch = search.trim().length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:h-[70vh]">
        <div className="h-1.5 w-full bg-emerald-500" />

        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Add Materials
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Review selected materials on the left and add more from the
                catalog on the right.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-gray-200 lg:border-b-0 lg:border-r lg:border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-emerald-700">
                Main Task
              </div>
              <div className="mt-1 text-[13px] font-medium text-gray-900">
                {mainTaskTitle}
              </div>
              <div className="mt-3 text-[12px] font-semibold text-gray-900">
                Added Materials
              </div>
              <div className="mt-1 text-[12px] text-gray-500">
                Remove from here if you no longer want it assigned.
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto green-scrollbar px-3 py-3">
              {existingMaterials.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-500">
                  No materials added yet for this main task.
                </div>
              ) : (
                <div className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
                  {existingMaterials.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          {item.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveMaterial(item.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600"
                        aria-label={`Remove ${item.name}`}
                        title="Remove material"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                Available Materials
              </p>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search material name..."
                  className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-[13px] text-gray-900 outline-none transition focus:border-green-300"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto green-scrollbar px-3 py-3">
              {loadingOptions ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  Loading material options...
                </div>
              ) : materialOptions.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  No materials are available in the catalog yet.
                </div>
              ) : availableMaterials.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  {hasSearch
                    ? "No materials match your search."
                    : "All available materials are already selected for this main task."}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
                  {availableMaterials.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          {item.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddMaterial(item, 1)}
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        title="Add material"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
