"use client"

import React, { createContext, useContext } from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

type Role = "client" | "staff" | "manager" | "admin"

type ClientProjectContextValue = {
  projectId: string | null
}

const ClientProjectContext = createContext<ClientProjectContextValue>({ projectId: null })

export function useClientProject() {
  return useContext(ClientProjectContext)
}

function ClientShell({ children, role }: { children: React.ReactNode; role: Role }) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <AppSidebar role={role} />

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
}: {
  children: React.ReactNode
  role: Role
  projectId: string | null
}) {
  return (
    <ClientProjectContext.Provider value={{ projectId }}>
      <SidebarProvider>
        <ClientShell role={role}>{children}</ClientShell>
      </SidebarProvider>
    </ClientProjectContext.Provider>
  )
}
