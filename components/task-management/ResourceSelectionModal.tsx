"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Check, Loader2, Search, X } from "lucide-react";

import type {
  TaskManagementResourceOption,
  TaskManagementSubTask,
} from "@/lib/taskManagement";

type Props = {
  open: boolean;
  type: "materials" | "equipment";
  selectedSubTask: TaskManagementSubTask | null;
  options: TaskManagementResourceOption[];
  selectedIds: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (selectedIds: string[]) => void | Promise<void>;
};

export default function ResourceSelectionModal({
  open,
  type,
  selectedSubTask,
  options,
  selectedIds,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraftSelectedIds(selectedIds);
    setSearchValue("");
  }, [open, selectedIds]);

  const label = type === "materials" ? "Materials" : "Equipment";

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return options;

    return options.filter((option) => {
      const haystack = `${option.name} ${option.meta ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [options, searchValue]);

  if (!open || !selectedSubTask) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="flex h-[min(80vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-[#00c065]" />

        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Default {label}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Choose which {label.toLowerCase()} should come with this subtask.
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

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="border-b border-gray-100 bg-gray-50/60 p-5 md:border-b-0 md:border-r">
            <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
              <p className="text-[11px] font-medium text-gray-500">Subtask</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {selectedSubTask.description}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <Boxes className="h-4 w-4 text-[#00c065]" />
                Selected {label}
              </div>

              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {draftSelectedIds.length > 0 ? (
                  draftSelectedIds.map((id) => {
                    const option = options.find((item) => item.id === id);
                    const name = option?.name ?? id;

                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-900">
                            {name}
                          </p>
                          {option?.meta ? (
                            <p className="truncate text-[10px] text-gray-500">
                              {option.meta}
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setDraftSelectedIds((current) =>
                              current.filter((item) => item !== id),
                            )
                          }
                          className="shrink-0 rounded-full border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs leading-5 text-gray-500">
                    No default {label.toLowerCase()} selected yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-10 w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-2">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    const selected = draftSelectedIds.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setDraftSelectedIds((current) =>
                            selected
                              ? current.filter((item) => item !== option.id)
                              : [...current, option.id],
                          )
                        }
                        className={[
                          "flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition",
                          selected
                            ? "border-emerald-200 bg-emerald-50/70"
                            : "border-gray-200 bg-white hover:border-emerald-100 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {option.name}
                          </p>
                          {option.meta ? (
                            <p className="mt-1 text-xs text-gray-500">
                              {option.meta}
                            </p>
                          ) : null}
                        </div>

                        <span
                          className={[
                            "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold",
                            selected
                              ? "border-emerald-200 bg-white text-emerald-700"
                              : "border-gray-200 bg-white text-gray-500",
                          ].join(" ")}
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : "Add"}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    No {label.toLowerCase()} matched your search.
                  </div>
                )}
              </div>
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
            onClick={() => onSave(draftSelectedIds)}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving..." : `Save ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
