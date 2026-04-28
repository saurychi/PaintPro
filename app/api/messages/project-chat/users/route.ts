import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const CLIENT_COOKIE = "paintpro_client_project_id"

// GET /api/messages/project-chat/users — list ONLY staff/manager users assigned to the client's project
export async function GET() {
  const cookieStore = await cookies()
  const projectId = cookieStore.get(CLIENT_COOKIE)?.value ?? null
  if (!projectId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  try {
    // 1. Get the Project Manager (Creator)
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("created_by")
      .eq("project_id", projectId)
      .single()

    // 2. Get all Main Tasks and their names
    const { data: tasks } = await supabaseAdmin
      .from("project_task")
      .select(`
        project_task_id,
        main_task ( name )
      `)
      .eq("project_id", projectId)
      
    const taskIds = tasks?.map(t => t.project_task_id) || []
    const taskNameMap = new Map(tasks?.map(t => [t.project_task_id, (t as any).main_task?.name || "Task"]))

    // 3. Get all Sub Tasks and their descriptions
    let subTaskIds: string[] = []
    const subTaskInfoMap = new Map()
    if (taskIds.length > 0) {
      const { data: subTasks } = await supabaseAdmin
        .from("project_sub_task")
        .select(`
          project_sub_task_id,
          project_task_id,
          sub_task ( description )
        `)
        .in("project_task_id", taskIds)
        
      subTasks?.forEach(st => {
        subTaskIds.push(st.project_sub_task_id)
        const mainName = taskNameMap.get(st.project_task_id)
        const subDesc = (st as any).sub_task?.description
        // Combines them: "Painting - Wall Prep"
        subTaskInfoMap.set(st.project_sub_task_id, subDesc ? `${mainName} - ${subDesc}` : mainName)
      })
    }

    // 4. Get all Staff assigned and map them to their tasks
    let assignedUserIds: string[] = []
    const userTaskMap = new Map<string, Set<string>>()
    
    if (subTaskIds.length > 0) {
      const { data: assignments } = await supabaseAdmin
        .from("project_sub_task_staff")
        .select("user_id, project_sub_task_id")
        .in("project_sub_task_id", subTaskIds)
        
      assignments?.forEach(a => {
        assignedUserIds.push(a.user_id)
        if (!userTaskMap.has(a.user_id)) {
          userTaskMap.set(a.user_id, new Set())
        }
        const taskLabel = subTaskInfoMap.get(a.project_sub_task_id)
        if (taskLabel) {
          userTaskMap.get(a.user_id)!.add(taskLabel)
        }
      })
    }

    // 5. Combine Project Manager + Assigned Staff
    if (project?.created_by) assignedUserIds.push(project.created_by)
    const uniqueUserIds = Array.from(new Set(assignedUserIds))

    if (uniqueUserIds.length === 0) return NextResponse.json([]) 

    // 6. Fetch the actual user profiles
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, username, role, profile_image_url")
      .in("id", uniqueUserIds)
      .order("username", { ascending: true })

    // 7. Attach the Task list string to the User objects
    const enrichedUsers = users?.map(u => {
      let assignedTasks = ""
      
      if (u.id === project?.created_by) {
        assignedTasks = "Project Manager"
      } else {
        const taskSet = userTaskMap.get(u.id)
        if (taskSet && taskSet.size > 0) {
          assignedTasks = Array.from(taskSet).join(", ")
        } else {
          assignedTasks = "Assigned Staff"
        }
      }

      return {
        ...u,
        assignedTasks
      }
    })

    return NextResponse.json(enrichedUsers ?? [])

  } catch (error) {
    console.error("Error fetching project users:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}