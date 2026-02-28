import React from "react"

export type CostSlice = {
  label: string
  percent: number
}

type Props = {
  title?: string
  items: CostSlice[]
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "").trim()
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function JobCostSpreadCard({
  title = "Job Cost Spread",
  items,
}: Props) {
  const safeItems = items
    .map((i) => ({
      ...i,
      percent: Math.max(0, Number.isFinite(i.percent) ? i.percent : 0),
    }))
    .filter((i) => i.label.trim().length > 0)

  const total = safeItems.reduce((sum, i) => sum + i.percent, 0)
  const normalized =
    total <= 0
      ? safeItems.map((i) => ({ ...i, percent: 0 }))
      : safeItems.map((i) => ({ ...i, percent: (i.percent / total) * 100 }))

  const COLORS = ["#FF7A2F", "#4DA3FF", "#00C853", "#E53935", "#8E24AA", "#FFCA28"]

  // smaller donut
  const size = 84
  const cx = size / 2
  const cy = size / 2
  const r = 26
  const thickness = 11
  const circumference = 2 * Math.PI * r

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

      {/* smaller inner container height */}
      <div className="mt-3 h-[110px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex h-full items-center gap-4">
          <div className="shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#EEF2F7"
                strokeWidth={thickness}
              />

              {(() => {
                let acc = 0
                return normalized.map((it, idx) => {
                  const pct = it.percent
                  const dash = (pct / 100) * circumference
                  const gap = 3
                  const dashWithGap = Math.max(0, dash - gap)

                  const offset = -((acc / 100) * circumference)
                  acc += pct

                  return (
                    <circle
                      key={it.label}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={thickness}
                      strokeLinecap="butt"
                      strokeDasharray={`${dashWithGap} ${circumference}`}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${cx} ${cy})`}
                    />
                  )
                })
              })()}

              <circle cx={cx} cy={cy} r={r - thickness / 2} fill="white" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div
              className={[
                "h-full overflow-y-auto overflow-x-hidden pr-4",
                "[&::-webkit-scrollbar]:w-2",
                "[&::-webkit-scrollbar-track]:rounded-full",
                "[&::-webkit-scrollbar-track]:bg-emerald-100",
                "[&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
                "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
                "max-h-20"
              ].join(" ")}
              style={{ scrollbarWidth: "thin", scrollbarColor: "#10B981 #D1FAE5" }}
            >
              <div className="space-y-2">
                {normalized.map((it, idx) => {
                  const color = COLORS[idx % COLORS.length]
                  const pct = Math.round(it.percent)

                  return (
                    <div
                      key={it.label}
                      title={it.label}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      style={{
                        backgroundColor: hexToRgba(color, 0.12),
                      }}
                    >
                      <div className="min-w-0 truncate font-semibold text-gray-900">
                        {pct}% - {it.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
