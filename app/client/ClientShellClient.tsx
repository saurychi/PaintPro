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

// Background watcher for the project's terminal transition.
//
// Behaviour:
//   1. The first time we see the project in a terminal state ("completed"
//      or "cancelled" + cancellation_phase "done"), pop a one-time modal
//      so the client knows they have a 24-hour grace window to download
//      anything they still need. "One-time" = keyed by projectId in
//      localStorage, so reloading doesn't reshow the modal.
//   2. We keep polling. The grace deadline is `project.updated_at + 24h`
//      (server-side gate uses the same reference). Once that passes,
//      we sign the client out: DELETE the project cookie, then redirect
//      to /auth/signin.
//
// Same poll cadence as the pending-docs badge (15s, plus visibility-
// triggered refresh).
const TERMINAL_MODAL_STORAGE_KEY = "paintpro_project_terminal_modal_seen"
const GRACE_MS = 24 * 60 * 60 * 1000

function getModalSeenKey(projectId: string) {
  return `${TERMINAL_MODAL_STORAGE_KEY}:${projectId}`
}

function ClientProjectTerminalWatcher({
  onTerminalDetected,
}: {
  onTerminalDetected: () => void
}) {
  const { projectId } = useClientProject()
  const router = useRouter()

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    let signedOut = false

    async function checkTerminalState() {
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
        if (cancelled) return

        // Compute the grace deadline. `updated_at` bumps on the status
        // flip, so it's a reliable reference. If we can't parse it,
        // fall back to "now" (safer to extend the grace than cut it).
        const updatedAtMs = data?.project?.updated_at
          ? new Date(data.project.updated_at).getTime()
          : Date.now()
        const deadlineMs =
          (Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now()) + GRACE_MS

        // Inform the shell so it can pop the one-time modal. The shell
        // gates on localStorage so this fires only once per project.
        onTerminalDetected()

        if (Date.now() < deadlineMs) {
          // Still within the 24-hour window — let the client keep
          // working. Next poll will re-check.
          return
        }

        if (cancelled || signedOut) return
        signedOut = true

        try {
          await fetch("/api/auth/client-access", { method: "DELETE" })
        } catch {
          // Best-effort. The layout's terminal-status gate (also
          // honouring the 24h window) will catch any stale cookie.
        }

        toast.info("Access window closed", {
          description:
            "Your 24-hour access window has ended. You've been signed out.",
        })
        router.replace("/auth/signin")
      } catch {
        // Network blip — try again on the next tick.
      }
    }

    void checkTerminalState()
    const interval = window.setInterval(() => {
      void checkTerminalState()
    }, 15_000)

    function handleVisibility() {
      if (document.visibilityState === "visible") void checkTerminalState()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [projectId, router, onTerminalDetected])

  return null
}

// One-time deactivation notice. Rendered by the shell when the watcher
// reports terminal state and the local "seen" flag hasn't been set yet.
function ProjectConcludedModal({
  open,
  onClose,
  onGoToDocuments,
}: {
  open: boolean
  onClose: () => void
  onGoToDocuments: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-[#00c065]" aria-hidden />
        <div className="px-5 py-5">
          <h2 className="text-base font-semibold text-gray-900">
            Your project has been concluded
          </h2>
          <p className="mt-2 text-sm leading-5 text-gray-600">
            This account will be deactivated in 24 hours. Make sure to
            download any documents you need before access is revoked.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onGoToDocuments}
            className="inline-flex h-9 items-center rounded-md bg-[#00c065] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054]"
          >
            Go to documents
          </button>
        </div>
      </div>
    </div>
  )
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
  const router = useRouter()
  const { projectId } = useClientProject()
  const [showConcludedModal, setShowConcludedModal] = useState(false)

  // Wired into the watcher: pop the modal the first time the project
  // is seen terminal, then never again on this device. The watcher
  // keeps polling and will handle the eventual signout when the
  // 24-hour grace ends.
  const handleTerminalDetected = React.useCallback(() => {
    if (!projectId) return
    try {
      const key = getModalSeenKey(projectId)
      if (window.localStorage.getItem(key) === "1") return
      window.localStorage.setItem(key, "1")
    } catch {
      // Storage disabled — fall back to "always show" (still gated by
      // the React state, so it can't reopen mid-session).
    }
    setShowConcludedModal((prev) => prev || true)
  }, [projectId])

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <AppSidebar role={role} user={user} maskIdentity />
      <ClientPendingDocumentBadge />
      <ClientMessagesBadge />
      <ClientProjectTerminalWatcher
        onTerminalDetected={handleTerminalDetected}
      />
      <ProjectConcludedModal
        open={showConcludedModal}
        onClose={() => setShowConcludedModal(false)}
        onGoToDocuments={() => {
          setShowConcludedModal(false)
          router.push("/client/documents")
        }}
      />

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
