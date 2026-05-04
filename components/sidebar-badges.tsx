"use client";

import * as React from "react";

export type SidebarBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type SidebarBadge = {
  label: string;
  tone?: SidebarBadgeTone;
};

type SidebarBadgesContextValue = {
  badges: Record<string, SidebarBadge | null>;
  setBadge: (key: string, badge: SidebarBadge | null) => void;
};

const SidebarBadgesContext =
  React.createContext<SidebarBadgesContextValue | null>(null);

export function SidebarBadgesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [badges, setBadges] = React.useState<
    Record<string, SidebarBadge | null>
  >({});

  const setBadge = React.useCallback(
    (key: string, badge: SidebarBadge | null) => {
      setBadges((prev) => {
        const current = prev[key] ?? null;
        if (
          (current === null && badge === null) ||
          (current &&
            badge &&
            current.label === badge.label &&
            current.tone === badge.tone)
        ) {
          return prev;
        }
        return { ...prev, [key]: badge };
      });
    },
    [],
  );

  const value = React.useMemo<SidebarBadgesContextValue>(
    () => ({ badges, setBadge }),
    [badges, setBadge],
  );

  return (
    <SidebarBadgesContext.Provider value={value}>
      {children}
    </SidebarBadgesContext.Provider>
  );
}

export function useSidebarBadges(): Record<string, SidebarBadge | null> {
  const ctx = React.useContext(SidebarBadgesContext);
  return ctx?.badges ?? {};
}

/**
 * Register a sidebar badge for the given item key (top-level `Item.key` or
 * `SubItem.key`). Pass `null`, `undefined`, or an empty string to clear it.
 *
 * Usage:
 *   useSidebarBadge("projects", pendingCount, "danger");
 */
export function useSidebarBadge(
  key: string,
  label: string | number | null | undefined,
  tone: SidebarBadgeTone = "neutral",
) {
  const ctx = React.useContext(SidebarBadgesContext);
  const setBadge = ctx?.setBadge;

  React.useEffect(() => {
    if (!setBadge) return;

    const normalized =
      label == null || label === "" || (typeof label === "number" && label <= 0)
        ? null
        : ({ label: String(label), tone } satisfies SidebarBadge);

    setBadge(key, normalized);

    return () => {
      setBadge(key, null);
    };
  }, [setBadge, key, label, tone]);
}

const TONE_CLASS: Record<SidebarBadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700 border border-gray-200",
  info: "bg-blue-100 text-blue-700 border border-blue-200",
  success: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border border-amber-200",
  danger: "bg-rose-100 text-rose-700 border border-rose-200",
};

const TONE_DOT_CLASS: Record<SidebarBadgeTone, string> = {
  neutral: "bg-gray-400",
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

/** Pill-style badge used on expanded sidebar rows. */
export function SidebarBadgePill({
  badge,
  className,
}: {
  badge: SidebarBadge;
  className?: string;
}) {
  const tone = badge.tone ?? "neutral";
  return (
    <span
      className={[
        "inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none",
        TONE_CLASS[tone],
        className ?? "",
      ].join(" ")}
    >
      {badge.label}
    </span>
  );
}

/** Tiny dot used on the collapsed icon-only sidebar. */
export function SidebarBadgeDot({
  badge,
  className,
}: {
  badge: SidebarBadge;
  className?: string;
}) {
  const tone = badge.tone ?? "neutral";
  return (
    <span
      aria-label={`${badge.label} badge`}
      className={[
        "block h-2 w-2 rounded-full ring-2 ring-white shadow",
        TONE_DOT_CLASS[tone],
        className ?? "",
      ].join(" ")}
    />
  );
}
