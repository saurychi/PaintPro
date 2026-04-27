export type ReviewTimingStatus =
  | "early"
  | "on time"
  | "late"
  | "completed"
  | "working on it..."
  | "not started";

export type ReviewMaterialSummary = {
  id: string;
  name: string;
  unit: string | null;
  totalQuantity: number;
  totalCost: number;
};

export type ReviewEquipmentSummary = {
  name: string;
  usageCount: number;
  notes: string[];
};

export type ReviewSubTaskSummary = {
  id: string;
  title: string;
  status: string;
  timingStatus: ReviewTimingStatus;
  estimatedHours: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completedAt: string | null;
  equipmentNames: string[];
  employeeNames: string[];
};

export type ReviewMainTaskSummary = {
  id: string;
  title: string;
  materials: ReviewMaterialSummary[];
  subTasks: ReviewSubTaskSummary[];
};

export type ReviewEmployeeTaskSummary = {
  subTaskId: string;
  mainTaskTitle: string;
  subTaskTitle: string;
  timingStatus: ReviewTimingStatus;
  scheduledStart: string | null;
  completedAt: string | null;
};

export type ReviewEmployeeSummary = {
  id: string;
  name: string;
  role: string | null;
  specialty: string | null;
  earlyCount: number;
  onTimeCount: number;
  lateCount: number;
  assignedTasks: ReviewEmployeeTaskSummary[];
};

export type ProjectReviewSummary = {
  projectId: string;
  projectCode: string;
  projectTitle: string;
  projectStatus: string;
  totalMainTasks: number;
  totalSubTasks: number;
  totalEmployees: number;
  totalMaterials: number;
  totalEquipment: number;
  mainTasks: ReviewMainTaskSummary[];
  materials: ReviewMaterialSummary[];
  equipment: ReviewEquipmentSummary[];
  employees: ReviewEmployeeSummary[];
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

function normalizeStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getTaskVisualStatus(rawStatus: string): ReviewTimingStatus {
  const normalized = normalizeStatus(rawStatus);

  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished"
  ) {
    return "completed";
  }

  if (
    normalized === "in_progress" ||
    normalized === "active" ||
    normalized === "ongoing" ||
    normalized === "ready_to_start"
  ) {
    return "working on it...";
  }

  return "not started";
}

