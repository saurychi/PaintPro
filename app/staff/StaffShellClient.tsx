"use client"

import React from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar"
import { SidebarBadgesProvider, useSidebarBadge } from "@/components/sidebar-badges"
import { supabase } from "@/lib/supabaseClient"
import { useMessagesUnread } from "@/lib/hooks/useMessagesUnread"
import { cn } from "@/lib/utils"

function MessagesBadgeFetcher() {
  const total = useMessagesUnread("/staff/messages")
  useSidebarBadge("messages", total, "danger")
  return null
}

// Mirrors the admin shell's InventoryBadgeFetcher: counts active material
// rows that are below their reorder point or have a project deficit, and
// surfaces that count on the staff sidebar's Inventory entry. Same data
// source so the two sidebars stay in sync.
function InventoryBadgeFetcher() {
  const [count, setCount] = React.useState<number>(0)

  const fetchCount = React.useCallback(async () => {
    const { data } = await supabase
      .from("materials")
      .select("current_in_stock, reorder_point, needed_stock, status")
    if (!data) return
    const c = data.reduce(
      (
        acc: number,
        item: {
          status?: string
          current_in_stock?: number | null
          reorder_point?: number | null
          needed_stock?: number | null
        },
      ) => {
        if (item.status === "Archived") return acc
        const stock = Number(item.current_in_stock ?? 0)
        const reorderPoint = Number(item.reorder_point ?? 0)
        const needed = Number(item.needed_stock ?? 0)
        return (reorderPoint > 0 && stock < reorderPoint) || needed > 0
          ? acc + 1
          : acc
      },
      0,
    )
    setCount(c)
  }, [])

  React.useEffect(() => {
    fetchCount()
  }, [fetchCount])

  React.useEffect(() => {
    const handler = () => fetchCount()
    window.addEventListener("materials:changed", handler)
    return () => window.removeEventListener("materials:changed", handler)
  }, [fetchCount])

  React.useEffect(() => {
    const channel = supabase
      .channel("staff-inventory-badge-watcher")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "materials" },
        fetchCount,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCount])

  // Belt-and-braces poll: staff sessions don't write to materials, so
  // they rely entirely on Realtime to pick up admin-side changes. If
  // Realtime isn't enabled on the materials table in Supabase, the
  // badge would never refresh after initial mount. A 60s refetch
  // ensures it eventually catches up regardless.
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      fetchCount()
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [fetchCount])

  // Also refresh on tab focus — common pattern: staff comes back to
  // the tab after admin has restocked, expects the badge to reflect
  // current state immediately.
  React.useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") fetchCount()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [fetchCount])

  useSidebarBadge("inventory", count, "danger")
  return null
}

function StaffShell({ children, user }: { children: React.ReactNode; user: SidebarUser }) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <InventoryBadgeFetcher />
      <MessagesBadgeFetcher />
      <AppSidebar role="staff" user={user} />

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          "transition-[padding-left] duration-300 ease-in-out",
          // Mobile burger lives at top-4 left-4 (40x40), so reserve
          // 56px at the top on phones. Pages that already key their
          // height off `var(--admin-header-offset,0px)` (e.g. the
          // schedule / inventory / settings shells) auto-adapt to
          // the reserved space, and `pt-14` covers the remaining
          // pages that flow naturally from the top.
          "[--admin-header-offset:56px] md:[--admin-header-offset:0px]",
          "pt-14 md:pt-0",
          open ? "md:pl-(--sidebar-width)" : "md:pl-(--sidebar-width-icon)"
        )}
        style={{ background: "var(--app-bg)" }}
      >
        {children}
      </main>
    </div>
  )
}

export default function StaffShellClient({ children, user }: { children: React.ReactNode; user: SidebarUser }) {
  return (
    <SidebarProvider>
      <SidebarBadgesProvider>
        <StaffShell user={user}>{children}</StaffShell>
      </SidebarBadgesProvider>
    </SidebarProvider>
  )
}
