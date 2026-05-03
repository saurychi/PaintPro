"use client";

import { Network, X } from "lucide-react";

type FormulaRelationshipRow = {
  id: string;
  formulaName: string;
  formulaKey: string;
  ruleScope: "duration" | "material";
  mainTaskName: string;
  ruleName: string;
};

type AllFormulaRelationshipsModalProps = {
  open: boolean;
  relationships: FormulaRelationshipRow[];
  onClose: () => void;
};

export default function AllFormulaRelationshipsModal({
  open,
  relationships,
  onClose,
}: AllFormulaRelationshipsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">
              All Rule Relationships
            </h2>
            <p className="truncate text-xs text-gray-500">
              All active relationships between formulas, main tasks, and rules.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Close all rule relationships"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-200 bg-gray-50 p-3">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              Total Active Relationships
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {relationships.length}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {relationships.length > 0 ? (
            <div className="space-y-2">
              {relationships.map((relationship) => (
                <div
                  key={relationship.id}
                  className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 lg:grid-cols-[auto_minmax(180px,0.9fr)_minmax(180px,1fr)_minmax(180px,1fr)]"
                >
                  <div className="flex items-start">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                        relationship.ruleScope === "duration"
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border border-blue-200 bg-blue-50 text-blue-700",
                      ].join(" ")}
                    >
                      {relationship.ruleScope}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Formula
                    </p>
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {relationship.formulaName}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {relationship.formulaKey}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Main Task
                    </p>
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {relationship.mainTaskName}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Rule
                    </p>
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {relationship.ruleName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white text-gray-400">
                <Network className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">
                No active relationships
              </p>
              <p className="mt-1 text-xs text-gray-500">
                There are no active links between formulas and main-task rules yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
