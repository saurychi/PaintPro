"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";

type CatalogSubTask = {
  id: string;
  name: string;
  sortOrder: number;
};

type SubTaskPickerModalProps = {
  open: boolean;
  mainTaskTitle: string;
  subTasks: CatalogSubTask[];
  selectedIds: string[];
  onToggle: (subTask: CatalogSubTask) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenCreateModal: () => void;
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";

export default function SubTaskPickerModal({
  open,
  mainTaskTitle,
  subTasks,
  selectedIds,
  onToggle,
  onClose,
  onSave,
  onOpenCreateModal,
}: SubTaskPickerModalProps) {
  const orderedSubTasks = useMemo(() => {
    const selectedSet = new Set(selectedIds);

    const sortSubTasks = (items: CatalogSubTask[]) =>
      [...items].sort((a, b) => {
        const sortDiff = a.sortOrder - b.sortOrder;
        if (sortDiff !== 0) return sortDiff;
        return a.name.localeCompare(b.name);
      });

    const selectedItems = subTasks.filter((item) => selectedSet.has(item.id));
    const unselectedItems = subTasks.filter(
      (item) => !selectedSet.has(item.id),
    );

    return [...sortSubTasks(selectedItems), ...sortSubTasks(unselectedItems)];
  }, [subTasks, selectedIds]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              Choose Sub Tasks
            </h3>
            <p className="mt-1 text-sm text-gray-600">{mainTaskTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
              <Plus className="h-4 w-4" />
              Add
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100"
              aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="green-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {orderedSubTasks.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-500">
                No sub tasks found for this main task.
              </div>
            ) : (
              orderedSubTasks.map((subTask, index) => {
                const selected = selectedIds.includes(subTask.id);

                return (
                  <div
                    key={subTask.id}
                    className={`flex items-center gap-3 px-4 py-3 transition ${
                      selected ? "opacity-45" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[12px] font-semibold text-gray-600">
                      {index + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-800">
                        {subTask.name}
                      </span>
                    </div>

                    {!selected ? (
                      <button
                        type="button"
                        onClick={() => onToggle(subTask)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 transition duration-150 hover:bg-emerald-100 hover:text-emerald-700 active:scale-95"
                        aria-label={`Add ${subTask.name}`}
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
            Cancel
          </button>

          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold text-white transition hover:brightness-95"
            style={{ backgroundColor: ACCENT }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
