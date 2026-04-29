import { NextRequest, NextResponse } from "next/server";

import {
  type EstimationFormulaVariable,
  type EstimationFormulaVariablePayload,
  type EstimationVariableDataType,
  isEstimationVariableDataType,
} from "@/lib/estimationSettings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FormulaVariableRow = {
  formula_variable_id: string;
  formula_template_id: string | null;
  variable_key: string | null;
  label: string | null;
  description: string | null;
  data_type: string | null;
  default_value: string | number | boolean | null;
  unit: string | null;
  is_required: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown) {
  return value !== false;
}

function normalizeDataType(
  value: unknown,
): EstimationVariableDataType | null {
  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();

  if (!isEstimationVariableDataType(trimmedValue)) return null;

  return trimmedValue;
}

function mapFormulaVariableRow(row: FormulaVariableRow): EstimationFormulaVariable {
  return {
    formula_variable_id: row.formula_variable_id,
    formula_template_id: normalizeString(row.formula_template_id),
    variable_key: normalizeString(row.variable_key),
    label: normalizeString(row.label),
    description: normalizeString(row.description),
    data_type: normalizeDataType(row.data_type) ?? "number",
    default_value:
      row.default_value === null || row.default_value === undefined
        ? ""
        : String(row.default_value),
    unit: normalizeString(row.unit),
    is_required: row.is_required !== false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function parsePayloadObject(
  body: Partial<EstimationFormulaVariablePayload>,
) {
  const formulaTemplateId = normalizeString(body.formulaTemplateId);
  const variableKey = normalizeString(body.variableKey);
  const label = normalizeString(body.label);
  const description = normalizeString(body.description);
  const dataType = normalizeDataType(body.dataType);
  const defaultValue =
    body.defaultValue === undefined || body.defaultValue === null
      ? ""
      : String(body.defaultValue).trim();
  const unit = normalizeString(body.unit);
  const isRequired = normalizeBoolean(body.isRequired);

  if (!formulaTemplateId) {
    return NextResponse.json(
      { error: "Formula template is required." },
      { status: 400 },
    );
  }

  if (!variableKey) {
    return NextResponse.json(
      { error: "Variable key is required." },
      { status: 400 },
    );
  }

  if (!label) {
    return NextResponse.json(
      { error: "Variable label is required." },
      { status: 400 },
    );
  }

  if (!dataType) {
    return NextResponse.json(
      { error: "Variable data type is invalid." },
      { status: 400 },
    );
  }

  return {
    formulaTemplateId,
    variableKey,
    label,
    description,
    dataType,
    defaultValue,
    unit,
    isRequired,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EstimationFormulaVariablePayload>;
    const payload = parsePayloadObject(body);
    if (payload instanceof NextResponse) return payload;

    const { data, error } = await supabaseAdmin
      .from("formula_variables")
      .insert({
        formula_template_id: payload.formulaTemplateId,
        variable_key: payload.variableKey,
        label: payload.label,
        description: payload.description,
        data_type: payload.dataType,
        default_value: payload.defaultValue,
        unit: payload.unit,
        is_required: payload.isRequired,
      })
      .select(
        "formula_variable_id, formula_template_id, variable_key, label, description, data_type, default_value, unit, is_required, created_at, updated_at",
      )
      .single<FormulaVariableRow>();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to create formula variable.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      variable: mapFormulaVariableRow(data),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating formula variable.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<
      EstimationFormulaVariablePayload & { formulaVariableId: string }
    >;
    const formulaVariableId = normalizeString(body.formulaVariableId);

    if (!formulaVariableId) {
      return NextResponse.json(
        { error: "Formula variable ID is required." },
        { status: 400 },
      );
    }

    const payload = parsePayloadObject(body);
    if (payload instanceof NextResponse) return payload;

    const { data, error } = await supabaseAdmin
      .from("formula_variables")
      .update({
        formula_template_id: payload.formulaTemplateId,
        variable_key: payload.variableKey,
        label: payload.label,
        description: payload.description,
        data_type: payload.dataType,
        default_value: payload.defaultValue,
        unit: payload.unit,
        is_required: payload.isRequired,
      })
      .eq("formula_variable_id", formulaVariableId)
      .select(
        "formula_variable_id, formula_template_id, variable_key, label, description, data_type, default_value, unit, is_required, created_at, updated_at",
      )
      .maybeSingle<FormulaVariableRow>();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update formula variable.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Formula variable was not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      variable: mapFormulaVariableRow(data),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while updating formula variable.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { formulaVariableId?: unknown };
    const formulaVariableId = normalizeString(body.formulaVariableId);

    if (!formulaVariableId) {
      return NextResponse.json(
        { error: "Formula variable ID is required." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("formula_variables")
      .delete()
      .eq("formula_variable_id", formulaVariableId);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to delete formula variable.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while deleting formula variable.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
