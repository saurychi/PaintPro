import { NextResponse } from "next/server";

const ONE_DAY_SECONDS = 60 * 60 * 24;

type NagerCountry = {
  countryCode: string;
  name: string;
};

export async function GET() {
  try {
    const upstream = await fetch(
      "https://date.nager.at/api/v3/AvailableCountries",
      { next: { revalidate: ONE_DAY_SECONDS } },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: "Failed to load supported countries.",
          status: upstream.status,
        },
        { status: 502 },
      );
    }

    const payload = (await upstream.json()) as NagerCountry[];

    const countries = (Array.isArray(payload) ? payload : [])
      .map((c) => ({ code: c.countryCode, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { countries },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${ONE_DAY_SECONDS}, stale-while-revalidate=${ONE_DAY_SECONDS}`,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load supported countries.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
