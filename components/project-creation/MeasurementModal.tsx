"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";
import type {
  ScaleBandKey,
  ScalePresetKey,
  SurfaceScalePresets,
} from "@/lib/planning/surfacePresets";

export type MeasurementRow = {
  id: string;
  presetKey: ScalePresetKey;
  sizeBand: ScaleBandKey;
  estimatedValue: number;
  isManualOverride: boolean;
  isMeasurementPending?: boolean;
};

export type MessageRecipient = {
  id: string;
  name: string;
  email?: string;
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
  messageRecipients?: MessageRecipient[];
  loadingMessageRecipients?: boolean;
  messageRecipientsError?: string | null;
  onLoadMessageRecipients?: () => void;
  onSendSurfaceMessage?: (recipientId: string) => Promise<void> | void;
  sendingSurfaceMessage?: boolean;
  // Refresh button surfaces when the project row already exists, so the
  // admin can pull the latest dimensions the staff pushed via the
  // measure-generator. Hidden in fresh-form mode where there's nothing
  // server-side to refresh from yet.
  onRefreshMeasurements?: () => Promise<void> | void;
  refreshingMeasurements?: boolean;
};

function unitLabel(unit: string) {
  if (unit === "m2") return "m²";
  if (unit === "m") return "m";
  return "count";
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
  messageRecipients = [],
  loadingMessageRecipients = false,
  messageRecipientsError = null,
  onLoadMessageRecipients,
  onSendSurfaceMessage,
  sendingSurfaceMessage = false,
  onRefreshMeasurements,
  refreshingMeasurements = false,
}: Props) {
  const allPresetKeys = Object.keys(surfacePresets);

  const [isAddSurfaceModalOpen, setIsAddSurfaceModalOpen] = useState(false);
  const [newSurfacePresetKey, setNewSurfacePresetKey] =
    useState<ScalePresetKey>(allPresetKeys[0] ?? "interior_wall_area_m2");
  const [measurementPendingDelete, setMeasurementPendingDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [selectedMeasurementIdsForDelete, setSelectedMeasurementIdsForDelete] =
    useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isRecipientMenuOpen, setIsRecipientMenuOpen] = useState(false);
  const [pendingRecipientId, setPendingRecipientId] = useState<string | null>(
    null,
  );
  const recipientMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isRecipientMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!recipientMenuRef.current) return;
      if (recipientMenuRef.current.contains(event.target as Node)) return;
      setIsRecipientMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRecipientMenuOpen]);

  function openRecipientMenu() {
    setIsRecipientMenuOpen(true);
    if (
      messageRecipients.length === 0 &&
      !loadingMessageRecipients &&
      onLoadMessageRecipients
    ) {
      onLoadMessageRecipients();
    }
  }

  async function handlePickRecipient(recipientId: string) {
    if (!onSendSurfaceMessage || sendingSurfaceMessage) return;
    setPendingRecipientId(recipientId);
    try {
      await onSendSurfaceMessage(recipientId);
      setIsRecipientMenuOpen(false);
    } finally {
      setPendingRecipientId(null);
    }
  }

  function openAddSurfaceModal() {
    const firstPresetKey = allPresetKeys[0];

    if (!firstPresetKey) return;

    setNewSurfacePresetKey(firstPresetKey);
    setIsAddSurfaceModalOpen(true);
  }

  function closeAddSurfaceModal() {
    setIsAddSurfaceModalOpen(false);
  }

  function toggleMeasurementDeleteSelection(id: string) {
    setSelectedMeasurementIdsForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllMeasurements() {
    setSelectedMeasurementIdsForDelete((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  const allSelected =
    rows.length > 0 && selectedMeasurementIdsForDelete.size === rows.length;
  const someSelected =
    selectedMeasurementIdsForDelete.size > 0 && !allSelected;

  function removeSelectedMeasurements(ids: Set<string>) {
    ids.forEach((id) => onRemove(id));
    setSelectedMeasurementIdsForDelete(new Set());
  }

  function confirmAddSurface() {
    if (!surfacePresets[newSurfacePresetKey]) return;

    onAdd(newSurfacePresetKey);
    setIsAddSurfaceModalOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="h-1 w-full shrink-0 bg-[#00c065]" />

        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Edit Measurements
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/60 px-5 py-2.5 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {rows.length} measurement{rows.length === 1 ? "" : "s"}
            </div>

            <div className="flex items-center gap-2">
              {selectedMeasurementIdsForDelete.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setBulkDeleteOpen(true)}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-gray-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  Remove ({selectedMeasurementIdsForDelete.size})
                </button>
              ) : null}
              {onRefreshMeasurements ? (
                <button
                  type="button"
                  onClick={() => void onRefreshMeasurements()}
                  disabled={refreshingMeasurements}
                  title="Reload measurements from the project. Picks up updates the staff saved from the measure generator."
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {refreshingMeasurements ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 dark:text-gray-400" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  )}
                  {refreshingMeasurements ? "Refreshing" : "Refresh"}
                </button>
              ) : null}
              {onSendSurfaceMessage && rows.length > 0 ? (
                <div className="relative" ref={recipientMenuRef}>
                  <button
                    type="button"
                    onClick={() =>
                      isRecipientMenuOpen
                        ? setIsRecipientMenuOpen(false)
                        : openRecipientMenu()
                    }
                    disabled={sendingSurfaceMessage}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {sendingSurfaceMessage ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 dark:text-gray-400" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    )}
                    Message Employee
                  </button>

                  {isRecipientMenuOpen ? (
                    <div className="absolute right-0 top-9 z-20 w-64 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        Send to staff
                      </div>

                      <div className="max-h-64 overflow-y-auto">
                        {loadingMessageRecipients ? (
                          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-gray-500 dark:text-gray-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading staff...
                          </div>
                        ) : messageRecipientsError ? (
                          <div className="px-3 py-4 text-xs text-rose-600 dark:text-rose-400">
                            {messageRecipientsError}
                            {onLoadMessageRecipients ? (
                              <button
                                type="button"
                                onClick={onLoadMessageRecipients}
                                className="mt-2 inline-flex h-7 items-center justify-center rounded-md border border-rose-200 bg-white px-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-gray-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                Retry
                              </button>
                            ) : null}
                          </div>
                        ) : messageRecipients.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">
                            No staff available.
                          </div>
                        ) : (
                          messageRecipients.map((recipient) => {
                            const isPending =
                              pendingRecipientId === recipient.id;
                            return (
                              <button
                                key={recipient.id}
                                type="button"
                                onClick={() => handlePickRecipient(recipient.id)}
                                disabled={sendingSurfaceMessage}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-gray-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-emerald-950/30"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-semibold">
                                    {recipient.name}
                                  </div>
                                  {recipient.email ? (
                                    <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                                      {recipient.email}
                                    </div>
                                  ) : null}
                                </div>
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={openAddSurfaceModal}
                disabled={loadingPresets || allPresetKeys.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />
                Add Measurement
              </button>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-500 [&::-webkit-scrollbar-thumb]:hover:bg-emerald-600 [&::-webkit-scrollbar-track]:bg-transparent"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#10B981 transparent",
            }}>
            {rows.length === 0 ? (
              <div className="m-5 flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 text-center dark:border-gray-700 dark:bg-gray-800/40">
                <div>
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-[#00c065] ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:ring-emerald-900/50">
                    <Plus className="h-4 w-4" />
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    No measurements added
                  </h3>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Add at least one surface measurement before generating the
                    project.
                  </p>

                  <button
                    type="button"
                    onClick={openAddSurfaceModal}
                    disabled={loadingPresets || allPresetKeys.length === 0}
                    className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white transition hover:bg-[#00a054]">
                    <Plus className="h-3.5 w-3.5" />
                    Add Measurement
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="sticky top-0 z-10 grid grid-cols-[32px_minmax(0,1.4fr)_minmax(170px,0.9fr)_32px] items-center gap-3 border-b border-gray-200 bg-gray-50 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                  <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAllMeasurements}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 bg-white transition-colors hover:border-emerald-400 checked:border-[#00c065] checked:bg-[#00c065] indeterminate:border-[#00c065] indeterminate:bg-[#00c065] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-emerald-500 dark:checked:border-[#00c065] dark:checked:bg-[#00c065] dark:indeterminate:border-[#00c065] dark:indeterminate:bg-[#00c065]"
                      aria-label={
                        allSelected
                          ? "Deselect all measurements"
                          : "Select all measurements"
                      }
                    />
                    <Check
                      strokeWidth={3}
                      className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
                    />
                    <Minus
                      strokeWidth={3}
                      className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-indeterminate:opacity-100"
                    />
                  </label>
                  <span>Surface Type</span>
                  <span>Measurement</span>
                  <span />
                </div>

                {rows.map((row) => {
                  const preset = surfacePresets[row.presetKey];

                  if (!preset) return null;

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[32px_minmax(0,1.4fr)_minmax(170px,0.9fr)_32px] items-center gap-3 border-b border-gray-100 px-5 py-3 transition-colors hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-gray-800/40">
                      <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedMeasurementIdsForDelete.has(row.id)}
                          onChange={() =>
                            toggleMeasurementDeleteSelection(row.id)
                          }
                          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 bg-white transition-colors hover:border-emerald-400 checked:border-[#00c065] checked:bg-[#00c065] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-emerald-500 dark:checked:border-[#00c065] dark:checked:bg-[#00c065]"
                          aria-label={`Select ${preset.label} for deletion`}
                        />
                        <Check
                          strokeWidth={3}
                          className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
                        />
                      </label>

                      <select
                        value={row.presetKey}
                        onChange={(e) =>
                          onPresetChange(
                            row.id,
                            e.target.value as ScalePresetKey,
                          )
                        }
                        className="h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/50">
                        {allPresetKeys.map((key) => (
                          <option key={key} value={key}>
                            {surfacePresets[key].label}
                          </option>
                        ))}
                      </select>

                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 min-w-0 flex-1 overflow-hidden rounded-md border border-gray-200 bg-white transition focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-200 dark:border-gray-700 dark:bg-gray-800 dark:focus-within:border-emerald-500 dark:focus-within:ring-emerald-900/50">
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={row.isMeasurementPending ? "" : row.estimatedValue}
                            onChange={(e) =>
                              onManualValueChange(row.id, e.target.value)
                            }
                            placeholder="Enter value"
                            className="min-w-0 flex-1 border-none bg-transparent px-2.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                          />
                          <div className="flex items-center border-l border-gray-200 bg-gray-50 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-700/50 dark:text-gray-400">
                            {unitLabel(preset.unit)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onManualValueChange(row.id, "")}
                          disabled={row.isMeasurementPending}
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-gray-50 dark:border-rose-900/50 dark:bg-gray-800 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:disabled:border-gray-700 dark:disabled:bg-gray-800/40 dark:disabled:text-gray-600 dark:disabled:hover:bg-gray-800/40">
                          Clear
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setMeasurementPendingDelete({
                            id: row.id,
                            label: preset.label,
                          })
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 dark:text-gray-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        aria-label="Remove measurement">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
            Close
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loadingPresets || allPresetKeys.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#00c065] px-3.5 text-xs font-semibold text-white transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-50">
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>

        {isAddSurfaceModalOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/30 px-4 backdrop-blur-[1px] dark:bg-gray-950/60">
            <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <div className="h-1 w-full bg-[#00c065]" />

              <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-3.5 dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Add Measurement
                </h3>

                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  aria-label="Close"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Surface Type
                </label>

                <select
                  value={newSurfacePresetKey}
                  onChange={(e) =>
                    setNewSurfacePresetKey(e.target.value as ScalePresetKey)
                  }
                  className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/50">
                  {allPresetKeys.map((key) => (
                    <option key={key} value={key}>
                      {surfacePresets[key].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <button
                  type="button"
                  onClick={closeAddSurfaceModal}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={confirmAddSurface}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#00c065] px-3.5 text-xs font-semibold text-white transition hover:bg-[#00a054]">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDeleteModal
        open={Boolean(measurementPendingDelete)}
        title="Remove measurement?"
        description={
          measurementPendingDelete
            ? `Remove "${measurementPendingDelete.label}" from this project?`
            : "Remove this measurement from this project?"
        }
        confirmLabel="Remove"
        onCancel={() => setMeasurementPendingDelete(null)}
        onConfirm={() => {
          if (measurementPendingDelete) onRemove(measurementPendingDelete.id);
          setMeasurementPendingDelete(null);
        }}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title="Remove selected measurements?"
        description={`Remove ${selectedMeasurementIdsForDelete.size} selected measurement${
          selectedMeasurementIdsForDelete.size === 1 ? "" : "s"
        } from this project?`}
        confirmLabel="Remove selected"
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => {
          removeSelectedMeasurements(selectedMeasurementIdsForDelete);
          setBulkDeleteOpen(false);
        }}
      />
    </div>
  );
}
