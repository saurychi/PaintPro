import { workHoursBetween } from "@/lib/schedule/workHours";

export const EMPLOYEE_PERFORMANCE_RATING_VALUES = [
  "great",
  "good",
  "bad",
  "awful",
] as const;

export type EmployeePerformanceRatingValue =
  (typeof EMPLOYEE_PERFORMANCE_RATING_VALUES)[number];

export type EmployeePerformanceRatingState = {
  timeEfficiency: EmployeePerformanceRatingValue | "";
  workQuality: EmployeePerformanceRatingValue | "";
  teamwork: EmployeePerformanceRatingValue | "";
  workEthic: EmployeePerformanceRatingValue | "";
};

export type EmployeeManagementFinishPayload = {
  employeeId: string;
  note: string;
  rating: EmployeePerformanceRatingState;
  isLastEmployee: boolean;
};

export type EmployeeTaskReview = {
  projectSubTaskId: string;
  title: string;
  status: "done" | "late" | "missed" | "pending";
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  completedAt?: string | null;
  timingLabel?: string | null;
};

export type EmployeeReviewItem = {
  userId: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  dateJoined?: string | null;
  salaryAmount?: number | null;
  totalEstimatedHours?: number | null;
  hourlyWage?: number | null;
  tasks: EmployeeTaskReview[];
};

const JUST_IN_TIME_TOLERANCE_MINUTES = 8;

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (
      typeof value === "string" &&
      value.trim() &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return 0;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveReferenceNowMs(value?: Date | number | string | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? Date.now() : value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return Date.now();
}

function getCompletionTimingLabel(args: {
  rawStatus: string;
  scheduledStart: string;
  estimatedHours: number;
  completedAt: string;
}) {
  const normalized = normalizeStatus(args.rawStatus);

  if (
    normalized !== "completed" &&
    normalized !== "done" &&
    normalized !== "finished"
  ) {
    return null;
  }

  if (!args.scheduledStart || !args.completedAt || args.estimatedHours <= 0) {
    return "Completed";
  }

  const startDate = new Date(args.scheduledStart);
  const completedDate = new Date(args.completedAt);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(completedDate.getTime())
  ) {
    return "Completed";
  }

  const plannedEndMs =
    startDate.getTime() + args.estimatedHours * 60 * 60 * 1000;
  const diffMinutes = (completedDate.getTime() - plannedEndMs) / (1000 * 60);

  if (Math.abs(diffMinutes) <= JUST_IN_TIME_TOLERANCE_MINUTES) {
    return "on time";
  }

  return diffMinutes < 0 ? "early" : "late";
}

function getTaskReviewStatus(args: {
  rawStatus: string;
  scheduledEnd: string | null;
  timingLabel: string | null;
  referenceNowMs: number;
}) {
  const normalized = normalizeStatus(args.rawStatus);

  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished"
  ) {
    return args.timingLabel?.trim().toLowerCase() === "late" ? "late" : "done";
  }

  if (args.scheduledEnd) {
    const scheduledEndDate = new Date(args.scheduledEnd);

    if (
      !Number.isNaN(scheduledEndDate.getTime()) &&
      scheduledEndDate.getTime() < args.referenceNowMs
    ) {
      return "missed";
    }
  }

  return "pending";
}

function sortDateValue(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;

  return date.getTime();
}

