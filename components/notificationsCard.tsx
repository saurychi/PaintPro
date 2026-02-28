import { MessageSquare, ChevronRight } from "lucide-react"

export type NotificationItem = {
  id: string
  title: string
  subtitle?: string
  isUnread?: boolean
}

type Props = {
  title?: string
  notifications: NotificationItem[]
  onOpenAll?: () => void
}

export default function NotificationsCard({
  title = "Notifications",
  notifications,
  onOpenAll,
}: Props) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

        <button
          type="button"
          onClick={onOpenAll}
          aria-label="Open notifications"
          className="inline-flex items-center rounded-lg px-2 py-1 text-gray-600 hover:text-emerald-500"
        >
          <MessageSquare className="h-4 w-4" />
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex-1 min-h-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
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
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <span
                  className={[
                    "mt-1 block h-2 w-2 rounded-full",
                    n.isUnread ? "bg-red-500" : "bg-gray-300",
                  ].join(" ")}
                />

                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {n.title}
                  </div>
                  {n.subtitle ? (
                    <div className="truncate text-xs text-gray-500">{n.subtitle}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
