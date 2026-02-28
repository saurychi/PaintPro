"use client"

import React, { useMemo, useState } from "react"
import { ChevronRight, Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"

const GREEN = "#7ED957"
const GREEN_SOFT = "#DFF6D5"
const BORDER = "border-gray-200"

type Task = {
  id: string
  name: string
}

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function MainTaskAssignment() {
  const router = useRouter()

  const jobNo = "#0000002A-2024"
  const siteName = "Emu House"

  const ALL_TASKS: Task[] = useMemo(
    () => [
      { id: "t1", name: "Interior & Exterior Painting" },
      { id: "t2", name: "Roof Tile & Colourbond Painting" },
      { id: "t3", name: "Plaster & Patching" },
      { id: "t4", name: "Prepping & Pointing Roof Tiles" },
      { id: "t5", name: "Wallpapering" },
      { id: "t6", name: "Spray or Brush Roll Finish" },
      { id: "t7", name: "Decking Staining & Coating" },
      { id: "t8", name: "High-Pressure Cleaning" },
      { id: "t9", name: "Epoxy Floor Coatings" },
      { id: "t10", name: "Commercial Painting" },
      { id: "t11", name: "Wallpaper Removal" },
      { id: "t12", name: "Spray Finish Touch Ups" },
      { id: "t13", name: "Exterior Prep and Wash" },
    ],
    []
  )

  const [selected, setSelected] = useState<Task[]>([
    { id: "t5", name: "Wallpapering" },
    { id: "t6", name: "Spray or Brush Roll Finish" },
    { id: "t7", name: "Decking Staining & Coating" },
    { id: "t7_dup", name: "Decking Staining & Coating" },
  ])

  function isSelected(task: Task) {
    return selected.some((s) => s.id === task.id)
  }

  function addTask(task: Task) {
    if (isSelected(task)) return
    setSelected((prev) => [...prev, task])
  }

  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((t) => t.id !== id))
  }

  function removeFromList(task: Task) {
    setSelected((prev) => prev.filter((t) => t.id !== task.id))
  }

  function createNewMainTask() {
    const name = prompt("New Main Task name:")
    if (!name) return
    setSelected((prev) => [...prev, { id: makeId("custom"), name }])
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Job</span>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" aria-hidden />
          <span>Main Tasks</span>
        </div>

        {/* Content */}
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* LEFT card */}
          <section className={`min-h-0 rounded-xl border ${BORDER} bg-white shadow-sm overflow-hidden flex flex-col`}>
            <div className="px-6 pt-4 pb-3">
              <div className="text-[14px] font-semibold text-gray-900">Main Tasks</div>
            </div>

            <div className="flex-1 min-h-0 px-6 pb-4 overflow-hidden flex flex-col">
              {/* Added Main Tasks */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="px-4 pt-3 text-[12px] font-semibold text-gray-700">Added Main Tasks</div>
                <div className="px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {selected.length ? (
                      selected.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-2 rounded-full border border-green-200 px-3 py-1 text-[12px] font-semibold"
                          style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                        >
                          <button
                            type="button"
                            onClick={() => removeSelected(t.id)}
                            className="grid h-4 w-4 place-items-center rounded-full bg-white/80 hover:bg-white"
                            aria-label="Remove selected task"
                            title="Remove"
                          >
                            <X className="h-3 w-3 text-[#4FAE2A]" />
                          </button>
                          {t.name}
                        </span>
                      ))
                    ) : (
                      <div className="text-[12px] text-gray-500">No tasks added yet.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* List header */}
              <div className="mt-5 grid grid-cols-[120px_1fr] gap-4 px-1">
                <div className="text-[12px] font-semibold text-gray-700">Actions</div>
                <div className="text-[12px] font-semibold text-gray-700">Main Tasks</div>
              </div>

              {/* List container with REAL scrollbar (same pattern as your other pages) */}
              <div className="mt-3 flex-1 min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="h-full overflow-y-auto pr-3 px-3 py-3 green-scrollbar">
                  <div className="space-y-3">
                    {ALL_TASKS.map((task) => {
                      const selectedFlag = isSelected(task)

                      return (
                        <div key={task.id} className="grid grid-cols-[120px_1fr] gap-4 items-center">
                          {/* Action */}
                          <button
                            type="button"
                            onClick={() => addTask(task)}
                            disabled={selectedFlag}
                            className={[
                              "h-12 rounded-lg border border-green-100 font-semibold text-[13px]",
                              "inline-flex items-center justify-center gap-2 shadow-sm",
                              selectedFlag ? "opacity-50 cursor-not-allowed" : "hover:brightness-95",
                            ].join(" ")}
                            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
                          >
                            <Plus className="h-5 w-5" />
                            Add
                          </button>

                          {/* Task field look */}
                          <div className="relative h-12">
                            <div className="flex h-full items-center rounded-md border border-gray-300 bg-white px-4 text-[13px] text-gray-800">
                              {task.name}
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFromList(task)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md border border-red-200 bg-red-50 hover:bg-red-100"
                              aria-label="Remove"
                              title="Remove"
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="h-3" />
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT sidebar */}
          <aside className="h-full min-h-0 flex flex-col gap-4">
            <section className={`rounded-xl border ${BORDER} bg-white shadow-sm p-5`}>
              <div className="text-[18px] font-semibold text-gray-900">{jobNo}</div>
              <div className="mt-1 text-[12px] text-gray-500">{siteName}</div>
            </section>

            <section className={`rounded-xl border ${BORDER} bg-white shadow-sm p-5`}>
              <button
                type="button"
                onClick={createNewMainTask}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-3 text-[13px] font-semibold shadow-sm"
                style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
              >
                <Plus className="h-5 w-5" />
                Create New Main Task
              </button>
            </section>

            <div className="hidden lg:block flex-1" />
          </aside>
        </div>

        {/* Footer buttons */}
        <div className="shrink-0 flex items-center justify-center gap-5">
          <button
            type="button"
            className="h-10 w-[260px] rounded-md text-[13px] font-semibold"
            style={{ backgroundColor: GREEN_SOFT, color: "#4FAE2A" }}
            onClick={() => router.push("/admin/job-creation/sub-task-assignment")}
          >
            Next
          </button>

          <button
            type="button"
            className="h-10 w-[260px] rounded-md bg-[#E9E9E9] text-[13px] font-semibold text-gray-700"
            onClick={() => router.back()}
          >
            Go Back
          </button>
        </div>
      </div>

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${GREEN};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .green-scrollbar {
          scrollbar-color: ${GREEN} #eaf7e4;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  )
}
