"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, UserCheck } from "lucide-react"

type WorkTimelineEntry = {
  jobName: string
  reportDate: string
  duration: string
  description: string
  materials: string[]
}

type Employee = {
  id: string
  name: string
  email: string
  phone: string
  photoUrl: string
  metrics: number[]
  workTimeline: WorkTimelineEntry[]
}

const initialEmployees: Employee[] = [
  {
    id: "21700254",
    name: "Marco Dela Cruz",
    email: "marcodelacruz@gmail.com",
    phone: "09662749655",
    photoUrl: "/paint_pro_logo.png",
    metrics: [85, 60, 40, 55, 90, 35],
    workTimeline: [
      {
        jobName: "Dawn House",
        reportDate: "June 15, 2025",
        duration: "6 Hours",
        description:
          "Completed exterior wall preparation and first coat application. Encountered minor dampness on the north wall, treated with sealer.",
        materials: ["20L Weather Shield Paint (White)", "5L Primer/Sealer", "Sandpaper (Grade 120)"],
      },
      {
        jobName: "Dawn House",
        reportDate: "June 16, 2025",
        duration: "5 Hours",
        description: "Applied second coat on exterior walls. Completed trim painting.",
        materials: ["15L Weather Shield Paint (White)", "Masking Tape"],
      },
      {
        jobName: "Dawn House",
        reportDate: "June 17, 2025",
        duration: "4 Hours",
        description: "Interior wall preparation and priming.",
        materials: ["10L Interior Primer", "Sandpaper (Grade 80)"],
      },
      {
        jobName: "Dawn House",
        reportDate: "June 18, 2025",
        duration: "7 Hours",
        description: "Interior painting, living room and hallway.",
        materials: ["20L Interior Paint (Cream)", "Paint Rollers", "Drop Sheets"],
      },
    ],
  },
]

type NewEmployeeInput = {
  name: string
  email: string
  phone: string
  photoUrl: string
}

export default function Staff() {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showReport, setShowReport] = useState<WorkTimelineEntry | null>(null)

  const addEmployee = (payload: NewEmployeeInput) => {
    const newEmp: Employee = {
      id: String(Math.floor(Math.random() * 1_000_000)),
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      photoUrl: payload.photoUrl || "/paint_pro_logo.png",
      metrics: [60, 50, 45, 55, 65, 40],
      workTimeline: [],
    }

    setEmployees((prev) => [newEmp, ...prev])
    setOpenIndex(null)
  }

  const toggleEmployee = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>

      <div className="mt-6">
        {/* Header Row */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-700">Employees</div>

          <div className="flex items-center gap-2">

            {/* Invites */}
            <Link
              href="/admin/staff/staff-invite"
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm",
                "bg-white text-gray-900",
                "border-gray-200",
                "transition-all duration-200 ease-out",
                "hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md",
                "active:scale-[0.98]",
              ].join(" ")}
            >
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              Invites
            </Link>

            {/* Add User */}
            <button
              onClick={() => setIsModalOpen(true)}
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm",
                "bg-white text-gray-900",
                "border-[#00c065]/25",
                "transition-all duration-200 ease-out",
                "hover:bg-emerald-50 hover:border-[#00c065]/40 hover:shadow-md",
                "active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              ].join(" ")}
            >
              <Plus className="h-4 w-4 text-[#00c065]" />
              Add user
            </button>
          </div>
        </div>

        {/* Employee List */}
        <div className="space-y-4">
          {employees.map((emp, idx) => {
            const isOpen = openIndex === idx

            return (
              <div
                key={emp.id}
                className={[
                  "rounded-lg border bg-white shadow-sm transition-colors",
                  isOpen ? "border-[#00c065]" : "border-gray-200",
                ].join(" ")}
              >
                {/* Trigger */}
                <button
                  onClick={() => toggleEmployee(idx)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-6 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={emp.photoUrl}
                      alt={emp.name}
                      className="h-10 w-10 rounded-lg border border-gray-200 object-cover"
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

                {/* Expanded */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {/* Profile */}
                    <div className="px-6 py-5">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Profile
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                          <img
                            src={emp.photoUrl}
                            alt={emp.name}
                            className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
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

                    {/* Work */}
                    <div className="px-6 pb-6">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Work
                      </div>

                      <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-2">
                        <div className="rounded-lg bg-white p-2">
                          <RadarChart values={emp.metrics} />
                        </div>

                        <div className="rounded-lg bg-white p-2">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">Work Timeline</span>
                          </div>

                          <div className="space-y-3">
                            {emp.workTimeline.map((entry, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                              >
                                <span className="text-sm font-medium text-gray-700">{entry.jobName}</span>

                                <button
                                  onClick={() => setShowReport(entry)}
                                  className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
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
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <AddUserModal
          onClose={() => setIsModalOpen(false)}
          onAdd={(payload) => {
            addEmployee(payload)
            setIsModalOpen(false)
          }}
        />
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="w-[92%] max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Job Report: {showReport.jobName}</h3>
              <button
                onClick={() => setShowReport(null)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                aria-label="Close report"
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
                  <p className="text-sm font-medium text-gray-900">{showReport.reportDate}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Duration</label>
                  <p className="text-sm font-medium text-gray-900">{showReport.duration}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-500">Description</label>
                <p className="text-sm text-gray-600">{showReport.description}</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-500">Materials Used</label>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-gray-600">
                  {showReport.materials.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowReport(null)}
                className="rounded-lg bg-[#00c065] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a054]"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (payload: NewEmployeeInput) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string>("/paint_pro_logo.png")

  const [error, setError] = useState("")

  const canSubmit = useMemo(() => {
    const okName = name.trim().length > 0
    const okEmail = email.trim().length > 0
    const okPhone = phone.trim().length > 0
    return okName && okEmail && okPhone
  }, [name, email, phone])

  const onPickPhoto: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhotoUrl(url)
  }

  const submit = () => {
    setError("")
    if (!canSubmit) {
      setError("Please fill all fields correctly.")
      return
    }

    onAdd({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      photoUrl: photoUrl || "/paint_pro_logo.png",
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[92%] max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Add user</h3>
            <p className="mt-1 text-sm text-gray-600">Create a new employee profile.</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <img src={photoUrl} alt="Employee photo preview" className="h-14 w-14 rounded-lg border border-gray-200 object-cover" />

            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Picture</label>
              <input
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-900 hover:file:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">Local preview only (no upload yet).</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marco Dela Cruz"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., marco@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone number</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c065]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g., 09xx xxx xxxx"
            />
          </div>

          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            onClick={submit}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              canSubmit ? "bg-[#00c065] hover:bg-[#00a054]" : "cursor-not-allowed bg-gray-300",
            ].join(" ")}
          >
            Add user
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
