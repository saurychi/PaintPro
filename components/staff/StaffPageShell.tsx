import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type StaffPageShellProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  bodyClassName?: string;
};

export default function StaffPageShell({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  ...props
}: StaffPageShellProps) {
  return (
    <div
      className={cn(
        "relative h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden p-6",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-6 h-32 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_58%),linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98)_70%)] dark:opacity-10"
      />

      <div className="relative flex h-full min-h-0 flex-col">
        <header className="overflow-hidden rounded-[28px] border border-emerald-100/80 bg-white/90 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-800/90">
          <div className="h-1 w-full bg-[#00c065]" />

          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/75">
                Staff Workspace
              </p>

              <h1 className="mt-1 shrink-0 text-2xl font-semibold leading-8 text-gray-900">
                {title}
              </h1>

              {subtitle ? (
                <p className="mt-1 max-w-3xl text-xs text-gray-600">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {actions ? <div className="min-w-0 shrink-0">{actions}</div> : null}
          </div>
        </header>

        <div className={cn("mt-4 min-h-0 flex-1", bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
