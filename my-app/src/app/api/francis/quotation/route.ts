// src/app/api/francis/quotation/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const quotation = {
    id: 1,
    quoteNumber: "#0000002A-2024",
    jobName: "Dawn House",
    clientName: "Samantha Reynolds",
    clientAddress: "42 Wellington Street East Perth WA 6004 Australia",
    clientPhone: "09662749655",
    status: "NOT_YET_APPROVED",
    approverName: null,
    items: [
      {
        sectionLabel: "Wallpapering",
        rows: [
          {
            description:
              "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
            price: 50.15,
          },
          {
            description:
              "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
            price: 50.15,
          },
        ],
        total: 100.3,
      },
      {
        sectionLabel: "Spray or Brush Roll Finish",
        rows: [
          {
            description:
              "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
            price: 50.15,
          },
          {
            description:
              "Prep surface and touch up with total prep by 2 coats of Dulux Wash and Wear.",
            price: 50.15,
          },
        ],
        total: 100.3,
      },
    ],
    grandTotal: 200.6,
  };

  return NextResponse.json(quotation);
}
