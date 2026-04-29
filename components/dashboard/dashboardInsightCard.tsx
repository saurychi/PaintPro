"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, PieChart } from "lucide-react";
import { type ProcessItem } from "@/components/dashboard/jobProgressCard";

export type CostSlice = {
  label: string;
  percent: number;
};

type Props = {
  processItems?: ProcessItem[];
  loadingDetails?: boolean;
  projectId?: string | null;
};

function computeProgressFromItems(items: ProcessItem[]) {
  let total = 0;
  let done = 0;
  let currentLabel = "";

  function walk(item: ProcessItem) {
    const isLeaf = !item.children || item.children.length === 0;
    if (isLeaf) {
      total++;
      if (item.status === "done") done++;
      else if (!currentLabel && item.status === "active") {
        currentLabel = item.title;
      }
    } else {
      for (const child of item.children!) walk(child);
    }
  }

  for (const item of items) walk(item);

  if (!currentLabel) {
    currentLabel = items.find((item) => item.status === "active")?.title ?? "";
  }

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { percent, currentLabel: currentLabel || "No active task" };
}

type SizeMode = "mini" | "short" | "compact" | "normal";

function getSizeMode(width: number, height: number): SizeMode {
  if (width < 280 || height < 130) return "mini";
  if (height < 165) return "short";
  if (width < 420 || height < 210) return "compact";
  return "normal";
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function AnalyticsRing({ percent, mode }: { percent: number; mode: SizeMode }) {
  const pct = clampPercent(percent);

  const size =
    mode === "mini"
      ? 76
      : mode === "short"
        ? 86
        : mode === "compact"
          ? 96
          : 108;

  const radius =
    mode === "mini" ? 29 : mode === "short" ? 34 : mode === "compact" ? 38 : 43;

  const strokeWidth = mode === "mini" ? 9 : 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = (1 - pct / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
      }}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#DFF7EA"
          strokeWidth={strokeWidth}
        />

        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#68D64F"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={[
            "font-semibold leading-none text-gray-900",
            mode === "mini" ? "text-[12px]" : "text-[15px]",
          ].join(" ")}>
          {pct}%
        </div>

        {mode !== "mini" && mode !== "short" ? (
          <div className="mt-0.5 text-[9px] leading-none text-gray-500">
            Complete
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsView({
  percentComplete,
  currentTaskLabel,
  loading,
  mode,
}: {
  percentComplete: number;
  currentTaskLabel?: string;
  loading?: boolean;
  mode: SizeMode;
}) {
  const isMini = mode === "mini";
  const isShort = mode === "short";
  const isTight = isMini || isShort;

  if (loading) {
    return (
      <div className="flex h-full max-h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/20">
        <span className="text-[12px] text-gray-400">Loading...</span>
      </div>
    );
  }

  return (
    <div
      className={[
        "flex h-full max-h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/20",
        isTight ? "gap-4 px-3 py-2" : "gap-6 px-5 py-4",
      ].join(" ")}>
      <AnalyticsRing percent={percentComplete} mode={mode} />

      <div className="min-w-0 max-w-[55%]">
        <div
          className={[
            "font-semibold text-gray-700",
            isTight ? "text-[11px]" : "text-[12px]",
          ].join(" ")}>
          Current Task
        </div>

        <div
          className={[
            "mt-1 truncate text-gray-900",
            isTight ? "text-[13px]" : "text-[15px]",
          ].join(" ")}
          title={currentTaskLabel || "No active task"}>
          {currentTaskLabel || "No active task"}
        </div>
      </div>
    </div>
  );
}

function CostDonut({ items, mode }: { items: CostSlice[]; mode: SizeMode }) {
  const safeItems = items
    .map((item) => ({
      ...item,
      percent: Math.max(0, Number.isFinite(item.percent) ? item.percent : 0),
    }))
    .filter((item) => item.label.trim().length > 0);

  const total = safeItems.reduce((sum, item) => sum + item.percent, 0);

  const normalized =
    total <= 0
      ? safeItems.map((item) => ({ ...item, percent: 0 }))
      : safeItems.map((item) => ({
          ...item,
          percent: (item.percent / total) * 100,
        }));

  const colors = [
    "#FF7A2F",
    "#4DA3FF",
    "#00C853",
    "#E53935",
    "#8E24AA",
    "#FFCA28",
  ];

  const size =
    mode === "mini"
      ? 54
      : mode === "short"
        ? 62
        : mode === "compact"
          ? 72
          : 84;

  const cx = size / 2;
  const cy = size / 2;
  const radius =
    mode === "mini" ? 20 : mode === "short" ? 24 : mode === "compact" ? 28 : 33;

  const strokeWidth = mode === "mini" ? 7 : 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />

        {(() => {
          let accumulatedPercent = 0;

          return normalized.map((item, index) => {
            const percent = item.percent;
            const dash = (percent / 100) * circumference;
            const gap = 3;
            const visibleDash = Math.max(0, dash - gap);
            const offset = -((accumulatedPercent / 100) * circumference);

            accumulatedPercent += percent;

            return (
              <circle
                key={`${item.label}-${index}`}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                strokeDasharray={`${visibleDash} ${circumference}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          });
        })()}

        <circle cx={cx} cy={cy} r={radius - strokeWidth / 2} fill="white" />
      </svg>
    </div>
  );
}

function CostSpreadView({
  items,
  loading,
  mode,
}: {
  items: CostSlice[];
  loading: boolean;
  mode: SizeMode;
}) {
  const isMini = mode === "mini";
  const isShort = mode === "short";
  const isTight = isMini || isShort || mode === "compact";

  const safeItems = items
    .map((item) => ({
      ...item,
      percent: Math.max(0, Number.isFinite(item.percent) ? item.percent : 0),
    }))
    .filter((item) => item.label.trim().length > 0);

  const total = safeItems.reduce((sum, item) => sum + item.percent, 0);

  const normalized =
    total <= 0
      ? safeItems.map((item) => ({ ...item, percent: 0 }))
      : safeItems.map((item) => ({
          ...item,
          percent: (item.percent / total) * 100,
        }));

  const colors = [
    "#FF7A2F",
    "#4DA3FF",
    "#00C853",
    "#E53935",
    "#8E24AA",
    "#FFCA28",
  ];

  return (
    <div
      className={[
        "flex h-full max-h-full min-h-0 w-full items-stretch overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/20",
        isTight ? "gap-4 px-3 py-2" : "gap-5 px-4 py-3",
      ].join(" ")}>
      <CostDonut items={items} mode={mode} />

      <div className="relative h-full min-h-0 min-w-0 flex-1 self-stretch overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center">
            <span className="text-[12px] text-gray-400">Loading...</span>
          </div>
        ) : normalized.length === 0 || total <= 0 ? (
          <div className="flex h-full items-center">
            <span className="text-[12px] text-gray-500">
              No cost data available.
            </span>
          </div>
        ) : (
          <div
            className={[
              "absolute inset-0 overflow-y-auto overflow-x-hidden",
              isTight ? "space-y-1.5 pr-2 pb-1" : "space-y-2 pr-2 pb-1",
              "[&::-webkit-scrollbar]:w-2",
              "[&::-webkit-scrollbar-track]:bg-transparent",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-emerald-500",
              "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-600",
            ].join(" ")}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#10B981 transparent",
            }}>
            {normalized.map((item, index) => {
              const color = colors[index % colors.length];
              const percent = Math.round(item.percent);

              return (
                <div
                  key={`${item.label}-${index}`}
                  title={item.label}
                  className={[
                    "min-w-0 rounded-lg border border-gray-200 font-semibold text-gray-900",
                    isTight
                      ? "px-2.5 py-1 text-[11px]"
                      : "px-3 py-1.5 text-[12px]",
                  ].join(" ")}
                  style={{
                    backgroundColor: hexToRgba(color, 0.12),
                  }}>
                  <div
                    className={[
                      "block max-w-full overflow-x-auto overflow-y-hidden whitespace-nowrap pb-0.5",
                      "[&::-webkit-scrollbar]:h-1.5",
                      "[&::-webkit-scrollbar-track]:bg-transparent",
                      "[&::-webkit-scrollbar-thumb]:rounded-full",
                      "[&::-webkit-scrollbar-thumb]:bg-emerald-400",
                      "[&::-webkit-scrollbar-thumb]:hover:bg-emerald-500",
                    ].join(" ")}
                    style={{
                      scrollbarWidth: "thin",
                      scrollbarColor: "#34D399 transparent",
                    }}>
                    <span className="inline-block min-w-max">
                      {percent}% - {item.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardInsightCard({
  processItems,
  loadingDetails,
  projectId,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);

  const [activeView, setActiveView] = useState<"analytics" | "cost">(
    "analytics",
  );

  const [size, setSize] = useState({ width: 0, height: 0 });

  const { percent: percentComplete, currentLabel: currentTaskLabel } =
    useMemo(() => {
      if (!processItems || processItems.length === 0) {
        return { percent: 0, currentLabel: "No active task" };
      }
      return computeProgressFromItems(processItems);
    }, [processItems]);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [costData, setCostData] = useState<{
    materialsCost: number;
    laborCost: number;
    estimatedCost: number;
    estimatedProfit: number;
  } | null>(null);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function fetchCosts() {
      if (!projectId) {
        setCostData(null);
        return;
      }

      try {
        setLoadingCosts(true);
        const response = await fetch(
          `/api/planning/getProjectCosts?projectId=${projectId}`,
        );
        const data = await response.json();

        if (!response.ok) {
          setCostData(null);
          return;
        }

        setCostData({
          materialsCost: Number(data.materialsCost ?? 0),
          laborCost: Number(data.laborCost ?? 0),
          estimatedCost: Number(data.estimatedCost ?? 0),
          estimatedProfit: Number(data.estimatedProfit ?? 0),
        });
      } catch {
        setCostData(null);
      } finally {
        setLoadingCosts(false);
      }
    }

    fetchCosts();
  }, [projectId]);

  const costItems = useMemo<CostSlice[]>(() => {
    if (!costData) return [];

    const { materialsCost, laborCost, estimatedCost, estimatedProfit } =
      costData;

    const basePrice = Math.max(
      0,
      estimatedCost - materialsCost - laborCost,
    );

    const slices: CostSlice[] = [
      { label: "Labor", percent: laborCost },
      { label: "Materials", percent: materialsCost },
      { label: "Base Price", percent: basePrice },
      { label: "Profit", percent: estimatedProfit },
    ];

    return slices.filter((s) => s.percent > 0);
  }, [costData]);

  const mode = useMemo(
    () => getSizeMode(size.width, size.height),
    [size.width, size.height],
  );

  const isMini = mode === "mini";
  const isShort = mode === "short";
  const headerPadding = "px-4 py-2";

  return (
    <section
      ref={sectionRef}
      className="grid h-full min-h-0 grid-rows-[4px_auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full bg-[#00c065]" />

      <div
        className={[
          "flex min-h-0 items-center justify-between gap-3 border-b border-gray-200",
          headerPadding,
        ].join(" ")}>
        <div className="min-w-0">
          <h3
            className={[
              "font-semibold leading-5 text-gray-900",
              isMini || isShort ? "text-[13px]" : "text-[14px]",
            ].join(" ")}>
            {activeView === "analytics" ? "Analytics" : "Job Cost Spread"}
          </h3>

          {mode === "normal" ? (
            <p className="mt-0.5 text-[10px] leading-4 text-gray-500">
              {activeView === "analytics"
                ? "Project completion and current task."
                : "Project cost distribution by category."}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 rounded-md border border-emerald-100 bg-emerald-50 p-0.5">
          <button
            type="button"
            onClick={() => setActiveView("analytics")}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition",
              activeView === "analytics"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-gray-500 hover:text-emerald-700",
            ].join(" ")}
            title="Show analytics">
            <BarChart3 className="h-3.5 w-3.5" />
            {mode === "normal" ? "Analytics" : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveView("cost")}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition",
              activeView === "cost"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-gray-500 hover:text-emerald-700",
            ].join(" ")}
            title="Show job cost spread">
            <PieChart className="h-3.5 w-3.5" />
            {mode === "normal" ? "Cost" : null}
          </button>
        </div>
      </div>

      <div
        className={[
          "grid h-full min-h-0 overflow-hidden",
          isMini || isShort ? "p-2" : "p-3",
        ].join(" ")}>
        <div className="h-full min-h-0 overflow-hidden">
          {activeView === "analytics" ? (
            <AnalyticsView
              percentComplete={percentComplete}
              currentTaskLabel={currentTaskLabel}
              loading={loadingDetails}
              mode={mode}
            />
          ) : (
            <CostSpreadView
              items={costItems}
              loading={loadingCosts}
              mode={mode}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default memo(DashboardInsightCard);
