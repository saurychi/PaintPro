"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, Save, X } from "lucide-react";

export type GeneratedTaskMaterial = {
  id: string;
  name: string;
  quantity: number;
  estimatedCost: number;
};

export type GeneratedTaskEquipment = {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
};

export type GeneratedTaskStaff = {
  id: string;
  name: string;
};

export type GeneratedTaskEditTarget = {
  projectTaskId: string;
  projectSubTaskId: string;
  title: string;
  materials: GeneratedTaskMaterial[];
  equipment: GeneratedTaskEquipment[];
  employees: GeneratedTaskStaff[];
  estimatedHours: number | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
};

type ResourceOption = {
  id: string;
  name: string;
  unit_cost?: number;
  status?: string | null;
};

type StaffOption = {
  id: string;
  username: string | null;
  email: string | null;
};

type GeneratedTaskEditModalProps = {
  open: boolean;
  task: GeneratedTaskEditTarget | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    projectTaskId: string;
    projectSubTaskId: string;
    materials: GeneratedTaskMaterial[];
    equipment: GeneratedTaskEquipment[];
    employeeIds: string[];
    estimatedHours: number | null;
    scheduledStartDatetime: string | null;
    scheduledEndDatetime: string | null;
  }) => void;
};

const ACCENT = "#00c065";

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

