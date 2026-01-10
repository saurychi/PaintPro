"use client"

import Image from "next/image"
import Link from "next/link"
import {
  Home,
  Users,
  CalendarDays,
  BarChart3,
  Boxes,
  FileText,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type Item = {
  title: string
  url: string
  icon: React.ElementType
  key: string
}

const items: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/admin", icon: Home },
  { key: "staff", title: "Staff", url: "/admin/staff", icon: Users },
  { key: "schedule", title: "Schedule", url: "/admin/schedule", icon: CalendarDays },
  { key: "report", title: "Report", url: "/admin/report", icon: BarChart3 },
  { key: "inventory", title: "Inventory", url: "/admin/inventory", icon: Boxes },
  { key: "documents", title: "Documents", url: "/admin/documents", icon: FileText },
  { key: "messages", title: "Messages", url: "/admin/messages", icon: MessageSquare },
  { key: "settings", title: "Settings", url: "/admin/settings", icon: Settings },
]

export function AppSidebar({ activeKey = "dashboard" }: { activeKey?: string }) {
  const { open, setOpen } = useSidebar()

  return (
    <Sidebar
      collapsible="icon"
      className="relative border-r bg-white"
    >
      {/* HEADER */}
      <SidebarHeader className="gap-0 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 overflow-hidden rounded-md bg-white">
            <Image
              src="/paint_pro_logo.png"
              alt="Paul Jackman logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </div>

          <div className={cn("min-w-0", !open && "hidden")}>
            <div className="text-xs font-semibold leading-4 text-gray-700">PAUL</div>
            <div className="text-xs font-semibold leading-4 text-gray-700">JACKMAN</div>
          </div>
        </div>

        <div className="relative mt-3">
          <div className="h-px w-full bg-gray-200" />
        </div>
      </SidebarHeader>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "absolute z-50 grid h-7 w-7 place-items-center",
          "top-[72px] -right-3",
          "rounded-full border bg-white text-gray-600 shadow-sm hover:bg-gray-50"
        )}
      >
        {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {/* CONTENT */}
      <SidebarContent className="px-2 py-3">
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon
            const isActive = item.key === activeKey

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <Link
                    href={item.url}
                    className={cn(
                      "h-11 rounded-md px-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                      isActive && "bg-emerald-500 text-white hover:bg-emerald-500 hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive && "text-white")} />
                    <span className={cn("ml-3 text-sm font-medium", !open && "hidden")}>
                      {item.title}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-2 py-3" />
    </Sidebar>
  )
}
