import { NextRequest, NextResponse } from "next/server";

const ONE_DAY_SECONDS = 60 * 60 * 24;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const YEAR_PATTERN = /^\d{4}$/;

type NagerHoliday = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
  types?: string[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "").toUpperCase();
  const year = searchParams.get("year") || String(new Date().getFullYear());

  if (!COUNTRY_CODE_PATTERN.test(country)) {
    return NextResponse.json(
      { error: "Invalid country code. Expected ISO 3166-1 alpha-2." },
      { status: 400 },
    );
  }

  if (!YEAR_PATTERN.test(year)) {
    return NextResponse.json(
      { error: "Invalid year." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
      { next: { revalidate: ONE_DAY_SECONDS } },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: "Failed to load holidays.",
          status: upstream.status,
        },
        { status: 502 },
      );
    }

    const payload = (await upstream.json()) as NagerHoliday[];

    const holidays = (Array.isArray(payload) ? payload : []).map((h) => ({
      date: h.date,
      name: h.localName || h.name,
    }));

    return NextResponse.json(
      {
        country,
        year: Number(year),
        holidays,
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${ONE_DAY_SECONDS}, stale-while-revalidate=${ONE_DAY_SECONDS}`,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load holidays.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
