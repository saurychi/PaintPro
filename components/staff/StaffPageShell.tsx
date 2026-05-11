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
        "flex min-h-[calc(100vh-var(--admin-header-offset,0px))] flex-col p-3 sm:p-4 md:p-6 lg:h-[calc(100vh-var(--admin-header-offset,0px))] lg:overflow-hidden",
        className,
      )}
      {...props}
    >
      {/* Header — matches admin page style */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl dark:text-slate-100">
            {title}
          </h1>

          {subtitle ? (
            <p className="mt-1 text-xs text-gray-500 sm:text-sm dark:text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {/* Body — smaller top margin when there's no subtitle so the title
          doesn't float in a sea of whitespace; full breathing room when
          a subtitle is present (the helper text needs the larger
          separator to read as a distinct section). */}
      <div
        className={cn(
          subtitle ? "mt-4 sm:mt-6" : "mt-3 sm:mt-4",
          "min-h-0 flex-1",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
