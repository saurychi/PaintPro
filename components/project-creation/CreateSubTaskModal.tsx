"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

type CreateSubTaskModalProps = {
  open: boolean;
  mainTaskTitle: string;
  onClose: () => void;
  onCreate: (payload: {
    description: string;
    sortOrder: string;
    defaultEquipmentIds: string[];
    defaultMaterialIds: string[];
  }) => Promise<void> | void;
};

const ACCENT = "#00c065";

export default function CreateSubTaskModal({
  open,
  mainTaskTitle,
  onClose,
  onCreate,
}: CreateSubTaskModalProps) {
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [creating, setCreating] = useState(false);

  const [equipmentOptions, setEquipmentOptions] = useState<{ id: string; name: string }[]>([]);
  const [materialOptions, setMaterialOptions] = useState<{ id: string; name: string }[]>([]);

  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");

  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);

  const [selectedEquipment, setSelectedEquipment] = useState<{ id: string; name: string }[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;

    async function loadOptions() {
      const response = await fetch("/api/planning/getSubTaskResourceOptions");
      const data = await response.json();

      if (!response.ok) {
        return;
      }

      setEquipmentOptions(Array.isArray(data?.equipment) ? data.equipment : []);
      setMaterialOptions(Array.isArray(data?.materials) ? data.materials : []);
    }

    loadOptions();
  }, [open]);

  const filteredEquipment = useMemo(() => {
    const q = equipmentQuery.trim().toLowerCase();
    return equipmentOptions.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
  }, [equipmentOptions, equipmentQuery]);

  const filteredMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase();
    return materialOptions.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
  }, [materialOptions, materialQuery]);

  function addEquipment(item: { id: string; name: string }) {
    setSelectedEquipment((prev) =>
      prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]
    );
    setEquipmentQuery("");
    setEquipmentOpen(false);
  }

  function removeEquipment(id: string) {
    setSelectedEquipment((prev) => prev.filter((item) => item.id !== id));
  }

  function addMaterial(item: { id: string; name: string }) {
    setSelectedMaterials((prev) =>
      prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]
    );
    setMaterialQuery("");
    setMaterialOpen(false);
  }

  function removeMaterial(id: string) {
    setSelectedMaterials((prev) => prev.filter((item) => item.id !== id));
  }

  if (!open) return null;

  function resetForm() {
    setDescription("");
    setSortOrder("");
    setEquipmentQuery("");
    setMaterialQuery("");
    setSelectedEquipment([]);
    setSelectedMaterials([]);
    setEquipmentOpen(false);
    setMaterialOpen(false);
  }

  async function handleCreate() {
    if (!description.trim()) return;
    if (!sortOrder.trim()) return;

    try {
      setCreating(true);
      await onCreate({
        description: description.trim(),
        sortOrder: sortOrder.trim(),
        defaultEquipmentIds: selectedEquipment.map((item) => item.id),
        defaultMaterialIds: selectedMaterials.map((item) => item.id),
      });
      resetForm();
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
      <div className="flex max-h-[80vh] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              Create Sub Task
            </h3>
            <p className="mt-1 text-sm text-gray-600">{mainTaskTitle}</p>
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
                Description Name
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                Default Equipment
              </label>

              <div className="rounded-md border border-gray-300 bg-white">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
                  {selectedEquipment.length === 0 ? (
                    <span className="text-[12px] text-gray-400">No equipment selected</span>
                  ) : (
                    selectedEquipment.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
                      >
                        {item.name}
                        <button
                          type="button"
                          onClick={() => removeEquipment(item.id)}
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
                      value={equipmentQuery}
                      onChange={(e) => {
                        setEquipmentQuery(e.target.value);
                        setEquipmentOpen(true);
                      }}
                      onFocus={() => setEquipmentOpen(true)}
                      className="h-10 w-full rounded-md bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
                      placeholder="Search equipment"
                    />
                    <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500" />
                  </div>

                  {equipmentOpen && (
                    <div className="green-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                      {filteredEquipment.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-gray-500">
                          No equipment found.
                        </div>
                      ) : (
                        filteredEquipment.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => addEquipment(item)}
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

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                Default Materials
              </label>

              <div className="rounded-md border border-gray-300 bg-white">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
                  {selectedMaterials.length === 0 ? (
                    <span className="text-[12px] text-gray-400">No materials selected</span>
                  ) : (
                    selectedMaterials.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
                      >
                        {item.name}
                        <button
                          type="button"
                          onClick={() => removeMaterial(item.id)}
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
                      value={materialQuery}
                      onChange={(e) => {
                        setMaterialQuery(e.target.value);
                        setMaterialOpen(true);
                      }}
                      onFocus={() => setMaterialOpen(true)}
                      className="h-10 w-full rounded-md bg-white px-3 pr-10 text-[13px] text-gray-800 outline-none"
                      placeholder="Search materials"
                    />
                    <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500" />
                  </div>

                  {materialOpen && (
                    <div className="green-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                      {filteredMaterials.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-gray-500">
                          No materials found.
                        </div>
                      ) : (
                        filteredMaterials.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => addMaterial(item)}
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
            onClick={handleCreate}
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
