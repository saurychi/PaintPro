import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { openRouterChat } from "@/lib/ai/openrouter"
import type { ProjectDimensions } from "@/lib/planning/materialEstimator"

type SubTaskOut = {
  title: string
  priority: number
}

type MainTaskOut = {
  name: string
  priority: number
  confidence: number
  reasons: string[]
  sub_tasks: SubTaskOut[]
}

type SuccessResponse = {
  main_tasks: MainTaskOut[]
  dimensions: ProjectDimensions | null
  raw: string
}

type MainTaskRow = {
  main_task_id: string
  name: string | null
  sort_order: number | null
  is_active: boolean | null
}

type SubTaskRow = {
  sub_task_id: string
  main_task_id: string | null
  description: string | null
  sort_order: number | null
  is_active: boolean | null
}

type CatalogMainTask = {
  id: string
  name: string
  priority: number
  subTasks: Array<{
    id: string
    title: string
    priority: number
  }>
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function norm(s: string) {
  return String(s || "").trim().toLowerCase()
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return "null"
  }
}

function parseCsvIndexes(value: string | undefined) {
  if (!value) return []
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}

function getLineValueMap(line: string) {
  const parts = line
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)

  const map = new Map<string, string>()

  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toUpperCase()
    const value = part.slice(eq + 1).trim()
    map.set(key, value)
  }

  return map
}

function buildIndexedMainTaskBlock(mainTasks: readonly string[]) {
  return [
    "",
    "Main task indexes:",
    ...mainTasks.map((task, i) => `${i + 1} = ${task}`),
  ].join("\n")
}

function buildIndexedSubTaskBlock(
  mainTasks: readonly string[],
  subTasks: Partial<Record<string, readonly { title: string; priority: number }[]>>
) {
  const lines: string[] = [
    "",
    "Sub-task indexes by main task:",
    "Use only the sub-task indexes that belong to the chosen main task.",
    "If a main task has no indexed sub-tasks, use SUB=",
  ]

  for (const main of mainTasks) {
    const hints = subTasks[main] ?? []
    lines.push(`Main Task: ${main}`)

    if (!hints.length) {
      lines.push("- none")
      continue
    }

    hints.forEach((hint, i) => {
      lines.push(`${i + 1} = ${hint.title}`)
    })
  }

  return lines.join("\n")
}

function parseAiLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.toUpperCase().startsWith("TASK="))
}

function buildPriorityFromSortOrder(sortOrder: number | null | undefined) {
  const n = Number(sortOrder)
  if (!Number.isFinite(n)) return 50
  return Math.max(1, Math.min(999, n * 10))
}

function uniqueSubTasks(items: SubTaskOut[]) {
  return items.filter(
    (item, index, arr) =>
      arr.findIndex((x) => norm(x.title) === norm(item.title)) === index
  )
}

