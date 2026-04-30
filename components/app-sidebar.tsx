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
  ChevronDown,
  Menu,
  X,
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

type SubItem = {
  title: string;
  url: string;
  key: string;
  matchUrls?: string[];
};

type Item = {
  title: string;
  url: string;
  icon: React.ElementType;
  key: string;
  subItems?: SubItem[];
};

type Role = "admin" | "manager" | "staff" | "client";

const adminItems: Item[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    url: "/admin",
    icon: Home,
    subItems: [
      {
        key: "create-job",
        title: "Create Job",
        url: "/admin/job-creation/basic-details",
        matchUrls: ["/admin/job-creation"],
      },
      {
        key: "projects",
        title: "Projects",
        url: "/admin/projects",
        matchUrls: ["/admin/projects"],
      },
    ],
  },
  { key: "staff", title: "Staff", url: "/admin/staff", icon: Users },
  {
    key: "schedule",
    title: "Schedule",
    url: "/admin/schedule",
    icon: CalendarDays,
    subItems: [
      {
        key: "admin-schedule-requests",
        title: "Requests",
        url: "/admin/schedule/requests",
        matchUrls: ["/admin/schedule/requests"],
      },
    ],
  },
  {
    key: "report",
    title: "Report",
    url: "/admin/report",
    icon: BarChart3,
    subItems: [
      {
        key: "project-report-list",
        title: "Project Report List",
        url: "/admin/report/report-list",
        matchUrls: ["/admin/report/report-list"],
      },
      {
        key: "dashboard-charts",
        title: "Dashboard Charts",
        url: "/admin/report/report-overview",
        matchUrls: ["/admin/report/report-overview"],
      },
    ],
  },
  {
    key: "inventory",
    title: "Inventory",
    url: "/admin/inventory",
    icon: Boxes,
  },
  {
    key: "documents",
    title: "Documents",
    url: "/admin/documents",
    icon: FileText,
    subItems: [
      {
        key: "pending-documents",
        title: "Pending",
        url: "/admin/documents/pending",
        matchUrls: ["/admin/documents/pending"],
      },
    ],
  },
  {
    key: "messages",
    title: "Messages",
    url: "/admin/messages",
    icon: MessageSquare,
  },
  {
    key: "settings",
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
    subItems: [
      {
        key: "settings-task-management",
        title: "Task Management",
        url: "/admin/settings/task-management",
        matchUrls: ["/admin/settings/task-management"],
      },
      {
        key: "settings-change-estimations",
        title: "Change Estimations",
        url: "/admin/settings/change-estimations",
        matchUrls: ["/admin/settings/change-estimations"],
      },
    ],
  },
];

const staffItems: Item[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    url: "/staff",
    icon: Home,
  },
  {
    key: "schedule",
    title: "Schedule",
    url: "/staff/schedule",
    icon: CalendarDays,
    subItems: [
      {
        key: "staff-schedule-requests",
        title: "Requests",
        url: "/staff/schedule/requests",
        matchUrls: ["/staff/schedule/requests"],
      },
    ],
  },
  {
    key: "report",
    title: "Report",
    url: "/staff/report",
    icon: BarChart3,
    subItems: [
      {
        key: "staff-report-attendance",
        title: "Attendance",
        url: "/staff/report/attendance",
        matchUrls: ["/staff/report/attendance"],
      },
      {
        key: "staff-report-payroll",
        title: "Payroll",
        url: "/staff/report/payroll",
        matchUrls: ["/staff/report/payroll"],
      },
    ],
  },
  {
    key: "messages",
    title: "Messages",
    url: "/staff/messages",
    icon: MessageSquare,
  },
  // { key: "profile", title: "Profile", url: "/staff/profile", icon: Users },
  {
    key: "settings",
    title: "Settings",
    url: "/staff/settings",
    icon: Settings,
  },
];

