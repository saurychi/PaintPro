import { NextResponse } from "next/server";
import { Parser } from "expr-eval";
import {
  computeAreasFromDimensions,
  type ProjectDimensions,
} from "@/lib/planning/materialEstimator";
import { buildAreaVariableMapFromSummary } from "@/lib/planning/areaVariables";
import {
  clampMinimumHours,
  getAdjustedDurationHours,
  getRequiredEmployeeCountFromLaborHours,
  roundToQuarterHour,
} from "@/lib/planning/workforceMath";
import { getPlanningCatalog } from "@/lib/planning/catalogCache";

// Batched counterpart to /api/planning/getDuration. Resolves every
// (taskName, subTaskTitle) pair against the in-memory planning catalog
// and evaluates each formula locally — zero DB round-trips on cache hit.

type Item = { taskName: string; subTaskTitle: string };

type DurationOut = {
  mainTaskId: string;
  subTaskId: string;
  baseLaborHours: number;
  requiredEmployeeCount: number;
  adjustedDurationHours: number;
  roundedHours: number;
  estimatedHours: number;
  minimumHours: number;
  formula: string;
  scope: Record<string, number>;
  productivityHoursPerEmployee: number;
  teamEfficiencyFactor: number;
};

type ResultEntry = {
  taskName: string;
  subTaskTitle: string;
  duration: DurationOut | null;
  error: string | null;
};

const parser = new Parser();

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isObj(body) || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "Body must be { items: Array<{ taskName, subTaskTitle }>, dimensions? }." },
      { status: 400 },
    );
  }

  const dimensions: ProjectDimensions | null =
    "dimensions" in body
      ? ((body.dimensions as ProjectDimensions | null) ?? null)
      : null;

  const items: Item[] = (body.items as unknown[])
    .filter(isObj)
    .map((raw) => ({
      taskName: typeof raw.taskName === "string" ? raw.taskName.trim() : "",
      subTaskTitle:
        typeof raw.subTaskTitle === "string" ? raw.subTaskTitle.trim() : "",
    }))
    .filter((item) => item.taskName && item.subTaskTitle);

  if (items.length === 0) {
    return NextResponse.json({ results: [] });
  }

  let catalog;
  try {
    catalog = await getPlanningCatalog();
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load planning catalog.", details: e?.message },
      { status: 500 },
    );
  }

  const areas = computeAreasFromDimensions(dimensions);
  const areaMap = buildAreaVariableMapFromSummary(
    areas as Record<string, number | null | undefined>,
  );

  const results: ResultEntry[] = items.map((item) => {
    const mainTask = catalog.mainTasksByName.get(item.taskName);
    if (!mainTask) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        duration: null,
        error: `No active main task for "${item.taskName}".`,
      };
    }
    const subTask = catalog.subTasksByPair.get(
      `${mainTask.id}::${item.subTaskTitle.toLowerCase()}`,
    );
    if (!subTask) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        duration: null,
        error: `No active sub task for "${item.subTaskTitle}".`,
      };
    }
    const rule = catalog.durationRulesByPair.get(
      `${mainTask.id}::${subTask.id}`,
    );
    if (!rule) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        duration: null,
        error: "No duration rule.",
      };
    }
    const template = catalog.formulaTemplatesById.get(rule.formulaTemplateId);
    if (!template) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        duration: null,
        error: "Missing formula template.",
      };
    }

    const scope: Record<string, number> = {};
    for (const v of catalog.formulaVariablesByTemplateId.get(template.id) ??
      []) {
      const fromArea = areaMap[v.variableKey];
      if (fromArea !== undefined && fromArea !== 0) {
        scope[v.variableKey] = fromArea;
      } else {
        const fallback = Number(v.defaultValue ?? 0);
        scope[v.variableKey] = Number.isFinite(fallback) ? fallback : 0;
      }
    }
    for (const [key, value] of Object.entries(areaMap)) {
      if (!(key in scope)) scope[key] = value;
    }

    let value = 0;
    try {
      const parsed = parser.parse(template.expression);
      const raw = parsed.evaluate(scope);
      value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    } catch (e: any) {
      return {
        taskName: item.taskName,
        subTaskTitle: item.subTaskTitle,
        duration: null,
        error: `Failed to evaluate formula: ${e?.message ?? e}`,
      };
    }

    const minimumHours =
      rule.minimumHours != null && Number.isFinite(rule.minimumHours)
        ? Math.max(rule.minimumHours, 0)
        : 0.25;

    const baseLaborHours = clampMinimumHours(value, minimumHours);
    const requiredEmployeeCount =
      getRequiredEmployeeCountFromLaborHours(baseLaborHours);
    const {
      adjustedDurationHours,
      productivityHoursPerEmployee,
      teamEfficiencyFactor,
    } = getAdjustedDurationHours({
      laborHours: baseLaborHours,
      employeeCount: requiredEmployeeCount,
    });
    const estimatedHours = roundToQuarterHour(adjustedDurationHours);

    return {
      taskName: item.taskName,
      subTaskTitle: item.subTaskTitle,
      duration: {
        mainTaskId: mainTask.id,
        subTaskId: subTask.id,
        baseLaborHours,
        requiredEmployeeCount,
        adjustedDurationHours,
        roundedHours: estimatedHours,
        estimatedHours,
        minimumHours,
        formula: template.expression,
        scope,
        productivityHoursPerEmployee,
        teamEfficiencyFactor,
      },
      error: null,
    };
  });

  return NextResponse.json({ results });
}
