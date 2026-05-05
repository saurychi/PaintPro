"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar"
import {
  SidebarBadgesProvider,
  useSidebarBadge,
} from "@/components/sidebar-badges"
import { cn } from "@/lib/utils"

type Role = "client" | "staff" | "manager" | "admin"

type ClientProjectContextValue = {
  projectId: string | null
}

const ClientProjectContext = createContext<ClientProjectContextValue>({ projectId: null })

export function useClientProject() {
  return useContext(ClientProjectContext)
}

// Lightweight badge driver — reads the active project (set in
// ClientProjectContext via the project cookie) and pings a small status
// endpoint. If the project's current status is one that needs the client to
// act on a document (quotation pending, invoice agreement pending), the
// "Pending" sub-item under Documents shows a red badge so the client can't
// miss it.
const PENDING_DOCUMENT_STATUSES = new Set([
  "quotation_pending",
  "invoice_agreement_pending",
])

function ClientPendingDocumentBadge() {
  const { projectId } = useClientProject()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState<number>(0)

  useEffect(() => {
    if (!projectId) {
      setPendingCount(0)
      return
    }

    let cancelled = false

    async function refresh() {
      try {
        const response = await fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(
            projectId!,
          )}`,
          { cache: "no-store" },
        )
        if (!response.ok) return
        const data = await response.json()
        const status = String(data?.project?.status ?? "")
          .trim()
          .toLowerCase()
        if (cancelled) return
        setPendingCount(PENDING_DOCUMENT_STATUSES.has(status) ? 1 : 0)
      } catch {
        // Silent — badge just stays at last known value.
      }
    }

    void refresh()

    // Re-check periodically so the badge clears once the client signs and
    // the project advances to the next status. Also re-runs on every route
    // change inside the client portal (pathname dep) so the badge is current
    // immediately after signing instead of waiting for the next interval tick.
    const interval = window.setInterval(refresh, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [projectId, pathname])

  useSidebarBadge("pending-documents", pendingCount, "danger")

  return null
}

function ClientShell({
  children,
  role,
  user,
}: {
  children: React.ReactNode
  role: Role
  user: SidebarUser
}) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <AppSidebar role={role} user={user} />
      <ClientPendingDocumentBadge />

      {/* Mobile-only top bar with the hamburger trigger. The sidebar primitive
          renders the desktop sidebar `hidden md:block`, so on phones there's
          no visible way to open it without this. */}
      <div
        className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2"
        style={{
          background: "var(--cp-bg)",
          borderColor: "var(--cp-border, rgb(226 232 240))",
        }}
      >
        <SidebarTrigger
          aria-label="Open menu"
          className="h-9 w-9"
        >
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
      </div>

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          // No left indent on mobile — the sidebar is an off-screen drawer
          // there, so any padding is dead space. Indent only kicks in at md+.
          "md:transition-[padding-left] md:duration-300 md:ease-in-out",
          open ? "md:pl-(--sidebar-width)" : "md:pl-(--sidebar-width-icon)",
        )}
        style={{ background: "var(--cp-bg)" }}
      >
        {children}
      </main>
    </div>
  )
}

export default function ClientShellClient({
  children,
  role,
  projectId,
  user,
}: {
  children: React.ReactNode
  role: Role
  projectId: string | null
  user: SidebarUser
}) {
  return (
    <ClientProjectContext.Provider value={{ projectId }}>
      <SidebarProvider>
        <SidebarBadgesProvider>
          <ClientShell role={role} user={user}>{children}</ClientShell>
        </SidebarBadgesProvider>
      </SidebarProvider>
    </ClientProjectContext.Provider>
  )
}
