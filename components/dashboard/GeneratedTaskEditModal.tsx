"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Hammer,
  Loader2,
  Package,
  Save,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";

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
  unit?: string | null;
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
const ACCENT_HOVER = "#00a054";

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

function staffInitials(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
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
  const [staffFilter, setStaffFilter] = useState("");

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
    setStaffFilter("");
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

  const filteredStaff = useMemo(() => {
    const query = staffFilter.trim().toLowerCase();
    if (!query) return staffOptions;
    return staffOptions.filter((staff) => {
      const label = (staff.username || staff.email || "").toLowerCase();
      return label.includes(query);
    });
  }, [staffOptions, staffFilter]);

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

  function removeMaterial(materialId: string) {
    setMaterials((current) => current.filter((item) => item.id !== materialId));
  }

  function removeEquipment(equipmentId: string) {
    setEquipment((current) =>
      current.filter((item) => item.id !== equipmentId),
    );
  }

  const materialUnitMap = new Map(
    materialOptions.map((option) => [option.id, option.unit ?? null] as const),
  );

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}>
        {/* Accent strip — matches the app-wide modal pattern (DownpaymentModal,
            ConcludeJob, etc.) so this dialog reads as part of the same family. */}
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} />

        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-700"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,192,101,0.08) 0%, rgba(0,192,101,0) 100%)",
          }}>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Edit Generated Task
            </h2>
            <p className="mt-1 truncate text-xs text-gray-600 dark:text-slate-400">
              {task.title}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-5 py-5 dark:bg-slate-950/30">
          {optionsError ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {optionsError}
            </div>
          ) : null}

          <div className="space-y-4">
            {/* Schedule */}
            <SectionCard
              icon={<CalendarClock className="h-4 w-4" />}
              title="Schedule"
              hint="Estimated work hours and the window the crew expects to work in.">
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldLabel label="Estimated hours" suffix="h">
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={estimatedHours}
                    onChange={(event) => setEstimatedHours(event.target.value)}
                    className={fieldInputClass}
                    placeholder="0"
                  />
                </FieldLabel>

                <FieldLabel label="Start">
                  <input
                    type="datetime-local"
                    value={startDatetime}
                    onChange={(event) => setStartDatetime(event.target.value)}
                    className={fieldInputClass}
                  />
                </FieldLabel>

                <FieldLabel label="End">
                  <input
                    type="datetime-local"
                    value={endDatetime}
                    onChange={(event) => setEndDatetime(event.target.value)}
                    className={fieldInputClass}
                  />
                </FieldLabel>
              </div>
            </SectionCard>

            {/* Staff */}
            <SectionCard
              icon={<Users className="h-4 w-4" />}
              title="Assigned Staff"
              hint="Tick the crew members responsible for this subtask. Changes propagate to the schedule and cost estimation on save."
              badge={`${employeeIds.length} selected`}>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={staffFilter}
                    onChange={(event) => setStaffFilter(event.target.value)}
                    placeholder="Search staff"
                    className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-emerald-500/20"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {loadingOptions ? (
                    <LoadingRow />
                  ) : filteredStaff.length === 0 ? (
                    <EmptyRow
                      label={
                        staffFilter
                          ? "No staff matches that search."
                          : "No active staff found."
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredStaff.map((staff) => {
                        const label =
                          staff.username || staff.email || "Staff";
                        const checked = employeeIds.includes(staff.id);
                        return (
                          <li key={staff.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800/70">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEmployee(staff.id)}
                                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                              />
                              <span
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                                  checked
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                    : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                                }`}>
                                {staffInitials(label)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-slate-200">
                                {label}
                              </span>
                              {checked ? (
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  Assigned
                                </span>
                              ) : null}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Materials */}
            <SectionCard
              icon={<Package className="h-4 w-4" />}
              title="Materials"
              hint="Pick the materials this subtask consumes and adjust quantity or per-unit cost as needed."
              badge={`${materials.length} selected`}>
              <ResourcePicker
                options={materialOptions}
                selectedIds={selectedMaterialIds}
                loading={loadingOptions}
                emptyLabel="No materials in the catalog."
                renderOption={(option) => (
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-gray-700 dark:text-slate-200">
                      {option.name}
                    </span>
                    {option.unit_cost !== undefined ? (
                      <span className="text-[11px] text-gray-400 dark:text-slate-500">
                        AUD {Number(option.unit_cost).toFixed(2)}
                        {option.unit ? ` / ${option.unit}` : ""}
                      </span>
                    ) : null}
                  </div>
                )}
                onToggle={upsertMaterial}
                selectedList={
                  materials.length > 0 ? (
                    <ul className="space-y-2">
                      {materials.map((material) => {
                        const unit = materialUnitMap.get(material.id);
                        return (
                          <li
                            key={material.id}
                            className="grid grid-cols-[minmax(0,1fr)_104px_124px_28px] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-800 dark:text-slate-100">
                                {material.name}
                              </div>
                              {unit ? (
                                <div className="text-[11px] text-gray-400 dark:text-slate-500">
                                  Unit: {unit}
                                </div>
                              ) : null}
                            </div>
                            <FieldInline label="Qty">
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
                                            quantity: Number(
                                              event.target.value || 0,
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className={inlineInputClass}
                              />
                            </FieldInline>
                            <FieldInline label="Cost (AUD)">
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
                                            estimatedCost: Number(
                                              event.target.value || 0,
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className={inlineInputClass}
                              />
                            </FieldInline>
                            <button
                              type="button"
                              onClick={() => removeMaterial(material.id)}
                              aria-label={`Remove ${material.name}`}
                              className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-gray-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null
                }
                emptySelectedLabel="No materials selected yet."
              />
            </SectionCard>

            {/* Equipment */}
            <SectionCard
              icon={<Hammer className="h-4 w-4" />}
              title="Equipment"
              hint="Tools and gear the crew brings along. Quantity is per session, not per worker."
              badge={`${equipment.length} selected`}>
              <ResourcePicker
                options={equipmentOptions}
                selectedIds={selectedEquipmentIds}
                loading={loadingOptions}
                emptyLabel="No equipment in the catalog."
                renderOption={(option) => (
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-gray-700 dark:text-slate-200">
                      {option.name}
                    </span>
                    {option.status ? (
                      <span className="text-[11px] text-gray-400 dark:text-slate-500">
                        {option.status}
                      </span>
                    ) : null}
                  </div>
                )}
                onToggle={upsertEquipment}
                selectedList={
                  equipment.length > 0 ? (
                    <ul className="space-y-2">
                      {equipment.map((item) => (
                        <li
                          key={item.id}
                          className="grid grid-cols-[minmax(0,1fr)_104px_28px] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <div className="truncate font-medium text-gray-800 dark:text-slate-100">
                            {item.name}
                          </div>
                          <FieldInline label="Qty">
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
                              className={inlineInputClass}
                            />
                          </FieldInline>
                          <button
                            type="button"
                            onClick={() => removeEquipment(item.id)}
                            aria-label={`Remove ${item.name}`}
                            className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-gray-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null
                }
                emptySelectedLabel="No equipment selected yet."
              />
            </SectionCard>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-slate-700">
          <p className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
            <UserRound className="h-3.5 w-3.5" />
            {employeeIds.length} staff, {materials.length} materials,{" "}
            {equipment.length} equipment
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
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
                  estimatedHours: estimatedHours
                    ? Number(estimatedHours)
                    : null,
                  scheduledStartDatetime: fromDateTimeLocal(startDatetime),
                  scheduledEndDatetime: fromDateTimeLocal(endDatetime),
                })
              }
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
              onMouseEnter={(event) => {
                if (!saving && !loadingOptions) {
                  event.currentTarget.style.backgroundColor = ACCENT_HOVER;
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = ACCENT;
              }}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fieldInputClass =
  "h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-500/20";

const inlineInputClass =
  "h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none transition focus:border-[#00c065] focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-500/20";

function SectionCard({
  icon,
  title,
  hint,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
            <span
              className="grid h-6 w-6 place-items-center rounded-md text-[#00c065]"
              style={{ backgroundColor: "rgba(0,192,101,0.12)" }}
              aria-hidden>
              {icon}
            </span>
            {title}
          </div>
          {hint ? (
            <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-slate-400">
              {hint}
            </p>
          ) : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {badge}
          </span>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

function FieldLabel({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-slate-300">
        <span>{label}</span>
        {suffix ? (
          <span className="text-gray-400 dark:text-slate-500">{suffix}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function FieldInline({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function ResourcePicker({
  options,
  selectedIds,
  loading,
  emptyLabel,
  renderOption,
  onToggle,
  selectedList,
  emptySelectedLabel,
}: {
  options: ResourceOption[];
  selectedIds: Set<string>;
  loading: boolean;
  emptyLabel: string;
  renderOption: (option: ResourceOption) => React.ReactNode;
  onToggle: (option: ResourceOption, checked: boolean) => void;
  selectedList: React.ReactNode;
  emptySelectedLabel: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading ? (
          <LoadingRow />
        ) : options.length === 0 ? (
          <EmptyRow label={emptyLabel} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {options.map((option) => {
              const checked = selectedIds.has(option.id);
              return (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        onToggle(option, event.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                    />
                    {renderOption(option)}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="rounded-md border border-dashed border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
        {selectedList ?? <EmptyRow label={emptySelectedLabel} />}
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500 dark:text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading...
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-3 py-3 text-xs text-gray-500 dark:text-slate-400">
      {label}
    </div>
  );
}
