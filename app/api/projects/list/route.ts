import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProjectRow = {
  project_id: string;
  project_code: string | null;
  title: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  status: string | null;
  cancellation_phase: string | null;
};

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

// Returns every project regardless of status. The /admin/projects page groups
// them by status, so unlike the schedule endpoints this one must NOT filter.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select(
      "project_id, project_code, title, scheduled_start_datetime, scheduled_end_datetime, status, cancellation_phase",
    )
    .order("scheduled_start_datetime", { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to load projects.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  const projects = ((data ?? []) as ProjectRow[]).map((project) => {
    const rawStatus = String(project.status || "").trim().toLowerCase();
    const cancellationPhase =
      typeof project.cancellation_phase === "string" &&
      project.cancellation_phase.trim()
        ? project.cancellation_phase.trim().toLowerCase()
        : null;
    return {
      id: project.project_id,
      projectCode: project.project_code,
      title: project.title || "Untitled Project",
      scheduledStartDatetime: project.scheduled_start_datetime,
      scheduledEndDatetime: project.scheduled_end_datetime,
      status: rawStatus,
      rawStatus,
      // Surface so the dashboard can tell apart "cancelled, wrap-up still
      // in progress" (admin still has work) from "cancelled, fully
      // closed-out" (archive). The dashboard sorts active work ahead of
      // archive in the workday picker.
      cancellationPhase,
      dateLabel: formatDateLabel(project.scheduled_start_datetime),
    };
  });

  return NextResponse.json({ projects });
}
