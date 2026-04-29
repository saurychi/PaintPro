"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, RefreshCcw, X } from "lucide-react";

import type { TaskManagementMainTask } from "@/lib/taskManagement";

type Props = {
  open: boolean;
  selectedMainTask: TaskManagementMainTask | null;
  mainTasks: TaskManagementMainTask[];
  saving?: boolean;
  onClose: () => void;
  onSave: (replacedByMainTaskId: string | null) => void | Promise<void>;
};

export default function MainTaskReplacementModal({
  open,
  selectedMainTask,
  mainTasks,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [replacementId, setReplacementId] = useState("");

  useEffect(() => {
    if (!open || !selectedMainTask) return;
    setReplacementId(selectedMainTask.replaced_by_main_task_id ?? "");
  }, [open, selectedMainTask]);

  if (!open || !selectedMainTask) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-[#00c065]" />

        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 ring-1 ring-amber-100">
              <ArrowRightLeft className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Replace Main Task
              </h3>
              <p className="mt-1 text-sm leading-5 text-gray-500">
                Link this main task to the task that should replace it going
                forward.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-medium text-gray-500">
              Current Main Task
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {selectedMainTask.name}
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Replace With
            </label>

            <select
              value={replacementId}
              onChange={(event) => setReplacementId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">No replacement</option>
              {mainTasks
                .filter(
                  (task) =>
                    task.main_task_id !== selectedMainTask.main_task_id,
                )
                .map((task) => (
                  <option key={task.main_task_id} value={task.main_task_id}>
                    {task.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
              <RefreshCcw className="h-4 w-4" />
              Replacement link only
            </div>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              This updates the catalog relationship. It does not copy or move
              subtasks automatically.
            </p>
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
            onClick={() => onSave(replacementId || null)}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving..." : "Save Replacement"}
          </button>
        </div>
      </div>
    </div>
  );
}
