"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import {
  getCachedSubTasks,
  setCachedSubTasks,
  setCachedStep,
  setCachedRefData,
  getCachedRefData,
  getCachedMainTasks,
  ensureWizardCacheHydrated,
  type CachedRefData,
} from "@/lib/wizardCache";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import ChangeEmployeesModal, {
  StaffUserOption,
} from "@/components/project-creation/ChangeEmployeesModal";

type StepStatus = "done" | "active" | "pending";

type AssignedEmployee = {
  id: string;
  name: string;
  role: string | null;
  assignmentStatus: string | null;
};

type StaffUser = StaffUserOption;

type ServiceStep = {
  id: string;
  subTaskId: string;
  title: string;
  status: "pending" | "active" | "done";
  employees: AssignedEmployee[];
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  children: ServiceStep[];
};

const ACCENT = "#00c065";
const SESSION_DRAFT_KEY = "paintpro-basic-details-draft";

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeEmployee(item: any): AssignedEmployee | null {
  const id = item?.user?.id ?? item?.user_id ?? item?.id ?? null;

  if (!id) return null;

  const name =
    item?.user?.username ??
    item?.user?.name ??
    item?.username ??
    item?.name ??
    item?.email ??
    "Staff";

  return {
    id: String(id),
    name: String(name),
    role:
      typeof item?.role === "string"
        ? item.role
        : typeof item?.user?.role === "string"
          ? item.user.role
          : null,
    assignmentStatus:
      typeof item?.assignment_status === "string"
        ? item.assignment_status
        : typeof item?.assignmentStatus === "string"
          ? item.assignmentStatus
          : null,
  };
}

function buildGroupsFromRows(rows: any[]): ServiceGroup[] {
  const groupedMap = new Map<string, ServiceGroup>();

  for (const row of rows) {
    const mainTaskId =
      row?.project_task?.main_task?.main_task_id ??
      row?.main_task_id ??
      row?.project_task_id ??
      null;

    const mainTaskTitle =
      row?.project_task?.main_task?.name ?? row?.main_task_name ?? "Main Task";

    const subTaskId =
      row?.sub_task?.sub_task_id ??
      row?.sub_task_id ??
      row?.project_sub_task_id ??
      null;

    const subTaskTitle =
      row?.sub_task?.description ??
      row?.sub_task_description ??
      row?.title ??
      "Sub Task";

    if (!mainTaskId || !subTaskId) continue;

    if (!groupedMap.has(String(mainTaskId))) {
      groupedMap.set(String(mainTaskId), {
        id: String(mainTaskId),
        title: String(mainTaskTitle),
        status: "pending",
        children: [],
      });
    }

    const staffSource = Array.isArray(row?.project_sub_task_staff)
      ? row.project_sub_task_staff
      : Array.isArray(row?.staffAssignments)
        ? row.staffAssignments
        : Array.isArray(row?.assignedEmployees)
          ? row.assignedEmployees
          : Array.isArray(row?.employees)
            ? row.employees
            : row?.assignedEmployee
              ? [row.assignedEmployee]
              : [];

    const employees = staffSource
      .map((item: any) => normalizeEmployee(item))
      .filter(Boolean) as AssignedEmployee[];

    groupedMap.get(String(mainTaskId))!.children.push({
      id: String(row?.project_sub_task_id ?? subTaskId),
      subTaskId: String(subTaskId),
      title: String(subTaskTitle),
      status:
        row?.status === "done" ||
        row?.status === "active" ||
        row?.status === "pending"
          ? row.status
          : "pending",
      employees,
    });
  }

  return Array.from(groupedMap.values());
}

function buildGroupsFromDraft(draft: any): ServiceGroup[] {
  const generatedTasks = Array.isArray(draft?.generatedTasks)
    ? draft.generatedTasks
    : [];

  return generatedTasks.map((task: any, taskIndex: number) => ({
    id: String(task?.main_task_id ?? `task-${taskIndex}`),
    title: normalizeString(task?.name, "Main Task"),
    status: "pending" as const,
    children: Array.isArray(task?.sub_tasks)
      ? task.sub_tasks.map((subTask: any, subTaskIndex: number) => {
          const staffSource = Array.isArray(subTask?.assignedEmployees)
            ? subTask.assignedEmployees
            : Array.isArray(subTask?.employees)
              ? subTask.employees
              : subTask?.assignedEmployee
                ? [subTask.assignedEmployee]
                : [];

          return {
            id: String(
              subTask?.project_sub_task_id ??
                `sub-${taskIndex}-${subTaskIndex}`,
            ),
            subTaskId: String(subTask?.sub_task_id ?? subTaskIndex),
            title: normalizeString(subTask?.title, "Sub Task"),
            status: "pending" as const,
            employees: staffSource
              .map((item: any) => normalizeEmployee(item))
              .filter(Boolean) as AssignedEmployee[],
          };
        })
      : [],
  }));
}

