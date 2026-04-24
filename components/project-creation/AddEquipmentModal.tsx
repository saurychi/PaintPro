"use client";

import React, { useMemo } from "react";
import { Plus, X } from "lucide-react";

export type EquipmentCatalogItem = {
  id: string;
  name: string;
  unitCost?: number | null;
};

type AddEquipmentModalProps = {
  open: boolean;
  subTaskTitle: string;
  equipmentItems: EquipmentCatalogItem[];
  selectedIds: string[];
  onToggle: (item: EquipmentCatalogItem) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function AddEquipmentModal({
  open,
  subTaskTitle,
  equipmentItems,
  selectedIds,
  onToggle,
  onClose,
  onSave,
}: AddEquipmentModalProps) {
  const orderedEquipment = useMemo(() => {
    const selectedSet = new Set(selectedIds);

    const selectedItems = equipmentItems.filter((item) =>
      selectedSet.has(item.id),
    );
    const unselectedItems = equipmentItems.filter(
      (item) => !selectedSet.has(item.id),
    );

    return [
      ...selectedItems.sort((a, b) => a.name.localeCompare(b.name)),
      ...unselectedItems.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [equipmentItems, selectedIds]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="text-sm font-semibold text-gray-900">
            Add Equipment
          </div>
          <div className="mt-1 text-sm text-gray-600">
            Select equipment for <span className="font-medium">{subTaskTitle}</span>.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          <section className="border-b border-gray-200 md:border-b-0 md:border-r md:border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="text-[13px] font-semibold text-gray-900">
                Selected Equipment
              </div>
              <div className="mt-1 text-[12px] text-gray-500">
                Equipment currently chosen for this sub task.
              </div>
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {selectedIds.length === 0 ? (
                <div className="px-4 py-4 text-[13px] text-gray-500">
                  No equipment selected yet.
                </div>
              ) : (
                orderedEquipment
                  .filter((item) => selectedIds.includes(item.id))
                  .map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-100"
                    >
                      <div className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[12px] font-semibold text-gray-600">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-gray-800">
                          {item.name}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggle(item)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition duration-150 hover:bg-red-100 hover:text-red-600 active:scale-95"
                        aria-label={`Remove ${item.name}`}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </section>

          <section>
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="text-[13px] font-semibold text-gray-900">
                Available Equipment
              </div>
              <div className="mt-1 text-[12px] text-gray-500">
                Pick equipment to assign to this sub task.
              </div>
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {orderedEquipment.length === 0 ? (
                <div className="px-4 py-4 text-[13px] text-gray-500">
                  No equipment available. Connect your equipment catalog next.
                </div>
              ) : (
                orderedEquipment.map((item, index) => {
                  const selected = selectedIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 ${
                        selected ? "opacity-45" : ""
                      }`}
                    >
                      <div className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[12px] font-semibold text-gray-600">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-gray-800">
                          {item.name}
                        </div>
                      </div>

                      {!selected ? (
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 transition duration-150 hover:bg-emerald-100 hover:text-emerald-700 active:scale-95"
                          aria-label={`Add ${item.name}`}
                          title="Add"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="h-8 w-8 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold text-white hover:brightness-95"
            style={{ backgroundColor: "#00c065" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
