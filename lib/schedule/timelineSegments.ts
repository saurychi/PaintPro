// Shared subtask → FullCalendar event converter for the admin / staff /
// client schedule pages. Each subtask is fanned out into one event per
// work segment (split by lunch / Sundays / unavailable days) so a chip
// that crosses lunch shows as two pieces with the lunch row empty
// between them, mirroring the wizard's project-schedule view.
//
// The renderer there does the same computation; this helper keeps the
// three read-only schedule pages on the same model without each one
// rebuilding the logic.

import type { EventInput } from "@fullcalendar/core";
import { computeWorkSegments } from "@/lib/schedule/workHours";

export type TimelineSubtaskInput = {
  id: string;
  title: string;
  scheduledStartDatetime: string | null;
  scheduledEndDatetime: string | null;
  estimatedHours: number | null;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  // Anything you want to read back inside eventContent / eventClassNames.
  // segmentIndex / totalSegments / partialUnavailable get appended by
  // this helper — don't pass those.
  extendedProps?: Record<string, unknown>;
};

export function buildTimelineSegmentEvents(
  subtask: TimelineSubtaskInput,
  unavailableDateSet: Set<string>,
): EventInput[] {
  if (!subtask.scheduledStartDatetime) return [];
  const startDate = new Date(subtask.scheduledStartDatetime);
  if (Number.isNaN(startDate.getTime())) return [];

  const baseExtendedProps = subtask.extendedProps ?? {};

  // Without a known work-hour count we can't resegment — fall back to
  // one chip with the stored span so legacy rows still render.
  if (subtask.estimatedHours === null || subtask.estimatedHours <= 0) {
    if (!subtask.scheduledEndDatetime) return [];
    return [
      {
        id: `${subtask.id}-tl-seg0`,
        title: subtask.title,
        start: subtask.scheduledStartDatetime,
        end: subtask.scheduledEndDatetime,
        backgroundColor: subtask.backgroundColor,
        borderColor: subtask.borderColor,
        textColor: subtask.textColor,
        extendedProps: {
          ...baseExtendedProps,
          subTaskId: subtask.id,
          segmentIndex: 0,
          totalSegments: 1,
        },
      },
    ];
  }

  const segments = computeWorkSegments(
    startDate,
    subtask.estimatedHours,
    unavailableDateSet,
  );
  if (segments.length === 0) return [];

  return segments.map((seg, segIndex) => ({
    id: `${subtask.id}-tl-seg${segIndex}`,
    title: subtask.title,
    start: seg.start.toISOString(),
    end: seg.end.toISOString(),
    backgroundColor: subtask.backgroundColor,
    borderColor: subtask.borderColor,
    textColor: subtask.textColor,
    extendedProps: {
      ...baseExtendedProps,
      subTaskId: subtask.id,
      segmentIndex: segIndex,
      totalSegments: segments.length,
    },
  }));
}

// Returns one of "seg-first" / "seg-mid" / "seg-last" / "" so the
// schedule pages' CSS can dim continuation chips and drop the inner
// borders. Mirrors the eventClassNames callback in
// app/admin/job-creation/project-schedule/page.tsx.
export function timelineSegmentClassName(
  segmentIndex: number | undefined,
  totalSegments: number | undefined,
): string {
  if (
    typeof segmentIndex !== "number" ||
    typeof totalSegments !== "number" ||
    totalSegments <= 1
  ) {
    return "";
  }
  if (segmentIndex === 0) return "seg-first";
  if (segmentIndex === totalSegments - 1) return "seg-last";
  return "seg-mid";
}
