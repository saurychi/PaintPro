import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"
const ALLOWED_PROJECT_ROLES = ["staff", "manager"] as const

type ProjectRow = {
  created_by: string | null
}

type ProjectTaskRow = {
  project_task_id: string
  main_task: { name: string | null } | Array<{ name: string | null }> | null
}

type ProjectSubTaskRow = {
  project_sub_task_id: string
  project_task_id: string
  sub_task: { description: string | null } | Array<{ description: string | null }> | null
}

type AssignmentRow = {
  user_id: string
  project_sub_task_id: string
}

type UserRow = {
  id: string
  username: string | null
  role: string | null
  profile_image_url: string | null
}

function normalizeRole(role: string | null | undefined) {
  return String(role ?? "").trim().toLowerCase()
}

function readSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// GET /api/messages/project-chat/users — list assigned staff/manager recipients for the client's project
export async function GET() {
  const cookieStore = await cookies()
  const projectId = cookieStore.get(CLIENT_COOKIE)?.value ?? null

  if (!projectId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const { data: projectData } = await supabaseAdmin
      .from("projects")
      .select("created_by")
      .eq("project_id", projectId)
      .maybeSingle()

    const project = projectData as ProjectRow | null

    const { data: taskData } = await supabaseAdmin
      .from("project_task")
      .select(`
        project_task_id,
        main_task ( name )
      `)
      .eq("project_id", projectId)

    const tasks = (taskData ?? []) as ProjectTaskRow[]
    const taskIds = tasks.map((task) => task.project_task_id)
    const taskNameMap = new Map<string, string>(
      tasks.map((task) => {
        const mainTask = readSingleRelation(task.main_task)
        return [task.project_task_id, mainTask?.name?.trim() || "Task"]
      })
    )

    const subTaskInfoMap = new Map<string, string>()
    const subTaskIds: string[] = []

    if (taskIds.length > 0) {
      const { data: subTaskData } = await supabaseAdmin
        .from("project_sub_task")
        .select(`
          project_sub_task_id,
          project_task_id,
          sub_task ( description )
        `)
        .in("project_task_id", taskIds)

      const subTasks = (subTaskData ?? []) as ProjectSubTaskRow[]

      for (const subTask of subTasks) {
        subTaskIds.push(subTask.project_sub_task_id)

        const mainTaskName = taskNameMap.get(subTask.project_task_id) ?? "Task"
        const subTaskRelation = readSingleRelation(subTask.sub_task)
        const subTaskDescription = subTaskRelation?.description?.trim()

        subTaskInfoMap.set(
          subTask.project_sub_task_id,
          subTaskDescription ? `${mainTaskName} - ${subTaskDescription}` : mainTaskName
        )
      }
    }

    const userTaskMap = new Map<string, Set<string>>()
    const candidateUserIds = new Set<string>()

    if (subTaskIds.length > 0) {
      const { data: assignmentData } = await supabaseAdmin
        .from("project_sub_task_staff")
        .select("user_id, project_sub_task_id")
        .in("project_sub_task_id", subTaskIds)

      const assignments = (assignmentData ?? []) as AssignmentRow[]

      for (const assignment of assignments) {
        candidateUserIds.add(assignment.user_id)

        if (!userTaskMap.has(assignment.user_id)) {
          userTaskMap.set(assignment.user_id, new Set<string>())
        }

        const taskLabel = subTaskInfoMap.get(assignment.project_sub_task_id)
        if (taskLabel) {
          userTaskMap.get(assignment.user_id)?.add(taskLabel)
        }
      }
    }

    if (project?.created_by) {
      candidateUserIds.add(project.created_by)
    }

    if (candidateUserIds.size === 0) {
      return NextResponse.json([])
    }

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("id, username, role, profile_image_url")
      .in("id", Array.from(candidateUserIds))
      .in("role", [...ALLOWED_PROJECT_ROLES])
      .order("username", { ascending: true })

    const users = (userData ?? []) as UserRow[]

    const enrichedUsers = users
      .filter((user) => {
        const role = normalizeRole(user.role)
        const assignedTaskSet = userTaskMap.get(user.id)
        const isAssignedStaff = Boolean(assignedTaskSet?.size)
        const isProjectManager = user.id === project?.created_by && role === "manager"

        return isAssignedStaff || isProjectManager
      })
      .map((user) => {
        const role = normalizeRole(user.role)
        const isProjectManager = user.id === project?.created_by && role === "manager"
        const taskSet = userTaskMap.get(user.id)
        const assignedTasks = isProjectManager
          ? "Project Manager"
          : taskSet && taskSet.size > 0
            ? Array.from(taskSet).join(", ")
            : "Assigned Staff"

        return {
          ...user,
          role: role || "staff",
          assignedTasks,
        }
      })

    return NextResponse.json(enrichedUsers)
  } catch (error) {
    console.error("Error fetching project users:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
