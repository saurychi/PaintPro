"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// Shape of what the postgres-changes payload's `new` and `old` carry
// for project_sub_task. Other columns may be present — we only depend
// on these.
export type ProjectSubtaskRow = {
  project_sub_task_id: string;
  project_task_id: string;
  status: string | null;
  scheduled_start_datetime: string | null;
  scheduled_end_datetime: string | null;
  updated_at: string | null;
};

export type SubtaskRealtimeEvent =
  | {
      eventType: "INSERT" | "UPDATE";
      newRow: ProjectSubtaskRow;
      oldRow: ProjectSubtaskRow | null;
    }
  | {
      eventType: "DELETE";
      newRow: null;
      oldRow: ProjectSubtaskRow;
    };

export type SubtaskRealtimeStatus =
  | "idle"
  | "connecting"
  | "live"
  | "error"
  | "closed";

type Args = {
  // Project task IDs whose subtask changes we want to watch. Pass
  // empty/null to detach the subscription. The hook re-subscribes
  // whenever this list changes (so switching projects rewires the
  // filter immediately).
  projectTaskIds: string[] | null;
  // Master gate — set to false to keep the hook idle (e.g. while the
  // overview is still loading or no project is selected).
  enabled: boolean;
  // Fired on every UPDATE / INSERT / DELETE for one of the watched
  // subtasks. Parents typically patch their `mainTasks` state
  // in-place to avoid a full re-fetch.
  onSubtaskEvent: (event: SubtaskRealtimeEvent) => void;
};

// Postgres-changes filter syntax doesn't support IN(), only equality
// or `eq.in.(...)` style — we work around this by subscribing without
// a server-side filter and rejecting events client-side. This is fine
// for the dashboard scale (one project's subtasks at a time, ~dozens).
function matchesWatchedTask(
  row: ProjectSubtaskRow | null | undefined,
  watched: Set<string>,
): boolean {
  if (!row) return false;
  return watched.has(row.project_task_id);
}

export function useProjectSubtaskRealtime({
  projectTaskIds,
  enabled,
  onSubtaskEvent,
}: Args): SubtaskRealtimeStatus {
  const [status, setStatus] = useState<SubtaskRealtimeStatus>("idle");

  // Hold the latest callback in a ref so the subscription effect can
  // call it without having `onSubtaskEvent` in its dependency array
  // (which would tear down + rebuild the channel on every render).
  const onSubtaskEventRef = useRef(onSubtaskEvent);
  useEffect(() => {
    onSubtaskEventRef.current = onSubtaskEvent;
  }, [onSubtaskEvent]);

  // Stringify the ID list so the effect re-runs only when the actual
  // set of watched IDs changes, not on every parent render.
  const watchedKey = (projectTaskIds ?? []).slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !watchedKey) {
      setStatus("idle");
      return;
    }

    const watched = new Set(watchedKey.split(",").filter(Boolean));
    if (watched.size === 0) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");

    // Channel name has to be unique per subscription so concurrent
    // hooks (e.g. admin + staff dashboards) don't share state.
    const channelName = `project-subtasks:${watchedKey}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        // @ts-expect-error - postgres_changes is a valid event but the
        // generic types in @supabase/supabase-js don't expose it cleanly.
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_sub_task",
        },
        (payload: {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          new: ProjectSubtaskRow | null;
          old: ProjectSubtaskRow | null;
        }) => {
          // Filter client-side to only the project we care about.
          // Postgres-changes filters don't support IN() so we compare
          // against the watched set ourselves.
          const targetRow =
            payload.eventType === "DELETE" ? payload.old : payload.new;
          if (!matchesWatchedTask(targetRow, watched)) return;

          if (payload.eventType === "DELETE" && payload.old) {
            onSubtaskEventRef.current({
              eventType: "DELETE",
              newRow: null,
              oldRow: payload.old,
            });
            return;
          }

          if (payload.new) {
            onSubtaskEventRef.current({
              eventType: payload.eventType as "INSERT" | "UPDATE",
              newRow: payload.new,
              oldRow: payload.old,
            });
          }
        },
      )
      .subscribe((subscriptionStatus) => {
        // The subscribe callback fires for every state transition.
        // Map Supabase's strings to our smaller surface so the
        // indicator stays simple.
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("live");
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT"
        ) {
          setStatus("error");
        } else if (subscriptionStatus === "CLOSED") {
          setStatus("closed");
        } else {
          setStatus("connecting");
        }
      });

    return () => {
      // removeChannel both unsubscribes server-side and cleans the
      // local registry, so we don't leak channels when the project
      // selection changes.
      supabase.removeChannel(channel);
    };
  }, [enabled, watchedKey]);

  return status;
}
