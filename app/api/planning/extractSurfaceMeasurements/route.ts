import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { openRouterChat } from "@/lib/ai/openrouter";

type SurfaceOption = {
  presetKey: string;
  label: string;
  unit: string;
};

function isObj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonObject(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    throw new Error("AI returned an empty response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("AI did not return a JSON object.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
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

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const bodyObj = isObj(body) ? body : null;
    const messageText = String(bodyObj?.messageText || "").trim();
    const rawSurfaces = Array.isArray(bodyObj?.surfaces) ? bodyObj.surfaces : [];
    const surfaces: SurfaceOption[] = rawSurfaces
      .map((surface: unknown) => {
        const candidate = isObj(surface) ? surface : {};

        return {
          presetKey: String(candidate.presetKey || "").trim(),
          label: String(candidate.label || "").trim(),
          unit: String(candidate.unit || "").trim(),
        };
      })
      .filter((surface) =>
        Boolean(surface.presetKey && surface.label && surface.unit),
      );

    if (!messageText) {
      return NextResponse.json(
        { error: "Message text is required." },
        { status: 400 },
      );
    }

    if (surfaces.length === 0) {
      return NextResponse.json(
        { error: "At least one configured surface is required." },
        { status: 400 },
      );
    }

    const prompt = `
Extract measurement values from the employee message below.

Only use the configured surfaces listed here:
${surfaces
  .map(
    (surface, index) =>
      `${index + 1}. presetKey=${surface.presetKey}; label=${surface.label}; unit=${surface.unit}`,
  )
  .join("\n")}

Rules:
- Match only to the configured surfaces above.
- Extract only numbers that clearly describe a configured surface measurement.
- Ignore phone numbers, dates, message counts, room counts, or unrelated numbers.
- If a surface has no clear measurement in the message, omit it.
- If the same surface appears more than once, keep the clearest final value.
- Return strict JSON only.
- Use this shape exactly:
{
  "measurements": [
    {
      "presetKey": "configured_surface_key",
      "estimatedValue": 123
    }
  ]
}

Employee message:
${messageText}
`.trim();

    const rawResult = await openRouterChat(
      [
        {
          role: "system",
          content:
            "You extract structured surface measurements for a painting job and return strict JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        temperature: 0,
        maxTokens: 300,
        title: "PaintPro Surface Measurement Extraction",
      },
    );

    const parsed = extractJsonObject(rawResult);
    const allowedPresetKeys = new Set(surfaces.map((surface) => surface.presetKey));

    const parsedMeasurements =
      isObj(parsed) && Array.isArray(parsed.measurements)
        ? parsed.measurements
        : [];

    const measurements = parsedMeasurements
          .map((measurement: unknown) => {
            const candidate = isObj(measurement) ? measurement : {};

            return {
              presetKey: String(candidate.presetKey || "").trim(),
              estimatedValue: Number(candidate.estimatedValue),
            };
          })
          .filter(
            (measurement) =>
              Boolean(measurement.presetKey) &&
              allowedPresetKeys.has(measurement.presetKey) &&
              Number.isFinite(measurement.estimatedValue) &&
              measurement.estimatedValue >= 0,
          );

    return NextResponse.json({ measurements });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to extract surface measurements.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
