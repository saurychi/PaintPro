// src/app/api/francis/quotation/calculate/route.ts
import { NextResponse } from "next/server";

type CalcRequest = {
  lengthM: number;
  widthM: number;
  heightM: number;
  coats: number;
  workers: number;
  durationDays: number;
  coverage: number; // m2 per litre per coat
  paintPrice: number; // $ per litre
  hourlyRate: number; // $ per hour per worker
  tasksText: string; // newline-separated tasks; supports "Task name - description" or just "description"
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CalcRequest;

    const {
      lengthM,
      widthM,
      heightM,
      coats,
      workers,
      durationDays,
      coverage,
      paintPrice,
      hourlyRate,
      tasksText,
    } = body;

    // Basic validation
    if (
      lengthM <= 0 ||
      widthM <= 0 ||
      heightM <= 0 ||
      coats <= 0 ||
      workers <= 0 ||
      durationDays <= 0 ||
      coverage <= 0 ||
      paintPrice < 0 ||
      hourlyRate < 0
    ) {
      return NextResponse.json(
        { error: "One or more inputs are invalid or non-positive." },
        { status: 400 }
      );
    }

    // 1. Area calculations
    const wallArea = 2 * (lengthM + widthM) * heightM; // m2
    const ceilingArea = lengthM * widthM; // m2
    const totalArea = wallArea + ceilingArea;

    // 2. Paint quantity
    const litresNeeded = (totalArea * coats) / coverage;

    // 3. Material & labour cost
    const materialCost = litresNeeded * paintPrice;
    const labourHours = durationDays * 8; // assume 8 hours per day
    const labourCost = workers * hourlyRate * labourHours;

    const baseCost = materialCost + labourCost;
    const markupPercent = 0.2; // 20% profit/overheads
    const totalCost = baseCost * (1 + markupPercent);

    // 4. Build task rows from textarea
    // Each line can be either:
    //   "Task name - description"  -> title + description
    //   "Just a description"       -> description only, title empty
    const lines = tasksText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const perLine = lines.length > 0 ? totalCost / lines.length : totalCost;

    const rows =
      lines.length > 0
        ? lines.map((line) => {
            const [rawTitle, ...rest] = line.split(" - ");
            const maybeTitle = rawTitle?.trim() || "";
            const maybeDesc = rest.join(" - ").trim();

            // If user wrote "Task - desc", we use title + desc.
            // If user wrote only "desc", we treat it as description only.
            const title = maybeDesc ? maybeTitle : "";
            const description = maybeDesc || maybeTitle;

            return {
              title,
              description,
              price: perLine,
            };
          })
        : [
            {
              title: "Painting & Decorating",
              description:
                "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
              price: totalCost,
            },
          ];

    const section = {
      sectionLabel: "Painting & Decorating",
      rows,
      total: totalCost,
    };

    return NextResponse.json({
      totalArea,
      wallArea,
      ceilingArea,
      litresNeeded,
      materialCost,
      labourCost,
      totalCost,
      section,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to calculate quotation." },
      { status: 500 }
    );
  }
}
