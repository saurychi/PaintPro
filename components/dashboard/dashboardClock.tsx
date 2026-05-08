"use client";

import { useEffect, useState } from "react";

import { resolveProjectTimeReferenceDate } from "@/lib/time/projectTimeReference";
import { useProjectTimeReference } from "@/lib/time/useProjectTimeReference";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DashboardClock({
  className = "",
}: {
  className?: string;
}) {
  const { isLoaded, referenceIso } = useProjectTimeReference();

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const simulated = resolveProjectTimeReferenceDate(referenceIso);

    if (simulated) {
      setNow(simulated);
      return;
    }

    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [isLoaded, referenceIso]);

  if (!now) {
    return (
      <div
        className={`h-[34px] w-[80px] shrink-0 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 flex-col items-end leading-tight ${className}`}>
      <div className="font-mono text-sm font-semibold tabular-nums text-gray-900">
        {formatTime(now)}
      </div>
      <div className="text-[11px] text-gray-500">{formatDate(now)}</div>
    </div>
  );
}
