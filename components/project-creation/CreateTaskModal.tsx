"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";

type ResourceOption = {
  id: string;
  name: string;
};

type DraftSubTask = {
  id: string;
  description: string;
  sortOrder: string;
  materialIds: string[];
  equipmentIds: string[];
};

type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    sortOrder: string;
    subTasks: {
      description: string;
      sortOrder: string;
      materialIds: string[];
      equipmentIds: string[];
    }[];
  }) => Promise<void> | void;
};

const ACCENT = "#00c065";
const ACCENT_SOFT = "#e6f9ef";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function ResourcePicker({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: ResourceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((item) => item.name.toLowerCase().includes(q));
  }, [options, query]);

  const selectedItems = options.filter((item) => selectedIds.includes(item.id));

  function addItem(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function removeItem(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-gray-700">
        {label}
      </label>

      <div className="rounded-md border border-gray-300 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
          {selectedItems.length === 0 ? (
            <span className="text-[12px] text-gray-400">No {label.toLowerCase()} selected</span>
          ) : (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
              >
                {item.name}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-emerald-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="relative">
          <div className="flex items-center">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className="h-10 w-full rounded-md bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
              placeholder={`Search ${label.toLowerCase()}`}
            />
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500" />
          </div>

          {open && (
            <div className="green-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-gray-500">
                  No {label.toLowerCase()} found.
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-800 transition hover:bg-emerald-50"
                  >
                    <Plus className="h-4 w-4 text-emerald-600" />
                    {item.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateTaskModal({
  open,
  onClose,
  onSave,
}: CreateTaskModalProps) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [creating, setCreating] = useState(false);

  const [subTasks, setSubTasks] = useState<DraftSubTask[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<ResourceOption[]>([]);
  const [materialOptions, setMaterialOptions] = useState<ResourceOption[]>([]);

  useEffect(() => {
    if (!open) return;

    async function loadOptions() {
      const response = await fetch("/api/planning/getSubTaskResourceOptions");
      const data = await response.json();

      if (!response.ok) return;

      setEquipmentOptions(Array.isArray(data?.equipment) ? data.equipment : []);
      setMaterialOptions(Array.isArray(data?.materials) ? data.materials : []);
    }

    loadOptions();
  }, [open]);

  function resetForm() {
    setName("");
    setSortOrder("");
    setSubTasks([]);
  }

  function addSubTaskRow() {
    setSubTasks((prev) => [
      ...prev,
      {
        id: makeId(),
        description: "",
        sortOrder: "",
        materialIds: [],
        equipmentIds: [],
      },
    ]);
  }

  function removeSubTaskRow(id: string) {
    setSubTasks((prev) => prev.filter((item) => item.id !== id));
  }

  function updateSubTask(id: string, patch: Partial<DraftSubTask>) {
    setSubTasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (!sortOrder.trim()) return;

    try {
      setCreating(true);

      await onSave({
        name: name.trim(),
        sortOrder: sortOrder.trim(),
        subTasks: subTasks.map((item) => ({
          description: item.description.trim(),
          sortOrder: item.sortOrder.trim(),
          materialIds: item.materialIds,
          equipmentIds: item.equipmentIds,
        })),
      });

      resetForm();
      onClose();
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Create Task</h3>
            <p className="mt-1 text-sm text-gray-600">
              Add a task and define its subtasks.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="green-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                Sort Order
              </label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Sub Tasks</div>
                  <div className="mt-1 text-[12px] text-gray-500">
                    Build the task flow like a todo list.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addSubTaskRow}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition hover:brightness-95"
                  style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="p-4">
                {subTasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-[13px] text-gray-500">
                    No subtasks added yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {subTasks.map((subTask, index) => (
                      <div
                        key={subTask.id}
                        className="rounded-lg border border-gray-200 bg-white p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">
                            Sub Task {index + 1}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeSubTaskRow(subTask.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                            aria-label="Remove sub task"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div className="lg:col-span-2">
                            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                              Description
                            </label>
                            <input
                              value={subTask.description}
                              onChange={(e) =>
                                updateSubTask(subTask.id, { description: e.target.value })
                              }
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                              Sort Order
                            </label>
                            <input
                              value={subTask.sortOrder}
                              onChange={(e) =>
                                updateSubTask(subTask.id, { sortOrder: e.target.value })
                              }
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                            />
                          </div>

                          <div />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <ResourcePicker
                            label="Equipment"
                            options={equipmentOptions}
                            selectedIds={subTask.equipmentIds}
                            onChange={(ids) =>
                              updateSubTask(subTask.id, { equipmentIds: ids })
                            }
                          />

                          <ResourcePicker
                            label="Materials"
                            options={materialOptions}
                            selectedIds={subTask.materialIds}
                            onChange={(ids) =>
                              updateSubTask(subTask.id, { materialIds: ids })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={creating}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
