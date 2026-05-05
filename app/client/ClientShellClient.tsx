"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
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

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          "transition-[padding-left] duration-300 ease-in-out",
          open ? "pl-(--sidebar-width)" : "pl-(--sidebar-width-icon)",
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
