"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  CalendarDays,
  BarChart3,
  Boxes,
  FileText,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

type Item = {
  title: string;
  url: string;
  icon: React.ElementType;
  key: string;
};

type Role = "admin" | "manager" | "staff" | "client";

const adminItems: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/admin", icon: Home },
  { key: "staff", title: "Staff", url: "/admin/staff", icon: Users },
  { key: "schedule", title: "Schedule", url: "/admin/schedule", icon: CalendarDays },
  { key: "report", title: "Report", url: "/admin/report", icon: BarChart3 },
  { key: "inventory", title: "Inventory", url: "/admin/inventory", icon: Boxes },
  { key: "documents", title: "Documents", url: "/admin/documents", icon: FileText },
  { key: "messages", title: "Messages", url: "/admin/messages", icon: MessageSquare },
  { key: "settings", title: "Settings", url: "/admin/settings", icon: Settings },
];

const staffItems: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/staff", icon: Home },
  { key: "report", title: "Report", url: "/staff/report", icon: BarChart3 },
  { key: "profile", title: "Profile", url: "/staff/profile", icon: Users },
  { key: "settings", title: "Settings", url: "/staff/settings", icon: Settings },
];

const clientItems: Item[] = [
  { key: "report", title: "Report", url: "/client", icon: BarChart3 },
  { key: "messages", title: "Messages", url: "/client/messages", icon: MessageSquare },
  { key: "documents", title: "Documents", url: "/client/documents", icon: FileText },
  { key: "schedule", title: "Schedule", url: "/client/schedule", icon: CalendarDays },
  { key: "settings", title: "Settings", url: "/client/settings", icon: Settings },
];

const ITEMS_BY_ROLE: Record<Role, Item[]> = {
  admin: adminItems,
  manager: adminItems,
  staff: staffItems,
  client: clientItems,
};

function isRouteActive(pathname: string, itemUrl: string) {
  const isRootRoute = itemUrl.split("/").length === 2;
  if (isRootRoute) return pathname === itemUrl;
  return pathname === itemUrl || pathname.startsWith(itemUrl + "/");
}

type AppSidebarProps = {
  role: Role;
};

type AppUser = {
  id: string;
  username: string | null;
  email: string | null;
  role: "client" | "staff" | "manager" | "admin" | null;
  profile_image_url: string | null;
};

const AVATAR_BG = [
  "bg-rose-500/15 text-rose-600",
  "bg-orange-500/15 text-orange-600",
  "bg-amber-500/15 text-amber-700",
  "bg-lime-500/15 text-lime-700",
  "bg-emerald-500/15 text-emerald-700",
  "bg-teal-500/15 text-teal-700",
  "bg-cyan-500/15 text-cyan-700",
  "bg-sky-500/15 text-sky-700",
  "bg-indigo-500/15 text-indigo-700",
  "bg-violet-500/15 text-violet-700",
];

function stableAvatarClass(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[hash % AVATAR_BG.length];
}

function firstLetter(nameOrEmail?: string | null) {
  const v = (nameOrEmail ?? "").trim();
  if (!v) return "?";
  return v[0]!.toUpperCase();
}

function roleBadgeClass(r: string | null | undefined) {
  // role colors per your request
  switch (r) {
    case "admin":
      return "bg-purple-500/10 text-purple-700 border-purple-200";
    case "manager":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
    case "staff":
      return "bg-blue-500/10 text-blue-700 border-blue-200";
    case "client":
      return "bg-amber-500/10 text-amber-800 border-amber-200";
    default:
      return "bg-gray-500/10 text-gray-700 border-gray-200";
  }
}

