export type StaffPerformanceRecord = {
  id: string;
  projectId: string;
  projectCode: string;
  projectTitle: string;
  timeEfficiency: number | null;
  workQuality: number | null;
  teamwork: number | null;
  workEthic: number | null;
  note: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function getPerformanceAverage(record: StaffPerformanceRecord) {
  const ratings = [
    record.timeEfficiency,
    record.workQuality,
    record.teamwork,
    record.workEthic,
  ].filter((value): value is number => value != null && Number.isFinite(value));

  if (!ratings.length) return null;

  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}
