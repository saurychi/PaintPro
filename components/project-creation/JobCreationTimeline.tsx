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
const ACCENT_SOFT = "#e6f9ef"

export default function JobCreationTimeline({
  currentStep,
}: JobCreationTimelineProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === currentStep)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ACCENT }}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-gray-900">Job Creation Progress</p>
        </div>
        <p className="mt-1 text-xs text-gray-600">
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
                    className="flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold sm:h-7 sm:w-7 sm:text-[11px]"
                    style={{
                      borderColor: isCurrent || isDone ? ACCENT : "#d1d5db",
                      backgroundColor: isCurrent || isDone ? ACCENT_SOFT : "#ffffff",
                      color: isCurrent || isDone ? ACCENT : "#6b7280",
                    }}
                  >
                    {index + 1}
                  </div>

                  {index < STEPS.length - 1 ? (
                    <div
                      className="my-1 w-px flex-1 min-h-[22px]"
                      style={{
                        backgroundColor: index < currentIndex ? ACCENT : "#e5e7eb",
                      }}
                    />
                  ) : null}
                </div>

                <div className="pb-4">
                  <div
                    className="text-[13px] font-medium sm:text-sm"
                    style={{
                      color: isCurrent ? "#111827" : isDone ? "#374151" : "#6b7280",
                    }}
                  >
                    {step.label}
                  </div>

                  <div className="mt-1">
                    {isCurrent ? (
                      <span
                        className="inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-semibold sm:text-[10px]"
                        style={{
                          borderColor: "#b7efcf",
                          backgroundColor: ACCENT_SOFT,
                          color: ACCENT,
                        }}
                      >
                        Current
                      </span>
                    ) : isDone ? (
                      <span className="text-[10px] font-medium text-gray-500">Completed</span>
                    ) : (
                      <span className="text-[10px] font-medium text-gray-400">Upcoming</span>
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

        .green-scrollbar::-webkit-scrollbar {
        width: 10px;
        }

        .green-scrollbar::-webkit-scrollbar-track {
        background: #e6f9ef;
        border-radius: 9999px;
        }

        .green-scrollbar::-webkit-scrollbar-thumb {
        background: #00c065;
        border-radius: 9999px;
        border: 2px solid #e6f9ef;
        }

        .green-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #00a054;
        }

        .green-scrollbar::-webkit-scrollbar-button:single-button {
        display: none;
        width: 0;
        height: 0;
        }

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
