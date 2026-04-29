"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  UserRound,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
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

export default function EmployeeAssignmentPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    async function loadEmployeeAssignments() {
      if (!projectId) {
        toast.error("Missing project ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const staffResponse = await fetch("/api/planning/getStaffUsers");
        const staffData = await staffResponse.json();

        if (!staffResponse.ok) {
          throw new Error(
            [staffData?.error, staffData?.details].filter(Boolean).join(": ") ||
              "Failed to load staff users.",
          );
        }

        setStaffUsers(
          Array.isArray(staffData?.staffUsers) ? staffData.staffUsers : [],
        );

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
          const groupedServices = buildGroupsFromRows(loadedRows);
          setServices(groupedServices);
          setExpanded(new Set(groupedServices.map((group) => group.id)));

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
      }
    }

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

      const response = await fetch("/api/planning/saveProjectSubTaskStaff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectSubTaskId: activeStepId,
          employeeIds: selectedEmployeeIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to save employee assignments.",
        );
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

  async function updateProjectStatus(status: string) {
    const response = await fetch("/api/planning/updateProjectStatus", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        status,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        [data?.error, data?.details].filter(Boolean).join(": ") ||
          "Failed to update project status.",
      );
    }
  }

  async function handleGoBack() {
    try {
      setIsNavigating("back");
      await updateProjectStatus("schedule_pending");
      window.location.href = `/admin/job-creation/project-schedule?projectId=${projectId}`;
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to go back to schedule.");
    }
  }

  async function handleNext() {
    try {
      setIsNavigating("next");
      await updateProjectStatus("cost_estimation_pending");
      window.location.href = `/admin/job-creation/cost-estimation?projectId=${projectId}`;
    } catch (error: any) {
      setIsNavigating(null);
      toast.error(error?.message || "Failed to continue to overview.");
    }
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

      const groupedServices = buildGroupsFromRows(rows);
      setServices(groupedServices);
      setExpanded(new Set(groupedServices.map((group) => group.id)));

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
    <div className="w-full h-screen overflow-hidden bg-white">
      <div className="h-full overflow-hidden px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-gray-900 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-gray-300 shrink-0"
            aria-hidden
          />
          <span>Employee Assignment</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      Employee Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Review assigned staff under each sub task before moving to
                    overview.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Staff Review
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2">
                <div className="space-y-2.5">
                  {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      Loading employee assignment...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                      No employee assignments found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white">
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
                              isOpen ? "bg-emerald-50/40" : "bg-white"
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
                                  <div className="text-[15px] font-semibold text-gray-900">
                                    {group.title}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-gray-500">
                                    {group.children.length} sub task
                                    {group.children.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>

                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-[13px] text-gray-500">
                                  No subtasks found for this main task.
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-200">
                                  {group.children.map((step) => (
                                    <div key={step.id} className="py-2.5">
                                      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)_auto] lg:items-start">
                                        <div className="min-w-0 pt-1">
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <div className="truncate text-[13px] font-semibold text-gray-900">
                                              {step.title}
                                            </div>
                                            <span className="text-[11px] text-gray-500">
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
                                            <div className="inline-flex min-h-9 items-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 text-[12px] text-gray-500">
                                              No employee assigned yet.
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap items-start gap-2">
                                              {step.employees.map((employee) => (
                                                <div
                                                  key={`${step.id}-${employee.id}`}
                                                  className="inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-white px-3">
                                                  <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                                                  <span
                                                    className="min-w-0 truncate text-[12px] font-medium text-gray-900"
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
                                            className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95">
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

                <div className="h-6" />
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-gray-900">
                  {cardTitle}
                </div>
                <div className="mt-1 text-[12px] text-gray-500">
                  {cardSubtitle}
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] text-gray-600">
                  <Users className="h-4 w-4 text-gray-400" />
                  {totalAssignedEmployees} assigned staff record
                  {totalAssignedEmployees === 1 ? "" : "s"}
                </div>

                <div className="mt-2 text-[12px] text-gray-500">
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

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigating !== null}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transform transition-all duration-150 hover:bg-gray-50 hover:opacity-80 hover:scale-[0.985] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100">
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
    </div>
  );
}
