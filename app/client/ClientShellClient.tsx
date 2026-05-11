"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
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
import { useMessagesUnread } from "@/lib/hooks/useMessagesUnread"
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
  "grant_access_quotation",
  "invoice_agreement_pending",
])

function ClientMessagesBadge() {
  // Lazily import the unread-count hook here so this file's prop signature
  // stays untouched. The hook is a no-op for project-cookie clients (the
  // unread-count API short-circuits to 0 when there's no auth user).
  const total = useMessagesUnread("/client/messages")
  useSidebarBadge("messages", total, "danger")
  return null
}

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

    // Tighter poll than the original 60s so a status flip from the admin
    // (e.g. they just clicked "Notify") shows up within ~15s without the
    // user touching anything. The body of the request is tiny, so the
    // bandwidth cost is negligible.
    const interval = window.setInterval(refresh, 15_000)

    // When the user comes back to the tab after working elsewhere, refresh
    // immediately instead of waiting for the next interval tick. Common
    // case: client had this tab open, switched to email, admin notified
    // them, they switch back → badge appears instantly.
    function handleVisibility() {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    // Cross-component refresh signal — the dashboard's "Refresh" button on
    // the Pending Documents card dispatches this event so the sidebar
    // badge re-fetches in the same gesture.
    function handleManualRefresh() {
      void refresh()
    }
    window.addEventListener(
      "paintpro:refresh-pending-docs",
      handleManualRefresh,
    )

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener(
        "paintpro:refresh-pending-docs",
        handleManualRefresh,
      )
    }
  }, [projectId, pathname])

  useSidebarBadge("pending-documents", pendingCount, "danger")

  return null
}

// Background watcher that auto-signs out the client the moment the project
// transitions to a terminal state — "completed" (normal end-of-work) or
// "cancelled" with cancellation_phase "done" (cancel wrap-up finished).
// Without this, a client sitting on any page wouldn't know the project
// closed until they reloaded, at which point the layout server check
// bounces them anyway. Polls the existing overview endpoint every 15s,
// piggybacking on the same cadence the pending-docs badge uses.
function ClientProjectTerminalWatcher() {
  const { projectId } = useClientProject()
  const router = useRouter()

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    let signedOut = false

    async function signOutIfTerminal() {
      if (cancelled || signedOut) return
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
        const phase = String(data?.project?.cancellation_phase ?? "")
          .trim()
          .toLowerCase()
        const isTerminal =
          status === "completed" ||
          (status === "cancelled" && phase === "done")
        if (!isTerminal) return
        if (cancelled || signedOut) return
        signedOut = true

        // Drop the project-cookie server-side so a hard refresh doesn't
        // bounce them right back through the same layout check.
        try {
          await fetch("/api/auth/client-access", { method: "DELETE" })
        } catch {
          // Best-effort. Even if the cookie clear fails, the layout's
          // own terminal-status gate will redirect on next load.
        }

        toast.info("Project has been closed out", {
          description: "You've been signed out. Thanks for working with us.",
        })
        router.replace("/auth/signin")
      } catch {
        // Network blip — try again on the next tick.
      }
    }

    void signOutIfTerminal()
    const interval = window.setInterval(() => {
      void signOutIfTerminal()
    }, 15_000)

    function handleVisibility() {
      if (document.visibilityState === "visible") void signOutIfTerminal()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [projectId, router])

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
      <ClientMessagesBadge />
      <ClientProjectTerminalWatcher />

      {/* Mobile-only top bar with the hamburger trigger. The sidebar primitive
          renders the desktop sidebar `hidden md:block`, so on phones there's
          no visible way to open it without this. */}
      <div
        className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2"
        style={{
          background: "var(--app-bg)",
          borderColor: "rgb(226 232 240)",
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
        style={{ background: "var(--app-bg)" }}
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
