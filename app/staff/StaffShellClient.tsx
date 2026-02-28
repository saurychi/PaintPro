"use client"

import React from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

function StaffShell({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <AppSidebar role="staff" />

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          "transition-[padding-left] duration-300 ease-in-out",
          open ? "pl-(--sidebar-width)" : "pl-(--sidebar-width-icon)"
        )}
      >
        {children}
      </main>
    </div>
  )
}

export default function StaffShellClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <StaffShell>{children}</StaffShell>
    </SidebarProvider>
  )
}
