"use client"

import React, { useMemo, useState } from "react"

type Employee = {
  id: string
  name: string
  email: string
  phone: string
  photoUrl: string
  metrics: number[] // six-point radar metrics
}

const initialEmployees: Employee[] = [
  {
    id: "21700254",
    name: "Marco Dela Cruz",
    email: "marcodelacruz@gmail.com",
    phone: "09662749655",
    photoUrl: "/paint_pro_logo.png",
    metrics: [85, 60, 40, 55, 90, 35],
  },
]

export default function Staff() {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const addEmployee = (name: string) => {
    const newEmp: Employee = {
      id: String(Math.floor(Math.random() * 1_000_000)),
      name,
      email: `${name.replace(/\s+/g, "").toLowerCase()}@example.com`,
      phone: "0900-000-0000",
      photoUrl: "/paint_pro_logo.png",
      metrics: [60, 50, 45, 55, 65, 40],
    }
    setEmployees((prev) => [newEmp, ...prev])
    setOpenIndex(null)
  }

  const toggleEmployee = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <main className="min-h-screen bg-white">
      {/* page shell */}
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {/* header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight text-[#111827]">
              Staff
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-600">
              Manage employees, view basic information, and check performance summaries.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#00c065] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00a857]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-md bg-white/20 text-white">
              +
            </span>
            Add User
          </button>
        </div>

        {/* section title */}
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Employees</h2>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* list */}
        <div className="space-y-4">
          {employees.map((emp, idx) => {
            const isOpen = openIndex === idx
            return (
              <div
                key={emp.id}
                className={[
                  "rounded-2xl border bg-white shadow-sm transition-colors",
                  isOpen ? "border-[#00c065]" : "border-gray-200",
                ].join(" ")}
              >
                {/* Header / Trigger */}
                <button
                  onClick={() => toggleEmployee(idx)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={emp.photoUrl}
                      alt={emp.name}
                      className="h-10 w-10 rounded-lg border object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">{emp.name}</div>
                      <div className="truncate text-xs text-gray-500">{emp.email}</div>
                    </div>
                  </div>

                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={[
                      "shrink-0 text-[#00c065] transition-transform duration-200",
                      isOpen ? "rotate-180" : "",
                    ].join(" ")}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {/* Profile Card */}
                    <div className="px-6 py-5">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Profile
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                          <img
                            src={emp.photoUrl}
                            alt={emp.name}
                            className="h-16 w-16 rounded-xl border object-cover"
                          />

                          <div className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-10">
                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                              <span className="text-gray-500">ID#:</span>
                              <span className="font-medium text-gray-900">{emp.id}</span>
                            </div>

                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                              <span className="text-gray-500">Phone:</span>
                              <span className="font-medium text-gray-900">{emp.phone}</span>
                            </div>

                            <div className="flex items-center justify-between gap-3 sm:justify-start sm:col-span-2">
                              <span className="text-gray-500">Email:</span>
                              <span className="font-medium text-gray-900">{emp.email}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Work Section */}
                    <div className="px-6 pb-6">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Work
                      </div>

                      <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2">
                        <div className="rounded-xl bg-white p-2">
                          <RadarChart values={emp.metrics} />
                        </div>

                        <div className="rounded-xl bg-white p-2">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">
                              Work Timeline
                            </span>
                          </div>

                          <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
                              >
                                <span className="text-sm font-medium text-gray-700">
                                  Dawn House
                                </span>

                                <button
                                  onClick={() => setShowReport(true)}
                                  className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-semibold text-[#166534] transition-colors hover:bg-[#bbf7d0]"
                                >
                                  See report
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isModalOpen && (
          <AddUserModal
            onClose={() => setIsModalOpen(false)}
            onAdd={(username) => {
              addEmployee(username)
              setIsModalOpen(false)
            }}
          />
        )}

        {showReport && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
            <div className="w-[92%] max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Job Report: Dawn House</h3>
                <button
                  onClick={() => setShowReport(false)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Date</label>
                    <p className="text-sm font-medium text-gray-900">June 15, 2025</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Duration</label>
                    <p className="text-sm font-medium text-gray-900">6 Hours</p>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Description</label>
                  <p className="text-sm text-gray-600">
                    Completed exterior wall preparation and first coat application. Encountered minor dampness on the
                    north wall, treated with sealer.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Materials Used</label>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-gray-600">
                    <li>20L Weather Shield Paint (White)</li>
                    <li>5L Primer/Sealer</li>
                    <li>Sandpaper (Grade 120)</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowReport(false)}
                  className="rounded-full bg-[#00c065] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (username: string) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length >= 6 && password === confirm,
    [username, password, confirm]
  )

  const submit = () => {
    if (!canSubmit) {
      setError("Please fill all fields correctly")
      return
    }
    onAdd(username.trim())
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-xl font-extrabold tracking-[-0.02em] text-[#1a1a4b]">Add user</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Username</label>
            <input
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Password</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-16 text-sm text-gray-700 outline-none focus:border-[#00c065]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                onClick={() => setShowPass((s) => !s)}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Re-type Password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-16 text-sm text-gray-700 outline-none focus:border-[#00c065]"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                onClick={() => setShowConfirm((s) => !s)}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={submit}
            className={[
              "rounded-full px-5 py-2 text-sm font-semibold text-white transition-colors",
              canSubmit ? "bg-[#00c065] hover:bg-[#00a857]" : "cursor-not-allowed bg-gray-300",
            ].join(" ")}
          >
            Add
          </button>

          <button
            onClick={onClose}
            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

function RadarChart({ values }: { values: number[] }) {
  const size = 220
  const center = size / 2
  const radius = 90
  const axes = ["Work Quality", "Time Efficiency", "Teamwork", "Work Ethic", "Tool Handling", "Compliance"]

  const points = values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2
      const r = (v / 100) * radius
      const x = center + r * Math.cos(angle)
      const y = center + r * Math.sin(angle)
      return `${x},${y}`
    })
    .join(" ")

  const grid = Array.from({ length: 4 }, (_, idx) => (idx + 1) * (radius / 4))

  return (
    <svg width={size} height={size} className="mx-auto block">
      {axes.map((_, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2
        const x = center + radius * Math.cos(angle)
        const y = center + radius * Math.sin(angle)
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#e5e7eb" />
      })}

      {grid.map((r, gi) => {
        const ringPoints = axes
          .map((_, i) => {
            const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2
            const x = center + r * Math.cos(angle)
            const y = center + r * Math.sin(angle)
            return `${x},${y}`
          })
          .join(" ")
        return <polygon key={gi} points={ringPoints} fill="none" stroke="#e5e7eb" />
      })}

      <polygon points={points} fill="#93c5fd55" stroke="#60a5fa" />

      {axes.map((label, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2
        const x = center + (radius + 18) * Math.cos(angle)
        const y = center + (radius + 18) * Math.sin(angle)
        return (
          <text key={label} x={x} y={y} textAnchor="middle" className="fill-gray-500 text-[10px]">
            {label}
          </text>
        )
      })}
    </svg>
  )
}
