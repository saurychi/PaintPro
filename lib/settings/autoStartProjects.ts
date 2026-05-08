"use client";

import { useEffect, useState } from "react";

// Per-browser preference (admin-only) that, when enabled, auto-fires the
// kickoff confirmation for a `ready_to_start` project the moment the
// (simulated or real) clock reaches its scheduled start time.
//
// Persisted in localStorage so the choice survives reloads but stays scoped
// to whichever browser the admin opted in from. A custom event lets every
// component on the page react to flips immediately without polling.

const STORAGE_KEY = "paintpro_admin_auto_start_projects";
const CHANGE_EVENT = "paintpro:auto-start-projects-changed";

export function getAutoStartProjects(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAutoStartProjects(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function useAutoStartProjects(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(getAutoStartProjects());

    const onChange = () => setEnabled(getAutoStartProjects());
    window.addEventListener(CHANGE_EVENT, onChange);
    // Also listen for cross-tab changes via the native `storage` event so
    // the dashboard updates if the admin flips the toggle in a second tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return enabled;
}
