export type CostEstimationAssignedStaff = {
  id: string;
  name: string;
  hourlyWage: number;
};

export type CostEstimationMaterial = {
  projectTaskMaterialId: string;
  materialId: string;
  name: string;
  unit: string | null;
  estimatedQuantity: number;
  unitCost: number;
  estimatedCost?: number | null;
};

export type CostEstimationSubTask = {
  projectSubTaskId: string;
  subTaskId: string;
  title: string;
  estimatedHours: number;
  assignedStaff: CostEstimationAssignedStaff[];
  scheduledStartDatetime?: string | null;
  scheduledEndDatetime?: string | null;
};

export type CostEstimationMainTask = {
  projectTaskId: string;
  mainTaskId: string;
  title: string;
  sortOrder: number;
  materials: CostEstimationMaterial[];
  subtasks: CostEstimationSubTask[];
};

export type CostEstimationInput = {
  project: {
    projectId: string;
    projectCode: string | null;
    title: string | null;
    description: string | null;
    siteAddress: string | null;
    status: string | null;
  };
  markupRate: number;
  mainTasks: CostEstimationMainTask[];
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeMarkupRate(value: number | null | undefined) {
  const raw = Number(value);

  if (!Number.isFinite(raw) || raw < 0) return 0.3;
  if (raw > 1) return raw / 100;

  return raw;
}

export function calculateProjectCostEstimation(input: CostEstimationInput) {
  const markupRate = normalizeMarkupRate(input.markupRate);

  const mainTasks = input.mainTasks
    .map((task) => {
      const materials = task.materials.map((material) => {
        const estimatedQuantity = Number(material.estimatedQuantity ?? 0);
        const unitCost = Number(material.unitCost ?? 0);
        const estimatedCost =
          material.estimatedCost !== undefined && material.estimatedCost !== null
            ? Number(material.estimatedCost)
            : estimatedQuantity * unitCost;

        return {
          ...material,
          estimatedQuantity,
          unitCost,
          estimatedCost: roundMoney(estimatedCost),
        };
      });

      const subtasks = task.subtasks.map((subtask) => {
        const estimatedHours = Number(subtask.estimatedHours ?? 0);

        const assignedStaff = subtask.assignedStaff.map((staff) => ({
          ...staff,
          hourlyWage: roundMoney(Number(staff.hourlyWage ?? 0)),
        }));

        const hourlyWageTotal = roundMoney(
          assignedStaff.reduce((sum, staff) => sum + staff.hourlyWage, 0),
        );

        const laborCost = roundMoney(estimatedHours * hourlyWageTotal);

        return {
          ...subtask,
          estimatedHours,
          assignedStaff,
          hourlyWageTotal,
          laborCost,
        };
      });

      const materialTotal = roundMoney(
        materials.reduce((sum, material) => sum + material.estimatedCost, 0),
      );

      const laborTotal = roundMoney(
        subtasks.reduce((sum, subtask) => sum + subtask.laborCost, 0),
      );

      const totalCost = roundMoney(materialTotal + laborTotal);

      return {
        ...task,
        materials,
        subtasks,
        materialTotal,
        laborTotal,
        totalCost,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const materialTotal = roundMoney(
    mainTasks.reduce((sum, task) => sum + task.materialTotal, 0),
  );

  const laborTotal = roundMoney(
    mainTasks.reduce((sum, task) => sum + task.laborTotal, 0),
  );

  const totalCost = roundMoney(materialTotal + laborTotal);
  const profitAmount = roundMoney(totalCost * markupRate);
  const quotationTotal = roundMoney(totalCost + profitAmount);

  return {
    project: {
      project_id: input.project.projectId,
      project_code: input.project.projectCode,
      title: input.project.title,
      description: input.project.description,
      site_address: input.project.siteAddress,
      status: input.project.status,
    },
    markupRate,
    mainTasks,
    summary: {
      materialTotal,
      laborTotal,
      totalCost,
      profitAmount,
      quotationTotal,
    },
  };
}
