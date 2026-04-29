"use client";

import { useMemo, useState } from "react";
import {
  formatProjectTimeReferenceInputValue,
  formatProjectTimeReferenceLabel,
  parseProjectTimeReferenceInput,
} from "@/lib/time/projectTimeReference";
import { useProjectTimeReference } from "@/lib/time/useProjectTimeReference";

const btnBase =
  "inline-flex items-center justify-center rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#00c065]/25";
const btnNeutral = `${btnBase} border border-gray-200 bg-white px-3 h-9 text-gray-900 hover:bg-gray-50 hover:shadow-md`;
const btnPrimary = `${btnBase} bg-[#00c065] px-3 h-9 text-white hover:bg-[#00a054] hover:shadow-md`;

export default function ProjectTimeReferenceSettings() {
  const { clearReferenceIso, isLoaded, referenceIso, saveReferenceIso } =
    useProjectTimeReference();

  const activeModeLabel = useMemo(() => {
    if (!isLoaded) return "Loading...";
    if (!referenceIso) return "Live system time";
    return `Simulated: ${formatProjectTimeReferenceLabel(referenceIso)}`;
  }, [isLoaded, referenceIso]);

  return (
    <ProjectTimeReferenceSettingsForm
      key={referenceIso || "live"}
      activeModeLabel={activeModeLabel}
      clearReferenceIso={clearReferenceIso}
      referenceIso={referenceIso}
      saveReferenceIso={saveReferenceIso}
    />
  );
}

function ProjectTimeReferenceSettingsForm({
  activeModeLabel,
  clearReferenceIso,
  referenceIso,
  saveReferenceIso,
}: {
  activeModeLabel: string;
  clearReferenceIso: () => void;
  referenceIso: string | null;
  saveReferenceIso: (nextValue: string) => string | null;
}) {
  const [isSimulationEnabled, setIsSimulationEnabled] = useState(
    Boolean(referenceIso),
  );
  const [draftDateTime, setDraftDateTime] = useState(() =>
    formatProjectTimeReferenceInputValue(referenceIso),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    setError(null);
    setMessage(null);
    setIsSimulationEnabled((current) => !current);
  };

  const handleUseCurrentTime = () => {
    setError(null);
    setMessage(null);
    setIsSimulationEnabled(true);
    setDraftDateTime(formatProjectTimeReferenceInputValue(new Date()));
  };

  const handleSave = () => {
    setError(null);
    setMessage(null);

    if (!isSimulationEnabled) {
      clearReferenceIso();
      setMessage("Live time restored for project status checks and task completion.");
      return;
    }

    const normalized = parseProjectTimeReferenceInput(draftDateTime);

    if (!normalized) {
      setError("Choose a valid reference date and time.");
      return;
    }

    saveReferenceIso(normalized);
    setMessage("Simulated project time saved.");
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Reference date and time
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Switch between live time and a simulated project clock for this
            browser.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isSimulationEnabled}
            onClick={handleToggle}
            className={[
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00c065]/25",
              isSimulationEnabled ? "bg-[#00c065]" : "bg-gray-300",
            ].join(" ")}>
            <span
              className={[
                "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                isSimulationEnabled ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {isSimulationEnabled ? "Simulated" : "Default"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 sm:max-w-[320px]">
          <label
            htmlFor="project-time-reference"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            Simulated time
          </label>
          <input
            id="project-time-reference"
            type="datetime-local"
            value={draftDateTime}
            onChange={(event) => setDraftDateTime(event.target.value)}
            disabled={!isSimulationEnabled}
            className={[
              "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none",
              "focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20",
              !isSimulationEnabled
                ? "cursor-not-allowed bg-gray-50 text-gray-400"
                : "",
            ].join(" ")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUseCurrentTime}
            className={btnNeutral}>
            Use current time
          </button>
          <button type="button" onClick={handleSave} className={btnPrimary}>
            {isSimulationEnabled ? "Save simulated time" : "Use live time"}
          </button>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          <span className="font-semibold">Active mode:</span> {activeModeLabel}
        </div>

        <p className="text-xs text-gray-500">
          This setting is shared across admin, manager, staff, and client views
          on this browser. It affects project timing checks and the completion
          timestamp written when a task is finished.
        </p>

        {error ? (
          <p className="text-sm font-semibold text-red-600">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm font-semibold text-emerald-700">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
