"use client";

import { Network, X } from "lucide-react";

import {
  type EstimationFormulaRuleRelation,
  type EstimationFormulaTemplate,
} from "@/lib/estimationSettings";

type FormulaRuleRelationsModalProps = {
  open: boolean;
  formula: EstimationFormulaTemplate | null;
  onClose: () => void;
};

export default function FormulaRuleRelationsModal({
  open,
  formula,
  onClose,
}: FormulaRuleRelationsModalProps) {
  if (!open || !formula) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">
              Rule Relationships
            </h2>
            <p className="truncate text-xs text-gray-500">
              See which main tasks and rules are currently using{" "}
              <span className="font-medium text-gray-700">{formula.name}</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Close rule relationships"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 border-b border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
          <SummaryItem label="Total Active Rules" value={String(formula.total_rule_count)} />
          <SummaryItem label="Duration Rules" value={String(formula.duration_rule_count)} />
          <SummaryItem label="Material Rules" value={String(formula.material_rule_count)} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {formula.rule_relations.length > 0 ? (
            <div className="space-y-2">
              {formula.rule_relations.map((relation) => (
                <RelationRow key={relation.relation_id} relation={relation} />
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
                This formula is not currently attached to any active main-task rule.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function RelationRow({
  relation,
}: {
  relation: EstimationFormulaRuleRelation;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-start">
        <span
          className={[
            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
            relation.rule_scope === "duration"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-blue-200 bg-blue-50 text-blue-700",
          ].join(" ")}
        >
          {relation.rule_scope}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
          Main Task
        </p>
        <p className="truncate text-xs font-semibold text-gray-900">
          {relation.main_task_name}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
          Rule
        </p>
        <p className="truncate text-xs font-semibold text-gray-900">
          {relation.sub_task_name}
        </p>
      </div>
    </div>
  );
}
