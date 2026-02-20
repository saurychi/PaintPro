"use client";

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Item = {
  title: string;
  url: string;
  icon: React.ElementType;
  key: string;
};

type Role = "admin" | "staff" | "client"

const adminItems: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/admin", icon: Home },
  { key: "staff", title: "Staff", url: "/admin/staff", icon: Users },
  { key: "schedule", title: "Schedule", url: "/admin/schedule", icon: CalendarDays },
  { key: "report", title: "Report", url: "/admin/report", icon: BarChart3 },
  { key: "inventory", title: "Inventory", url: "/admin/inventory", icon: Boxes },
  { key: "documents", title: "Documents", url: "/admin/documents", icon: FileText },
  { key: "messages", title: "Messages", url: "/admin/messages", icon: MessageSquare },
  { key: "settings", title: "Settings", url: "/admin/settings", icon: Settings },
]

const staffItems: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/staff", icon: Home },
  { key: "report", title: "Report", url: "/staff/report", icon: BarChart3 },
  { key: "profile", title: "Profile", url: "/staff/profile", icon: Users },
]

const clientItems: Item[] = [
  { key: "report", title: "Report", url: "/client", icon: BarChart3 },
  { key: "messages", title: "Messages", url: "/client/messages", icon: MessageSquare },
  { key: "documents", title: "Documents", url: "/client/documents", icon: FileText },
  { key: "schedule", title: "Schedule", url: "/client/schedule", icon: CalendarDays },
  { key: "settings", title: "Settings", url: "/client/settings", icon: Settings },
]

const ITEMS_BY_ROLE: Record<Role, Item[]> = {
  admin: adminItems,
  staff: staffItems,
  client: clientItems,
}

function isRouteActive(pathname: string, itemUrl: string) {
  const isRootRoute = itemUrl.split("/").length === 2
  if (isRootRoute) return pathname === itemUrl
  return pathname === itemUrl || pathname.startsWith(itemUrl + "/")
}

type AppSidebarProps = {
  role: Role
}

export function AppSidebar({ role }: AppSidebarProps) {
  const { open, setOpen } = useSidebar()
  const pathname = usePathname()

  const menuItems = ITEMS_BY_ROLE[role]

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
       "fixed inset-y-0 left-0 z-40",
        "border-r border-gray-200/60",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "absolute z-50",
          "top-4 -right-4",
          "h-8 w-9",
          "border border-gray-200/60 bg-white",
          "grid place-items-center text-gray-400 shadow-sm hover:bg-gray-50",
          "flex justify-between content-center"
        )}
      >
        <ChevronLeft className="h-5" />
        <ChevronRight className="h-5" />
      </button>

      <SidebarHeader className="px-4 py-4">
        <div className={cn("flex items-center", open ? "gap-3" : "justify-center")}>
          <Image
            src="/paint_pro_logo.png"
            alt="Paul Jackman logo"
            width={36}
            height={36}
            className="object-contain"
            priority
          />

          {open && (
            <div className="leading-tight">
              <div className="text-xs font-semibold text-gray-700">PAUL</div>
              <div className="text-xs font-semibold text-gray-700">JACKMAN</div>
            </div>
          )}
        </div>

        <div className="mt-4 h-px w-full bg-gray-200/60" />
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarMenu className={cn(
          "space-y-1 flex",
          open ? "" : "items-center"
        )}>
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = isRouteActive(pathname, item.url)

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild tooltip={item.title} className={
                  cn(
                    isActive ? "text-white hover:text-[#00BF63]" : "text-gray-500",
                    // "bg-red-500"
                  )
                }>
                  <Link
                    href={item.url}
                    className={cn(
                      "w-full overflow-visible",
                      open
                        ? "flex h-10 items-center gap-3 px-3 rounded-md text-sm font-medium"
                        : cn(
                            "flex h-14 items-center justify-center rounded-md",
                            "[&>svg]:!h-5 [&>svg]:!w-5"
                          ),
                      isActive && "bg-[#00BF63]",

                    )}
                  >
                    <Icon
                      className={cn(
                        open ? "h-5 w-5" : "!h-5 !w-5"
                      )}
                    />
                    {open && <span className="truncate">{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
