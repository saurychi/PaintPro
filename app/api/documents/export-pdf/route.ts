import { NextResponse } from "next/server"
import { chromium } from "playwright"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

function safeFilename(value: string) {
  return value
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
}

export async function GET(request: Request) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    const url = new URL(request.url)
    const documentId = url.searchParams.get("documentId")

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId." }, { status: 400 })
    }

    const { data: document, error } = await supabaseAdmin
      .from("documents")
      .select("document_id, title, content, content_type")
      .eq("document_id", documentId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 })
    }

    if (document.content_type !== "text/html") {
      return NextResponse.json(
        { error: "Only HTML documents can be exported as PDF." },
        { status: 400 }
      )
    }

    browser = await chromium.launch({ headless: true })

    const page = await browser.newPage({
      viewport: {
        width: 1200,
        height: 1600,
      },
    })

    await page.setContent(document.content || "", {
      waitUntil: "networkidle",
    })

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    })

    const filename = `${safeFilename(document.title || "document")}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to export document PDF.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
