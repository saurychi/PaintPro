"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function StaffLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // staff activeKey mapping
  const activeKey =
    pathname.startsWith("/staff/report/payment") ? "payment" :
    pathname.startsWith("/staff/report/attendance") ? "attendance" :
    pathname.startsWith("/staff/report") ? "report" :
    pathname.startsWith("/staff/schedule") ? "schedule" :
    pathname.startsWith("/staff/inventory") ? "inventory" :
    pathname.startsWith("/staff/documents") ? "documents" :
    pathname.startsWith("/staff/messages") ? "messages" :
    pathname.startsWith("/staff/settings") ? "settings" :
    pathname.startsWith("/staff/staff") ? "staff" :
    "dashboard";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar variant="staff" activeKey={activeKey} />
        <main className="flex-1">{children}</main>
      </div>
    </SidebarProvider>
  );
}
