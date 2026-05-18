"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200";

function formatAud(amount: number) {
  return `$AUD ${amount.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Parse a comma-formatted currency string ("1,500,000.50") into a
// plain number. Empty / invalid input → 0 so downstream math stays
// safe.
function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Re-format whatever the user typed into a thousand-separated string.
// Commas anywhere in the input are stripped first; digits and a single
// decimal are kept; the integer half gets a comma every three digits.
// Returns the cleaned string verbatim, so:
//   "1500000"     -> "1,500,000"
//   "1,500,000"   -> "1,500,000"
//   "1500.55"     -> "1,500.55"
//   "abc"         -> ""
function formatCurrencyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const firstDot = cleaned.indexOf(".");
  const intPart = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const decPartRaw =
    firstDot === -1 ? "" : cleaned.slice(firstDot + 1).replace(/\./g, "");
  const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return firstDot === -1 ? intWithCommas : `${intWithCommas}.${decPartRaw}`;
}

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
  // savedDownpayment = the cumulative amount already recorded in the DB
  // (read-only display field). inputPayment = the NEW instalment the
  // admin is adding right now; it gets added on top of savedDownpayment
  // when the request fires, then cleared so the field is ready for the
  // next instalment.
  const [savedDownpayment, setSavedDownpayment] = useState<number>(0);
  const [inputPayment, setInputPayment] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchBudget = useCallback(async () => {
    if (!projectId) return;
    setLoadingBudget(true);
    try {
      const response = await fetch(
        `/api/planning/getProjectBudget?projectId=${encodeURIComponent(projectId)}`,
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "Failed to fetch budget.");
      setEstimatedBudget(Number(data.estimatedBudget) || 0);
      setEstimatedCost(Number(data.estimatedCost) || 0);
      setSavedDownpayment(Number(data.downpayment) || 0);
      // Use the rate the admin entered on the cost-estimation page rather
      // than the 50% default. Falls back to 50% only when no rate was set
      // (legacy projects pre-dating the downpayment_rate column).
      const fetchedRate = Number(data.downpaymentRate);
      if (Number.isFinite(fetchedRate) && fetchedRate > 0) {
        setPercentage(String(fetchedRate));
      }
    } catch {
      setEstimatedBudget(0);
      setSavedDownpayment(0);
    } finally {
      setLoadingBudget(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId) return;

    setInputPayment("");
    setPercentage("50");
    setEstimatedCost(0);
    setEstimatedBudget(0);
    setSavedDownpayment(0);

    fetchBudget();
  }, [open, projectId, fetchBudget]);

  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const calculatedDownpayment = (estimatedBudget * pct) / 100;
  const inputAmount = parseCurrencyInput(inputPayment);
  // The cumulative we'd land on if the admin clicked Add/Confirm right
  // now. Drives the gating below — the API expects the full cumulative
  // total, not the delta.
  const prospectiveTotal = savedDownpayment + inputAmount;
  const neededAfterSaved = Math.max(0, calculatedDownpayment - savedDownpayment);
  const neededAfterInput = Math.max(
    0,
    calculatedDownpayment - prospectiveTotal,
  );
  const meetsCalculated =
    prospectiveTotal > 0 && prospectiveTotal >= calculatedDownpayment;
  // Add is for partial instalments — only fires when the admin
  // actually entered a positive amount and the running total is still
  // short of the calculated downpayment.
  const canAdd = inputAmount > 0 && !meetsCalculated;
  // Confirm fires once the prospective total reaches the threshold —
  // either via a fresh input or because saved already covers it.
  const canConfirm = meetsCalculated;
  const isBusy = confirming || adding;

  async function handleAdd() {
    if (!projectId || isBusy || !canAdd) return;

    // Snapshot the values BEFORE the request so the toast / clear
    // logic still has the correct numbers if state churns.
    const newTotal = prospectiveTotal;
    const addedThisRound = inputAmount;

    try {
      setAdding(true);

      const response = await fetch("/api/planning/manageDownpayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          downpayment: newTotal,
          finalize: false,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save partial payment.");
      }

      toast.success("Partial payment recorded.", {
        description: `${formatAud(addedThisRound)} added — ${formatAud(newTotal)} of ${formatAud(calculatedDownpayment)} now collected.`,
      });

      // Clear the input field so the admin can immediately type the
      // next instalment, then refetch so the read-only Paid
      // Downpayment field reflects the freshly-saved total.
      setInputPayment("");
      await fetchBudget();

      // Ping the client about the freshly-updated balance. Fire-and-
      // forget — the partial payment is already recorded server-side,
      // and a failed messages-API call shouldn't undo that.
      fetch("/api/planning/notifyDownpaymentClient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          calculatedDownpayment,
          paidAmount: newTotal,
          neededDownpayment: Math.max(0, calculatedDownpayment - newTotal),
          percentage: pct,
        }),
      }).catch(() => {});
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save partial payment.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleConfirm() {
    if (!projectId || isBusy || !canConfirm) return;

    try {
      setConfirming(true);

      const response = await fetch("/api/planning/manageDownpayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          downpayment: prospectiveTotal,
          finalize: true,
        }),
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
      <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
        {/* Green accent strip — matches the dashboard CurrentJob card so the
            two cards read as part of the same workflow lane. */}
        <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
        {/* Header — also gets a faint green wash that fades into the body so
            the accent strip doesn't sit on a stark white background. */}
        <div
          className="flex items-center justify-between border-b border-gray-200 px-5 py-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,192,101,0.08) 0%, rgba(0,192,101,0) 100%)",
          }}
        >
          <h3 className="text-base font-semibold text-gray-900">Down Payment</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-50">
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
                <div className={`flex h-10 items-center overflow-hidden rounded-md border ${BORDER} bg-gray-50`}>
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
                  <div className={`flex h-10 flex-1 items-center overflow-hidden rounded-md border ${BORDER} bg-gray-50`}>
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
                  {/* Percentage is read-only here. The downpayment ratio
                      is locked once the quotation is decided on the
                      cost-estimation page so the admin can't quietly
                      change it after the client signs. */}
                  <div
                    className={`flex h-10 w-24 items-center overflow-hidden rounded-md border ${BORDER} bg-gray-50`}
                    title="Set on the quotation; locked here."
                  >
                    <span className="flex-1 px-3 text-sm font-medium text-gray-700">
                      {pct}
                    </span>
                    <span className="pr-3 text-sm text-gray-500">%</span>
                  </div>
                </div>
              </div>

              {/* Paid Downpayment (read-only) — what's already in the
                  database. Updates after every Add so the running
                  tally is always visible. */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Paid Downpayment
                </label>
                <div className={`flex h-10 items-center overflow-hidden rounded-md border ${BORDER} bg-gray-50`}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <span className="flex-1 px-3 text-sm text-gray-700">
                    {savedDownpayment.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Needed Downpayment (read-only) — what's still missing
                  to hit the calculated threshold, before counting the
                  current input. */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Needed Downpayment
                </label>
                <div className={`flex h-10 items-center overflow-hidden rounded-md border ${BORDER} bg-gray-50`}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <span className="flex-1 px-3 text-sm text-gray-700">
                    {neededAfterSaved.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Input Payment — the only editable field. Admin types
                  the new instalment they want to add; we sum it with
                  Paid Downpayment when sending to the API and clear
                  this field once the request lands. */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-600">
                  Input Payment
                </label>
                <div
                  className={`flex h-10 items-center overflow-hidden rounded-md border ${BORDER} bg-white focus-within:ring-2`}
                  style={{ ["--tw-ring-color" as any]: ACCENT }}>
                  <span className="border-r border-gray-200 px-3 text-sm font-medium text-gray-500">
                    $AUD
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={inputPayment}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      // Cap the instalment at what's still owed so the
                      // cumulative downpayment never overshoots the
                      // calculated total. Clamping the formatted string
                      // (not just the parsed number) keeps the visible
                      // value in sync with the underlying amount.
                      if (parseCurrencyInput(formatted) > neededAfterSaved) {
                        setInputPayment(
                          formatCurrencyInput(neededAfterSaved.toFixed(2)),
                        );
                        return;
                      }
                      setInputPayment(formatted);
                    }}
                    placeholder="Enter new instalment"
                    className="flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                  />
                </div>
                {inputAmount > 0 && !meetsCalculated ? (
                  <p className="mt-1 text-[11px] text-amber-600">
                    Adding this brings the total to{" "}
                    {formatAud(prospectiveTotal)} —{" "}
                    {formatAud(neededAfterInput)} still needed to reach{" "}
                    {formatAud(calculatedDownpayment)}. Click{" "}
                    <strong>Add</strong> to record this instalment, or{" "}
                    <strong>Notify Client</strong> to remind them of the
                    remainder.
                  </p>
                ) : null}
                {inputAmount > 0 && meetsCalculated ? (
                  <p className="mt-1 text-[11px] text-emerald-600">
                    Adding this brings the total to{" "}
                    {formatAud(prospectiveTotal)} — covers the calculated
                    downpayment. Click <strong>Confirm</strong> to lock
                    it in.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-md border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
            Go Back
          </button>
          {canConfirm ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isBusy || loadingBudget}
              className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
              onMouseEnter={(e) => {
                if (!isBusy)
                  e.currentTarget.style.backgroundColor = ACCENT_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT;
              }}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirming ? "Confirming..." : "Confirm"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd || isBusy || loadingBudget}
              className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
              onMouseEnter={(e) => {
                if (canAdd && !isBusy)
                  e.currentTarget.style.backgroundColor = ACCENT_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT;
              }}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {adding ? "Adding..." : "Add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
