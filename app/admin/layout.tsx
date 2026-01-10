"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const activeKey =
    pathname.startsWith("/admin/messages") ? "messages" :
    pathname.startsWith("/admin/documents") ? "documents" :
    pathname.startsWith("/admin/staff") ? "staff" :
    pathname.startsWith("/admin/schedule") ? "schedule" :
    pathname.startsWith("/admin/report") ? "report" :
    pathname.startsWith("/admin/inventory") ? "inventory" :
    pathname.startsWith("/admin/settings") ? "settings" :
    "dashboard";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar variant="admin" activeKey={activeKey} />
        <main className="flex-1">{children}</main>
      </div>
    </SidebarProvider>
  );
}
