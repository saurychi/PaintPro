import { fakeDelay, toMs } from "./_shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus =
  | "Job on-going"
  | "Job completed"
  | "Job pending"
  | "Job cancelled"

export type EventType = "primary" | "secondary"

/** A calendar event tied to a scheduled job */
export type ScheduleEvent = {
  id: string
  jobId: string
  title: string
  dateISO: string   // ISO-8601 date string, e.g. "2025-06-02T00:00:00.000Z"
  type: EventType
}

/** Condensed job row shown in the sidebar "Jobs" list */
export type UpcomingJob = {
  id: string
  dateLabel: string  // e.g. "June 6"
  title: string
  description: string
}

/** The single active / current job shown in the status card */
export type CurrentJob = {
  id: string         // display ID, e.g. "#0000005D-2025"
  name: string       // site name, e.g. "Lee House"
  status: JobStatus
}

export type GetScheduleParams = {
  /** Optional filter: only return events for this role's view */
  role?: "admin" | "client" | "staff"
  /** Optional filter: only return events within this year+month (0-indexed month) */
  year?: number
  month?: number
}

// ---------------------------------------------------------------------------
// Dummy Data
// (Later: replace body of each function with a Supabase query)
// ---------------------------------------------------------------------------

const DUMMY_EVENTS: ScheduleEvent[] = [
  { id: "ev1",  jobId: "j1",  title: "Interior & Ext...",    dateISO: "2025-06-01T00:00:00.000Z", type: "secondary" },
  { id: "ev2",  jobId: "j2",  title: "Roof Painting",        dateISO: "2025-06-02T00:00:00.000Z", type: "primary"   },
  { id: "ev3",  jobId: "j3",  title: "High-Pressure...",     dateISO: "2025-06-06T00:00:00.000Z", type: "secondary" },
  { id: "ev4",  jobId: "j4",  title: "Interior & Ext...",    dateISO: "2025-06-08T00:00:00.000Z", type: "secondary" },
  { id: "ev5",  jobId: "j5",  title: "Interior & Ext...",    dateISO: "2025-06-12T00:00:00.000Z", type: "secondary" },
  { id: "ev6",  jobId: "j6",  title: "Industrial Co...",     dateISO: "2025-06-15T00:00:00.000Z", type: "secondary" },
  { id: "ev7",  jobId: "j7",  title: "Interior & Ext...",    dateISO: "2025-06-18T00:00:00.000Z", type: "secondary" },
  { id: "ev8",  jobId: "j8",  title: "Wallpapering",         dateISO: "2025-06-21T00:00:00.000Z", type: "secondary" },
  { id: "ev9",  jobId: "j9",  title: "Plaster & Pa...",      dateISO: "2025-06-28T00:00:00.000Z", type: "secondary" },
  { id: "ev10", jobId: "j10", title: "Interior & Ext...",    dateISO: "2025-06-30T00:00:00.000Z", type: "secondary" },
  { id: "ev11", jobId: "j11", title: "Epoxy Floor Coating",  dateISO: "2025-07-03T00:00:00.000Z", type: "secondary" },
]

const DUMMY_UPCOMING: UpcomingJob[] = [
  { id: "j3",  dateLabel: "June 6",  title: "High-Pressure Cleaning",        description: "Removing mold, dirt, and grime from exterior surfaces." },
  { id: "j4",  dateLabel: "June 8",  title: "Interior & Exterior Painting",  description: "Complete interior and exterior painting including trims and doors." },
  { id: "j5",  dateLabel: "June 12", title: "Interior & Exterior Painting",  description: "Touch-up coat and finish work on living areas." },
  { id: "j6",  dateLabel: "June 15", title: "Industrial Coating",            description: "Protective coating application for warehouse floor." },
  { id: "j7",  dateLabel: "June 18", title: "Interior & Exterior Painting",  description: "Bedroom and hallway repainting." },
  { id: "j8",  dateLabel: "June 21", title: "Wallpapering",                  description: "Install feature-wall wallpaper in dining room." },
  { id: "j9",  dateLabel: "June 28", title: "Plaster & Patching",            description: "Patch hairline cracks and smooth plaster before painting." },
  { id: "j10", dateLabel: "June 30", title: "Interior & Exterior Painting",  description: "Final coat on exterior facade." },
  { id: "j11", dateLabel: "July 3",  title: "Epoxy Floor Coating",           description: "Two-part epoxy seal on garage floor." },
]

const DUMMY_CURRENT_JOB: CurrentJob = {
  id: "#0000005D-2025",
  name: "Lee House",
  status: "Job on-going",
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function filterByMonth(events: ScheduleEvent[], year: number, month: number) {
  return events.filter((e) => {
    const d = new Date(e.dateISO)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

// ---------------------------------------------------------------------------
// Public API
// (Later: swap each function body for a real Supabase query)
// ---------------------------------------------------------------------------

/** List all calendar events, optionally filtered to a specific month */
export async function listScheduleEvents(
  params: GetScheduleParams = {}
): Promise<ScheduleEvent[]> {
  await fakeDelay(200)

  let events = DUMMY_EVENTS.slice()

  if (typeof params.year === "number" && typeof params.month === "number") {
    events = filterByMonth(events, params.year, params.month)
  }

  // Sort chronologically
  events.sort((a, b) => toMs(a.dateISO) - toMs(b.dateISO))
  return events
}

/** List upcoming jobs for the sidebar panel */
export async function listUpcomingJobs(
  _params: GetScheduleParams = {}
): Promise<UpcomingJob[]> {
  await fakeDelay(150)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_UPCOMING
}

/** Get the single current/active job for the status card */
export async function getCurrentJob(
  _params: GetScheduleParams = {}
): Promise<CurrentJob | null> {
  await fakeDelay(100)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_CURRENT_JOB
}