export default function GeneratedTaskEditModal({
  open,
  task,
  saving,
  onClose,
  onSave,
}: GeneratedTaskEditModalProps) {
  const [materials, setMaterials] = useState<GeneratedTaskMaterial[]>([]);
  const [equipment, setEquipment] = useState<GeneratedTaskEquipment[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [startDatetime, setStartDatetime] = useState("");
  const [endDatetime, setEndDatetime] = useState("");
  const [materialOptions, setMaterialOptions] = useState<ResourceOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<ResourceOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    if (!open || !task) return;

    setMaterials(task.materials);
    setEquipment(task.equipment);
    setEmployeeIds(task.employees.map((employee) => employee.id));
    setEstimatedHours(
      typeof task.estimatedHours === "number" ? String(task.estimatedHours) : "",
    );
    setStartDatetime(toDateTimeLocal(task.scheduledStartDatetime));
    setEndDatetime(toDateTimeLocal(task.scheduledEndDatetime));
  }, [open, task]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    async function loadOptions() {
      try {
        setLoadingOptions(true);
        setOptionsError("");

        const [resourceResponse, staffResponse] = await Promise.all([
          fetch("/api/planning/getSubTaskResourceOptions"),
          fetch("/api/planning/getStaffUsers"),
        ]);

        const [resourceData, staffData] = await Promise.all([
          resourceResponse.json().catch(() => null),
          staffResponse.json().catch(() => null),
        ]);

        if (!resourceResponse.ok) {
          throw new Error(resourceData?.error || "Failed to load resources.");
        }

        if (!staffResponse.ok) {
          throw new Error(staffData?.error || "Failed to load staff.");
        }

        if (!active) return;

        setMaterialOptions(resourceData?.materials ?? []);
        setEquipmentOptions(resourceData?.equipment ?? []);
        setStaffOptions(staffData?.staffUsers ?? []);
      } catch (error) {
        if (!active) return;
        setOptionsError(
          error instanceof Error ? error.message : "Failed to load options.",
        );
      } finally {
        if (active) setLoadingOptions(false);
      }
    }

    loadOptions();

    return () => {
      active = false;
    };
  }, [open]);

  const selectedMaterialIds = useMemo(
    () => new Set(materials.map((material) => material.id)),
    [materials],
  );
  const selectedEquipmentIds = useMemo(
    () => new Set(equipment.map((item) => item.id)),
    [equipment],
  );

  if (!open || !task) return null;

  function upsertMaterial(option: ResourceOption, checked: boolean) {
    setMaterials((current) => {
      if (!checked) return current.filter((item) => item.id !== option.id);
      if (current.some((item) => item.id === option.id)) return current;

      return [
        ...current,
        {
          id: option.id,
          name: option.name,
          quantity: 1,
          estimatedCost: Number(option.unit_cost ?? 0),
        },
      ];
    });
  }

  function upsertEquipment(option: ResourceOption, checked: boolean) {
    setEquipment((current) => {
      if (!checked) return current.filter((item) => item.id !== option.id);
      if (current.some((item) => item.id === option.id)) return current;

      return [
        ...current,
        {
          id: option.id,
          name: option.name,
          quantity: 1,
          notes: null,
        },
      ];
    });
  }

  function toggleEmployee(employeeId: string) {
    setEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}>
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">
              Edit Generated Task
            </h2>
            <p className="mt-1 truncate text-xs text-gray-500">{task.title}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-60"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {optionsError ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {optionsError}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Schedule
              </h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-700">
                    Hours
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={estimatedHours}
                    onChange={(event) => setEstimatedHours(event.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-700">
                    Start
                  </span>
                  <input
                    type="datetime-local"
                    value={startDatetime}
                    onChange={(event) => setStartDatetime(event.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-700">End</span>
                  <input
                    type="datetime-local"
                    value={endDatetime}
                    onChange={(event) => setEndDatetime(event.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Assigned Employees
              </h3>

              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {loadingOptions ? (
                  <LoadingRow />
                ) : staffOptions.length === 0 ? (
                  <EmptyRow label="No active staff found." />
                ) : (
                  staffOptions.map((staff) => (
                    <label
                      key={staff.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={employeeIds.includes(staff.id)}
                        onChange={() => toggleEmployee(staff.id)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="min-w-0 truncate text-gray-700">
                        {staff.username || staff.email || "Staff"}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </section>

            <ResourceSection
              title="Materials"
              options={materialOptions}
              selectedIds={selectedMaterialIds}
              loading={loadingOptions}
              emptyLabel="No materials found."
              onToggle={upsertMaterial}
            >
              {materials.map((material) => (
                <div
                  key={material.id}
                  className="grid grid-cols-[minmax(0,1fr)_88px_104px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {material.name}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={material.quantity}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.id === material.id
                            ? {
                                ...item,
                                quantity: Number(event.target.value || 0),
                              }
                            : item,
                        ),
                      )
                    }
                    className="h-8 rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-emerald-400"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={material.estimatedCost}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.id === material.id
                            ? {
                                ...item,
                                estimatedCost: Number(event.target.value || 0),
                              }
                            : item,
                        ),
                      )
                    }
                    className="h-8 rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-emerald-400"
                  />
                </div>
              ))}
            </ResourceSection>

            <ResourceSection
              title="Equipment"
              options={equipmentOptions}
              selectedIds={selectedEquipmentIds}
              loading={loadingOptions}
              emptyLabel="No equipment found."
              onToggle={upsertEquipment}
            >
              {equipment.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {item.name}
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) =>
                      setEquipment((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                quantity: Math.max(
                                  1,
                                  Number(event.target.value || 1),
                                ),
                              }
                            : entry,
                        ),
                      )
                    }
                    className="h-8 rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-emerald-400"
                  />
                </div>
              ))}
            </ResourceSection>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loadingOptions}
            onClick={() =>
              onSave({
                projectTaskId: task.projectTaskId,
                projectSubTaskId: task.projectSubTaskId,
                materials,
                equipment,
                employeeIds,
                estimatedHours: estimatedHours ? Number(estimatedHours) : null,
                scheduledStartDatetime: fromDateTimeLocal(startDatetime),
                scheduledEndDatetime: fromDateTimeLocal(endDatetime),
              })
            }
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourceSection({
  title,
  options,
  selectedIds,
  loading,
  emptyLabel,
  onToggle,
  children,
}: {
  title: string;
  options: ResourceOption[];
  selectedIds: Set<string>;
  loading: boolean;
  emptyLabel: string;
  onToggle: (option: ResourceOption, checked: boolean) => void;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-2">
          {loading ? (
            <LoadingRow />
          ) : options.length === 0 ? (
            <EmptyRow label={emptyLabel} />
          ) : (
            options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedIds.has(option.id)}
                  onChange={(event) => onToggle(option, event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="min-w-0 truncate text-gray-700">
                  {option.name}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
          {hasChildren ? (
            children
          ) : (
            <EmptyRow label={`No ${title.toLowerCase()} selected.`} />
          )}
        </div>
      </div>
    </section>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading...
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-2 py-2 text-xs text-gray-500">{label}</div>;
}
