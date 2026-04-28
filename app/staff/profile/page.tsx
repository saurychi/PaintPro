"use client";

import React, { useState } from "react";

import StaffPageShell from "@/components/staff/StaffPageShell";

export default function StaffProfile() {
  const [showReport, setShowReport] = useState(false);

  const profile = {
    id: "21700254",
    name: "Marco Dela Cruz",
    email: "marcodelacruz@gmail.com",
    phone: "09662749655",
    photoUrl: "/paint_pro_logo.png",
    metrics: [85, 60, 40, 55, 90, 35],
  };

  return (
    <>
      <StaffPageShell
        title="Profile"
        subtitle="Review your account details, recent work, and performance highlights in the same staff workspace style."
        bodyClassName="overflow-y-auto pr-1"
      >
        <div className="space-y-4 pb-1">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="h-1 w-full bg-[#00c065]" />

            <div className="grid gap-6 p-6">
              <section className="grid gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#00c065]" />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Profile Details
                  </h2>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <img
                      src={profile.photoUrl}
                      alt={profile.name}
                      className="h-16 w-16 rounded-xl border border-gray-200 object-cover"
                    />

                    <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                          ID
                        </div>
                        <div className="mt-1 font-medium text-gray-900">
                          {profile.id}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Name
                        </div>
                        <div className="mt-1 font-medium text-gray-900">
                          {profile.name}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Email
                        </div>
                        <div className="mt-1 font-medium text-gray-900">
                          {profile.email}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Phone
                        </div>
                        <div className="mt-1 font-medium text-gray-900">
                          {profile.phone}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#00c065]" />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Performance and Work
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-emerald-50/40 p-4">
                    <RadarChart values={profile.metrics} />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">
                        Recent Work Timeline
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {[1, 2, 3, 4].map((item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-xl border border-gray-200 p-3"
                        >
                          <span className="text-sm text-gray-700">
                            Dawn House
                          </span>
                          <button
                            onClick={() => setShowReport(true)}
                            className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200"
                          >
                            See report
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </StaffPageShell>

      {showReport ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[90%] max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">
                Job Report: Dawn House
              </h3>
              <button
                onClick={() => setShowReport(false)}
                className="text-gray-400 transition hover:text-gray-600"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">
                    Date
                  </label>
                  <p className="text-sm font-medium">June 15, 2025</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">
                    Duration
                  </label>
                  <p className="text-sm font-medium">6 Hours</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-500">
                  Description
                </label>
                <p className="text-sm text-gray-600">
                  Completed exterior wall preparation and first coat
                  application. Encountered minor dampness on the north wall,
                  treated with sealer.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-500">
                  Materials Used
                </label>
                <ul className="mt-1 list-disc pl-4 text-sm text-gray-600">
                  <li>20L Weather Shield Paint (White)</li>
                  <li>5L Primer/Sealer</li>
                  <li>Sandpaper (Grade 120)</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowReport(false)}
                className="rounded-lg bg-[#00c065] px-4 py-2 font-medium text-white transition hover:bg-[#00a054]"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RadarChart({ values }: { values: number[] }) {
  const size = 220;
  const center = size / 2;
  const radius = 90;
  const axes = [
    "Work Quality",
    "Time Efficiency",
    "Teamwork",
    "Work Ethic",
    "Tool Handling",
    "Compliance",
  ];

  const points = values
    .map((value, index) => {
      const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
      const scaledRadius = (value / 100) * radius;
      const x = center + scaledRadius * Math.cos(angle);
      const y = center + scaledRadius * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");

  const grid = Array.from({ length: 4 }, (_, index) => (index + 1) * (radius / 4));

  return (
    <svg width={size} height={size} className="mx-auto block">
      {axes.map((_, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="#d1d5db"
          />
        );
      })}

      {grid.map((gridRadius, gridIndex) => {
        const ringPoints = axes
          .map((_, axisIndex) => {
            const angle = (Math.PI * 2 * axisIndex) / axes.length - Math.PI / 2;
            const x = center + gridRadius * Math.cos(angle);
            const y = center + gridRadius * Math.sin(angle);
            return `${x},${y}`;
          })
          .join(" ");

        return (
          <polygon
            key={gridIndex}
            points={ringPoints}
            fill="none"
            stroke="#d1d5db"
          />
        );
      })}

      <polygon points={points} fill="#86efac55" stroke="#00c065" />

      {axes.map((label, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        const x = center + (radius + 18) * Math.cos(angle);
        const y = center + (radius + 18) * Math.sin(angle);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            className="fill-gray-500 text-[10px]"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
