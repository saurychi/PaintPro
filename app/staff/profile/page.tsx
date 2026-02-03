"use client";

import React, { useState } from "react";
import SideNavbar from "@/components/sideNavbar";

export default function StaffProfile() {
  const [showReport, setShowReport] = useState(false);

  // Mocked Logged-in User Profile
  const profile = {
    id: "21700254",
    name: "Marco Dela Cruz",
    email: "marcodelacruz@gmail.com",
    phone: "09662749655",
    photoUrl: "/paint_pro_logo.png",
    metrics: [85, 60, 40, 55, 90, 35],
  };

  return (
    <div className="flex min-h-screen bg-white">
      <SideNavbar activeKey="profile" />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-[#1a1a4b]">My Profile</h1>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Profile Card */}
            <div className="px-6 py-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Profile Details</div>
              <div className="border rounded-lg p-4 flex items-center gap-4 bg-white">
                <img src={profile.photoUrl} alt={profile.name} className="w-16 h-16 rounded-md object-cover border" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <span className="text-gray-500">ID#:</span>
                  <span className="text-gray-800 font-medium">{profile.id}</span>
                  <span className="text-gray-500">Name:</span>
                  <span className="text-gray-800 font-medium">{profile.name}</span>
                  <span className="text-gray-500">Email:</span>
                  <span className="text-gray-800 font-medium">{profile.email}</span>
                  <span className="text-gray-500">Phone No.:</span>
                  <span className="text-gray-800 font-medium">{profile.phone}</span>
                </div>
              </div>
            </div>

            {/* Work Section */}
            <div className="px-6 pb-6">
              <div className="text-sm font-medium text-gray-700 mb-2">Performance & Work</div>
              <div className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4">
                  <RadarChart values={profile.metrics} />
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Recent Work Timeline</span>
                  </div>
                  <div className="space-y-3">
                    {[1,2,3,4].map((i) => (
                      <div key={i} className="border rounded-lg p-3 flex items-center justify-between">
                        <span className="text-sm text-gray-700">Dawn House</span>
                        <button 
                            onClick={() => setShowReport(true)}
                            className="text-xs px-3 py-1 rounded-full bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]"
                        >
                            see report
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showReport && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm grid place-items-center z-50">
                <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-lg p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">Job Report: Dawn House</h3>
                        <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                                <p className="text-sm font-medium">June 15, 2025</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Duration</label>
                                <p className="text-sm font-medium">6 Hours</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                            <p className="text-sm text-gray-600">
                                Completed exterior wall preparation and first coat application.
                                Encountered minor dampness on the north wall, treated with sealer.
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Materials Used</label>
                            <ul className="text-sm text-gray-600 list-disc pl-4 mt-1">
                                <li>20L Weather Shield Paint (White)</li>
                                <li>5L Primer/Sealer</li>
                                <li>Sandpaper (Grade 120)</li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={() => setShowReport(false)} className="bg-[#00c065] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#00a054]">
                            Close Report
                        </button>
                    </div>
                </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RadarChart({ values }: { values: number[] }) {
  const size = 220;
  const center = size / 2;
  const radius = 90;
  const axes = ["Work Quality", "Time Efficiency", "Teamwork", "Work Ethic", "Tool Handling", "Compliance"];

  const points = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2; // start at top
    const r = (v / 100) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(" ");

  const grid = Array.from({ length: 4 }, (_, idx) => (idx + 1) * (radius / 4));

  return (
    <svg width={size} height={size} className="mx-auto block">
      {/* axes */}
      {axes.map((_, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#e5e7eb" />;
      })}

      {/* concentric polygons */}
      {grid.map((r, gi) => {
        const ringPoints = axes.map((_, i) => {
          const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          return `${x},${y}`;
        }).join(" ");
        return <polygon key={gi} points={ringPoints} fill="none" stroke="#e5e7eb" />;
      })}

      {/* value polygon */}
      <polygon points={points} fill="#93c5fd55" stroke="#60a5fa" />

      {/* labels */}
      {axes.map((label, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const x = center + (radius + 18) * Math.cos(angle);
        const y = center + (radius + 18) * Math.sin(angle);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" className="fill-gray-500 text-[10px]">{label}</text>
        );
      })}
    </svg>
  );
}