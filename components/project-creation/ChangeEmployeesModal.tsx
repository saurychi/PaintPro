"use client";

import React from "react";
import { Loader2, X } from "lucide-react";

export type StaffUserOption = {
  id: string;
  username: string | null;
  email: string | null;
  specialties: string[];
};

type ChangeEmployeesModalProps = {
  open: boolean;
  subTaskTitle: string;
  staffUsers: StaffUserOption[];
  selectedEmployeeIds: string[];
  saving: boolean;
  generating: boolean;
  onClose: () => void;
  onToggleEmployee: (employeeId: string) => void;
  onGenerate: () => void;
  onSave: () => void;
};

const ACCENT = "#00c065";

export default function ChangeEmployeesModal({
  open,
  subTaskTitle,
  staffUsers,
  selectedEmployeeIds,
  saving,
  generating,
  onClose,
  onToggleEmployee,
  onGenerate,
  onSave,
}: ChangeEmployeesModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              Change Employees
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Select active staff for{" "}
              <span className="font-medium text-gray-800">{subTaskTitle}</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-150 hover:bg-gray-50 hover:scale-[0.985] active:scale-95"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[380px] space-y-2 overflow-y-auto px-5 py-4">
          {staffUsers.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
              No active staff users found.
            </div>
          ) : (
            staffUsers.map((staff) => {
              const checked = selectedEmployeeIds.includes(staff.id);

              return (
                <label
                  key={staff.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleEmployee(staff.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />

                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gray-900">
                      {staff.username || staff.email || "Staff"}
                    </div>

                    {staff.specialties.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {staff.specialties.map((specialty) => (
                          <span
                            key={`${staff.id}-${specialty}`}
                            className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            {specialty}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-gray-500">
                        No specialty listed
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || generating}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70">
            Cancel
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={saving || generating}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70">
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Staff"
            )}
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving || generating}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: ACCENT }}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