export function buildEmployeeReviewItems(
  mainTasks: Record<string, unknown>[],
  options?: {
    referenceNow?: Date | number | string | null;
  },
): EmployeeReviewItem[] {
  const referenceNowMs = resolveReferenceNowMs(options?.referenceNow);
  const employeeMap = new Map<
    string,
    EmployeeReviewItem & { taskIds: Set<string> }
  >();

  for (const mainTask of mainTasks) {
    const subTasks = [
      ...asArray<Record<string, unknown>>(mainTask.subTasks),
      ...asArray<Record<string, unknown>>(mainTask.subtasks),
      ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
      ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
    ];

    for (const subTask of subTasks) {
      const projectSubTaskId =
        readString(subTask.project_sub_task_id, subTask.id) || "";

      if (!projectSubTaskId) continue;

      const rawStatus = readString(
        subTask.status,
        subTask.rawStatus,
        subTask.project_status,
      );
      const scheduledStart =
        readString(
          subTask.scheduled_start_datetime,
          subTask.scheduledStartDatetime,
          subTask.start_datetime,
          subTask.startDatetime,
        ) || null;
      const scheduledEnd =
        readString(
          subTask.scheduled_end_datetime,
          subTask.scheduledEndDatetime,
          subTask.end_datetime,
          subTask.endDatetime,
        ) || null;
      const completedAt =
        readString(subTask.updated_at, subTask.updatedAt) || null;
      let estimatedHours = readNumber(
        subTask.estimated_hours,
        subTask.estimatedHours,
        subTask.duration_hours,
        subTask.durationHours,
      );

      // Fallback: derive hours from the scheduled window when the cost-
      // estimation step never wrote estimated_hours (older projects, or
      // schedules edited directly without re-running cost estimation).
      // Without this the salary multiplier ends up as 0 × wage = $0 in
      // the Employee Management modal, even though the task clearly had
      // a planned duration.
      if (estimatedHours <= 0 && scheduledStart && scheduledEnd) {
        const startDate = new Date(scheduledStart);
        const endDate = new Date(scheduledEnd);
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          estimatedHours = workHoursBetween(startDate, endDate);
        }
      }
      const timingLabel = getCompletionTimingLabel({
        rawStatus,
        scheduledStart: scheduledStart || "",
        estimatedHours,
        completedAt: completedAt || "",
      });

      const taskReview: EmployeeTaskReview = {
        projectSubTaskId,
        title:
          readString(
            subTask.description,
            subTask.title,
            subTask.name,
            subTask.sub_task_name,
          ) || "Sub Task",
        status: getTaskReviewStatus({
          rawStatus,
          scheduledEnd,
          timingLabel,
          referenceNowMs,
        }),
        scheduledStart,
        scheduledEnd,
        completedAt,
        timingLabel,
      };

      const assignedStaff = [
        ...asArray<Record<string, unknown>>(subTask.assigned_staff),
        ...asArray<Record<string, unknown>>(subTask.assignedStaff),
        ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
      ];

      for (const staffEntry of assignedStaff) {
        const userRecord =
          asRecord(staffEntry.user) ||
          asRecord(staffEntry.employee) ||
          asRecord(staffEntry.profile);

        const userId =
          readString(staffEntry.user_id, staffEntry.userId, userRecord?.id) || "";

        if (!userId) continue;

        const username =
          readString(
            staffEntry.username,
            staffEntry.full_name,
            staffEntry.fullName,
            staffEntry.name,
            staffEntry.email,
            userRecord?.username,
            userRecord?.full_name,
            userRecord?.fullName,
            userRecord?.name,
            userRecord?.email,
          ) || "Assigned Employee";

        const role =
          readString(
            userRecord?.specialty,
            userRecord?.role,
            staffEntry.role,
          ) || null;
        const email = readString(staffEntry.email, userRecord?.email) || null;
        const phone = readString(staffEntry.phone, userRecord?.phone) || null;
        const profileImageUrl =
          readString(
            staffEntry.profile_image_url,
            staffEntry.profileImageUrl,
            userRecord?.profile_image_url,
            userRecord?.profileImageUrl,
          ) || null;
        const hourlyWage = readNumber(
          staffEntry.hourly_wage,
          staffEntry.hourlyWage,
          userRecord?.hourly_wage,
          userRecord?.hourlyWage,
        );
        const dateJoined =
          readString(
            staffEntry.created_at,
            staffEntry.createdAt,
            userRecord?.created_at,
            userRecord?.createdAt,
          ) || null;

        const existing = employeeMap.get(userId);

        if (existing) {
          if (!existing.taskIds.has(projectSubTaskId)) {
            existing.tasks.push(taskReview);
            existing.taskIds.add(projectSubTaskId);
            existing.totalEstimatedHours =
              Number(existing.totalEstimatedHours ?? 0) + estimatedHours;
          }

          if (!existing.role && role) existing.role = role;
          if (!existing.email && email) existing.email = email;
          if (!existing.phone && phone) existing.phone = phone;
          if (!existing.profileImageUrl && profileImageUrl) {
            existing.profileImageUrl = profileImageUrl;
          }
          if (!existing.dateJoined && dateJoined) {
            existing.dateJoined = dateJoined;
          }
          if (!existing.hourlyWage && hourlyWage) {
            existing.hourlyWage = hourlyWage;
          }

          continue;
        }

        employeeMap.set(userId, {
          userId,
          username,
          email,
          phone,
          profileImageUrl,
          role,
          dateJoined,
          salaryAmount: null,
          totalEstimatedHours: estimatedHours,
          hourlyWage,
          tasks: [taskReview],
          taskIds: new Set([projectSubTaskId]),
        });
      }
    }
  }

  return Array.from(employeeMap.values())
    .map((employee) => {
      const totalEstimatedHours = Number(employee.totalEstimatedHours ?? 0);
      const hourlyWage = Number(employee.hourlyWage ?? 0);

      employee.tasks.sort(
        (a, b) => sortDateValue(a.scheduledStart) - sortDateValue(b.scheduledStart),
      );

      return {
        userId: employee.userId,
        username: employee.username,
        email: employee.email,
        phone: employee.phone,
        profileImageUrl: employee.profileImageUrl,
        role: employee.role,
        dateJoined: employee.dateJoined,
        hourlyWage,
        totalEstimatedHours,
        salaryAmount: Math.round(totalEstimatedHours * hourlyWage * 100) / 100,
        tasks: employee.tasks,
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}

export function uniqueEmployeeIdsFromReviewItems(items: EmployeeReviewItem[]) {
  return unique(items.map((item) => item.userId));
}

// For the post-cancel "Employee Management" step the admin only reviews
// the work the employees actually finished — pending/missed subtasks
// (which the cancel flow ends up marking "cancelled") never executed,
// so they shouldn't show up on a performance review. Keeps tasks with
// status "done" or "late" (both represent finished work, just with
// different timing) and drops employees who have nothing left after
// that filter.
export function filterEmployeeReviewItemsToFinishedOnly(
  items: EmployeeReviewItem[],
): EmployeeReviewItem[] {
  return items
    .map((employee) => {
      const finishedTasks = employee.tasks.filter(
        (task) => task.status === "done" || task.status === "late",
      );

      // Keep the original totalEstimatedHours / salaryAmount as-is —
      // recomputing would require per-task hours which this shape
      // doesn't carry. The admin can edit the salary inline in the
      // modal if it needs to be scaled down for cancelled work.
      return {
        ...employee,
        tasks: finishedTasks,
      };
    })
    .filter((employee) => employee.tasks.length > 0);
}
