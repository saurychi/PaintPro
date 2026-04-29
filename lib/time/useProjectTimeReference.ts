"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildClearProjectTimeReferenceCookie,
  buildProjectTimeReferenceCookie,
  normalizeProjectTimeReferenceIso,
  PROJECT_TIME_REFERENCE_EVENT,
  readProjectTimeReferenceFromCookieString,
} from "./projectTimeReference";

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

export function useProjectTimeReference() {
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

  const saveReferenceIso = useCallback((nextValue: string) => {
    const normalized = normalizeProjectTimeReferenceIso(nextValue);

    if (!normalized || typeof document === "undefined") return null;

    document.cookie = buildProjectTimeReferenceCookie(normalized);
    setReferenceIso(normalized);
    setIsLoaded(true);
    dispatchProjectTimeReferenceChange(normalized);

    return normalized;
  }, []);

  const clearReferenceIso = useCallback(() => {
    if (typeof document !== "undefined") {
      document.cookie = buildClearProjectTimeReferenceCookie();
    }

    setReferenceIso(null);
    setIsLoaded(true);
    dispatchProjectTimeReferenceChange(null);
  }, []);

  return {
    referenceIso,
    isLoaded,
    simulationEnabled: Boolean(referenceIso),
    saveReferenceIso,
    clearReferenceIso,
  };
}
