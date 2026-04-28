export type StaffAttendanceStatus =
  | "ASSIGNED"
  | "UPCOMING"
  | "IN_PROGRESS"
  | "COMPLETED";

export type StaffAttendanceRecord = {
  id: string;
  projectId: string;
  projectCode: string;
  projectTitle: string;
  siteAddress: string | null;
  mainTaskName: string;
  subTaskName: string;
  projectStatus: string | null;
  scheduleStatus: string | null;
  assignmentStatus: string | null;
  taskStatus: string | null;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  actualStartDatetime: string | null;
  actualEndDatetime: string | null;
  estimatedHours: number | null;
  updatedAt: string | null;
  status: StaffAttendanceStatus;
};

export function normalizeAttendanceText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function isCompletedAttendanceStatus(value?: string | null) {
  const normalized = normalizeAttendanceText(value);
  return (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "cancelled"
  );
}

export function isActiveAttendanceStatus(value?: string | null) {
  const normalized = normalizeAttendanceText(value);
  return (
    normalized === "in_progress" ||
    normalized === "active" ||
    normalized === "ongoing" ||
    normalized === "started"
  );
}

export function deriveAttendanceStatus(args: {
  projectStatus?: string | null;
  scheduleStatus?: string | null;
  assignmentStatus?: string | null;
  taskStatus?: string | null;
  scheduledStartDatetime?: string | null;
  actualStartDatetime?: string | null;
  actualEndDatetime?: string | null;
  now?: Date;
}): StaffAttendanceStatus {
  if (
    args.actualEndDatetime ||
    isCompletedAttendanceStatus(args.projectStatus) ||
    isCompletedAttendanceStatus(args.scheduleStatus) ||
    isCompletedAttendanceStatus(args.assignmentStatus) ||
    isCompletedAttendanceStatus(args.taskStatus)
  ) {
    return "COMPLETED";
  }

  if (
    args.actualStartDatetime ||
    isActiveAttendanceStatus(args.projectStatus) ||
    isActiveAttendanceStatus(args.scheduleStatus) ||
    isActiveAttendanceStatus(args.assignmentStatus) ||
    isActiveAttendanceStatus(args.taskStatus)
  ) {
    return "IN_PROGRESS";
  }

  if (args.scheduledStartDatetime) {
    const scheduledDate = new Date(args.scheduledStartDatetime);
    const now = args.now ?? new Date();

    if (
      !Number.isNaN(scheduledDate.getTime()) &&
      scheduledDate.getTime() > now.getTime()
    ) {
      return "UPCOMING";
    }
  }

  return "ASSIGNED";
}

export function getAttendanceStatusLabel(status: StaffAttendanceStatus) {
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "IN_PROGRESS":
      return "In Progress";
    case "UPCOMING":
      return "Upcoming";
    case "ASSIGNED":
    default:
      return "Assigned";
  }
}

export function getAttendancePrimaryDate(record: StaffAttendanceRecord) {
  return (
    record.actualStartDatetime ||
    record.scheduledStartDatetime ||
    record.actualEndDatetime ||
    record.scheduledEndDatetime ||
    record.updatedAt ||
    null
  );
}
