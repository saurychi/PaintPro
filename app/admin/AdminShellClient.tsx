"use client"

import React from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

function AdminShell({
  children,
  role,
}: {
  children: React.ReactNode
  role: "admin" | "manager"
}) {
  const { open } = useSidebar()

  return (
    <div className="[--sidebar-width:240px] [--sidebar-width-icon:80px] min-h-screen w-full">
      <AppSidebar role={role} />

      <main
        className={cn(
          "min-h-screen min-w-0 overflow-auto",
          "transition-[padding-left] duration-300 ease-in-out",
          "pl-0",
          open
            ? "md:pl-[var(--sidebar-width)]"
            : "md:pl-[var(--sidebar-width-icon)]",
        )}
      >
        {children}
      </main>
    </div>
  )
}

export default function AdminShellClient({
  children,
  role,
}: {
  children: React.ReactNode
  role: "admin" | "manager"
}) {
  return (
    <SidebarProvider>
      <AdminShell role={role}>{children}</AdminShell>
    </SidebarProvider>
  )
}
