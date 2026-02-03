export type EmployeeStatus = "Worked" | "On-leave"

export type Employee = {
  id: string
  name: string
  role?: string
  avatarUrl?: string
  status: EmployeeStatus
}

type Props = {
  title?: string
  employees: Employee[]
}

function StatusDot({ status }: { status: EmployeeStatus }) {
  const color = status === "Worked" ? "bg-emerald-500" : "bg-red-500"
  return <span className={`h-2 w-2 rounded-full ${color}`} />
}

export default function EmployeesCard({ title = "Employees", employees }: Props) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>

      <div className="mt-3 flex-1 rounded-xl border border-gray-200 p-3 shadow-sm max-h-[130px]">
        <div
          className={[
            "h-full overflow-y-auto pr-3",
            "[&::-webkit-scrollbar]:w-2",
            "[&::-webkit-scrollbar-track]:rounded-full",
            "[&::-webkit-scrollbar-track]:bg-emerald-100",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
            "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
          ].join(" ")}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#10B981 #D1FAE5",
          }}
        >
          <div className="space-y-2">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3">
                {/* status: tighter column so name gets priority */}
                <div className="flex w-18 items-center gap-2 text-xs text-gray-600">
                  <StatusDot status={emp.status} />
                  <span className="truncate">{emp.status}</span>
                </div>

                <div className="flex flex-1 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-1.5 shadow-sm">
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt={emp.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-500">
                        {emp.name
                          .split(" ")
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {emp.name}
                    </div>

                    {emp.role ? (
                      <div className="truncate text-[10px] leading-3 text-gray-500">
                        {emp.role}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
