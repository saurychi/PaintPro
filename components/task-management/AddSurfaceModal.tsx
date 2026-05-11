"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabaseClient";

type Unit = "m2" | "m" | "count";

type Props = {
  open: boolean;
  // Fired after a successful insert. Caller refetches its dropdown
  // and pre-selects the new surface_key.
  onCreated: (surfaceKey: string) => void;
  onClose: () => void;
};

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: "m2", label: "Area (m2)" },
  { value: "m", label: "Length (m)" },
  { value: "count", label: "Count" },
];

function defaultBandValues(unit: Unit) {
  // Sensible per-unit defaults so the admin doesn't stare at blanks.
  // Numbers come from common painting surfaces in the existing
  // surface_scale_presets rows (m2 covers wall/ceiling typical area,
  // m covers trim/skirting lengths, count covers doors/windows).
  if (unit === "m2") {
    return {
      smallMin: "20",
      smallMax: "40",
      smallSuggested: "30",
      mediumMin: "40",
      mediumMax: "80",
      mediumSuggested: "60",
      largeMin: "80",
      largeMax: "160",
      largeSuggested: "120",
    };
  }
  if (unit === "m") {
    return {
      smallMin: "10",
      smallMax: "25",
      smallSuggested: "18",
      mediumMin: "25",
      mediumMax: "50",
      mediumSuggested: "35",
      largeMin: "50",
      largeMax: "100",
      largeSuggested: "70",
    };
  }
  return {
    smallMin: "1",
    smallMax: "5",
    smallSuggested: "3",
    mediumMin: "5",
    mediumMax: "12",
    mediumSuggested: "8",
    largeMin: "12",
    largeMax: "24",
    largeSuggested: "18",
  };
}

// Slug a label into a snake_case surface_key. Used to populate the
// key field as the admin types the label, then editable if they
// want a different key. Matches the pattern of existing rows like
// `interior_wall_area_m2`.
function slugify(label: string, unit: Unit): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  if (unit === "m2") return `${base}_area_m2`;
  if (unit === "m") return `${base}_length_m`;
  return `${base}_count`;
}

export default function AddSurfaceModal({ open, onCreated, onClose }: Props) {
  const [label, setLabel] = useState("");
  const [surfaceKey, setSurfaceKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [unit, setUnit] = useState<Unit>("m2");
  const [bandValues, setBandValues] = useState(() => defaultBandValues("m2"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setSurfaceKey("");
    setKeyTouched(false);
    setUnit("m2");
    setBandValues(defaultBandValues("m2"));
    setSaving(false);
  }, [open]);

  // Re-key when unit flips, unless the admin has manually typed a key
  // already (in which case respect their choice).
  useEffect(() => {
    if (keyTouched) return;
    setSurfaceKey(slugify(label, unit));
  }, [label, unit, keyTouched]);

  // Refresh the band defaults when unit changes so the placeholder
  // numbers make sense for that scale. Only auto-apply when the admin
  // hasn't started editing them.
  useEffect(() => {
    setBandValues(defaultBandValues(unit));
  }, [unit]);

  if (!open) return null;

  async function handleCreate() {
    const trimmedLabel = label.trim();
    const trimmedKey = surfaceKey.trim();

    if (!trimmedLabel) {
      toast.error("Label is required.");
      return;
    }
    if (!trimmedKey) {
      toast.error("Surface key is required.");
      return;
    }

    const numbers = {
      small_min: Number(bandValues.smallMin),
      small_max: Number(bandValues.smallMax),
      small_suggested: Number(bandValues.smallSuggested),
      medium_min: Number(bandValues.mediumMin),
      medium_max: Number(bandValues.mediumMax),
      medium_suggested: Number(bandValues.mediumSuggested),
      large_min: Number(bandValues.largeMin),
      large_max: Number(bandValues.largeMax),
      large_suggested: Number(bandValues.largeSuggested),
    };

    if (Object.values(numbers).some((value) => !Number.isFinite(value))) {
      toast.error("All band values must be valid numbers.");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from("surface_scale_presets").insert({
        surface_key: trimmedKey,
        label: trimmedLabel,
        unit,
        small_label: "Small",
        medium_label: "Medium",
        large_label: "Large",
        ...numbers,
      });
      if (error) throw error;
      toast.success("Surface created.");
      onCreated(trimmedKey);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create surface.";
      toast.error("Failed to create surface.", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Add Surface
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Define a new surface_scale_presets row with bands.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:rotate-90 hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Example: Pressure Wash Area"
              className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Surface Key <span className="text-red-500">*</span>
              </label>
              <input
                value={surfaceKey}
                onChange={(event) => {
                  setSurfaceKey(event.target.value);
                  setKeyTouched(true);
                }}
                placeholder="pressure_wash_area_m2"
                className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 font-mono text-xs text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Unit
              </label>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as Unit)}
                className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                {UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Size Bands
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Min, max, and suggested values per band. Used by the
              quick-estimate slider on the measurement UI.
            </p>

            {(["small", "medium", "large"] as const).map((band) => (
              <div key={band} className="mt-2 grid grid-cols-4 items-center gap-2">
                <span className="text-[11px] font-semibold capitalize text-gray-700">
                  {band}
                </span>
                <input
                  type="number"
                  value={bandValues[`${band}Min` as keyof typeof bandValues]}
                  onChange={(event) =>
                    setBandValues((prev) => ({
                      ...prev,
                      [`${band}Min`]: event.target.value,
                    }))
                  }
                  placeholder="min"
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-emerald-300 focus:ring-1 focus:ring-emerald-100"
                />
                <input
                  type="number"
                  value={bandValues[`${band}Max` as keyof typeof bandValues]}
                  onChange={(event) =>
                    setBandValues((prev) => ({
                      ...prev,
                      [`${band}Max`]: event.target.value,
                    }))
                  }
                  placeholder="max"
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-emerald-300 focus:ring-1 focus:ring-emerald-100"
                />
                <input
                  type="number"
                  value={
                    bandValues[`${band}Suggested` as keyof typeof bandValues]
                  }
                  onChange={(event) =>
                    setBandValues((prev) => ({
                      ...prev,
                      [`${band}Suggested`]: event.target.value,
                    }))
                  }
                  placeholder="suggested"
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-emerald-300 focus:ring-1 focus:ring-emerald-100"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !label.trim() || !surfaceKey.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {saving ? "Creating..." : "Add Surface"}
          </button>
        </div>
      </div>
    </div>
  );
}
