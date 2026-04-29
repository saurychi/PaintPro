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
        "flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col overflow-hidden p-6",
        className,
      )}
      {...props}
    >
      {/* Header — matches admin page style */}
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>

          {subtitle ? (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {/* Body */}
      <div className={cn("mt-6 min-h-0 flex-1", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
