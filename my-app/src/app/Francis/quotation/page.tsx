// src/app/Francis/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type QuotationItemRow = {
  title?: string;
  description: string;
  price: number;
};

type QuotationSection = {
  sectionLabel: string;
  rows: QuotationItemRow[];
  total: number;
};

type QuotationStatus = "NOT_YET_APPROVED" | "APPROVED";

type Quotation = {
  id: number;
  quoteNumber: string;
  jobName: string;
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  status: QuotationStatus;
  approverName: string | null;
  items: QuotationSection[];
  grandTotal: number;
};

const DEFAULT_TASKS =
  "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.\n" +
  "Final inspection and touch-ups if required.";

// breakdown used in Estimation Summary + PDF
type CalcSummary = {
  totalArea: number;
  wallArea: number;
  ceilingArea: number;
  litresNeeded: number;
  materialCost: number;
  labourCost: number;
  totalCost: number;
};

const FrancisQuotationPage: React.FC = () => {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendToName, setSendToName] = useState("john doe");
  const [optionalEmail, setOptionalEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Estimation inputs as strings so typing works nicely
  const [lengthM, setLengthM] = useState("5"); // meters
  const [widthM, setWidthM] = useState("4");
  const [heightM, setHeightM] = useState("2.8");
  const [coats, setCoats] = useState("2");
  const [workers, setWorkers] = useState("2");
  const [durationDays, setDurationDays] = useState("3");
  const [coverage, setCoverage] = useState("10"); // m² per litre per coat
  const [paintPrice, setPaintPrice] = useState("30"); // $ per litre
  const [hourlyRate, setHourlyRate] = useState("25"); // $ per hour per worker
  const [tasksText, setTasksText] = useState(DEFAULT_TASKS);
  const [calculating, setCalculating] = useState(false);

  const [calcSummary, setCalcSummary] = useState<CalcSummary | null>(null);

  useEffect(() => {
    const loadQuotation = async () => {
      try {
        const res = await fetch("/api/francis/quotation");
        const data = (await res.json()) as Quotation;
        setQuotation(data);
      } catch (err) {
        console.error(err);
        setMessage("Failed to load quotation.");
      } finally {
        setLoading(false);
      }
    };
    loadQuotation();
  }, []);

  const handleCalculateQuotation = async () => {
    if (!quotation) return;
    setCalculating(true);
    setMessage(null);

    // Convert to numbers for validation and backend
    const lengthNum = Number(lengthM);
    const widthNum = Number(widthM);
    const heightNum = Number(heightM);
    const coatsNum = Number(coats);
    const workersNum = Number(workers);
    const daysNum = Number(durationDays);
    const coverageNum = Number(coverage);
    const paintPriceNum = Number(paintPrice);
    const hourlyRateNum = Number(hourlyRate);

    const numbers = [
      lengthNum,
      widthNum,
      heightNum,
      coatsNum,
      workersNum,
      daysNum,
      coverageNum,
      paintPriceNum,
      hourlyRateNum,
    ];

    if (numbers.some((n) => !Number.isFinite(n) || n <= 0)) {
      setMessage("Please enter valid positive numbers for all fields.");
      setCalculating(false);
      return;
    }

    try {
      const res = await fetch("/api/francis/quotation/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lengthM: lengthNum,
          widthM: widthNum,
          heightM: heightNum,
          coats: coatsNum,
          workers: workersNum,
          durationDays: daysNum,
          coverage: coverageNum,
          paintPrice: paintPriceNum,
          hourlyRate: hourlyRateNum,
          tasksText,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Calculation failed");
      }

      const data: {
        totalArea: number;
        wallArea: number;
        ceilingArea: number;
        litresNeeded: number;
        materialCost: number;
        labourCost: number;
        totalCost: number;
        section: QuotationSection;
      } = await res.json();

      // update table + grand total
      setQuotation({
        ...quotation,
        items: [data.section],
        grandTotal: data.totalCost,
      });

      // store breakdown for the Estimation Summary card + PDF
      setCalcSummary({
        totalArea: data.totalArea,
        wallArea: data.wallArea,
        ceilingArea: data.ceilingArea,
        litresNeeded: data.litresNeeded,
        materialCost: data.materialCost,
        labourCost: data.labourCost,
        totalCost: data.totalCost,
      });

      setMessage(
        `Recalculated quotation based on ${data.totalArea.toFixed(
          1
        )} m², paint ${data.litresNeeded.toFixed(
          1
        )} L, material $${data.materialCost.toFixed(
          2
        )}, labour $${data.labourCost.toFixed(2)}.`
      );
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Failed to calculate quotation.");
    } finally {
      setCalculating(false);
    }
  };

  const handleSendQuotation = () => {
    if (!quotation) return;
    setQuotation({
      ...quotation,
      status: "APPROVED",
      approverName: "Walter Caballero",
    });
    setMessage(
      `Quotation sent to ${optionalEmail || sendToName} and marked as Approved.`
    );
  };

  const handleCreateJobInstance = () => {
    setMessage("Job instance created (demo only).");
  };

  const handleDownloadPdf = async () => {
    if (!quotation) return;

    try {
      const res = await fetch("/api/francis/quotation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation,
          summary: calcSummary,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quotation_${quotation.quoteNumber.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMessage("Failed to download quotation PDF.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading quotation…</p>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-red-500">No quotation data found.</p>
      </div>
    );
  }

  const isApproved = quotation.status === "APPROVED";

  return (
    <div className="flex min-h-screen bg-[#f5f5f5] text-gray-900">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-white border-r border-gray-200">
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="h-10 w-10 rounded bg-green-600 mb-2" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            PAUL JACKMAN
          </p>
          <p className="text-xs text-gray-500">Painting and Decorating</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          <NavItem label="Jobs" active />
          <NavItem label="Staff" />
          <NavItem label="Schedule" />
          <NavItem label="Report" />
          <NavItem label="Inventory" />
          <NavItem label="Documents" />
          <NavItem label="Settings" />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Top bar / breadcrumb */}
        <header className="flex items-center justify-between px-10 py-6 border-b border-gray-200 bg-white">
          <div>
            <p className="text-xs text-gray-500">
              Job <span className="text-gray-400 mx-1">{">"}</span>{" "}
              <span className="font-semibold text-gray-700">
                Quotation Generation
              </span>
            </p>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">
              Quotation Generation
            </h1>
          </div>
        </header>

        {/* Content area */}
        <div className="flex flex-1 px-10 py-8 gap-8">
          {/* Left: quotation preview */}
          <section className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            {/* Top actions */}
            <div className="flex justify-end mb-4">
              <button
                onClick={handleDownloadPdf}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Download PDF
              </button>
            </div>

            {/* Banner */}
            <div className="mb-8 h-40 w-full rounded-lg bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 flex items-center justify-between px-10 text-white">
              <div>
                <h2 className="text-4xl font-semibold">Quote</h2>
                <div className="mt-4 space-y-1 text-sm">
                  <p>+61 467 606 570</p>
                  <p>pauljackmanpainting@outlook.com</p>
                  <p>Deakin Place Durack NT 0830</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs tracking-wide uppercase text-gray-300">
                  Paul Jackman
                </p>
                <p className="text-xs text-gray-300">
                  Painting and Decorating
                </p>
              </div>
            </div>

            {/* Client / job info */}
            <div className="mb-6">
              <p className="font-semibold">{quotation.jobName}</p>
              <p className="text-xs text-gray-500">{quotation.quoteNumber}</p>
              <div className="mt-3 text-sm text-gray-700 space-y-1">
                <p>{quotation.clientAddress}</p>
                <p>{quotation.clientName}</p>
                <p>{quotation.clientPhone}</p>
              </div>
            </div>

            {/* Tasks */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3">Tasks</h3>

              <div className="space-y-6">
                {quotation.items.map((section, index) => (
                  <div key={index}>
                    {/* main task / section name OUTSIDE table */}
                    <p className="text-sm font-semibold mb-1">
                      {section.sectionLabel}
                    </p>

                    <table className="w-full text-xs border border-gray-300">
                      <tbody>
                        {section.rows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-200">
                            <td className="px-3 py-2 align-top border-r border-gray-200">
                              {row.title && (
                                <div className="font-semibold mb-0.5">
                                  {row.title}
                                </div>
                              )}
                              {row.description && (
                                <div className="text-[11px] text-gray-700">
                                  {row.description}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              ${row.price.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-3 py-2 text-right font-semibold border-r border-gray-200">
                            Total:
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            ${section.total.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Footer bar */}
              <div className="mt-8 flex items-center justify-between text-xs text-gray-600">
                <div className="h-4 flex-1 bg-green-600 rounded-sm" />
                <div className="mx-4 flex items-center gap-3">
                  <span>Page</span>
                  <span className="px-2 py-1 rounded bg-gray-800 text-white text-[11px]">
                    1 / 5
                  </span>
                  <span className="text-lg cursor-default">🔍</span>
                </div>
                <div className="text-[11px] text-right w-40">
                  ABN: 8317 676 7074
                </div>
              </div>
            </div>
          </section>

          {/* Right: estimation + status + actions */}
          <aside className="w-80 space-y-6">
            {/* Estimation inputs */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
              <p className="text-sm font-semibold">Estimation Inputs</p>

              {/* Dimensions */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <InputField
                  label="Length (m)"
                  value={lengthM}
                  onChange={setLengthM}
                />
                <InputField
                  label="Width (m)"
                  value={widthM}
                  onChange={setWidthM}
                />
                <InputField
                  label="Height (m)"
                  value={heightM}
                  onChange={setHeightM}
                />
              </div>

              {/* Coats and paint */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InputField label="Coats" value={coats} onChange={setCoats} />
                <InputField
                  label="Coverage m²/L"
                  value={coverage}
                  onChange={setCoverage}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <InputField
                  label="Paint $/L"
                  value={paintPrice}
                  onChange={setPaintPrice}
                />
                <InputField
                  label="Workers"
                  value={workers}
                  onChange={setWorkers}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <InputField
                  label="Days"
                  value={durationDays}
                  onChange={setDurationDays}
                />
                <InputField
                  label="$ /hr /worker"
                  value={hourlyRate}
                  onChange={setHourlyRate}
                />
              </div>

              {/* Tasks textarea */}
              <div className="text-xs space-y-1">
                <label className="block text-gray-600">
                  Tasks & materials (one per line)
                </label>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs h-20 resize-none"
                  value={tasksText}
                  onChange={(e) => setTasksText(e.target.value)}
                />
              </div>

              <button
                onClick={handleCalculateQuotation}
                disabled={calculating}
                className="w-full rounded-lg bg-gray-900 text-white text-xs font-semibold py-2 hover:bg-black transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {calculating ? "Calculating…" : "Calculate quotation"}
              </button>
            </div>

            {/* Estimation summary */}
            {calcSummary && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-2 text-xs">
                <p className="text-sm font-semibold mb-1">
                  Estimation Summary
                </p>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wall area</span>
                  <span>{calcSummary.wallArea.toFixed(1)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ceiling area</span>
                  <span>{calcSummary.ceilingArea.toFixed(1)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total area</span>
                  <span>{calcSummary.totalArea.toFixed(1)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Paint needed</span>
                  <span>{calcSummary.litresNeeded.toFixed(1)} L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Material cost</span>
                  <span>${calcSummary.materialCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Labour cost</span>
                  <span>${calcSummary.labourCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-1 text-[11px] font-semibold">
                  <span>Total quotation</span>
                  <span>${calcSummary.totalCost.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Status card */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold mb-3">Status</p>
              <div
                className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${
                  isApproved
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-red-100 text-red-700 border border-red-300"
                }`}
              >
                {isApproved ? "Approved" : "Not yet Approved"}
              </div>
              {isApproved && quotation.approverName && (
                <p className="mt-2 text-xs text-gray-500 text-center">
                  {quotation.approverName}
                </p>
              )}
            </div>

            {/* Send quotation or create job instance */}
            {!isApproved ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
                <p className="text-sm font-semibold">Send Quotation</p>

                <div className="space-y-1 text-xs">
                  <label className="block text-gray-600">Send to:</label>
                  <select
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={sendToName}
                    onChange={(e) => setSendToName(e.target.value)}
                  >
                    <option value="john doe">john doe</option>
                    <option value="Samantha Reynolds">
                      Samantha Reynolds
                    </option>
                  </select>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="block text-gray-600">optional:</label>
                  <input
                    type="email"
                    placeholder="johndoe@gmail.com"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={optionalEmail}
                    onChange={(e) => setOptionalEmail(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleSendQuotation}
                  className="w-full rounded-lg bg-green-600 text-white text-sm font-semibold py-2 hover:bg-green-700 transition"
                >
                  Send quotation
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <button
                  onClick={handleCreateJobInstance}
                  className="w-full rounded-lg bg-green-100 text-green-700 border border-green-300 text-sm font-semibold py-3 hover:bg-green-200 transition"
                >
                  Create Job Instance
                </button>
              </div>
            )}

            {/* Message / toast */}
            {message && (
              <div className="text-xs text-gray-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
                {message}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

type NavItemProps = {
  label: string;
  active?: boolean;
};

const NavItem: React.FC<NavItemProps> = ({ label, active }) => (
  <button
    className={`flex w-full items-center rounded-md px-3 py-2 text-left ${
      active
        ? "bg-green-600 text-white font-semibold"
        : "text-gray-700 hover:bg-gray-100"
    }`}
  >
    <span className="text-sm">{label}</span>
  </button>
);

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <label className="block text-gray-600">{label}</label>
    <input
      type="number"
      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      step="0.1"
    />
  </div>
);

export default FrancisQuotationPage;
