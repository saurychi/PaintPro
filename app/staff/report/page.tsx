"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Star, Wallet } from "lucide-react";

import StaffPageShell from "@/components/staff/StaffPageShell";
import {
  getPerformanceAverage,
  type StaffPerformanceRecord,
} from "@/lib/staff/employeePerformance";
import { cn } from "@/lib/utils";

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

type PerformanceResponse = {
  records?: StaffPerformanceRecord[];
  error?: string;
  details?: string;
};

const RATING_LABELS: Array<{
  key: keyof Pick<
    StaffPerformanceRecord,
    "timeEfficiency" | "workQuality" | "teamwork" | "workEthic"
  >;
  label: string;
}> = [
  { key: "timeEfficiency", label: "Time Efficiency" },
  { key: "workQuality", label: "Work Quality" },
  { key: "teamwork", label: "Teamwork" },
  { key: "workEthic", label: "Work Ethic" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatRating(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 10) / 10}`;
}

function RatingStars({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-xs font-normal text-gray-400">No rating</span>;
  }

  const rounded = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "h-3.5 w-3.5",
            index < rounded
              ? "fill-amber-400 text-amber-400"
              : "text-gray-300",
          )}
        />
      ))}
      <span className="ml-1.5 text-xs font-medium text-gray-700">
        {formatRating(value)}
      </span>
    </div>
  );
}

export default function StaffReportPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [records, setRecords] = useState<StaffPerformanceRecord[]>([]);

  useEffect(() => {
    let alive = true;

    async function loadPerformance() {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch("/api/staff/employee-performance", {
          cache: "no-store",
        });
        const data = (await response.json()) as PerformanceResponse;

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(": ") ||
              "Failed to load performance reviews.",
          );
        }

        if (!alive) return;
        setRecords(Array.isArray(data.records) ? data.records : []);
      } catch (error) {
        if (!alive) return;
        console.error(error);
        setRecords([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load performance reviews.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadPerformance();

    return () => {
      alive = false;
    };
  }, []);

  const overallAverages = useMemo(() => {
    if (!records.length) return null;

    const totals = {
      timeEfficiency: 0,
      workQuality: 0,
      teamwork: 0,
      workEthic: 0,
    };
    const counts = {
      timeEfficiency: 0,
      workQuality: 0,
      teamwork: 0,
      workEthic: 0,
    };

    for (const record of records) {
      for (const { key } of RATING_LABELS) {
        const value = record[key];
        if (value != null && Number.isFinite(value)) {
          totals[key] += value;
          counts[key] += 1;
        }
      }
    }

    return RATING_LABELS.map(({ key, label }) => ({
      key,
      label,
      value: counts[key] ? totals[key] / counts[key] : null,
    }));
  }, [records]);

  return (
    <StaffPageShell
      title="Report"
      subtitle="Monitor your attendance, task history, and payroll from one reporting hub."
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
                  <div className="mt-1 line-clamp-2 text-xs font-normal leading-[1.35] text-gray-900/65 dark:text-gray-400">
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

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Employee Performance
            </div>
            <div className="mt-1 text-xs font-normal text-gray-500">
              Ratings and feedback from completed project reviews.
            </div>
          </div>
          <div className="text-xs font-normal text-gray-500">
            {records.length} review{records.length === 1 ? "" : "s"}
          </div>
        </div>

        {overallAverages && (
          <div className="mt-3 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
            {overallAverages.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-gray-200 bg-white p-3.5"
              >
                <div className="text-xs font-medium text-gray-900/70 dark:text-gray-400">
                  {item.label}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-gray-900">
                    {formatRating(item.value)}
                  </span>
                  <span className="text-xs font-normal text-gray-500">/ 5</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Loading performance reviews...
            </div>
          ) : loadError ? (
            <div className="px-4 py-8 text-center">
              <div className="text-[15px] font-semibold text-red-700">
                Failed to load reviews
              </div>
              <div className="mt-1.5 text-[13px] font-normal text-gray-500">
                {loadError}
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-[15px] font-semibold text-gray-900">
                No performance reviews yet
              </div>
              <div className="mt-1.5 text-[13px] font-normal text-gray-500">
                Reviews will appear here once an admin completes one for your work.
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-700">
              {records.map((record) => {
                const average = getPerformanceAverage(record);

                return (
                  <li key={record.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {record.projectTitle}
                        </div>
                        <div className="mt-1 truncate text-xs font-normal text-gray-500">
                          {record.projectCode}
                          {record.reviewedByName
                            ? ` / Reviewed by ${record.reviewedByName}`
                            : ""}
                          {record.reviewedAt
                            ? ` / ${formatDateTime(record.reviewedAt)}`
                            : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium text-gray-500">
                          Overall
                        </div>
                        <div className="mt-0.5 text-base font-semibold text-gray-900">
                          {formatRating(average)}{" "}
                          <span className="text-xs font-normal text-gray-500">
                            / 5
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 min-[561px]:grid-cols-2">
                      {RATING_LABELS.map(({ key, label }) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2"
                        >
                          <span className="text-xs font-medium text-gray-700">
                            {label}
                          </span>
                          <RatingStars value={record[key]} />
                        </div>
                      ))}
                    </div>

                    {record.note?.trim() && (
                      <div className="mt-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[13px] font-normal text-gray-700">
                        {record.note}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </StaffPageShell>
  );
}
