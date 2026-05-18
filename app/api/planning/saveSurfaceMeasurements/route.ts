import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type IncomingMeasurement = {
  surfaceKey?: string;
  estimatedValue?: number;
};

type ScaledField = {
  presetKey: string;
  estimatedValue?: number;
  notes?: string;
};

type CodeOwner =
  | { table: "projects"; id: string; dimensions: unknown }
  | { table: "drafts"; id: string; dimensions: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

// Resolve a code to whichever row owns it. Projects are checked first
// because the conversation pages we receive measurements from are
// typically post-promotion (the wizard's draft has already been
// promoted into a project, conversations.project_id is set). The
// drafts table is the fallback for the pre-promotion case where the
// admin started the conversation while basic-details was still open.
async function resolveOwner(code: string): Promise<CodeOwner | null> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("project_id, dimensions")
    .eq("project_code", code)
    .maybeSingle<{ project_id: string; dimensions: unknown }>();
  if (project) {
    return {
      table: "projects",
      id: project.project_id,
      dimensions: project.dimensions,
    };
  }
  const { data: draft } = await supabaseAdmin
    .from("drafts")
    .select("draft_id, dimensions")
    .eq("draft_code", code)
    .maybeSingle<{ draft_id: string; dimensions: unknown }>();
  if (draft) {
    return {
      table: "drafts",
      id: draft.draft_id,
      dimensions: draft.dimensions,
    };
  }
  return null;
}

// Merges Measure Generator rows into the dimensions.scaled map of either
// a draft or a project, whichever owns the supplied code. Surface keys
// not yet present are created; keys that exist are overwritten.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = typeof body?.projectCode === "string"
      ? body.projectCode.trim()
      : "";
    const measurements = Array.isArray(body?.measurements)
      ? (body.measurements as IncomingMeasurement[])
      : [];

    if (!code) {
      return NextResponse.json(
        { error: "Missing projectCode." },
        { status: 400 },
      );
    }

    if (measurements.length === 0) {
      return NextResponse.json(
        { error: "No measurements provided." },
        { status: 400 },
      );
    }

    const owner = await resolveOwner(code);
    if (!owner) {
      return NextResponse.json(
        { error: `No project or draft found with code "${code}".` },
        { status: 404 },
      );
    }

    const existingDimensions = isPlainObject(owner.dimensions)
      ? (owner.dimensions as { scaled?: Record<string, ScaledField>; notes?: string })
      : {};
    const existingScaled: Record<string, ScaledField> = isPlainObject(
      existingDimensions.scaled,
    )
      ? { ...(existingDimensions.scaled as Record<string, ScaledField>) }
      : {};

    const updatedKeys: string[] = [];
    const createdKeys: string[] = [];

    for (const m of measurements) {
      const key = typeof m?.surfaceKey === "string" ? m.surfaceKey : "";
      if (!key) continue;
      const numericValue = Number(m?.estimatedValue);
      if (!Number.isFinite(numericValue)) continue;

      const existing = existingScaled[key];

      existingScaled[key] = {
        ...(existing ?? {}),
        presetKey: existing?.presetKey || key,
        estimatedValue: numericValue,
      };
      if (existing) {
        updatedKeys.push(key);
      } else {
        createdKeys.push(key);
      }
    }

    if (updatedKeys.length === 0 && createdKeys.length === 0) {
      return NextResponse.json(
        { error: "No valid measurements provided." },
        { status: 400 },
      );
    }

    const nextDimensions = {
      ...existingDimensions,
      scaled: existingScaled,
    };

    const idColumn = owner.table === "projects" ? "project_id" : "draft_id";
    const { error: updateError } = await supabaseAdmin
      .from(owner.table)
      .update({
        dimensions: nextDimensions,
        updated_at: new Date().toISOString(),
      })
      .eq(idColumn, owner.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to save measurements.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      ownerTable: owner.table,
      ownerId: owner.id,
      updatedKeys,
      createdKeys,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving surface measurements.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
