"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  isWizardCacheDirty,
  getWizardCache,
  clearWizardCache,
} from "@/lib/wizardCache";

const WIZARD_PATH_PREFIX = "/admin/job-creation/";
// The quotation-generation page is wrapped by the same job-creation layout
// (so it gets the dirty-check exit guard) but it is POST-wizard — its
// status is managed by Grant Access / Cancel Project actions on the page
// itself, not by the wizard cache. Syncing the cached step here would
// overwrite the actual DB status (e.g., revert grant_access_quotation back
// to quotation_pending).
const POST_WIZARD_PATHS = ["/admin/job-creation/quotation-generation"];

export default function WizardExitGuard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = searchParams.get("projectId") ?? "";

  const [showModal, setShowModal] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowNavigationRef = useRef(false);

  const isWizardUrl = useCallback((url: string) => {
    try {
      const path = url.startsWith("http")
        ? new URL(url).pathname
        : url.split("?")[0];
      return path.startsWith(WIZARD_PATH_PREFIX);
    } catch {
      return false;
    }
  }, []);

  // Fire-and-forget status update (no await needed — navigation proceeds
  // immediately). Used when leaving without unsaved data changes.
  function syncStatusToDb() {
    // Skip on post-wizard pages whose status the cache no longer reflects.
    if (pathname && POST_WIZARD_PATHS.some((p) => pathname.startsWith(p))) {
      return;
    }
    const cache = getWizardCache(projectId);
    if (!cache?.currentStep) return;
    fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status: cache.currentStep }),
    }).catch(() => {});
  }

  // --- Click interception (sidebar links) ---
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (allowNavigationRef.current) return;
      if (!projectId) return;

      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (isWizardUrl(href)) return;

      // Dirty cache → block and show modal
      if (isWizardCacheDirty(projectId)) {
        e.preventDefault();
        e.stopPropagation();
        setPendingUrl(href);
        setShowModal(true);
        return;
      }

      // Not dirty but cache exists → just sync status to DB (fire-and-forget)
      syncStatusToDb();
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [projectId, isWizardUrl]);

  // --- beforeunload (tab close) ---
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (allowNavigationRef.current) return;
      if (!projectId || !isWizardCacheDirty(projectId)) return;
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [projectId]);

  // --- popstate (browser back leaving wizard) ---
  useEffect(() => {
    if (!projectId) return;

    window.history.pushState({ wizardGuard: true }, "", window.location.href);

    function handlePopState(e: PopStateEvent) {
      if (allowNavigationRef.current) return;

      const currentPath = window.location.pathname;
      if (currentPath.startsWith(WIZARD_PATH_PREFIX)) {
        // Still in wizard — allow (normal back between pages)
        return;
      }

      if (isWizardCacheDirty(projectId)) {
        // Leaving wizard with unsaved changes — block and show modal
        window.history.pushState({ wizardGuard: true }, "", window.location.href);
        setPendingUrl(currentPath);
        setShowModal(true);
        return;
      }

      // Not dirty — sync status and allow
      syncStatusToDb();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [projectId]);

  function navigateAway(url: string) {
    allowNavigationRef.current = true;
    router.push(url);
  }

  async function handleSaveAndLeave() {
    if (!projectId || !pendingUrl) return;

    try {
      setSaving(true);
      const cache = getWizardCache(projectId);
      if (!cache) {
        navigateAway(pendingUrl);
        return;
      }

      const res = await fetch("/api/planning/batchSaveProject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: cache.projectId,
          mainTasks: cache.mainTasks,
          subTasks: cache.subTasks,
          materials: cache.materials,
          markupRate: cache.markupRate,
          status: cache.currentStep,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save project.");
      }

      clearWizardCache(projectId);
      navigateAway(pendingUrl);
    } catch (err: any) {
      setSaving(false);
      alert(err?.message || "Save failed. Please try again.");
    }
  }

  function handleLeaveWithoutSaving() {
    if (!projectId || !pendingUrl) return;
    // Save current step to DB so the project reflects where the user was,
    // even though data changes are discarded.
    syncStatusToDb();
    clearWizardCache(projectId);
    navigateAway(pendingUrl);
  }

  function handleCancel() {
    setShowModal(false);
    setPendingUrl(null);
  }

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Leave Project Wizard?
          </h3>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
            Save your progress to the database before leaving, or discard
            unsaved changes.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleLeaveWithoutSaving}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-3 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
          >
            Discard & Leave
          </button>

          <button
            type="button"
            onClick={handleSaveAndLeave}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#00c065] px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save & Leave"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
