"use client"

import React from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar"
import { SidebarBadgesProvider, useSidebarBadge } from "@/components/sidebar-badges"
import { supabase } from "@/lib/supabaseClient"
import { useMessagesUnread } from "@/lib/hooks/useMessagesUnread"
import { cn } from "@/lib/utils"

function MessagesBadgeFetcher() {
  const total = useMessagesUnread("/admin/messages")
  useSidebarBadge("messages", total, "danger")
  return null
}

function InventoryBadgeFetcher() {
  const [count, setCount] = React.useState<number>(0)

  const fetchCount = React.useCallback(async () => {
    const { data } = await supabase
      .from("materials")
      .select("current_in_stock, reorder_point, needed_stock, status")
    if (!data) return
    const c = data.reduce((acc: number, item: { status?: string; current_in_stock?: number | null; reorder_point?: number | null; needed_stock?: number | null }) => {
      if (item.status === "Archived") return acc
      const stock = Number(item.current_in_stock ?? 0)
      const reorderPoint = Number(item.reorder_point ?? 0)
      const needed = Number(item.needed_stock ?? 0)
      return (reorderPoint > 0 && stock < reorderPoint) || needed > 0 ? acc + 1 : acc
    }, 0)
    setCount(c)
  }, [])

  React.useEffect(() => { fetchCount() }, [fetchCount])

  // Respond to in-app writes immediately (same-tab changes)
  React.useEffect(() => {
    const handler = () => fetchCount()
    window.addEventListener("materials:changed", handler)
    return () => window.removeEventListener("materials:changed", handler)
  }, [fetchCount])

  // Fallback: catch changes from other tabs/devices via Supabase Realtime
  // (requires Realtime enabled on the materials table in the Supabase dashboard)
  React.useEffect(() => {
    const channel = supabase
      .channel("inventory-badge-watcher")
      .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, fetchCount)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchCount])

  useSidebarBadge("inventory", count, "danger")
  return null
}

function AdminShell({
  children,
  role,
  user,
}: {
  children: React.ReactNode
  role: "admin" | "manager"
  user: SidebarUser
}) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <InventoryBadgeFetcher />
      <MessagesBadgeFetcher />
      <AppSidebar role={role} user={user} />

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          "transition-[padding-left] duration-300 ease-in-out",
          "pl-0",
          open
            ? "md:pl-(--sidebar-width)"
            : "md:pl-(--sidebar-width-icon)",
        )}
        style={{ background: "var(--app-bg)" }}
      >
        {children}
      </main>
    </div>
  )
}

export default function AdminShellClient({
  children,
  role,
  user,
}: {
  children: React.ReactNode
  role: "admin" | "manager"
  user: SidebarUser
}) {
  return (
    <SidebarProvider>
      <SidebarBadgesProvider>
        <AdminShell role={role} user={user}>{children}</AdminShell>
      </SidebarBadgesProvider>
    </SidebarProvider>
  )
}
