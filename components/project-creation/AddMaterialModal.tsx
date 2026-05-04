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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 md:h-[70vh]">
        <div className="h-1.5 w-full bg-emerald-500" />

        <div className="border-b border-slate-200 bg-linear-to-r from-emerald-50 via-white to-white px-5 py-4 dark:border-slate-700 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add Materials
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Review selected materials on the left and add more from the
                catalog on the right.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-slate-200 dark:border-slate-700 lg:border-b-0 lg:border-r lg:border-slate-200 lg:dark:border-slate-700">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Main Task
              </div>
              <div className="mt-1 text-[13px] font-medium text-slate-900 dark:text-slate-100">
                {mainTaskTitle}
              </div>
              <div className="mt-3 text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                Added Materials
              </div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Remove from here if you no longer want it assigned.
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto green-scrollbar px-3 py-3">
              {existingMaterials.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  No materials added yet for this main task.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                  {existingMaterials.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveMaterial(item.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:text-red-200"
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
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Available Materials
              </p>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search material name..."
                  className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 dark:border-slate-600 dark:bg-slate-950 text-[13px] text-slate-900 outline-none dark:text-slate-100 transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto green-scrollbar px-3 py-3">
              {loadingOptions ? (
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 text-[13px] text-slate-500 dark:text-slate-400">
                  Loading material options...
                </div>
              ) : materialOptions.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 text-[13px] text-slate-500 dark:text-slate-400">
                  No materials are available in the catalog yet.
                </div>
              ) : availableMaterials.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 text-[13px] text-slate-500 dark:text-slate-400">
                  {hasSearch
                    ? "No materials match your search."
                    : "All available materials are already selected for this main task."}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                  {availableMaterials.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddMaterial(item, 1)}
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
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
