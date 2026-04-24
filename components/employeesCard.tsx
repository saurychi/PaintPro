"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export type EmployeeStatus =
  | "Available"
  | "Unavailable"
  | "Worked"
  | "On-leave";

export type Employee = {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string | null;
  status: EmployeeStatus;
};

type Props = {
  title?: string;
  employees?: Employee[];
};

type EmployeesResponse = {
  employees?: Employee[];
  error?: string;
  details?: string;
};

type SizeMode = "mini" | "compact" | "normal";

function getSizeMode(width: number, height: number): SizeMode {
  if (width < 320 || height < 150) return "mini";
  if (width < 430 || height < 230) return "compact";
  return "normal";
}

function StatusDot({ status }: { status: EmployeeStatus }) {
  const isAvailable = status === "Available" || status === "Worked";
  const color = isAvailable ? "bg-emerald-500" : "bg-red-500";

  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const label = getStatusLabel(status);
  const isAvailable = label === "Available";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        isAvailable
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
          : "bg-red-50 text-red-600 ring-1 ring-red-100",
      ].join(" ")}>
      <StatusDot status={status} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function getStatusLabel(status: EmployeeStatus) {
  if (status === "Worked") return "Available";
  if (status === "On-leave") return "Unavailable";
  return status;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function EmployeesCard({
  title = "Employees",
  employees: externalEmployees,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  const [employees, setEmployees] = useState<Employee[]>(
    externalEmployees ?? [],
  );

  const [loading, setLoading] = useState(!externalEmployees);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;

      setSize({
        width: rect.width,
        height: rect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (externalEmployees) {
      setEmployees(externalEmployees);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    async function loadEmployees() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/components/getActiveStaffAvailability",
          {
            cache: "no-store",
          },
        );

        const contentType = response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          const text = await response.text();

          console.log("EmployeesCard API returned non-JSON:", {
            status: response.status,
            statusText: response.statusText,
            contentType,
            preview: text.slice(0, 300),
          });

          throw new Error(
            "Employees API route was not found. Check app/api/components/getActiveStaffAvailability/route.ts, then restart the dev server.",
          );
        }

        const data = (await response.json()) as EmployeesResponse;

        if (!response.ok) {
          console.log("EmployeesCard API error:", data);

          throw new Error(
            [data.error, data.details].filter(Boolean).join(": ") ||
              "Failed to load employees.",
          );
        }

        if (!cancelled) {
          setEmployees(Array.isArray(data.employees) ? data.employees : []);
        }
      } catch (error) {
        console.log("EmployeesCard load error:", error);

        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);

          setEmployees([]);
          setError(message);

          toast.error("Failed to load employees", {
            description: message,
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [externalEmployees]);

  const mode = useMemo(
    () => getSizeMode(size.width, size.height),
    [size.width, size.height],
  );

  const availableCount = employees.filter(
    (employee) =>
      employee.status === "Available" || employee.status === "Worked",
  ).length;

  const unavailableCount = employees.length - availableCount;

  const isMini = mode === "mini";
  const isCompact = mode === "compact" || mode === "mini";

  return (
    <section
      ref={sectionRef}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full shrink-0 bg-[#00c065]" />

      <div className="shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-5 text-gray-900">
              {title}
            </h3>

            {!isMini ? (
              <p className="mt-1 text-[11px] leading-4 text-gray-500">
                {availableCount} available, {unavailableCount} unavailable today
              </p>
            ) : null}
          </div>

          {loading ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400" />
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!isMini ? (
          <div className="grid shrink-0 grid-cols-[100px_minmax(0,1fr)] gap-3 border-b border-gray-200 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
            <div>Status</div>
            <div>Staff</div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={[
              "h-full min-h-0 flex-1 overflow-y-auto",
              isCompact ? "px-4 py-2" : "px-5 py-2.5",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar-track]:bg-transparent",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
              "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
            ].join(" ")}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#10B981 transparent",
            }}>
            {error ? (
              <div className="flex h-full min-h-20 items-center justify-center px-3 text-center text-xs text-red-600">
                {error}
              </div>
            ) : loading ? (
              <div className="space-y-2">
                {Array.from({ length: isMini ? 2 : 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3">
                    <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                    <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="flex h-full min-h-20 items-center justify-center px-3 text-center text-xs text-gray-500">
                No active staff found.
              </div>
            ) : (
              <div>
                {employees.map((employee) => {
                  const statusLabel = getStatusLabel(employee.status);

                  return (
                    <div
                      key={employee.id}
                      className={
                        isMini
                          ? "border-b border-gray-100 px-2 py-2.5 last:border-b-0"
                          : "grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3 border-b border-gray-100 px-0 py-3 last:border-b-0"
                      }>
                      <div className="flex min-w-0 items-center">
                        {!isMini ? (
                          <StatusBadge status={employee.status} />
                        ) : null}
                      </div>

                      <div
                        className={[
                          "flex min-w-0 items-center gap-3",
                          isMini ? "mt-2" : "",
                        ].join(" ")}>
                        <div
                          className={[
                            "flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1",
                            statusLabel === "Available"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                              : "bg-gray-100 text-gray-500 ring-gray-200",
                            isCompact ? "h-8 w-8" : "h-9 w-9",
                          ].join(" ")}>
                          {employee.avatarUrl ? (
                            <img
                              src={employee.avatarUrl}
                              alt={employee.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={[
                                "flex h-full w-full items-center justify-center font-semibold",
                                statusLabel === "Available"
                                  ? "text-emerald-700"
                                  : "text-gray-500",
                                "text-[11px]",
                              ].join(" ")}>
                              {getInitials(employee.name)}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={[
                              "truncate font-semibold text-gray-900",
                              isCompact ? "text-[12px]" : "text-[13px]",
                            ].join(" ")}>
                            {employee.name}
                          </div>

                          <div className="mt-0.5 flex min-w-0 items-center gap-2">
                            {employee.role && !isMini ? (
                              <div className="truncate text-[10px] leading-4 text-gray-500">
                                {employee.role}
                              </div>
                            ) : null}

                            {isMini ? (
                              <StatusBadge status={employee.status} />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
