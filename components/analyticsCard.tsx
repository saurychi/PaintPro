import React from "react"

type Props = {
  title?: string
  percentComplete: number
  currentTaskLabel?: string
}

export default function AnalyticsCard({
  title = "Analytics",
  percentComplete,
  currentTaskLabel,
}: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(percentComplete)))

  // SVG ring math (accurate)
  const r = 42
  const c = 2 * Math.PI * r
  const dashOffset = (1 - pct / 100) * c

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

      {/* INNER CONTAINER (content body) */}
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-5">
          {/* LEFT: Accurate ring */}
          <div className="relative h-24 w-24 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#E5F7EE"
                strokeWidth="10"
              />

              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#7ED957"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={dashOffset}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xl font-semibold text-gray-900">{pct}%</div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          </div>

          {/* RIGHT: Current Task */}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700">Current Task</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <span className="truncate">{currentTaskLabel ?? "No active task"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
