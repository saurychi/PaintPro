type JobCreationStepKey =
  | "main_task"
  | "sub_task"
  | "materials"
  | "equipment"
  | "schedule"
  | "employee_assignment"
  | "cost_estimation"
  | "overview"

type JobCreationTimelineProps = {
  currentStep: JobCreationStepKey
}

const STEPS: { key: JobCreationStepKey; label: string }[] = [
  { key: "main_task", label: "Main Task" },
  { key: "sub_task", label: "Sub Task" },
  { key: "materials", label: "Materials" },
  { key: "equipment", label: "Equipment" },
  { key: "schedule", label: "Task Date & Time" },
  { key: "employee_assignment", label: "Employee Assignment" },
  { key: "cost_estimation", label: "Cost Estimation" },
  { key: "overview", label: "Overview" },
];

const ACCENT = "#00c065"
export default function JobCreationTimeline({
  currentStep,
}: JobCreationTimelineProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === currentStep)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ACCENT }}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Job Creation Progress</p>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Follow the project setup flow step by step.
        </p>
      </div>

      <div className="green-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        <div className="space-y-0">
          {STEPS.map((step, index) => {
            const isDone = index < currentIndex
            const isCurrent = index === currentIndex
            const isUpcoming = index > currentIndex

            return (
              <div key={step.key} className="grid grid-cols-[24px_1fr] gap-3 sm:grid-cols-[28px_1fr]">
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      "flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold sm:h-7 sm:w-7 sm:text-[11px]",
                      isCurrent || isDone
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400",
                    ].join(" ")}
                  >
                    {index + 1}
                  </div>

                  {index < STEPS.length - 1 ? (
                    <div
                      className={[
                        "my-1 w-px flex-1 min-h-[22px]",
                        index < currentIndex
                          ? "bg-[#00c065]"
                          : "bg-slate-200 dark:bg-slate-700",
                      ].join(" ")}
                    />
                  ) : null}
                </div>

                <div className="pb-4">
                  <div
                    className={[
                      "text-[13px] font-medium sm:text-sm",
                      isCurrent
                        ? "text-slate-900 dark:text-slate-100"
                        : isDone
                          ? "text-slate-700 dark:text-slate-300"
                          : "text-slate-500 dark:text-slate-500",
                    ].join(" ")}
                  >
                    {step.label}
                  </div>

                  <div className="mt-1">
                    {isCurrent ? (
                      <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 sm:text-[10px]">
                        Current
                      </span>
                    ) : isDone ? (
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Completed</span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Upcoming</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    <style jsx>{`
        .green-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #00c065 #e6f9ef;
        }

        :global(.dark) .green-scrollbar {
          scrollbar-color: #00c065 #0f172a;
        }

        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }

        .green-scrollbar::-webkit-scrollbar-track {
          background: #e6f9ef;
          border-radius: 9999px;
        }

        :global(.dark) .green-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }

        .green-scrollbar::-webkit-scrollbar-thumb {
          background: #00c065;
          border-radius: 9999px;
          border: 2px solid #e6f9ef;
        }

        :global(.dark) .green-scrollbar::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }

        .green-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #00a054;
        }

        .green-scrollbar::-webkit-scrollbar-button:single-button,
        .green-scrollbar::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }
      `}
    </style>

    </div>
  )
}
