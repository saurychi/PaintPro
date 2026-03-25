import { fakeDelay } from "./_shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceStepStatus = "done" | "active" | "pending"

export type ServiceStep = {
  id: string
  title: string
  scheduledAt?: string
  finishedAt?: string
  status: ServiceStepStatus
  assignedTo?: string
  materialsNeeded?: string
}

export type ServiceGroup = {
  id: string
  title: string
  scheduledAt?: string
  finishedAt?: string
  status: ServiceStepStatus
  children: ServiceStep[]
}

export type DashboardEmployee = {
  id: string
  name: string
  role: string
  status: "Worked" | "On-leave" | "Absent"
  avatarUrl: string
}

export type DashboardNotification = {
  id: string
  title: string
  subtitle: string
  isUnread: boolean
}

export type CostSliceItem = {
  label: string
  percent: number
}

export type CurrentJobSummary = {
  statusLabel: string
  jobNo: string
  siteName: string
  percentComplete: number
  currentTaskLabel: string
}

// ---------------------------------------------------------------------------
// Dummy Data
// (Later: replace function bodies with Supabase queries)
// ---------------------------------------------------------------------------

const DUMMY_CURRENT_JOB: CurrentJobSummary = {
  statusLabel: "Work in progress",
  jobNo: "#0000001A-2024",
  siteName: "Dawn House",
  percentComplete: 45,
  currentTaskLabel: "Spray or Brush Roll Finish",
}

const DUMMY_EMPLOYEES: DashboardEmployee[] = [
  { id: "e1", name: "Marco Dela Cruz", role: "Painter", status: "Worked",   avatarUrl: "/avatars/1.jpg" },
  { id: "e2", name: "Ramon Santos",    role: "Painter", status: "On-leave", avatarUrl: "/avatars/2.jpg" },
  { id: "e3", name: "Jessa Mendoza",   role: "Painter", status: "Worked",   avatarUrl: "/avatars/3.jpg" },
]

const DUMMY_NOTIFICATIONS: DashboardNotification[] = [
  { id: "n1", title: "The client changed their p...", subtitle: "Ramon Dela Cruz", isUnread: true  },
  { id: "n2", title: "The client changed their p...", subtitle: "Marco Dela Cruz", isUnread: false },
]

const DUMMY_COST_SPREAD: CostSliceItem[] = [
  { label: "Labor Cost",          percent: 30 },
  { label: "Transportation Cost", percent: 30 },
  { label: "Materials Cost",      percent: 30 },
  { label: "Other Cost",          percent: 10 },
]

const DUMMY_SERVICES: ServiceGroup[] = [
  {
    id: "svc-spray",
    title: "Spray or Brush Roll Finish",
    scheduledAt: "01 July 2024, 9:30 AM",
    finishedAt: undefined,
    status: "active",
    children: [
      {
        id: "svc-spray-1",
        title: "Prepare paint needed",
        scheduledAt: "01 July 2024, 9:30 AM",
        finishedAt: "01 July 2024, 9:45 AM",
        assignedTo: "Marco Dela Cruz",
        materialsNeeded: "1 Bucket of Boysen green paint",
        status: "done",
      },
      {
        id: "svc-spray-2",
        title: "Apply base coat on left side wall",
        scheduledAt: "01 July 2024, 9:45 AM",
        finishedAt: "01 July 2024, 10:10 AM",
        assignedTo: "Marco Dela Cruz",
        materialsNeeded: "1 Bucket of Boysen green paint",
        status: "done",
      },
      {
        id: "svc-spray-3",
        title: "Apply second coat on left side wall",
        scheduledAt: "01 July 2024, 10:10 AM",
        finishedAt: undefined,
        status: "active",
        assignedTo: "Marco Dela Cruz",
        materialsNeeded: "1 Bucket of Boysen green paint",
      },
      {
        id: "svc-spray-4",
        title: "Clean and prep tools post-application",
        scheduledAt: "01 July 2024, 10:30 AM",
        finishedAt: undefined,
        status: "pending",
      },
    ],
  },
  {
    id: "svc-wallpaper",
    title: "Wallpapering",
    scheduledAt: "01 July 2024, 11:15 AM",
    finishedAt: undefined,
    status: "pending",
    children: [
      {
        id: "svc-wallpaper-1",
        title: "Measure and mark wall for wallpaper alignment",
        scheduledAt: "01 July 2024, 11:15 AM",
        finishedAt: undefined,
        status: "pending",
      },
      {
        id: "svc-wallpaper-2",
        title: "Apply wallpaper to left side wall section",
        scheduledAt: "01 July 2024, 11:40 AM",
        finishedAt: undefined,
        status: "pending",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Public API
// (Later: swap each function body for a real Supabase query)
// ---------------------------------------------------------------------------

/** Get the current active job summary shown at the top of the dashboard */
export async function getCurrentJobSummary(): Promise<CurrentJobSummary> {
  await fakeDelay(150)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_CURRENT_JOB
}

/** Get the list of employees/team members shown on the dashboard */
export async function getDashboardEmployees(): Promise<DashboardEmployee[]> {
  await fakeDelay(200)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_EMPLOYEES
}

/** Get recent notifications for the dashboard notification card */
export async function getDashboardNotifications(): Promise<DashboardNotification[]> {
  await fakeDelay(150)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_NOTIFICATIONS
}

/** Get cost spread breakdown (labor, transport, materials, etc.) */
export async function getJobCostSpread(): Promise<CostSliceItem[]> {
  await fakeDelay(100)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_COST_SPREAD
}

/** Get the service progress groups (tasks within the current job) */
export async function getServiceGroups(): Promise<ServiceGroup[]> {
  await fakeDelay(250)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_SERVICES
}
