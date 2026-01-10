"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const activeKey =
    pathname.startsWith("/client/messages") ? "messages" :
    pathname.startsWith("/client/documents") ? "documents" :
    pathname.startsWith("/client/report") ? "report" :
    pathname.startsWith("/client/schedule") ? "schedule" :
    pathname.startsWith("/client/settings") ? "settings" :
    pathname.startsWith("/client/staff") ? "staff" :
    pathname.startsWith("/client/inventory") ? "inventory" :
    "dashboard";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar variant="client" activeKey={activeKey} />
        <main className="flex-1">{children}</main>
      </div>
    </SidebarProvider>
  );
}