function getCompletionTimingLabel(args: {
  rawStatus: string;
  scheduledStart: string;
  estimatedHours: number;
  completedAt: string;
}): ReviewTimingStatus {
  if (getTaskVisualStatus(args.rawStatus) !== "completed") return "not started";
  if (!args.scheduledStart || !args.completedAt || args.estimatedHours <= 0) {
    return "completed";
  }

  const startDate = new Date(args.scheduledStart);
  const completedDate = new Date(args.completedAt);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(completedDate.getTime())
  ) {
    return "completed";
  }

  const plannedEndMs =
    startDate.getTime() + args.estimatedHours * 60 * 60 * 1000;
  const diffMinutes = (completedDate.getTime() - plannedEndMs) / (1000 * 60);

  if (Math.abs(diffMinutes) <= JUST_IN_TIME_TOLERANCE_MINUTES) {
    return "on time";
  }

  return diffMinutes < 0 ? "early" : "late";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function buildProjectReviewSummary(args: {
  project: Record<string, unknown> | null;
  mainTasks: Record<string, unknown>[];
}): ProjectReviewSummary | null {
  const { project, mainTasks } = args;

  if (!project) return null;

  const materialMap = new Map<string, ReviewMaterialSummary>();
  const equipmentMap = new Map<string, ReviewEquipmentSummary>();
  const employeeMap = new Map<string, ReviewEmployeeSummary>();

  const normalizedMainTasks: ReviewMainTaskSummary[] = mainTasks.map(
    (mainTask, mainTaskIndex) => {
      const mainTaskId =
        readString(mainTask.project_task_id, mainTask.id) ||
        `main-task-${mainTaskIndex}`;
      const mainTaskTitle =
        readString(
          mainTask.title,
          mainTask.name,
          mainTask.main_task_name,
          mainTask.mainTaskName,
        ) || `Main Task ${mainTaskIndex + 1}`;

      const materials = asArray<Record<string, unknown>>(mainTask.materials).map(
        (material, materialIndex) => {
          const materialId =
            readString(material.material_id, material.id) ||
            `material-${mainTaskId}-${materialIndex}`;
          const name =
            readString(material.name, material.title) ||
            `Material ${materialIndex + 1}`;
          const unit = readString(material.unit) || null;
          const totalQuantity = readNumber(
            material.estimated_quantity,
            material.estimatedQuantity,
          );
          const totalCost = readNumber(
            material.estimated_cost,
            material.estimatedCost,
            material.total_cost,
            material.totalCost,
          );

          const existingMaterial = materialMap.get(materialId);
          if (existingMaterial) {
            existingMaterial.totalQuantity += totalQuantity;
            existingMaterial.totalCost += totalCost;
          } else {
            materialMap.set(materialId, {
              id: materialId,
              name,
              unit,
              totalQuantity,
              totalCost,
            });
          }

          return {
            id: materialId,
            name,
            unit,
            totalQuantity,
            totalCost,
          };
        },
      );

      const subTasks = [
        ...asArray<Record<string, unknown>>(mainTask.subTasks),
        ...asArray<Record<string, unknown>>(mainTask.subtasks),
        ...asArray<Record<string, unknown>>(mainTask.projectSubTasks),
        ...asArray<Record<string, unknown>>(mainTask.project_sub_tasks),
      ].map((subTask, subTaskIndex) => {
        const subTaskId =
          readString(subTask.project_sub_task_id, subTask.id) ||
          `sub-task-${mainTaskId}-${subTaskIndex}`;
        const title =
          readString(
            subTask.description,
            subTask.title,
            subTask.name,
            subTask.sub_task_name,
          ) || `Sub Task ${subTaskIndex + 1}`;
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
        const estimatedHours = readNumber(
          subTask.estimatedHours,
          subTask.estimated_hours,
          subTask.durationHours,
          subTask.duration_hours,
        );
        const timingStatus =
          getTaskVisualStatus(rawStatus) === "completed"
            ? getCompletionTimingLabel({
                rawStatus,
                scheduledStart: scheduledStart || "",
                estimatedHours,
                completedAt: completedAt || "",
              })
            : getTaskVisualStatus(rawStatus);

        const equipmentRows = [
          ...asArray<Record<string, unknown>>(subTask.equipments_used),
          ...asArray<Record<string, unknown>>(subTask.equipmentsUsed),
        ];

        const equipmentNames = equipmentRows
          .map((equipment, equipmentIndex) => {
            const name =
              readString(equipment.name, equipment.title) ||
              `Equipment ${equipmentIndex + 1}`;
            const notes = readString(equipment.notes, equipment.note);

            const existingEquipment = equipmentMap.get(name);
            if (existingEquipment) {
              existingEquipment.usageCount += 1;
              if (notes) existingEquipment.notes = unique([...existingEquipment.notes, notes]);
            } else {
              equipmentMap.set(name, {
                name,
                usageCount: 1,
                notes: notes ? [notes] : [],
              });
            }

            return name;
          })
          .filter(Boolean);

        const assignedStaff = [
          ...asArray<Record<string, unknown>>(subTask.assigned_staff),
          ...asArray<Record<string, unknown>>(subTask.assignedStaff),
          ...asArray<Record<string, unknown>>(subTask.projectSubTaskStaff),
        ];

        const employeeNames = assignedStaff
          .map((entry, entryIndex) => {
            const userRecord =
              asRecord(entry.user) ||
              asRecord(entry.employee) ||
              asRecord(entry.profile);
            const employeeId =
              readString(entry.user_id, entry.userId, userRecord?.id) ||
              `employee-${subTaskId}-${entryIndex}`;
            const name =
              readString(
                entry.username,
                entry.full_name,
                entry.fullName,
                entry.name,
                entry.email,
                userRecord?.username,
                userRecord?.full_name,
                userRecord?.fullName,
                userRecord?.name,
                userRecord?.email,
              ) || "Unassigned employee";
            const role = readString(entry.role) || null;
            const specialty = readString(userRecord?.specialty) || null;

            const existingEmployee = employeeMap.get(employeeId);
            if (existingEmployee) {
              existingEmployee.assignedTasks.push({
                subTaskId,
                mainTaskTitle,
                subTaskTitle: title,
                timingStatus,
                scheduledStart,
                completedAt,
              });
              if (timingStatus === "early") existingEmployee.earlyCount += 1;
              if (timingStatus === "on time") existingEmployee.onTimeCount += 1;
              if (timingStatus === "late") existingEmployee.lateCount += 1;
            } else {
              employeeMap.set(employeeId, {
                id: employeeId,
                name,
                role,
                specialty,
                earlyCount: timingStatus === "early" ? 1 : 0,
                onTimeCount: timingStatus === "on time" ? 1 : 0,
                lateCount: timingStatus === "late" ? 1 : 0,
                assignedTasks: [
                  {
                    subTaskId,
                    mainTaskTitle,
                    subTaskTitle: title,
                    timingStatus,
                    scheduledStart,
                    completedAt,
                  },
                ],
              });
            }

            return name;
          })
          .filter(Boolean);

        return {
          id: subTaskId,
          title,
          status: rawStatus || "pending",
          timingStatus,
          estimatedHours,
          scheduledStart,
          scheduledEnd,
          completedAt,
          equipmentNames: unique(equipmentNames),
          employeeNames: unique(employeeNames),
        };
      });

      return {
        id: mainTaskId,
        title: mainTaskTitle,
        materials,
        subTasks,
      };
    },
  );

  return {
    projectId: readString(project.project_id, project.id),
    projectCode: readString(project.project_code, project.projectCode),
    projectTitle: readString(project.title, project.name),
    projectStatus: readString(project.status, project.rawStatus),
    totalMainTasks: normalizedMainTasks.length,
    totalSubTasks: normalizedMainTasks.reduce(
      (sum, mainTask) => sum + mainTask.subTasks.length,
      0,
    ),
    totalEmployees: employeeMap.size,
    totalMaterials: materialMap.size,
    totalEquipment: equipmentMap.size,
    mainTasks: normalizedMainTasks,
    materials: [...materialMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    equipment: [...equipmentMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    employees: [...employeeMap.values()]
      .map((employee) => ({
        ...employee,
        assignedTasks: employee.assignedTasks.sort((a, b) =>
          a.mainTaskTitle.localeCompare(b.mainTaskTitle),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
