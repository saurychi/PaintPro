import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/planning/material-estimation-rule
//
// Inserts a row into material_estimation_rules linking an existing
// formula_template to a main_task. Used by the Add Main Task modal
// after it creates the main_task, so the admin's formula choice
// actually persists as a real rule instead of being captured in
// state and discarded.
//
// Duration formulas bind to sub_tasks (not main_tasks) so they
// can't be created here. Caller checks the formula's scope before
// calling this route; we additionally re-validate server-side and
// reject if the chosen formula is duration-scoped.

async function getAuthUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    const role = String(caller?.role ?? "").toLowerCase();
    const callerStatus = String(caller?.status ?? "").toLowerCase();
    if (
      callerStatus !== "active" ||
      (role !== "admin" && role !== "manager")
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const mainTaskId = String(body?.mainTaskId ?? "").trim();
    const formulaTemplateId = String(body?.formulaTemplateId ?? "").trim();
    const materialName = String(body?.materialName ?? "").trim();
    const minimumQuantity = Number(body?.minimumQuantity ?? 0);
    const isActive = body?.isActive !== false;

    if (!mainTaskId) {
      return NextResponse.json(
        { error: "mainTaskId is required." },
        { status: 400 },
      );
    }
    if (!formulaTemplateId) {
      return NextResponse.json(
        { error: "formulaTemplateId is required." },
        { status: 400 },
      );
    }
    if (!materialName) {
      return NextResponse.json(
        { error: "materialName is required." },
        { status: 400 },
      );
    }

    // Reject duration formulas. material_estimation_rules is for
    // material-scope formulas; duration formulas live in
    // task_duration_rules and need a sub_task_id we don't have.
    const { data: formula, error: formulaError } = await supabaseAdmin
      .from("formula_templates")
      .select("formula_scope")
      .eq("formula_template_id", formulaTemplateId)
      .maybeSingle();
    if (formulaError) {
      return NextResponse.json(
        {
          error: "Failed to read formula.",
          details: formulaError.message,
        },
        { status: 500 },
      );
    }
    if (!formula) {
      return NextResponse.json(
        { error: "Formula not found." },
        { status: 404 },
      );
    }
    if (formula.formula_scope !== "material") {
      return NextResponse.json(
        {
          error:
            "Only material-scope formulas can be linked to a main task here. Duration formulas attach to sub-tasks via Edit Estimations.",
        },
        { status: 400 },
      );
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("material_estimation_rules")
      .insert({
        main_task_id: mainTaskId,
        sub_task_id: null,
        formula_template_id: formulaTemplateId,
        material_name: materialName,
        minimum_quantity: Number.isFinite(minimumQuantity)
          ? Math.max(minimumQuantity, 0)
          : 0,
        is_active: isActive,
      })
      .select("material_rule_id")
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          error: "Failed to create material estimation rule.",
          details: insertError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      materialRuleId: inserted?.material_rule_id ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error creating material estimation rule.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Shared role + auth gate used by PATCH / DELETE below.
async function requireAdminOrManager() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { data: caller } = await supabaseAdmin
    .from("users")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();
  const role = String(caller?.role ?? "").toLowerCase();
  const callerStatus = String(caller?.status ?? "").toLowerCase();
  if (
    callerStatus !== "active" ||
    (role !== "admin" && role !== "manager")
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

// PATCH /api/planning/material-estimation-rule
//
// Edit an existing material_estimation_rules row. Identified by
// materialRuleId. Allowed updates: materialName, minimumQuantity,
// isActive, formulaTemplateId (if you want to point the rule at a
// different formula). main_task_id is intentionally NOT editable
// here. If you need to move a rule between main tasks, delete and
// recreate so the audit trail is clear.
export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireAdminOrManager();
    if (gate) return gate;

    const body = await request.json().catch(() => null);
    const materialRuleId = String(body?.materialRuleId ?? "").trim();
    if (!materialRuleId) {
      return NextResponse.json(
        { error: "materialRuleId is required." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.materialName === "string") {
      const trimmed = body.materialName.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "materialName cannot be empty." },
          { status: 400 },
        );
      }
      updates.material_name = trimmed;
    }

    if (body.minimumQuantity !== undefined) {
      const value = Number(body.minimumQuantity);
      if (!Number.isFinite(value)) {
        return NextResponse.json(
          { error: "minimumQuantity must be a finite number." },
          { status: 400 },
        );
      }
      updates.minimum_quantity = Math.max(value, 0);
    }

    if (body.isActive !== undefined) {
      updates.is_active = body.isActive !== false;
    }

    if (body.formulaTemplateId !== undefined) {
      const newFormulaId = String(body.formulaTemplateId).trim();
      if (!newFormulaId) {
        return NextResponse.json(
          { error: "formulaTemplateId cannot be empty." },
          { status: 400 },
        );
      }
      // Verify the new formula is material-scope before swapping.
      const { data: formula, error: formulaError } = await supabaseAdmin
        .from("formula_templates")
        .select("formula_scope")
        .eq("formula_template_id", newFormulaId)
        .maybeSingle();
      if (formulaError) {
        return NextResponse.json(
          { error: "Failed to read formula.", details: formulaError.message },
          { status: 500 },
        );
      }
      if (!formula) {
        return NextResponse.json(
          { error: "Formula not found." },
          { status: 404 },
        );
      }
      if (formula.formula_scope !== "material") {
        return NextResponse.json(
          {
            error:
              "Only material-scope formulas can be attached to material_estimation_rules.",
          },
          { status: 400 },
        );
      }
      updates.formula_template_id = newFormulaId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields supplied to update." },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("material_estimation_rules")
      .update(updates)
      .eq("material_rule_id", materialRuleId);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update material estimation rule.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, materialRuleId });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error updating material estimation rule.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/planning/material-estimation-rule
//
// Remove a material_estimation_rules row. Body needs materialRuleId.
// Doesn't touch the underlying formula or main_task. Use this when
// the link between a formula and a main task should be severed.
export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireAdminOrManager();
    if (gate) return gate;

    const body = await request.json().catch(() => null);
    const materialRuleId = String(body?.materialRuleId ?? "").trim();
    if (!materialRuleId) {
      return NextResponse.json(
        { error: "materialRuleId is required." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("material_estimation_rules")
      .delete()
      .eq("material_rule_id", materialRuleId);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to delete material estimation rule.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, materialRuleId });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error deleting material estimation rule.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
