"use client"

import React from "react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

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
      <AdminShell role={role} user={user}>{children}</AdminShell>
    </SidebarProvider>
  )
}