const clientItems: Item[] = [
  { key: "report", title: "Report", url: "/client", icon: BarChart3 },
  {
    key: "messages",
    title: "Messages",
    url: "/client/messages",
    icon: MessageSquare,
  },
  {
    key: "documents",
    title: "Documents",
    url: "/client/documents",
    icon: FileText,
    subItems: [
      {
        key: "pending-documents",
        title: "Pending",
        url: "/client/documents/pending",
        matchUrls: ["/client/documents/pending"],
      },
    ],
  },
  {
    key: "schedule",
    title: "Schedule",
    url: "/client/schedule",
    icon: CalendarDays,
  },
  {
    key: "settings",
    title: "Settings",
    url: "/client/settings",
    icon: Settings,
  },
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

function isSubRouteActive(pathname: string, subItem: SubItem) {
  if (isRouteActive(pathname, subItem.url)) return true;

  return (subItem.matchUrls ?? []).some((matchUrl) => {
    return pathname === matchUrl || pathname.startsWith(matchUrl + "/");
  });
}

export type SidebarUser = {
  id: string;
  username: string | null;
  email: string | null;
  role: "client" | "staff" | "manager" | "admin" | null;
  profile_image_url: string | null;
};

const FALLBACK_SIDEBAR_USER: SidebarUser = {
  id: "",
  username: null,
  email: null,
  role: null,
  profile_image_url: null,
};

type AppSidebarProps = {
  role: Role;
  user?: SidebarUser | null;
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
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[hash % AVATAR_BG.length];
}

function firstLetter(nameOrEmail?: string | null) {
  const v = (nameOrEmail ?? "").trim();
  if (!v) return "?";
  return v[0]!.toUpperCase();
}

function roleBadgeClass(r: string | null | undefined) {
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

export function AppSidebar({ role, user }: AppSidebarProps) {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const menuItems = ITEMS_BY_ROLE[role];
  const desktopScrollRef = React.useRef<HTMLDivElement | null>(null);
  const resolvedUser = user ?? FALLBACK_SIDEBAR_USER;

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [desktopScrollFade, setDesktopScrollFade] = React.useState({
    showTop: false,
    showBottom: false,
  });
  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>({
    dashboard:
      pathname === "/admin" ||
      pathname.startsWith("/admin/job-creation") ||
      pathname === "/staff",
    report: pathname.startsWith("/staff/report"),
    documents:
      pathname.startsWith("/admin/documents") ||
      pathname.startsWith("/client/documents"),
    settings: pathname.startsWith("/admin/settings/"),
    schedule:
      pathname.startsWith("/admin/schedule/") ||
      pathname.startsWith("/staff/schedule/"),
  });

  React.useEffect(() => {
    setOpenMenus((prev) => ({
      ...prev,
      dashboard:
        prev.dashboard ||
        pathname === "/admin" ||
        pathname.startsWith("/admin/job-creation") ||
        pathname.startsWith("/admin/projects"),
      report: prev.report || pathname.startsWith("/admin/report"),
      documents:
        prev.documents ||
        pathname.startsWith("/admin/documents") ||
        pathname.startsWith("/client/documents"),
      settings: prev.settings || pathname.startsWith("/admin/settings/"),
      schedule:
        prev.schedule ||
        pathname.startsWith("/admin/schedule/") ||
        pathname.startsWith("/staff/schedule/"),
    }));
  }, [pathname]);

  const updateDesktopScrollFade = React.useCallback(() => {
    const node = desktopScrollRef.current;

    if (!node) {
      setDesktopScrollFade({ showTop: false, showBottom: false });
      return;
    }

    const maxScrollTop = Math.max(node.scrollHeight - node.clientHeight, 0);
    const canScroll = maxScrollTop > 6;
    const scrollTop = node.scrollTop;
    const nextState = {
      showTop: canScroll && scrollTop > 8,
      showBottom: canScroll && scrollTop < maxScrollTop - 8,
    };

    setDesktopScrollFade((prev) => {
      if (
        prev.showTop === nextState.showTop &&
        prev.showBottom === nextState.showBottom
      ) {
        return prev;
      }

      return nextState;
    });
  }, []);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(updateDesktopScrollFade);
    const handleResize = () => updateDesktopScrollFade();

    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateDesktopScrollFade, open, openMenus, pathname]);

  const displayName =
    resolvedUser.username ||
    (resolvedUser.email ? resolvedUser.email.split("@")[0] : "");
  const letter = firstLetter(displayName || resolvedUser.email);
  const avatarSeed = resolvedUser.id || resolvedUser.email || displayName || "seed";
  const avatarClass = stableAvatarClass(avatarSeed);

  const effectiveRole =
    (resolvedUser.role === "admin" ||
    resolvedUser.role === "manager" ||
    resolvedUser.role === "staff" ||
    resolvedUser.role === "client"
      ? resolvedUser.role
      : role) || role;

  function toggleMenu(key: string) {
    setOpenMenus((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open mobile menu"
        className="fixed left-4 top-4 z-60 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-70 md:hidden">
          <button
            type="button"
            aria-label="Close mobile menu overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/35"
          />

          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/paint_pro_logo.png"
                  alt="Paul Jackman logo"
                  width={34}
                  height={34}
                  className="object-contain"
                  priority
                />
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-gray-700">
                    PAUL
                  </div>
                  <div className="text-xs font-semibold text-gray-700">
                    JACKMAN
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close mobile menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-px w-full bg-gray-200/60" />

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isRouteActive(pathname, item.url);
                  const hasSubItems =
                    Array.isArray(item.subItems) && item.subItems.length > 0;
                  const isSubItemActive =
                    hasSubItems &&
                    item.subItems!.some((subItem) =>
                      isSubRouteActive(pathname, subItem),
                    );
                  const isExpanded = Boolean(openMenus[item.key]);

                  return (
                    <div key={item.key}>
                      {hasSubItems ? (
                        <div>
                          <div
                            className={cn(
                              "flex items-center rounded-xl transition-all duration-200",
                              isActive || isSubItemActive
                                ? "bg-[#00BF63] text-white shadow-sm"
                                : "text-gray-600 hover:bg-gray-50",
                            )}
                          >
                            <Link
                              href={item.url}
                              onClick={() => setMobileOpen(false)}
                              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-sm font-medium"
                            >
                              <Icon className="h-5 w-5 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => toggleMenu(item.key)}
                              className={cn(
                                "mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200",
                                isActive || isSubItemActive
                                  ? "text-white/90 hover:bg-white/10"
                                  : "text-gray-500 hover:bg-gray-100",
                              )}
                              aria-label={
                                isExpanded
                                  ? `Collapse ${item.title}`
                                  : `Expand ${item.title}`
                              }
                            >
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform duration-300",
                                  isExpanded ? "rotate-180" : "rotate-0",
                                )}
                              />
                            </button>
                          </div>

                          <div
                            className={cn(
                              "ml-4 overflow-hidden border-l border-gray-200 pl-3 transition-all duration-300 ease-out",
                              isExpanded
                                ? "mt-1 max-h-52 opacity-100"
                                : "max-h-0 opacity-0",
                            )}
                          >
                            <div className="space-y-1 py-1">
                              {item.subItems!.map((subItem) => {
                                const subActive = isSubRouteActive(
                                  pathname,
                                  subItem,
                                );

                                return (
                                  <Link
                                    key={subItem.key}
                                    href={subItem.url}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                      "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                      subActive
                                        ? "bg-[#00BF63]/10 text-[#00BF63]"
                                        : "text-gray-500 hover:bg-gray-50",
                                    )}
                                  >
                                    {subItem.title}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={item.url}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-[#00BF63] text-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-50",
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-200/60 px-4 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "relative h-9 w-9 overflow-hidden rounded-full border border-gray-200",
                    !resolvedUser.profile_image_url && avatarClass,
                  )}
                >
                  {resolvedUser.profile_image_url ? (
                    <Image
                      src={resolvedUser.profile_image_url}
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

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {displayName || "User"}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {resolvedUser.email || ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Sidebar
        collapsible="icon"
        className={cn(
          "fixed inset-y-0 left-0 z-40 max-md:hidden",
          "border-r border-gray-200/60",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          className={cn(
            "absolute z-50 max-md:hidden",
            "top-4 -right-4",
            "h-8 w-9",
            "border border-gray-200/60 bg-white",
            "grid place-items-center text-gray-400 shadow-sm",
            "transition-all duration-200 ease-out hover:scale-105 hover:bg-gray-50 hover:shadow-md active:scale-95",
            "flex justify-between content-center",
          )}
        >
          <ChevronLeft className="h-5 transition-transform duration-200" />
          <ChevronRight className="h-5 transition-transform duration-200" />
        </button>

        <SidebarHeader className="px-4 py-4">
          <div
            className={cn(
              "flex items-center",
              open ? "gap-3" : "justify-center",
            )}
          >
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
                <div className="text-xs font-semibold text-gray-700">
                  JACKMAN
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 h-px w-full bg-gray-200/60" />
        </SidebarHeader>

        {/* IMPORTANT: make SidebarContent a full-height flex column so collapsed does not overlap */}
        <SidebarContent className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-4">
          <div className="relative min-h-0 flex-1">
            <div
              ref={desktopScrollRef}
              onScroll={updateDesktopScrollFade}
              className={cn(
                "min-h-0 h-full overflow-y-auto overflow-x-hidden pr-0.5",
                "[-ms-overflow-style:none] [scrollbar-width:none]",
                "[&::-webkit-scrollbar]:w-0",
                "[&::-webkit-scrollbar]:h-0",
              )}>
              <SidebarMenu
                className={cn(
                  "flex space-y-1 pt-4 pb-4",
                  open ? "w-full flex-col" : "items-center",
                )}>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isRouteActive(pathname, item.url);
                  const hasSubItems =
                    open &&
                    Array.isArray(item.subItems) &&
                    item.subItems.length > 0;
                  const isSubItemActive =
                    hasSubItems &&
                    item.subItems!.some((subItem) =>
                      isSubRouteActive(pathname, subItem),
                    );
                  const isExpanded = Boolean(openMenus[item.key]);

                  return (
                    <SidebarMenuItem
                      key={item.key}
                      className={cn(open ? "w-full" : "")}>
                      {hasSubItems ? (
                        <div className="w-full">
                          <div
                            className={cn(
                              "flex h-10 items-center rounded-md transition-all duration-200 ease-out",
                              "hover:scale-[1.01]",
                              isActive || isSubItemActive
                                ? "bg-[#00BF63] text-white shadow-sm"
                                : "text-gray-500 hover:bg-gray-50 hover:shadow-sm",
                            )}>
                            <Link
                              href={item.url}
                              className="flex min-w-0 flex-1 items-center gap-3 px-3 text-sm font-medium transition-all duration-200">
                              <Icon className="h-5 w-5 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => toggleMenu(item.key)}
                              className={cn(
                                "mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-200 ease-out",
                                "hover:scale-105 active:scale-95",
                                isActive || isSubItemActive
                                  ? "text-white/90 hover:bg-white/10"
                                  : "text-gray-500 hover:bg-gray-100",
                              )}
                              aria-label={
                                isExpanded
                                  ? `Collapse ${item.title}`
                                  : `Expand ${item.title}`
                              }>
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform duration-300 ease-out",
                                  isExpanded ? "rotate-180" : "rotate-0",
                                )}
                              />
                            </button>
                          </div>

                          <div
                            className={cn(
                              "mt-1 ml-4 overflow-hidden border-l border-gray-200 pl-3 transition-all duration-300 ease-out",
                              isExpanded
                                ? "max-h-40 opacity-100 translate-y-0"
                                : "max-h-0 opacity-0 -translate-y-1",
                            )}>
                            <div className="space-y-1 py-1">
                              {item.subItems!.map((subItem) => {
                                const subActive = isSubRouteActive(
                                  pathname,
                                  subItem,
                                );

                                return (
                                  <Link
                                    key={subItem.key}
                                    href={subItem.url}
                                    className={cn(
                                      "flex h-9 items-center rounded-md px-3 text-sm font-medium transition-all duration-200 ease-out",
                                      "hover:translate-x-1 hover:scale-[1.01]",
                                      subActive
                                        ? "bg-[#00BF63]/10 text-[#00BF63]"
                                        : "text-gray-500 hover:bg-gray-50",
                                    )}>
                                    {subItem.title}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          className={cn(
                            isActive
                              ? "text-white hover:text-[#00BF63]"
                              : "text-gray-500",
                          )}>
                          <Link
                            href={item.url}
                            className={cn(
                              "w-full overflow-visible transition-all duration-200 ease-out",
                              open
                                ? "flex h-10 items-center gap-3 px-3 rounded-md text-sm font-medium hover:scale-[1.01]"
                                : cn(
                                    "flex h-14 items-center justify-center rounded-md hover:scale-105",
                                    "[&>svg]:h-5! [&>svg]:w-5!",
                                  ),
                              isActive
                                ? "bg-[#00BF63] text-white shadow-sm"
                                : "hover:bg-gray-50 hover:shadow-sm",
                            )}>
                            <Icon
                              className={cn(
                                open ? "h-5 w-5" : "h-5! w-5!",
                                "transition-transform duration-200",
                              )}
                            />
                            {open && (
                              <span className="truncate">{item.title}</span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>

            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 h-7 bg-linear-to-b from-sidebar via-sidebar/95 to-transparent transition-opacity duration-200",
                desktopScrollFade.showTop ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-7 bg-linear-to-t from-sidebar via-sidebar/95 to-transparent transition-opacity duration-200",
                desktopScrollFade.showBottom ? "opacity-100" : "opacity-0",
              )}
            />
          </div>

          {/* Divider only, no extra container */}
          <div className="shrink-0 px-2">
            <div className="h-px w-full bg-gray-200/60" />

            <div
              className={cn(
                "mt-4",
                open ? "flex items-center gap-3" : "grid place-items-center",
              )}
            >
              <div
                className={cn(
                  "relative h-9 w-9 overflow-hidden rounded-full border border-gray-200",
                  !resolvedUser.profile_image_url && avatarClass,
                )}
                aria-label="User avatar"
                title={displayName || resolvedUser.email || "User"}
              >
                {resolvedUser.profile_image_url ? (
                  <Image
                    src={resolvedUser.profile_image_url}
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
                <div className="truncate text-xs text-gray-500">
                  {resolvedUser.email || ""}
                </div>

                  <div className="mt-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                        roleBadgeClass(effectiveRole),
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
    </>
  );
}
