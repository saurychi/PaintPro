import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  SurfaceScalePresets,
  SurfaceUnit,
} from "@/lib/planning/surfacePresets";

type SurfacePresetRow = {
  surface_key: string;
  label: string;
  unit: SurfaceUnit;

  small_min: number;
  small_max: number;
  small_suggested: number;
  small_label: string;

  medium_min: number;
  medium_max: number;
  medium_suggested: number;
  medium_label: string;

  large_min: number;
  large_max: number;
  large_suggested: number;
  large_label: string;
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("surface_scale_presets")
      .select(
        `
        surface_key,
        label,
        unit,
        small_min,
        small_max,
        small_suggested,
        small_label,
        medium_min,
        medium_max,
        medium_suggested,
        medium_label,
        large_min,
        large_max,
        large_suggested,
        large_label
      `,
      )
      .order("label", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch surface scale presets.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as SurfacePresetRow[];

    const surfaceScalePresets = rows.reduce<SurfaceScalePresets>((acc, row) => {
      acc[row.surface_key] = {
        key: row.surface_key,
        label: row.label,
        unit: row.unit,
        bands: {
          small: {
            min: Number(row.small_min),
            max: Number(row.small_max),
            suggested: Number(row.small_suggested),
            label: row.small_label,
          },
          medium: {
            min: Number(row.medium_min),
            max: Number(row.medium_max),
            suggested: Number(row.medium_suggested),
            label: row.medium_label,
          },
          large: {
            min: Number(row.large_min),
            max: Number(row.large_max),
            suggested: Number(row.large_suggested),
            label: row.large_label,
          },
        },
      };

      return acc;
    }, {});

    return NextResponse.json({
      surfaceScalePresets,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Unexpected error while fetching surface scale presets.",
        details: message,
      },
      { status: 500 },
    );
  }
}
