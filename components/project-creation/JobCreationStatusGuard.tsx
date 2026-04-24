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
  overrview_pending: "/admin/job-creation/overview",
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

    async function checkAndRedirect() {
      const res = await fetch(
        `/api/planning/getProjectStatus?projectId=${projectId}`,
        { cache: "no-store" },
      );

      if (!res.ok) return;

      const data = await res.json();
      const status: string = data?.status || "";

      if (!status) return;

      if (POST_CREATION_STATUSES.has(status)) {
        window.location.replace("/admin");
        return;
      }

      const expectedPath = STATUS_ROUTES[status];
      if (expectedPath && pathname !== expectedPath) {
        window.location.replace(`${expectedPath}?projectId=${projectId}`);
      }
    }

    checkAndRedirect();
  }, [projectId, pathname]);

  return <>{children}</>;
}
