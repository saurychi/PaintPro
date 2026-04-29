import { NextRequest, NextResponse } from "next/server";

import {
  type EstimationFormulaTemplate,
  type EstimationFormulaTemplatePayload,
  type EstimationFormulaScope,
  isEstimationFormulaScope,
} from "@/lib/estimationSettings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FormulaTemplateRow = {
  formula_template_id: string;
  formula_key: string | null;
  name: string | null;
  description: string | null;
  formula_scope: string | null;
  formula_expression: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScope(value: unknown): EstimationFormulaScope | null {
  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();

  if (!isEstimationFormulaScope(trimmedValue)) return null;

  return trimmedValue;
}

function normalizeBoolean(value: unknown) {
  return value !== false;
}

function mapFormulaTemplateRow(row: FormulaTemplateRow): EstimationFormulaTemplate {
  return {
    formula_template_id: row.formula_template_id,
    formula_key: normalizeString(row.formula_key),
    name: normalizeString(row.name),
    description: normalizeString(row.description),
    formula_scope: normalizeScope(row.formula_scope) ?? "duration",
    formula_expression: normalizeString(row.formula_expression),
    is_active: row.is_active !== false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    variables: [],
    material_rule_count: 0,
    duration_rule_count: 0,
    total_rule_count: 0,
    sample_usage: null,
  };
}

function parsePayloadObject(body: Partial<EstimationFormulaTemplatePayload>) {
  const formulaKey = normalizeString(body.formulaKey);
  const name = normalizeString(body.name);
  const description = normalizeString(body.description);
  const formulaScope = normalizeScope(body.formulaScope);
  const formulaExpression = normalizeString(body.formulaExpression);
  const isActive = normalizeBoolean(body.isActive);

  if (!formulaKey) {
    return NextResponse.json(
      { error: "Formula key is required." },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "Formula name is required." },
      { status: 400 },
    );
  }

  if (!formulaScope) {
    return NextResponse.json(
      { error: "Formula scope must be either duration or material." },
      { status: 400 },
    );
  }

  if (!formulaExpression) {
    return NextResponse.json(
      { error: "Formula expression is required." },
      { status: 400 },
    );
  }

  return {
    formulaKey,
    name,
    description,
    formulaScope,
    formulaExpression,
    isActive,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EstimationFormulaTemplatePayload>;
    const payload = parsePayloadObject(body);
    if (payload instanceof NextResponse) return payload;

    const { data, error } = await supabaseAdmin
      .from("formula_templates")
      .insert({
        formula_key: payload.formulaKey,
        name: payload.name,
        description: payload.description,
        formula_scope: payload.formulaScope,
        formula_expression: payload.formulaExpression,
        is_active: payload.isActive,
      })
      .select(
        "formula_template_id, formula_key, name, description, formula_scope, formula_expression, is_active, created_at, updated_at",
      )
      .single<FormulaTemplateRow>();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to create formula template.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      formula: mapFormulaTemplateRow(data),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating formula template.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<
      EstimationFormulaTemplatePayload & { formulaTemplateId: string }
    >;
    const formulaTemplateId = normalizeString(body.formulaTemplateId);

    if (!formulaTemplateId) {
      return NextResponse.json(
        { error: "Formula template ID is required." },
        { status: 400 },
      );
    }

    const payload = parsePayloadObject(body);
    if (payload instanceof NextResponse) return payload;

    const { data, error } = await supabaseAdmin
      .from("formula_templates")
      .update({
        formula_key: payload.formulaKey,
        name: payload.name,
        description: payload.description,
        formula_scope: payload.formulaScope,
        formula_expression: payload.formulaExpression,
        is_active: payload.isActive,
      })
      .eq("formula_template_id", formulaTemplateId)
      .select(
        "formula_template_id, formula_key, name, description, formula_scope, formula_expression, is_active, created_at, updated_at",
      )
      .maybeSingle<FormulaTemplateRow>();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update formula template.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Formula template was not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      formula: mapFormulaTemplateRow(data),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while updating formula template.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { formulaTemplateId?: unknown };
    const formulaTemplateId = normalizeString(body.formulaTemplateId);

    if (!formulaTemplateId) {
      return NextResponse.json(
        { error: "Formula template ID is required." },
        { status: 400 },
      );
    }

    const [materialUsageResult, durationUsageResult] = await Promise.all([
      supabaseAdmin
        .from("material_estimation_rules")
        .select("material_rule_id", { count: "exact", head: true })
        .eq("formula_template_id", formulaTemplateId),
      supabaseAdmin
        .from("task_duration_rules")
        .select("duration_rule_id", { count: "exact", head: true })
        .eq("formula_template_id", formulaTemplateId),
    ]);

    if (materialUsageResult.error) {
      return NextResponse.json(
        {
          error: "Failed to check material rule usage.",
          details: materialUsageResult.error.message,
        },
        { status: 500 },
      );
    }

    if (durationUsageResult.error) {
      return NextResponse.json(
        {
          error: "Failed to check duration rule usage.",
          details: durationUsageResult.error.message,
        },
        { status: 500 },
      );
    }

    const materialUsageCount = materialUsageResult.count ?? 0;
    const durationUsageCount = durationUsageResult.count ?? 0;

    if (materialUsageCount > 0 || durationUsageCount > 0) {
      return NextResponse.json(
        {
          error:
            "This formula is still referenced by estimation rules. Remove or reassign those rules before deleting it.",
        },
        { status: 409 },
      );
    }

    const deleteVariablesResult = await supabaseAdmin
      .from("formula_variables")
      .delete()
      .eq("formula_template_id", formulaTemplateId);

    if (deleteVariablesResult.error) {
      return NextResponse.json(
        {
          error: "Failed to delete formula variables.",
          details: deleteVariablesResult.error.message,
        },
        { status: 500 },
      );
    }

    const deleteFormulaResult = await supabaseAdmin
      .from("formula_templates")
      .delete()
      .eq("formula_template_id", formulaTemplateId);

    if (deleteFormulaResult.error) {
      return NextResponse.json(
        {
          error: "Failed to delete formula template.",
          details: deleteFormulaResult.error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while deleting formula template.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
