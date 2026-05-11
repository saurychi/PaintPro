"use client";

// Calendar-shaped pulsing skeleton used by all three schedule pages
// (admin, staff, client) while the FullCalendar + sidebar data loads.
// Mirrors the real grid: a 7×5 month grid in the main panel + three
// stacked sidebar cards on the right (Current Project / Unavailable Days
// / Projects). Pure presentation — no props beyond optional className.

type Props = {
  className?: string;
};

function PulseBlock({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "animate-pulse rounded-md bg-gray-200 dark:bg-slate-800",
        className,
      ].join(" ")}>
      {children}
    </div>
  );
}

function CalendarCell({ extraChips = 0 }: { extraChips?: number }) {
  return (
    <div className="flex min-h-20 flex-col gap-1.5 rounded-md border border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/60">
      <PulseBlock className="h-3 w-6" />
      {Array.from({ length: extraChips }).map((_, idx) => (
        <PulseBlock
          key={idx}
          className="h-2 w-full"
          // Stagger the pulse so the cell looks alive instead of strobing.
        />
      ))}
    </div>
  );
}

function SidebarCard({
  rows,
  withHeader = true,
}: {
  rows: number;
  withHeader?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      {withHeader ? (
        <div className="flex items-center justify-between">
          <PulseBlock className="h-3 w-24" />
          <PulseBlock className="h-3 w-10" />
        </div>
      ) : null}
      {Array.from({ length: rows }).map((_, idx) => (
        <PulseBlock key={idx} className="h-9 w-full" />
      ))}
    </div>
  );
}

// Pseudo-random "chip count" per cell so the skeleton looks like a calendar
// with real entries, not a sterile empty grid. Deterministic per index so
// hydration matches between server and client renders.
const CHIP_COUNTS = [0, 1, 2, 0, 1, 0, 0, 0, 1, 2, 1, 0, 0, 0, 1, 1, 0, 2, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export default function ScheduleSkeleton({ className = "" }: Props) {
  return (
    <div
      className={["grid grid-cols-12 gap-3 lg:h-full lg:min-h-0", className].join(
        " ",
      )}
      aria-busy="true"
      aria-live="polite">
      {/* Main calendar panel */}
      <div className="col-span-12 flex flex-col rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/25 lg:col-span-9 lg:h-full lg:min-h-0 lg:overflow-hidden">
        {/* Toolbar — view toggle + legend + refresh placeholders */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <PulseBlock className="h-9 w-44" />
          <div className="flex items-center gap-2">
            <PulseBlock className="h-4 w-16" />
            <PulseBlock className="h-4 w-16" />
            <PulseBlock className="h-4 w-16" />
          </div>
          <PulseBlock className="h-9 w-9" />
        </div>

        {/* Month-grid placeholder — header row of weekday labels +
            5 rows × 7 cells. Each cell varies its filled chip count so
            the placeholder reads as a calendar with events on it. */}
        <div className="flex flex-1 flex-col gap-1 overflow-hidden">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, idx) => (
              <PulseBlock key={idx} className="h-4 w-full" />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 grid-rows-5 gap-1 min-h-0">
            {CHIP_COUNTS.map((chipCount, idx) => (
              <CalendarCell key={idx} extraChips={chipCount} />
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar panel */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-y-auto">
        <SidebarCard rows={3} />
        <SidebarCard rows={2} />
        <SidebarCard rows={4} />
      </div>
    </div>
  );
}
