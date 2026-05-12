"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildClearProjectTimeReferenceCookie,
  buildProjectTimeReferenceCookie,
  normalizeProjectTimeReferenceIso,
  PROJECT_TIME_REFERENCE_EVENT,
  readProjectTimeReferenceFromCookieString,
} from "./projectTimeReference";

// Read vs write of the simulated workday clock is split into two hooks
// on purpose. The Settings panel owns the cookie; every other surface
// (dashboard, schedule, job creation, …) only needs to KNOW the current
// reference. Keeping the mutators on a separate, settings-only hook
// makes it structurally impossible to accidentally overwrite the clock
// from a buried flow — there is nothing to import.

function readBrowserProjectTimeReference() {
  if (typeof document === "undefined") return null;
  return readProjectTimeReferenceFromCookieString(document.cookie);
}

function dispatchProjectTimeReferenceChange(referenceIso: string | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(PROJECT_TIME_REFERENCE_EVENT, {
      detail: { referenceIso },
    }),
  );
}

function useProjectTimeReferenceSync() {
  const [referenceIso, setReferenceIso] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const syncFromCookie = () => {
      setReferenceIso(readBrowserProjectTimeReference());
      setIsLoaded(true);
    };

    syncFromCookie();

    if (typeof window === "undefined") return;

    const handleReferenceChange = () => {
      syncFromCookie();
    };

    window.addEventListener(
      PROJECT_TIME_REFERENCE_EVENT,
      handleReferenceChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        PROJECT_TIME_REFERENCE_EVENT,
        handleReferenceChange as EventListener,
      );
    };
  }, []);

  return { referenceIso, isLoaded, setReferenceIso, setIsLoaded };
}

// READ-ONLY hook. Use this everywhere except the Settings panel.
// Returns the current reference + a loaded flag, with no way to mutate.
export function useProjectTimeReference() {
  const { referenceIso, isLoaded } = useProjectTimeReferenceSync();

  return {
    referenceIso,
    isLoaded,
    simulationEnabled: Boolean(referenceIso),
  };
}

// MUTATOR hook. ONLY the Settings panel
// (components/settings/projectTimeReferenceSettings.tsx) is meant to
// import this. If you reach for it from anywhere else, stop and route
// the desired behaviour through URL params or a dedicated server call
// instead — the simulated workday clock is a global toggle and per-
// page side effects on it are exactly what we removed.
export function useProjectTimeReferenceSettingsControls() {
  const { referenceIso, isLoaded, setReferenceIso, setIsLoaded } =
    useProjectTimeReferenceSync();

  const saveReferenceIso = useCallback(
    (nextValue: string) => {
      const normalized = normalizeProjectTimeReferenceIso(nextValue);

      if (!normalized || typeof document === "undefined") return null;

      document.cookie = buildProjectTimeReferenceCookie(normalized);
      setReferenceIso(normalized);
      setIsLoaded(true);
      dispatchProjectTimeReferenceChange(normalized);

      return normalized;
    },
    [setReferenceIso, setIsLoaded],
  );

  const clearReferenceIso = useCallback(() => {
    if (typeof document !== "undefined") {
      document.cookie = buildClearProjectTimeReferenceCookie();
    }

    setReferenceIso(null);
    setIsLoaded(true);
    dispatchProjectTimeReferenceChange(null);
  }, [setReferenceIso, setIsLoaded]);

  return {
    referenceIso,
    isLoaded,
    simulationEnabled: Boolean(referenceIso),
    saveReferenceIso,
    clearReferenceIso,
  };
}
