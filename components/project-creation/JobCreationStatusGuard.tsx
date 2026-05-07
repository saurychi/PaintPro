"use client";

import { useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { getOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import { getCachedStep } from "@/lib/wizardCache";

const STATUS_ROUTES: Record<string, string> = {
  main_task_pending: "/admin/job-creation/main-task-assignment",
  sub_task_pending: "/admin/job-creation/sub-task-assignment",
  materials_pending: "/admin/job-creation/materials-assignment",
  equipment_pending: "/admin/job-creation/equipment-assignment",
  schedule_pending: "/admin/job-creation/project-schedule",
  employee_assignment_pending: "/admin/job-creation/employee-assignment",
  cost_estimation_pending: "/admin/job-creation/cost-estimation",
  overview_pending: "/admin/job-creation/overview",
  quotation_pending: "/admin/job-creation/quotation-generation",
};

const PATH_TO_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_ROUTES).map(([status, path]) => [path, status]),
);

const POST_CREATION_STATUSES = new Set([
  "ready_to_start",
  "in_progress",
  "completed",
  "cancelled",
]);

export default function JobCreationStatusGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = searchParams.get("projectId");

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function loadProjectStatus() {
      const res = await fetch(
        `/api/planning/getProjectStatus?projectId=${projectId}`,
        { cache: "no-store" },
      );

      if (!res.ok || cancelled) return "";

      const data = await res.json();
      return String(data?.status || "");
    }

    async function checkAndRedirect() {
      const pathStatus = PATH_TO_STATUS[pathname];
      if (!pathStatus) return; // not a guarded page

      // 1. Fast path: check optimistic in-memory cache (set by Previous/Next buttons)
      const optimistic = getOptimisticProjectStatus(projectId!);
      if (optimistic && pathStatus === optimistic) return;

      // 2. Check sessionStorage wizard cache (survives refreshes)
      const cachedStep = getCachedStep(projectId!);
      if (cachedStep) {
        if (pathStatus === cachedStep) return; // user is on the correct page
        // Cached step doesn't match — redirect to correct page
        const correctPath = STATUS_ROUTES[cachedStep];
        if (correctPath && pathname !== correctPath) {
          window.location.replace(`${correctPath}?projectId=${projectId}`);
        }
        return;
      }

      // 3. No cache at all — fall back to API (project not in active wizard session)
      const apiStatus = await loadProjectStatus();
      if (!apiStatus || cancelled) return;

      if (POST_CREATION_STATUSES.has(apiStatus)) {
        window.location.replace("/admin");
        return;
      }

      if (pathStatus === apiStatus) return;

      // Path mismatch — wait briefly for potential race, then recheck
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      if (cancelled) return;

      const freshOptimistic = getOptimisticProjectStatus(projectId!);
      if (freshOptimistic && pathStatus === freshOptimistic) return;

      const freshCachedStep = getCachedStep(projectId!);
      if (freshCachedStep && pathStatus === freshCachedStep) return;

      const confirmedApiStatus = await loadProjectStatus();
      if (!confirmedApiStatus || cancelled) return;

      if (POST_CREATION_STATUSES.has(confirmedApiStatus)) {
        window.location.replace("/admin");
        return;
      }

      if (pathStatus === confirmedApiStatus) return;

      const correctPath = STATUS_ROUTES[confirmedApiStatus];
      if (correctPath && pathname !== correctPath) {
        window.location.replace(`${correctPath}?projectId=${projectId}`);
      }
    }

    checkAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [projectId, pathname]);

  return <>{children}</>;
}