/** Raw staff user shape from the cache (matches CachedRefData.staffUsers) */
type RawCachedStaffUser = NonNullable<CachedRefData["staffUsers"]>[number];

/** Convert raw cached staff users to the StaffUserOption shape needed by the component */
function toStaffUserOptions(raw: RawCachedStaffUser[]): StaffUser[] {
  return raw.map((u) => {
    let specialties: string[] = [];
    if (Array.isArray(u.specialty)) {
      specialties = u.specialty.filter(Boolean).map(String);
    } else if (typeof u.specialty === "string" && u.specialty.trim()) {
      specialties = u.specialty.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (u.role && u.role !== "staff") {
      specialties = [u.role];
    }
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      specialties,
    };
  });
}

/** Convert StaffUserOption[] back to the cache-friendly format */
function toRawStaffUsers(users: StaffUser[]): RawCachedStaffUser[] {
  return users.map((u) => ({
    id: u.id,
    username: u.username ?? "",
    email: u.email ?? "",
    hourly_wage: 0,
    role: u.specialties?.[0] ?? "staff",
  }));
}

/**
 * Build ServiceGroup[] from cached subtasks and a staffUsers list (for name resolution).
 */
function buildGroupsFromCache(
  projectId: string,
  cachedSubTasks: NonNullable<ReturnType<typeof getCachedSubTasks>>,
  staffUsersList: StaffUser[],
): ServiceGroup[] {
  const groupedMap = new Map<string, ServiceGroup>();

  const mainTasks = getCachedMainTasks(projectId) ?? [];
  const mainTaskNameMap = new Map(mainTasks.map((t) => [t.id, t.name]));

  for (const st of cachedSubTasks) {
    const mainTaskId = st.mainTaskId;

    // Skip orphan subtasks — the parent main task is no longer in the
    // cache, so the user has removed it. Without this filter the page
    // would render an unnamed "Main Task" group for the orphan.
    if (!mainTaskNameMap.has(mainTaskId)) continue;

    if (!groupedMap.has(mainTaskId)) {
      groupedMap.set(mainTaskId, {
        id: mainTaskId,
        title: mainTaskNameMap.get(mainTaskId) ?? "Main Task",
        status: "pending",
        children: [],
      });
    }

    const employees: AssignedEmployee[] = st.assignedEmployeeIds.map((empId) => {
      const user = staffUsersList.find((u) => u.id === empId);
      return {
        id: empId,
        name: user?.username || user?.email || "Staff",
        role: user?.specialties?.[0] ?? "staff",
        assignmentStatus: "assigned",
      };
    });

    groupedMap.get(mainTaskId)!.children.push({
      id: st.id,
      subTaskId: st.subTaskId,
      title: st.title,
      status: "pending",
      employees,
    });
  }

  return Array.from(groupedMap.values());
}

