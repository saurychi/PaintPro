// src/app/api/francis/quotation/pdf/route.ts
import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

type QuotationRow = {
  title?: string;
  description: string;
  price: number;
};

type QuotationSection = {
  sectionLabel: string;
  rows: QuotationRow[];
  total: number;
};

type QuotationPayload = {
  quoteNumber: string;
  jobName: string;
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  items: QuotationSection[];
  grandTotal: number;
};

type SummaryPayload = {
  totalArea: number;
  wallArea: number;
  ceilingArea: number;
  litresNeeded: number;
  materialCost: number;
  labourCost: number;
  totalCost: number;
} | null;

export async function POST(req: Request) {
  try {
    const { quotation, summary } = (await req.json()) as {
      quotation: QuotationPayload;
      summary?: SummaryPayload;
    };

    if (!quotation) {
      return NextResponse.json(
        { error: "Missing quotation data" },
        { status: 400 }
      );
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // landscape A4
    const { width, height } = page.getSize();

    const margin = 40;

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const bannerHeight = 120;
    const bannerX = margin;
    const bannerY = height - margin - bannerHeight;

    // Gradient-ish banner: dark rectangle + green strip
    page.drawRectangle({
      x: bannerX,
      y: bannerY,
      width: width - margin * 2,
      height: bannerHeight,
      color: rgb(0.15, 0.18, 0.2),
    });

    page.drawRectangle({
      x: bannerX + (width - margin * 2) * 0.6,
      y: bannerY,
      width: (width - margin * 2) * 0.4,
      height: 25,
      color: rgb(0.2, 0.7, 0.25),
    });

    // Banner text: "Quote"
    page.drawText("Quote", {
      x: bannerX + 20,
      y: bannerY + bannerHeight - 50,
      size: 32,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Company info (right side)
    const rightX = width - margin - 220;
    const baseY = bannerY + bannerHeight - 30;

    page.drawText("Paul Jackman", {
      x: rightX,
      y: baseY,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Painting and Decorating", {
      x: rightX,
      y: baseY - 14,
      size: 9,
      font: fontRegular,
      color: rgb(0.9, 0.9, 0.9),
    });
    page.drawText("+61 467 606 570", {
      x: rightX,
      y: baseY - 32,
      size: 9,
      font: fontRegular,
      color: rgb(0.9, 0.9, 0.9),
    });
    page.drawText("pauljackmanpainting@outlook.com", {
      x: rightX,
      y: baseY - 46,
      size: 9,
      font: fontRegular,
      color: rgb(0.9, 0.9, 0.9),
    });
    page.drawText("Deakin Place Durack NT 0830", {
      x: rightX,
      y: baseY - 60,
      size: 9,
      font: fontRegular,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Client / job box
    let currentY = bannerY - 30;

    page.drawText(quotation.jobName, {
      x: margin,
      y: currentY,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    currentY -= 14;
    page.drawText(quotation.quoteNumber, {
      x: margin,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= 18;
    page.drawText(quotation.clientAddress, {
      x: margin,
      y: currentY,
      size: 10,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    currentY -= 14;
    page.drawText(quotation.clientName, {
      x: margin,
      y: currentY,
      size: 10,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    currentY -= 14;
    page.drawText(quotation.clientPhone, {
      x: margin,
      y: currentY,
      size: 10,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    currentY -= 30;

    // Section title "Tasks"
    page.drawText("Tasks", {
      x: margin,
      y: currentY,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    currentY -= 16;

    // We only use the first section for now (Painting & Decorating)
    const section = quotation.items[0];

    page.drawText(section.sectionLabel, {
      x: margin,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    currentY -= 16;

    // Table-like layout
    const tableX = margin;
    const tableWidth = width - margin * 2;
    const priceColWidth = 90;
    const descriptionWidth = tableWidth - priceColWidth;

    // helper to wrap text
    const wrapText = (
      text: string,
      maxWidth: number,
      font: any,
      size: number
    ) => {
      const words = text.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        const testWidth = font.widthOfTextAtSize(test, size);
        if (testWidth > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    // rows
    section.rows.forEach((row) => {
      if (currentY < 80) {
        // avoid running off page bottom; (simple, 1 page only for now)
        return;
      }

      // description block
      const titleLines = row.title
        ? wrapText(row.title, descriptionWidth - 10, fontBold, 10)
        : [];
      const descLines = row.description
        ? wrapText(row.description, descriptionWidth - 10, fontRegular, 9)
        : [];

      const linesCount = titleLines.length + descLines.length || 1;
      const rowHeight = linesCount * 12 + 6;

      // horizontal separator
      page.drawLine({
        start: { x: tableX, y: currentY },
        end: { x: tableX + tableWidth, y: currentY },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      let textY = currentY - 14;

      // title
      titleLines.forEach((line) => {
        page.drawText(line, {
          x: tableX + 6,
          y: textY,
          size: 10,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
        textY -= 12;
      });

      // description
      descLines.forEach((line) => {
        page.drawText(line, {
          x: tableX + 6,
          y: textY,
          size: 9,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        textY -= 12;
      });

      // price (right column)
      page.drawText(`$${row.price.toFixed(2)}`, {
        x: tableX + tableWidth - priceColWidth + 10,
        y: currentY - 14,
        size: 10,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      currentY -= rowHeight;
    });

    // bottom line for table
    page.drawLine({
      start: { x: tableX, y: currentY },
      end: { x: tableX + tableWidth, y: currentY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    // Total row
    currentY -= 18;
    page.drawText("Total:", {
      x: tableX + tableWidth - priceColWidth - 50,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    page.drawText(`$${section.total.toFixed(2)}`, {
      x: tableX + tableWidth - priceColWidth + 10,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Summary box (right bottom, similar to UI)
    if (summary) {
      const boxWidth = 220;
      const boxHeight = 110;
      const boxX = width - margin - boxWidth;
      const boxY = margin + 40;

      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.6,
      });

      const sx = boxX + 10;
      let sy = boxY + boxHeight - 16;

      page.drawText("Estimation Summary", {
        x: sx,
        y: sy,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const smallLine = (label: string, value: string) => {
        sy -= 12;
        page.drawText(label, {
          x: sx,
          y: sy,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        page.drawText(value, {
          x: boxX + boxWidth - 70,
          y: sy,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
      };

      smallLine("Wall area", `${summary.wallArea.toFixed(1)} m²`);
      smallLine("Ceiling area", `${summary.ceilingArea.toFixed(1)} m²`);
      smallLine("Total area", `${summary.totalArea.toFixed(1)} m²`);
      smallLine("Paint needed", `${summary.litresNeeded.toFixed(1)} L`);
      smallLine("Material cost", `$${summary.materialCost.toFixed(2)}`);
      smallLine("Labour cost", `$${summary.labourCost.toFixed(2)}`);

      sy -= 10;
      page.drawLine({
        start: { x: sx, y: sy },
        end: { x: boxX + boxWidth - 10, y: sy },
        thickness: 0.4,
        color: rgb(0.85, 0.85, 0.85),
      });

      sy -= 12;
      page.drawText("Total quotation", {
        x: sx,
        y: sy,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(`$${summary.totalCost.toFixed(2)}`, {
        x: boxX + boxWidth - 70,
        y: sy,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // Footer bar
    const footerY = margin + 10;
    page.drawRectangle({
      x: margin,
      y: footerY,
      width: width - margin * 2 - 80,
      height: 6,
      color: rgb(0.2, 0.7, 0.25),
    });

    page.drawText("Page 1 / 1", {
      x: width / 2 - 20,
      y: footerY + 10,
      size: 8,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText("ABN: 8317 676 7074", {
      x: width - margin - 110,
      y: footerY + 10,
      size: 8,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });

        const pdfBytes = await pdfDoc.save();
    const safeQuoteId = quotation.quoteNumber.replace(/[^a-zA-Z0-9]/g, "_");

    // Buffer.from fixes the TS type complaint and is fine in Node runtime
    const response = new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Quotation_${safeQuoteId}.pdf"`,
      },
    });

    return response;

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to generate PDF." },
      { status: 500 }
    );
  }
}
