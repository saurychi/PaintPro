"use client";

import React, { useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";

type ExistingMaterial = {
  id: string;
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
  onUpdateMaterialQuantity: (materialRowId: string, quantity: number) => void;
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
  onUpdateMaterialQuantity,
  onRemoveMaterial,
}: AddMaterialModalProps) {
  const [search, setSearch] = useState("");

  const usedMaterialNames = useMemo(() => {
    return new Set(existingMaterials.map((item) => item.name.trim().toLowerCase()));
  }, [existingMaterials]);

  const availableMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();

    return materialOptions.filter((item) => {
      const alreadyUsed = usedMaterialNames.has(item.name.trim().toLowerCase());
      if (alreadyUsed) return false;

      if (!query) return true;
      return item.name.toLowerCase().includes(query);
    });
  }, [materialOptions, search, usedMaterialNames]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Add Materials</h3>
              <p className="mt-1 text-sm text-gray-600">{mainTaskTitle}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid max-h-[78vh] grid-cols-1 md:grid-cols-[520px_minmax(0,1fr)]">
          <div className="border-b border-gray-200 md:border-b-0 md:border-r md:border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                Current Materials
              </p>
            </div>

            <div className="max-h-[34vh] overflow-y-auto green-scrollbar px-3 py-3 md:max-h-[calc(78vh-57px)]">
              {existingMaterials.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  No materials added yet for this main task.
                </div>
              ) : (
                <div className="space-y-2">
                  {existingMaterials.map((item, index) => (
                    <div
                        key={`${item.id ?? item.name ?? "existing-material"}_${index}`}
                        className="rounded-md border border-gray-200 bg-white px-3 py-3"
                    >
                        <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-gray-900">
                            {item.name}
                        </p>

                        <div className="mt-3 grid grid-cols-[100px_100px_minmax(0,1fr)_40px] items-end gap-2">
                            <div>
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Quantity
                            </label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(event) =>
                                onUpdateMaterialQuantity(
                                    item.id,
                                    Number(event.target.value || 1)
                                )
                                }
                                className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none transition focus:border-green-300"
                            />
                            </div>

                            <div>
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Unit Cost
                            </label>
                            <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium text-gray-800">
                                ₱{Number(item.unitCost || 0).toLocaleString()}
                            </div>
                            </div>

                            <div>
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Estimated Cost
                            </label>
                            <div className="min-w-0 flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium text-gray-800">
                                ₱{Number(item.estimatedCost || 0).toLocaleString()}
                            </div>
                            </div>

                            <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => onRemoveMaterial(item.id)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                                title="Remove material"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                            </div>
                        </div>
                        </div>
                    </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="min-w-0">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                Add More Materials
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

            <div className="max-h-[44vh] overflow-y-auto green-scrollbar px-3 py-3 md:max-h-[calc(78vh-114px)]">
              {loadingOptions ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  Loading material options...
                </div>
              ) : availableMaterials.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                  No available materials found.
                </div>
              ) : (
                <div className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
                  {availableMaterials.map((item, index) => (
                    <div
                      key={`${item.id ?? item.name ?? "material"}_${index}`}
                      className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onAddMaterial(item, 1)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-green-600 transition hover:bg-green-50"
                        title="Add material"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          {item.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
