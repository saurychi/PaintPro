export const MINIMUM_ESTIMATED_HOURS = 0.25;
export const PRODUCTIVE_HOURS_PER_EMPLOYEE = 6;

export function roundToQuarterHour(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 4) / 4;
}

export function clampMinimumHours(
  value: number,
  minimum = MINIMUM_ESTIMATED_HOURS,
): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(value, minimum);
}

export function getTeamEfficiencyFactor(employeeCount: number): number {
  if (employeeCount <= 1) return 1;
  if (employeeCount === 2) return 0.95;
  if (employeeCount === 3) return 0.9;
  if (employeeCount === 4) return 0.85;
  return 0.8;
}

export function getRequiredEmployeeCountFromLaborHours(
  laborHours: number,
): number {
  const normalizedLaborHours = clampMinimumHours(Number(laborHours || 0));
  let employeeCount = Math.max(
    1,
    Math.ceil(normalizedLaborHours / PRODUCTIVE_HOURS_PER_EMPLOYEE),
  );

  while (true) {
    const teamEfficiencyFactor = getTeamEfficiencyFactor(employeeCount);
    const effectiveDailyCapacity =
      employeeCount *
      PRODUCTIVE_HOURS_PER_EMPLOYEE *
      teamEfficiencyFactor;

    if (effectiveDailyCapacity >= normalizedLaborHours) {
      return employeeCount;
    }

    employeeCount += 1;
  }
}

export function getAdjustedDurationHours(args: {
  laborHours: number;
  employeeCount: number;
}): {
  adjustedDurationHours: number;
  productivityHoursPerEmployee: number;
  teamEfficiencyFactor: number;
} {
  const normalizedLaborHours = clampMinimumHours(Number(args.laborHours || 0));
  const normalizedEmployeeCount = Math.max(Number(args.employeeCount || 0), 1);
  const teamEfficiencyFactor =
    getTeamEfficiencyFactor(normalizedEmployeeCount);
  const effectiveCrewSize = Math.max(
    normalizedEmployeeCount * teamEfficiencyFactor,
    1,
  );

  return {
    adjustedDurationHours: clampMinimumHours(
      normalizedLaborHours / effectiveCrewSize,
    ),
    productivityHoursPerEmployee: PRODUCTIVE_HOURS_PER_EMPLOYEE,
    teamEfficiencyFactor,
  };
}
