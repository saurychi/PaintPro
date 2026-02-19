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

  const r = 36
  const c = 2 * Math.PI * r
  const dashOffset = (1 - pct / 100) * c

  return (
    <section className="h-fit flex-none rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-4">
          {/* ring */}
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#E5F7EE"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#7ED957"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={dashOffset}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-md font-semibold text-gray-900">{pct}%</div>
              <div className="text-[8px] text-gray-500 leading-none">
                Complete
              </div>
            </div>
          </div>

          {/* current task */}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700">
              Current Task
            </div>
            <div className="mt-1 text-sm text-gray-700 truncate">
              {currentTaskLabel ?? "No active task"}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
