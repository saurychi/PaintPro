"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

type Props = {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    defaultSortOrder: number;
    isActive: boolean;
  }) => void | Promise<void>;
};

export default function AddMainTaskModal({
  open,
  saving = false,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [defaultSortOrder, setDefaultSortOrder] = useState("0");
  const [status, setStatus] = useState("true");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDefaultSortOrder("0");
    setStatus("true");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-[#00c065]" />

        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Add Main Task
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Create a reusable main task for planning and job creation.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Main Task Name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Example: Interior Painting"
              className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Default Sort Order
              </label>
              <input
                type="number"
                value={defaultSortOrder}
                onChange={(event) => setDefaultSortOrder(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Status
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                defaultSortOrder: Number(defaultSortOrder || 0),
                isActive: status === "true",
              })
            }
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {saving ? "Creating..." : "Add Main Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
