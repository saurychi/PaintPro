"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Wallet } from "lucide-react";
import StaffPageShell from "@/components/staff/StaffPageShell";

type Tile = {
  title: string;
  subtitle: string;
  href: string;
  icon: ElementType;
};

const TILES: Tile[] = [
  {
    title: "Attendance",
    subtitle: "View staff attendance logs and status breakdown",
    href: "/staff/report/attendance",
    icon: ClipboardList,
  },
  {
    title: "Payroll",
    subtitle: "View payroll summaries, payslips, and payment status",
    href: "/staff/report/payroll",
    icon: Wallet,
  },
];

export default function StaffReportPage() {
  return (
    <StaffPageShell
      title="Report"
      subtitle="Jump into attendance and payroll views from one shared staff reporting hub."
      bodyClassName="overflow-y-auto pr-1"
    >
      <div className="grid grid-cols-1 gap-3 pb-1 min-[901px]:grid-cols-2">
        {TILES.map((tile) => {
          const Icon = tile.icon;

          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex items-center justify-between gap-3.5 rounded-2xl border border-gray-200 bg-white p-3.5 text-inherit transition duration-150 hover:-translate-y-px hover:border-gray-300 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                  <Icon className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="min-w-0">
                  <div className="text-base font-semibold text-gray-900">
                    {tile.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs font-normal leading-[1.35] text-gray-900/65">
                    {tile.subtitle}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end">
                <div
                  className="grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-emerald-500/20 bg-emerald-500/10"
                  aria-hidden="true"
                >
                  <ChevronRight className="h-[18px] w-[18px] text-emerald-600" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </StaffPageShell>
  );
}
