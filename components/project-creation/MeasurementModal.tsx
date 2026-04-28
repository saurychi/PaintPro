"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type {
  ScaleBandKey,
  ScalePresetKey,
  SurfaceScalePresets,
} from "@/lib/planning/surfacePresets";

const ACCENT = "#00c065";

export type MeasurementRow = {
  id: string;
  presetKey: ScalePresetKey;
  sizeBand: ScaleBandKey;
  estimatedValue: number;
  isManualOverride: boolean;
};

type Props = {
  open: boolean;
  rows: MeasurementRow[];
  onClose: () => void;
  onAdd: (presetKey: ScalePresetKey) => void;
  onRemove: (id: string) => void;
  onPresetChange: (id: string, presetKey: ScalePresetKey) => void;
  onBandChange: (id: string, band: ScaleBandKey) => void;
  onManualValueChange: (id: string, value: string) => void;
  surfacePresets: SurfaceScalePresets;
  loadingPresets?: boolean;
};

function unitLabel(unit: string) {
  if (unit === "m2") return "m²";
  if (unit === "m") return "m";
  return "count";
}

function getBandIndex(band: ScaleBandKey) {
  return ["small", "medium", "large"].indexOf(band);
}

function getBandFromIndex(index: number): ScaleBandKey {
  return (["small", "medium", "large"][Math.max(0, Math.min(2, index))] ??
    "medium") as ScaleBandKey;
}

export default function MeasurementModal({
  open,
  rows,
  surfacePresets,
  loadingPresets = false,
  onClose,
  onAdd,
  onRemove,
  onPresetChange,
  onBandChange,
  onManualValueChange,
}: Props) {
  const allPresetKeys = Object.keys(surfacePresets);

  const [isAddSurfaceModalOpen, setIsAddSurfaceModalOpen] = useState(false);
  const [newSurfacePresetKey, setNewSurfacePresetKey] =
    useState<ScalePresetKey>(allPresetKeys[0] ?? "interior_wall_area_m2");

  function openAddSurfaceModal() {
    const firstPresetKey = allPresetKeys[0];

    if (!firstPresetKey) return;

    setNewSurfacePresetKey(firstPresetKey);
    setIsAddSurfaceModalOpen(true);
  }

  function closeAddSurfaceModal() {
    setIsAddSurfaceModalOpen(false);
  }

  function confirmAddSurface() {
    if (!surfacePresets[newSurfacePresetKey]) return;

    onAdd(newSurfacePresetKey);
    setIsAddSurfaceModalOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-linear-to-r from-emerald-950/50 via-slate-900 to-slate-900 px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
              Project Measurements
            </div>

            <h2 className="mt-3 text-lg font-semibold text-white">
              Edit Measurements
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-300">
              Select the surface type, choose a quick size scale, then refine
              the exact measurement if needed.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
            <div className="text-sm font-medium text-gray-700">
              {rows.length} measurement{rows.length === 1 ? "" : "s"} added
            </div>

            <button
              type="button"
              onClick={openAddSurfaceModal}
              disabled={loadingPresets || allPresetKeys.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-[#00c065] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Add Measurement
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-500 [&::-webkit-scrollbar-thumb]:hover:bg-emerald-600 [&::-webkit-scrollbar-track]:bg-transparent"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#10B981 transparent",
            }}>
            {rows.length === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                <div>
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100">
                    <Plus className="h-5 w-5" />
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-gray-900">
                    No measurements added
                  </h3>

                  <p className="mt-1 text-xs text-gray-500">
                    Add at least one surface measurement before generating the
                    project.
                  </p>

                  <button
                    type="button"
                    onClick={openAddSurfaceModal}
                    disabled={loadingPresets || allPresetKeys.length === 0}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#00c065] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054]">
                    <Plus className="h-4 w-4" />
                    Add Measurement
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const preset = surfacePresets[row.presetKey];

                  if (!preset) return null;

                  const bandMeta = preset.bands[row.sizeBand];

                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.7fr)_auto]">
                        <div className="min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Surface Type
                          </label>

                          <select
                            value={row.presetKey}
                            onChange={(e) =>
                              onPresetChange(
                                row.id,
                                e.target.value as ScalePresetKey,
                              )
                            }
                            className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100">
                            {allPresetKeys.map((key) => (
                              <option key={key} value={key}>
                                {surfacePresets[key].label}
                              </option>
                            ))}
                          </select>

                          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Size Scale
                              </label>

                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                {bandMeta.label}
                              </span>
                            </div>

                            <input
                              type="range"
                              min={0}
                              max={2}
                              step={1}
                              value={getBandIndex(row.sizeBand)}
                              onChange={(e) =>
                                onBandChange(
                                  row.id,
                                  getBandFromIndex(Number(e.target.value)),
                                )
                              }
                              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-emerald-100"
                              style={{ accentColor: ACCENT }}
                            />

                            <div className="mt-2 grid grid-cols-3 text-[11px] font-medium text-gray-500">
                              <span>Small</span>
                              <span className="text-center">Medium</span>
                              <span className="text-right">Large</span>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Exact Measurement
                          </label>

                          <div className="mt-1.5 flex h-10 overflow-hidden rounded-lg border border-gray-200 bg-white transition focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={row.estimatedValue}
                              onChange={(e) =>
                                onManualValueChange(row.id, e.target.value)
                              }
                              className="min-w-0 flex-1 border-none bg-transparent px-3 text-sm text-gray-900 outline-none"
                            />

                            <div className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-500">
                              {unitLabel(preset.unit)}
                            </div>
                          </div>

                          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-[11px] font-medium text-gray-500">
                              Current value
                            </div>
                            <div className="mt-0.5 text-sm font-semibold text-gray-900">
                              {row.estimatedValue} {unitLabel(preset.unit)}
                            </div>
                          </div>

                          {row.isManualOverride ? (
                            <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              Manual override
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-start justify-end">
                          <button
                            type="button"
                            onClick={() => onRemove(row.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove measurement">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
            Close
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loadingPresets || allPresetKeys.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-[#00c065] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
            <Check className="h-4 w-4" />
            Done
          </button>
        </div>

        {isAddSurfaceModalOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
              <div className="h-1.5 w-full bg-[#00c065]" />

              <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-linear-to-r from-emerald-950/50 via-slate-900 to-slate-900 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white">
                    Add Measurement
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Choose the surface type. The new row will start at medium
                    scale.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-slate-300 shadow-sm transition hover:bg-slate-700 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Surface Type
                </label>

                <select
                  value={newSurfacePresetKey}
                  onChange={(e) =>
                    setNewSurfacePresetKey(e.target.value as ScalePresetKey)
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-900/40">
                  {allPresetKeys.map((key) => (
                    <option key={key} value={key}>
                      {surfacePresets[key].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={confirmAddSurface}
                  className="inline-flex items-center gap-2 rounded-full bg-[#00c065] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]">
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