function buildCatalog(args: {
  mainTasks: MainTaskRow[]
  subTasks: SubTaskRow[]
}): CatalogMainTask[] {
  const { mainTasks, subTasks } = args

  const activeMainTasks = mainTasks
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.main_task_id,
      name: String(row.name || "").trim(),
      sort_order: Number.isFinite(Number(row.sort_order))
        ? Number(row.sort_order)
        : 999,
    }))
    .filter((row) => row.id && row.name)
    .sort((a, b) => a.sort_order - b.sort_order)

  const activeSubTasks = subTasks
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.sub_task_id,
      main_task_id: row.main_task_id ? String(row.main_task_id) : "",
      title: String(row.description || "").trim(),
      sort_order: Number.isFinite(Number(row.sort_order))
        ? Number(row.sort_order)
        : 999,
    }))
    .filter((row) => row.id && row.main_task_id && row.title)

  const subTasksByMainTaskId = new Map<string, typeof activeSubTasks>()

  for (const row of activeSubTasks) {
    const list = subTasksByMainTaskId.get(row.main_task_id) ?? []
    list.push(row)
    subTasksByMainTaskId.set(row.main_task_id, list)
  }

  return activeMainTasks.map((main) => {
    const mappedSubTasks = (subTasksByMainTaskId.get(main.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((sub) => ({
        id: sub.id,
        title: sub.title,
        priority: buildPriorityFromSortOrder(sub.sort_order),
      }))

    return {
      id: main.id,
      name: main.name,
      priority: buildPriorityFromSortOrder(main.sort_order),
      subTasks: mappedSubTasks,
    }
  })
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!isObj(body)) {
    return NextResponse.json({ error: "Invalid body shape." }, { status: 400 })
  }

  const description = typeof body.description === "string" ? body.description.trim() : ""
  const dimensions: ProjectDimensions | null =
    "dimensions" in body ? ((body.dimensions as ProjectDimensions | null) ?? null) : null

  if (!description) {
    return NextResponse.json({ error: "Missing description." }, { status: 400 })
  }

  const { data: mainTaskRows, error: mainTaskError } = await supabaseAdmin
  .from("main_task")
  .select("main_task_id, name, sort_order, is_active")
  .order("sort_order", { ascending: true })

  if (mainTaskError) {
    return NextResponse.json(
      {
        error: "Failed to fetch main tasks.",
        details: mainTaskError.message,
      },
      { status: 500 }
    )
  }

  const { data: subTaskRows, error: subTaskError } = await supabaseAdmin
    .from("sub_task")
    .select("sub_task_id, main_task_id, description, sort_order, is_active")
    .order("sort_order", { ascending: true })

  if (subTaskError) {
    return NextResponse.json(
      {
        error: "Failed to fetch sub tasks.",
        details: subTaskError.message,
      },
      { status: 500 }
    )
  }

  const catalog = buildCatalog({
    mainTasks: (mainTaskRows ?? []) as MainTaskRow[],
    subTasks: (subTaskRows ?? []) as SubTaskRow[],
  })

  if (!catalog.length) {
    return NextResponse.json(
      { error: "No active main tasks found in database." },
      { status: 500 }
    )
  }

  const allowedMainTasks = catalog.map((task) => task.name)

  const subTaskMap: Partial<Record<string, readonly { title: string; priority: number }[]>> = {}
  for (const task of catalog) {
    subTaskMap[task.name] = task.subTasks.map((subTask) => ({
      title: subTask.title,
      priority: subTask.priority,
    }))
  }

  const indexedMainTaskBlock = buildIndexedMainTaskBlock(allowedMainTasks)
  const indexedSubTaskBlock = buildIndexedSubTaskBlock(allowedMainTasks, subTaskMap)

  const system = [
    "You are PaintPro's project planning assistant.",
    "Return only plain text lines.",
    "Do not return JSON.",
    "Use only numeric indexes for TASK and SUB.",
    "Do not output words like P60.",
    "Do not output dimension keys like interior_wall_area_m2.",
    "Do not output task names.",
    "",
    "Business: Paul Jackman Painting & Decorating",
    "Location: Darwin, NT (Australia)",
    indexedMainTaskBlock,
    indexedSubTaskBlock,
    "",
    "Return only lines in this exact format:",
    "TASK=<main_task_index>|SUB=<comma-separated-subtask-indexes>|CONF=<0-to-1>",
    "",
    "Example valid lines:",
    "TASK=1|SUB=1,2,3|CONF=0.92",
    "TASK=4|SUB=|CONF=0.71",
    "",
    "Strict rules:",
    "- Return 3 to 12 lines only.",
    "- One task per line.",
    "- TASK must be a number from the Main task indexes list.",
    "- SUB must contain only numbers from the chosen task's sub-task index list.",
    "- If there are no suitable indexed sub-tasks, use SUB=",
    "- CONF must be a number from 0 to 1.",
    "- No markdown.",
    "- No explanations.",
    "- No extra text before or after the lines.",
  ].join("\n")

  const user = [
    "Project description:",
    description,
    "",
    "Project dimensions and measurement inputs:",
    safeJsonStringify(dimensions),
  ].join("\n")

  let raw = ""

  try {
    raw = await openRouterChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0, maxTokens: 400, retries: 2 }
    )
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "AI request failed.",
        details: typeof e?.message === "string" ? e.message : String(e),
      },
      { status: 502 }
    )
  }

  const lines = parseAiLines(raw)
  const byNameLower = new Map<string, MainTaskOut>()

  for (const line of lines) {
    const valueMap = getLineValueMap(line)

    const taskIndex = Number(valueMap.get("TASK"))
    if (!Number.isInteger(taskIndex) || taskIndex < 1 || taskIndex > catalog.length) {
      continue
    }

    const mappedTask = catalog[taskIndex - 1]
    if (!mappedTask) continue

    const confidence = clamp01(Number(valueMap.get("CONF")))
    const priority = mappedTask.priority

    const subIndexes = parseCsvIndexes(valueMap.get("SUB"))
    const sub_tasks: SubTaskOut[] = uniqueSubTasks(
      subIndexes
        .map((idx) => mappedTask.subTasks[idx - 1])
        .filter(
          (hint): hint is { id: string; title: string; priority: number } => Boolean(hint)
        )
        .map((hint) => ({
          title: hint.title,
          priority: hint.priority,
        }))
    )
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 16)

    const key = mappedTask.name.toLowerCase()
    const existing = byNameLower.get(key)

    if (!existing || confidence > existing.confidence) {
      byNameLower.set(key, {
        name: mappedTask.name,
        priority,
        confidence,
        reasons: [],
        sub_tasks,
      })
    }
  }

  const main_tasks = Array.from(byNameLower.values())
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12)

  const response: SuccessResponse = {
    main_tasks,
    dimensions,
    raw,
  }

  return NextResponse.json(response)
}
