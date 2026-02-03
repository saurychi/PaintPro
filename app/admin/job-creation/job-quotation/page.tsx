"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

const GREEN_SOFT = "#DFF6D5";

type StatusType = "Not yet Approved" | "Approved";

const CLIENTS = ["john doe", "samantha reynolds", "paul jackman"];

export default function JobQuotation() {
  const router = useRouter();

  const [status, setStatus] = useState<StatusType>("Not yet Approved");
  const [sendTo, setSendTo] = useState<string>("john doe");
  const [optionalEmail, setOptionalEmail] = useState<string>("johndoe@gmail.com");

  const statusStyles = useMemo(() => {
    if (status === "Approved") {
      return { bg: "#E6F9DD", border: "#BDE7AF", text: "#4FAE2A" };
    }
    return { bg: "#FAD6D6", border: "#F3A7A7", text: "#D33A3A" };
  }, [status]);

  const toggleStatus = () => {
    setStatus((prev) => (prev === "Approved" ? "Not yet Approved" : "Approved"));
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Job</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Quotation Generation</span>
        </div>

        {/* content row */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-5">
          {/* LEFT: PDF Preview placeholder */}
          <div className="col-span-12 lg:col-span-8 min-h-0">
            <div className="h-full min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="h-full min-h-0 p-4">
                <div className="h-full min-h-0 rounded-lg border border-gray-200 bg-[#F7F7F7] relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-20 bg-[#5B5B5B]" />
                  <div className="absolute right-0 top-0 h-20 w-[180px] bg-[#5B5B5B]" />
                  <div className="absolute right-0 top-0 h-20 w-[180px] flex items-center justify-center">
                    <div className="h-10 w-10 rounded-md bg-white/15 border border-white/20" />
                  </div>

                  <div className="absolute left-5 top-6 text-white">
                    <div className="text-[36px] font-black leading-none">Quote</div>
                    <div className="text-[11px] text-white/70 mt-2">PDF Preview Placeholder</div>
                  </div>

                  <div className="absolute left-0 right-0 bottom-0 h-12 bg-white/70 backdrop-blur-sm border-t border-gray-200 flex items-center justify-center gap-3">
                    <div className="h-6 w-20 rounded bg-gray-200" />
                    <div className="h-6 w-6 rounded bg-gray-200" />
                    <div className="h-6 w-6 rounded bg-gray-200" />
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center px-6">
                      <div className="text-[13px] font-semibold text-gray-700">
                        PDF Preview goes here
                      </div>
                      <div className="text-[12px] text-gray-500 mt-1">
                        You can replace this with a real PDF viewer later.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Status + conditional content */}
          <div className="col-span-12 lg:col-span-4 min-h-0 flex flex-col gap-5">
            {/* Status card */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <div className="text-[13px] font-semibold text-gray-900">Status</div>

              {/* Clickable pill */}
              <button
                type="button"
                onClick={toggleStatus}
                className="mt-3 h-11 w-full rounded-md flex items-center justify-center text-[13px] font-semibold border"
                style={{
                  backgroundColor: statusStyles.bg,
                  borderColor: statusStyles.border,
                  color: statusStyles.text,
                }}
                aria-label="Toggle approval status"
              >
                {status}
              </button>
            </div>

            {/* NOT APPROVED: show Send Quotation */}
            {status !== "Approved" ? (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <div className="text-[13px] font-semibold text-gray-900">Send Quotation</div>

                <div className="mt-4 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-[60px] text-[12px] text-gray-500">Send to:</div>

                    <div className="relative flex-1">
                      <select
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        className="appearance-none h-9 w-full rounded-md border border-gray-300 bg-white px-3 pr-9 text-[13px] text-gray-800 outline-none"
                      >
                        {CLIENTS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    </div>
                  </div>

                  <div className="mt-5 text-[12px] text-gray-500">optional:</div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="w-[60px] text-[12px] text-gray-500">Send to:</div>

                    <input
                      value={optionalEmail}
                      onChange={(e) => setOptionalEmail(e.target.value)}
                      className="h-9 flex-1 rounded-md border border-gray-300 bg-white px-3 text-[13px] text-gray-800 outline-none"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => alert("Send Quotation (UI only).")}
                    className="h-10 w-[160px] rounded-md text-[13px] font-semibold"
                    style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              /* APPROVED: show Create Job Instance button like your image */
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => router.push("/admin")}
                  className="w-full h-[56px] rounded-md text-[16px] font-semibold"
                  style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                >
                  Create Job Instance
                </button>
              </div>
            )}

            <div className="hidden lg:block flex-1" />
          </div>
        </div>

        {/* bottom actions */}
        <div className="shrink-0 flex items-center justify-end gap-5">
          <button
            type="button"
            onClick={() => router.push("/admin/job-creation/overview")}
            className="h-10 w-[260px] rounded-md text-[13px] font-semibold"
            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
          >
            Back to Overview
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 w-[260px] rounded-md bg-[#E9E9E9] text-[13px] font-semibold text-gray-700"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
