"use client";

import { useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";

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
      const status = await loadProjectStatus();

      if (!status || cancelled) return;

      if (POST_CREATION_STATUSES.has(status)) {
        window.location.replace("/admin");
        return;
      }

      const expectedPath = STATUS_ROUTES[status];
      if (!expectedPath || pathname === expectedPath) return;

      // A quick re-check prevents brief stale status reads from bouncing
      // the user back to the previous step right after clicking Next.
      await new Promise((resolve) => window.setTimeout(resolve, 250));

      if (cancelled) return;

      const confirmedStatus = await loadProjectStatus();
      if (!confirmedStatus || cancelled) return;

      if (POST_CREATION_STATUSES.has(confirmedStatus)) {
        window.location.replace("/admin");
        return;
      }

      const confirmedPath = STATUS_ROUTES[confirmedStatus];
      if (confirmedPath && pathname !== confirmedPath) {
        window.location.replace(`${confirmedPath}?projectId=${projectId}`);
      }
    }

    checkAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [projectId, pathname]);

  return <>{children}</>;
}
