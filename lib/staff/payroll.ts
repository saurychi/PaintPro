export type StaffPayrollStatus = "REVIEWED" | "UNREVIEWED";

export type StaffPayrollRecord = {
  id: string;
  projectId: string;
  projectCode: string;
  projectTitle: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  totalEstimatedHours: number | null;
  hourlyWage: number | null;
  salaryAmount: number | null;
  note: string | null;
  status: StaffPayrollStatus;
};

export function derivePayrollStatus(args: { reviewedAt?: string | null }) {
  return args.reviewedAt ? "REVIEWED" : "UNREVIEWED";
}

export function getPayrollStatusLabel(status: StaffPayrollStatus) {
  switch (status) {
    case "UNREVIEWED":
      return "Unreviewed";
    case "REVIEWED":
    default:
      return "Reviewed";
  }
}

export function getPayrollPrimaryDate(record: StaffPayrollRecord) {
  return record.reviewedAt || record.updatedAt || record.createdAt || null;
}
