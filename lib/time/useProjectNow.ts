"use client";

import { useMemo } from "react";

import { resolveProjectTimeReferenceDate } from "@/lib/time/projectTimeReference";
import { useProjectTimeReference } from "@/lib/time/useProjectTimeReference";

export function useProjectNow() {
  const { referenceIso, isLoaded, simulationEnabled } = useProjectTimeReference();

  const now = useMemo(
    () => resolveProjectTimeReferenceDate(referenceIso) ?? new Date(),
    [referenceIso],
  );

  return {
    now,
    todayKey: now.toISOString().slice(0, 10),
    referenceIso,
    isLoaded,
    simulationEnabled,
  };
}