export default function EmployeeAssignmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/project-schedule");
    router.prefetch("/admin/job-creation/cost-estimation");
  }, [router]);

  const [services, setServices] = useState<ServiceGroup[]>([]);
  // Skip the loading flash on Go Back / repeat visits.
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    const cached = getCachedSubTasks(projectId);
    return !cached || cached.length === 0;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isNavigating, setIsNavigating] = useState<"next" | "back" | null>(
    null,
  );

  const [cardTitle, setCardTitle] = useState("Employee Assignment");
  const [cardSubtitle, setCardSubtitle] = useState(
    "Review assigned staff for each sub task before moving to overview.",
  );

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activeStepTitle, setActiveStepTitle] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isSavingEmployees, setIsSavingEmployees] = useState(false);
  const [isGeneratingEmployees, setIsGeneratingEmployees] = useState(false);

  async function loadEmployeeAssignments(forceRefresh = false) {
    if (!projectId) {
      toast.error("Missing project ID.");
      setLoading(false);
      return;
    }

    try {
      // Spinner only when cache is empty. Repeat visits render
      // synchronously from cache below — no need to flash.
      const cachedAtStart = getCachedSubTasks(projectId);
      const hasCacheAtStart = !!cachedAtStart && cachedAtStart.length > 0;
      if (forceRefresh) setRefreshing(true);
      else if (!hasCacheAtStart) setLoading(true);

      await ensureWizardCacheHydrated(projectId);

      // --- Load staff users (always fetch fresh on forceRefresh) ---
      let loadedStaffUsers: StaffUser[] = [];
      const cachedRef = getCachedRefData(projectId);

      if (!forceRefresh && cachedRef?.staffUsers && cachedRef.staffUsers.length > 0) {
        loadedStaffUsers = toStaffUserOptions(cachedRef.staffUsers);
      } else {
        const staffResponse = await fetch("/api/planning/getStaffUsers");
        const staffData = await staffResponse.json();

        if (!staffResponse.ok) {
          throw new Error(
            [staffData?.error, staffData?.details].filter(Boolean).join(": ") ||
              "Failed to load staff users.",
          );
        }

        loadedStaffUsers = Array.isArray(staffData?.staffUsers)
          ? staffData.staffUsers
          : [];

        setCachedRefData(projectId, { staffUsers: toRawStaffUsers(loadedStaffUsers) });
      }

      setStaffUsers(loadedStaffUsers);

      // --- Load subtask assignment data (cache-first) ---
      const cachedSubTasks = getCachedSubTasks(projectId);

      // The cache is populated by sub-task-assignment with empty
      // assignedEmployeeIds (it doesn't fetch staff assignments). If we
      // short-circuit here on every visit, the user sees no employees on
      // the first load and has to click Refresh to trigger the DB pull.
      // Only short-circuit when the cache actually carries assignments
      // — otherwise fall through to /api/planning/getProjectSubTaskStaff,
      // which writes the assignments back into the cache below so future
      // visits stay fast.
      const cacheHasAssignments = (cachedSubTasks ?? []).some(
        (st) =>
          Array.isArray(st.assignedEmployeeIds) &&
          st.assignedEmployeeIds.length > 0,
      );

      if (
        !forceRefresh &&
        cachedSubTasks &&
        cachedSubTasks.length > 0 &&
        cacheHasAssignments
      ) {
        const groupedServices = buildGroupsFromCache(projectId, cachedSubTasks, loadedStaffUsers);
        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
        return;
      }

      // --- Fetch from API (on refresh or cache miss) ---
      let loadedRows: any[] = [];
      let loadedProject: any = null;

      try {
        const response = await fetch(
          `/api/planning/getProjectSubTaskStaff?projectId=${projectId}`,
        );

        if (response.ok) {
          const data = await response.json();
          loadedRows = Array.isArray(data?.projectSubTaskStaff)
            ? data.projectSubTaskStaff
            : [];
          loadedProject = data?.project ?? null;
        }
      } catch {
        // fallback below
      }

      if (loadedRows.length === 0) {
        try {
          const response = await fetch(
            `/api/planning/getProjectSubTasks?projectId=${projectId}`,
          );

          if (response.ok) {
            const data = await response.json();
            loadedRows = Array.isArray(data?.projectSubTasks)
              ? data.projectSubTasks
              : Array.isArray(data?.subTasks)
                ? data.subTasks
                : Array.isArray(data?.rows)
                  ? data.rows
                  : [];
            loadedProject = data?.project ?? loadedProject;
          }
        } catch {
          // fallback below
        }
      }

      if (loadedRows.length > 0) {
        // Build a map of project_sub_task_id → assigned employees from
        // whatever the API returned. We then overlay it onto the cache
        // (the authoritative subtask list — subtasks deleted in this
        // session live only in the cache, not yet flushed to the DB)
        // so we never re-introduce a row the user has already removed.
        const apiEmployeeMap = new Map<string, AssignedEmployee[]>();
        for (const group of buildGroupsFromRows(loadedRows)) {
          for (const step of group.children) {
            apiEmployeeMap.set(step.id, step.employees);
          }
        }

        if (cachedSubTasks && cachedSubTasks.length > 0) {
          // Cache is the source of truth for which subtasks exist.
          // For each cached subtask, if the API has matching staff,
          // copy them in; otherwise keep whatever the cache already
          // had (empty list, or a previously-set draft).
          const hydratedSubTasks = cachedSubTasks.map((st) => {
            const apiEmployees = apiEmployeeMap.get(st.id);
            return apiEmployees !== undefined
              ? { ...st, assignedEmployeeIds: apiEmployees.map((e) => e.id) }
              : st;
          });
          setCachedSubTasks(projectId, hydratedSubTasks);

          const groupedServices = buildGroupsFromCache(
            projectId,
            hydratedSubTasks,
            loadedStaffUsers,
          );
          setServices(groupedServices);
          setExpanded(new Set(groupedServices.map((group) => group.id)));
        } else {
          // No cache (cold load) — fall back to rendering whatever the
          // API gave us.
          const groupedServices = buildGroupsFromRows(loadedRows);
          setServices(groupedServices);
          setExpanded(new Set(groupedServices.map((group) => group.id)));
        }

        if (loadedProject) {
          const label =
            loadedProject?.project_code ??
            loadedProject?.title ??
            "Employee Assignment";

          const subLabel =
            loadedProject?.title ??
            loadedProject?.site_address ??
            "Review assigned staff for each sub task before moving to overview.";

          setCardTitle(label);
          setCardSubtitle(subLabel);
        }

        return;
      }

      // No API rows came back. In manual mode the wizard cache holds
      // the freshly-picked main tasks + subtasks even though the DB
      // doesn't have project_task rows yet — render straight from the
      // cache so the admin can keep going instead of seeing an empty
      // page.
      if (cachedSubTasks && cachedSubTasks.length > 0) {
        const groupedServices = buildGroupsFromCache(
          projectId,
          cachedSubTasks,
          loadedStaffUsers,
        );
        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
        return;
      }

      const draftRaw = sessionStorage.getItem(SESSION_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        const groupedServices = buildGroupsFromDraft(draft);
        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));

        setCardTitle(draft?.projectCode ?? "Employee Assignment");
        setCardSubtitle(
          draft?.basicDetails?.projectName ??
            draft?.basicDetails?.address ??
            "Review assigned staff for each sub task before moving to overview.",
        );
        return;
      }

      setServices([]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load employee assignment.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadEmployeeAssignments();
  }, [projectId]);

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function openEmployeePicker(step: ServiceStep) {
    setActiveStepId(step.id);
    setActiveStepTitle(step.title);
    setSelectedEmployeeIds(step.employees.map((employee) => employee.id));
    setShowEmployeePicker(true);
  }

  function toggleEmployeeSelection(employeeId: string) {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId],
    );
  }

  async function handleSaveEmployees() {
    if (!activeStepId) return;

    try {
      setIsSavingEmployees(true);

      // Update the cached subtasks with new employee assignments
      const cachedSubTasks = getCachedSubTasks(projectId);
      if (cachedSubTasks) {
        const updatedSubTasks = cachedSubTasks.map((st) =>
          st.id === activeStepId
            ? { ...st, assignedEmployeeIds: selectedEmployeeIds }
            : st,
        );
        setCachedSubTasks(projectId, updatedSubTasks);
      }

      const selectedEmployees: AssignedEmployee[] = staffUsers
        .filter((user) => selectedEmployeeIds.includes(user.id))
        .map((user) => ({
          id: user.id,
          name: user.username || user.email || "Staff",
          role: "staff",
          assignmentStatus: "assigned",
        }));

      setServices((prev) =>
        prev.map((group) => ({
          ...group,
          children: group.children.map((step) =>
            step.id === activeStepId
              ? {
                  ...step,
                  employees: selectedEmployees,
                }
              : step,
          ),
        })),
      );

      setShowEmployeePicker(false);
      setActiveStepId(null);
      setActiveStepTitle("");
      setSelectedEmployeeIds([]);
      toast.success("Employee assignments updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save employee assignments.");
    } finally {
      setIsSavingEmployees(false);
    }
  }

  async function handleGenerateEmployeesForActiveSubTask() {
    if (!activeStepId) return;

    try {
      setIsGeneratingEmployees(true);

      const response = await fetch(
        "/api/planning/generateProjectSubTaskStaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectSubTaskId: activeStepId,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to generate staff recommendation.",
        );
      }

      const recommendedIds = Array.isArray(data?.recommendedEmployeeIds)
        ? data.recommendedEmployeeIds
        : [];

      setSelectedEmployeeIds(recommendedIds);
      toast.success("Recommended staff generated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate staff recommendation.");
    } finally {
      setIsGeneratingEmployees(false);
    }
  }

  function handleGoBack() {
    setIsNavigating("back");
    setOptimisticProjectStatus(projectId, "schedule_pending");
    setCachedStep(projectId, "schedule_pending");
    router.push(`/admin/job-creation/project-schedule?projectId=${projectId}`);
  }

  function handleNext() {
    setIsNavigating("next");
    setOptimisticProjectStatus(projectId, "cost_estimation_pending");
    setCachedStep(projectId, "cost_estimation_pending");
    router.push(`/admin/job-creation/cost-estimation?projectId=${projectId}`);
  }

  async function handleGenerateAssignments() {
    try {
      setLoading(true);

      const response = await fetch(
        "/api/planning/generateProjectSubTaskStaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ projectId }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to generate employee assignments.",
        );
      }

      const reloadResponse = await fetch(
        `/api/planning/getProjectSubTaskStaff?projectId=${projectId}`,
      );
      const reloadData = await reloadResponse.json();

      if (!reloadResponse.ok) {
        throw new Error(
          [reloadData?.error, reloadData?.details].filter(Boolean).join(": ") ||
            "Failed to reload employee assignments.",
        );
      }

      const rows = Array.isArray(reloadData?.projectSubTaskStaff)
        ? reloadData.projectSubTaskStaff
        : [];

      // Build a project_sub_task_id → employees map from the API response,
      // then overlay it onto the cache (the authoritative subtask list).
      // Rendering buildGroupsFromRows(rows) directly would expose subtasks
      // the user already removed in sub-task-assignment but that still
      // live in the DB until the overview-step batch save.
      const apiGroups = buildGroupsFromRows(rows);
      const apiEmployeeMap = new Map<string, AssignedEmployee[]>();
      for (const group of apiGroups) {
        for (const step of group.children) {
          apiEmployeeMap.set(step.id, step.employees);
        }
      }

      const cachedSubTasks = getCachedSubTasks(projectId);
      if (cachedSubTasks && cachedSubTasks.length > 0) {
        const updatedSubTasks = cachedSubTasks.map((st) => {
          const apiEmployees = apiEmployeeMap.get(st.id);
          return apiEmployees !== undefined
            ? { ...st, assignedEmployeeIds: apiEmployees.map((e) => e.id) }
            : st;
        });
        setCachedSubTasks(projectId, updatedSubTasks);

        const groupedServices = buildGroupsFromCache(
          projectId,
          updatedSubTasks,
          staffUsers,
        );
        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
      } else {
        setServices(apiGroups);
        setExpanded(new Set(apiGroups.map((group) => group.id)));
      }

      toast.success("Employee assignments generated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate employee assignments.");
    } finally {
      setLoading(false);
    }
  }

  const totalAssignedEmployees = useMemo(() => {
    return services.reduce(
      (sum, group) =>
        sum +
        group.children.reduce(
          (childSum, step) => childSum + step.employees.length,
          0,
        ),
      0,
    );
  }, [services]);

  const unassignedSubTasks = useMemo(() => {
    return services.reduce(
      (sum, group) =>
        sum +
        group.children.filter((step) => step.employees.length === 0).length,
      0,
    );
  }, [services]);

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0"
            aria-hidden
          />
          <span>Employee Assignment</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Employee Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Review assigned staff under each sub task before moving to
                    overview.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadEmployeeAssignments(true)}
                    disabled={refreshing}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Refresh">
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                  <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Staff Review
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="green-scrollbar h-full overflow-y-auto pr-2">
                <div className="space-y-2.5">
                  {loading ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Loading employee assignment...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      No employee assignments found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroup(group.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleGroup(group.id);
                              }
                            }}
                            className={`w-full cursor-pointer px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/40 dark:bg-emerald-500/10" : "bg-white dark:bg-slate-900"
                            }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={`h-9 w-1 rounded-full ${
                                    isOpen ? "opacity-100" : "opacity-0"
                                  }`}
                                  style={{ backgroundColor: ACCENT }}
                                />
                                <div className="min-w-0">
                                  <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                                    {group.title}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                                    {group.children.length} sub task
                                    {group.children.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>

                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                                  No subtasks found for this main task.
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {group.children.map((step) => (
                                    <div key={step.id} className="py-2.5">
                                      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)_auto] lg:items-start">
                                        <div className="min-w-0 pt-1">
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                              {step.title}
                                            </div>
                                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                              {step.employees.length} assigned
                                              employee
                                              {step.employees.length === 1
                                                ? ""
                                                : "s"}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="min-w-0">
                                          {step.employees.length === 0 ? (
                                            <div className="inline-flex min-h-9 items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                                              No employee assigned yet.
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap items-start gap-2">
                                              {step.employees.map((employee) => (
                                                <div
                                                  key={`${step.id}-${employee.id}`}
                                                  className="inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
                                                  <UserRound className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                                                  <span
                                                    className="min-w-0 truncate text-[12px] font-medium text-slate-900 dark:text-slate-100"
                                                    title={employee.name}>
                                                    {employee.name}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        <div className="lg:justify-self-end">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openEmployeePicker(step)
                                            }
                                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 transform transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 hover:opacity-80 hover:scale-[0.985] active:scale-95">
                                            Change Employees
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  {cardTitle}
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  {cardSubtitle}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                  <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  {totalAssignedEmployees} assigned staff record
                  {totalAssignedEmployees === 1 ? "" : "s"}
                </div>

                <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                  {unassignedSubTasks} sub task
                  {unassignedSubTasks === 1 ? "" : "s"} without assigned staff
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="employee_assignment" />
            </div>
          </aside>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transform transition-all duration-150 hover:bg-slate-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            {isNavigating === "back" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
              </>
            ) : (
              "Go Back"
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transform transition-all duration-150 hover:opacity-85 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            style={{ backgroundColor: ACCENT }}>
            {isNavigating === "next" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
      <ChangeEmployeesModal
        open={showEmployeePicker}
        subTaskTitle={activeStepTitle}
        staffUsers={staffUsers}
        selectedEmployeeIds={selectedEmployeeIds}
        saving={isSavingEmployees}
        generating={isGeneratingEmployees}
        onClose={() => {
          setShowEmployeePicker(false);
          setActiveStepId(null);
          setActiveStepTitle("");
          setSelectedEmployeeIds([]);
        }}
        onToggleEmployee={toggleEmployeeSelection}
        onGenerate={handleGenerateEmployeesForActiveSubTask}
        onSave={handleSaveEmployees}
      />

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .dark .green-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .dark .green-scrollbar::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }
        .green-scrollbar {
          scrollbar-color: ${ACCENT} #eaf7e4;
          scrollbar-width: thin;
        }
        .dark .green-scrollbar {
          scrollbar-color: ${ACCENT} #0f172a;
        }

        .dark .fixed.inset-0 {
          color: #e2e8f0;
        }

        .dark .fixed.inset-0 [class*="bg-white"] {
          background-color: #0f172a !important;
        }

        .dark .fixed.inset-0 [class*="border-gray-200"],
        .dark .fixed.inset-0 [class*="border-slate-200"] {
          border-color: #334155 !important;
        }

        .dark .fixed.inset-0 [class*="text-gray-900"],
        .dark .fixed.inset-0 [class*="text-slate-900"] {
          color: #f8fafc !important;
        }

        .dark .fixed.inset-0 [class*="text-gray-700"],
        .dark .fixed.inset-0 [class*="text-slate-700"] {
          color: #e2e8f0 !important;
        }

        .dark .fixed.inset-0 [class*="text-gray-600"],
        .dark .fixed.inset-0 [class*="text-gray-500"],
        .dark .fixed.inset-0 [class*="text-slate-600"],
        .dark .fixed.inset-0 [class*="text-slate-500"] {
          color: #94a3b8 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-white"],
        .dark .fixed.inset-0 button[class*="border-gray-200"],
        .dark .fixed.inset-0 button[class*="border-slate-200"] {
          background-color: #0f172a !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-white"]:hover,
        .dark .fixed.inset-0 button[class*="border-gray-200"]:hover,
        .dark .fixed.inset-0 button[class*="border-slate-200"]:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }

        .dark .fixed.inset-0 input,
        .dark .fixed.inset-0 textarea,
        .dark .fixed.inset-0 select {
          background-color: #020617 !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }
      `}</style>
    </div>
  );
}
