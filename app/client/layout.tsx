"use client";

import React from "react";
import ClientSideNavbar from "@/components/clientSideNavbar";
import { usePathname } from "next/navigation";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/client/login";

  return (
    <div
      className="flex h-screen bg-gray-50"
      style={{
        fontFamily:
          'var(--font-paintpro), system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {!isLoginPage && <ClientSideNavbar />}
      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
