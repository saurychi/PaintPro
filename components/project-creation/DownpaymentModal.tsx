"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200";

type Props = {
  open: boolean;
  projectId: string | null | undefined;
  onClose: () => void;
  onConfirmed: () => void;
};

export default function DownpaymentModal({ open, projectId, onClose, onConfirmed }: Props) {
  const [loadingBudget, setLoadingBudget] = useState(false);
  const [estimatedBudget, setEstimatedBudget] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [percentage, setPercentage] = useState<string>("50");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;

    setPaidAmount("");
    setPercentage("50");
    setEstimatedCost(0);
    setEstimatedBudget(0);

    async function fetchBudget() {
      setLoadingBudget(true);
      try {
        const response = await fetch(
          `/api/planning/getProjectBudget?projectId=${encodeURIComponent(projectId!)}`,
        );
        const data = await response.json();

        if (!response.ok) throw new Error(data?.error || "Failed to fetch budget.");
        setEstimatedBudget(Number(data.estimatedBudget) || 0);
        setEstimatedCost(Number(data.estimatedCost) || 0);
        if (data.downpayment) {
          setPaidAmount(String(data.downpayment));
        }
      } catch {
        setEstimatedBudget(0);
      } finally {
        setLoadingBudget(false);
      }
    }

    fetchBudget();
  }, [open, projectId]);

  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const calculatedDownpayment = (estimatedBudget * pct) / 100;
  const paid = parseFloat(paidAmount) || 0;
  const neededDownpayment = Math.max(0, calculatedDownpayment - paid);
  const canConfirm = paid > 0 && paid >= calculatedDownpayment;

  async function handleConfirm() {
    if (!projectId || confirming) return;

    try {
      setConfirming(true);

      const response = await fetch("/api/planning/manageDownpayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, downpayment: paid }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to confirm downpayment.");
      }

      onConfirmed();
    } catch {
      // parent handles error display
    } finally {
      setConfirming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Down Payment</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-5 py-5">
          {loadingBudget ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Total Cost */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Total Cost
                </label>
                <div className={`flex h-10 items-center overflow-hidden rounded-lg border ${BORDER} bg-gray-50`}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <span className="flex-1 px-3 text-sm text-gray-700">
                    {estimatedCost.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Calculated Downpayment */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Calculated Downpayment
                </label>
                <div className="flex gap-2">
                  <div className={`flex h-10 flex-1 items-center overflow-hidden rounded-lg border ${BORDER} bg-gray-50`}>
                    <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                      $AUD
                    </span>
                    <span className="flex-1 px-3 text-sm text-gray-700">
                      {calculatedDownpayment.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className={`flex h-10 w-24 items-center overflow-hidden rounded-lg border ${BORDER} bg-white`}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      className="w-full bg-transparent px-3 text-sm text-gray-900 outline-none"
                    />
                    <span className="pr-3 text-sm text-gray-500">%</span>
                  </div>
                </div>
              </div>

              {/* Needed Downpayment */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Needed Downpayment
                </label>
                <div className={`flex h-10 items-center overflow-hidden rounded-lg border ${BORDER} bg-gray-50`}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <span className="flex-1 px-3 text-sm text-gray-700">
                    {neededDownpayment.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Paid Downpayment */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Paid Downpayment
                </label>
                <div
                  className={`flex h-10 items-center overflow-hidden rounded-lg border ${BORDER} bg-white focus-within:ring-2`}
                  style={{ ["--tw-ring-color" as any]: ACCENT }}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="Enter Payment"
                    className="flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                  />
                </div>
                {paid > 0 && paid < calculatedDownpayment ? (
                  <p className="mt-1 text-[11px] text-red-500">
                    Payment must be at least $AUD{" "}
                    {calculatedDownpayment.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
            Go Back
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || confirming || loadingBudget}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
            onMouseEnter={(e) => {
              if (canConfirm && !confirming)
                e.currentTarget.style.backgroundColor = ACCENT_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT;
            }}>
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirming ? "Confirming..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
