export type MainTaskName = string

export type SubTaskHint = {
  title: string
  priority: number
}

export type MaterialHint = {
  name: string
  unit?: string
  notes?: string
}

export type EquipmentHint = {
  name: string
  notes?: string
}

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export type EmployeeAvailability = {
  day_of_week: WeekdayKey
  is_available: boolean
  start_time?: string | null
  end_time?: string | null
}

export type EmployeeRole = "staff" | "manager" | "admin" | "client"

export type EmployeeHint = {
  id: string
  name: string
  role: EmployeeRole
  specialties: readonly string[]
  availability: readonly EmployeeAvailability[]
  notes?: string
}

export type AiCatalog = {
  mainTasks: readonly string[]
  mainTaskPriority?: Record<string, number>
  subTasks?: Partial<Record<string, readonly SubTaskHint[]>>
  materials?: readonly MaterialHint[]
  equipment?: readonly EquipmentHint[]
  employees?: readonly EmployeeHint[]
}

export type BusinessProfile = {
  businessName: string
  location: string
}

function safeList(lines: string[]) {
  return lines.filter(Boolean).join("\n")
}