export function AppSidebar({ role }: AppSidebarProps) {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const menuItems = ITEMS_BY_ROLE[role];

  const [user, setUser] = React.useState<AppUser | null>(null);

  React.useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;

      if (!authUser) {
        if (alive) setUser(null);
        return;
      }

      const { data: row } = await supabase
        .from("users")
        .select("id, username, email, role, profile_image_url")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!alive) return;

      setUser({
        id: authUser.id,
        username: row?.username ?? authUser.user_metadata?.username ?? null,
        email: row?.email ?? authUser.email ?? null,
        role: row?.role ?? (authUser.user_metadata?.role ?? null),
        profile_image_url: row?.profile_image_url ?? (authUser.user_metadata?.avatar_url ?? null),
      });
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const displayName = user?.username || (user?.email ? user.email.split("@")[0] : "");
  const letter = firstLetter(displayName || user?.email);
  const avatarSeed = user?.id || user?.email || displayName || "seed";
  const avatarClass = stableAvatarClass(avatarSeed);

  const effectiveRole =
    (user?.role === "admin" || user?.role === "manager" || user?.role === "staff" || user?.role === "client"
      ? user.role
      : role) || role;

  return (
    <Sidebar
      collapsible="icon"
      className={cn("fixed inset-y-0 left-0 z-40", "border-r border-gray-200/60")}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "absolute z-50",
          "top-4 -right-4",
          "h-8 w-9",
          "border border-gray-200/60 bg-white",
          "grid place-items-center text-gray-400 shadow-sm hover:bg-gray-50",
          "flex justify-between content-center"
        )}
      >
        <ChevronLeft className="h-5" />
        <ChevronRight className="h-5" />
      </button>

      <SidebarHeader className="px-4 py-4">
        <div className={cn("flex items-center", open ? "gap-3" : "justify-center")}>
          <Image
            src="/paint_pro_logo.png"
            alt="Paul Jackman logo"
            width={36}
            height={36}
            className="object-contain"
            priority
          />

          {open && (
            <div className="leading-tight">
              <div className="text-xs font-semibold text-gray-700">PAUL</div>
              <div className="text-xs font-semibold text-gray-700">JACKMAN</div>
            </div>
          )}
        </div>

        <div className="mt-4 h-px w-full bg-gray-200/60" />
      </SidebarHeader>

      {/* IMPORTANT: make SidebarContent a full-height flex column so collapsed does not overlap */}
      <SidebarContent className="flex h-full flex-col px-2 py-4">
        <SidebarMenu className={cn("space-y-1 flex", open ? "" : "items-center")}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(pathname, item.url);

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={cn(isActive ? "text-white hover:text-[#00BF63]" : "text-gray-500")}
                >
                  <Link
                    href={item.url}
                    className={cn(
                      "w-full overflow-visible",
                      open
                        ? "flex h-10 items-center gap-3 px-3 rounded-md text-sm font-medium"
                        : cn(
                            "flex h-14 items-center justify-center rounded-md",
                            "[&>svg]:!h-5 [&>svg]:!w-5"
                          ),
                      isActive && "bg-[#00BF63]"
                    )}
                  >
                    <Icon className={cn(open ? "h-5 w-5" : "!h-5 !w-5")} />
                    {open && <span className="truncate">{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {/* Divider only, no extra container */}
        <div className="mt-auto px-2 pt-4">
          <div className="h-px w-full bg-gray-200/60" />

          <div className={cn("mt-4", open ? "flex items-center gap-3" : "grid place-items-center")}>
            {/* Avatar */}
            <div
              className={cn(
                "relative h-9 w-9 overflow-hidden rounded-full border border-gray-200",
                !user?.profile_image_url && avatarClass
              )}
              aria-label="User avatar"
              title={displayName || user?.email || "User"}
            >
              {user?.profile_image_url ? (
                <Image
                  src={user.profile_image_url}
                  alt="Profile"
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-sm font-semibold">
                  {letter}
                </div>
              )}
            </div>

            {open && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-900">
                  {displayName || "User"}
                </div>
                <div className="truncate text-xs text-gray-500">{user?.email || ""}</div>

                <div className="mt-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                      roleBadgeClass(effectiveRole)
                    )}
                  >
                    {effectiveRole.toUpperCase()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
