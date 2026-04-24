import { NextResponse } from "next/server";
import { openRouterChat } from "@/lib/ai/openrouter";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const description = String(body?.description || "").trim();
    const clientName = String(body?.clientName || "").trim();
    const address = String(body?.address || "").trim();

    if (!description || !clientName || !address) {
      return NextResponse.json(
        { error: "Description, client name, and address are required." },
        { status: 400 },
      );
    }

    const prompt = `
Generate a short project name for a painting and decorating job.

Required format:
2-3 word description - Client, Address

Rules:
- The first part must be only 2 to 3 words
- It must sound like a painting/decorating project
- Then add: " - "
- Then output: client name, short address
- Keep the address short and readable, not the full long address unless needed
- No quotation marks
- No extra explanation
- Output only one final project name

Description:
${description}

Client:
${clientName}

Address:
${address}
`.trim();

    const result = await openRouterChat(
      [
        {
          role: "system",
          content:
            "You generate short, clean project names for a painting and decorating business.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        temperature: 0.2,
        maxTokens: 40,
      },
    );

    const projectName = String(result || "")
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .trim();

    if (!projectName) {
      return NextResponse.json(
        { error: "Failed to generate project name." },
        { status: 500 },
      );
    }

    return NextResponse.json({ projectName });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to generate project name.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
