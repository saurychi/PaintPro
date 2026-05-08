"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

// Refcount-based suppression so any view that already renders incoming
// messages inline (e.g. the basic-details StaffMessageModal) can silence
// the global "New message" toast for the duration that view is active.
// Refcount (not boolean) handles overlapping suppressors safely.
let toastSuppressionCount = 0;
export function suppressNewMessageToast(): () => void {
  toastSuppressionCount += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    toastSuppressionCount = Math.max(0, toastSuppressionCount - 1);
  };
}

// Drives both the sidebar Messages badge AND the toast notifications fired
// when a new message arrives somewhere outside the current view.
//
// Behaviour:
//   - Fetches the unread total from /api/messages/unread-count on mount.
//   - Subscribes to the `messages` table for INSERT events; on every new
//     message it refetches the total. Refetch (vs. local +1) means the
//     count stays correct even if multiple events fire in quick succession
//     or the user navigates between conversations.
//   - Fires a sonner toast for incoming messages from other users — but
//     only when the current pathname is NOT a `/messages` page, since that
//     page shows the message inline and a toast on top would be noisy.
//   - Returns the total so a calling component can wire it into a sidebar
//     badge via `useSidebarBadge`.
//
// The hook is safe to mount once per shell (Admin / Staff / Client). It
// doesn't depend on any role-specific paths beyond the toast suppression.
export function useMessagesUnread(messagesPathPrefix: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [total, setTotal] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      // Cookie-client fallback: send the localStorage-tracked last-seen
      // timestamp so the API can count messages newer than that. The
      // anchor key is global (not per-project) since the cookie itself
      // already scopes the user to one project at a time.
      let url = "/api/messages/unread-count";
      try {
        const since = window.localStorage.getItem(
          "paintpro_messages_last_seen",
        );
        if (since) {
          url += `?since=${encodeURIComponent(since)}`;
        }
      } catch {}

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const next = Number(data?.total ?? 0);
      setTotal(Number.isFinite(next) ? next : 0);
    } catch {
      // Network blip: leave the existing count alone.
    }
  }, []);

  // Cache the auth user id once so the realtime handler can short-circuit
  // own-message events without hitting the network on every INSERT.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) currentUserIdRef.current = data.user?.id ?? null;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // First-mount baseline: if the cookie-client has never visited, anchor
  // their "last seen" to right now so historical messages don't all show
  // up as unread. Subsequent new messages count from this point onward.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem("paintpro_messages_last_seen")) {
        window.localStorage.setItem(
          "paintpro_messages_last_seen",
          new Date().toISOString(),
        );
      }
    } catch {}
  }, []);

  // Initial fetch + refetch on every navigation so the count drops to zero
  // promptly after the user opens the messages page. Auth users get this
  // for free via `markConversationAsRead`; cookie clients need a manual
  // bump of the localStorage anchor since they don't have a participant
  // row to update.
  useEffect(() => {
    if (pathname?.startsWith(messagesPathPrefix)) {
      try {
        window.localStorage.setItem(
          "paintpro_messages_last_seen",
          new Date().toISOString(),
        );
      } catch {}
    }
    void refetch();
  }, [refetch, pathname, messagesPathPrefix]);

  // Refetch instantly when something marks conversation(s) as read (the
  // messages page emits this via lib/messages.ts). Without this the badge
  // would only update on the next 15s poll and feel laggy.
  useEffect(() => {
    const handler = () => void refetch();
    window.addEventListener("paintpro:messages-read", handler);
    return () => window.removeEventListener("paintpro:messages-read", handler);
  }, [refetch]);

  // Polling fallback so the badge keeps updating even if Supabase Realtime
  // isn't enabled on `public.messages` or RLS is filtering the broadcast.
  // 15s is light (one cheap COUNT query per interval per shell) and means
  // the user never has to interact with the sidebar to see a new badge.
  // Pauses while the tab is hidden to save bandwidth.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void refetch();
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);

  // Mirror pathname / prefix / router into refs so the realtime handler can
  // read the latest values without forcing the effect itself to rebind on
  // every navigation. Re-subscribing on every navigation was the bug —
  // there's a small unsubscribed window each time, and after a few hops the
  // channel stops pushing reliably, which is why the badge only worked
  // after a full page refresh.
  const pathnameRef = useRef(pathname);
  const messagesPathPrefixRef = useRef(messagesPathPrefix);
  const routerRef = useRef(router);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    messagesPathPrefixRef.current = messagesPathPrefix;
  }, [messagesPathPrefix]);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Realtime: any new message anywhere triggers a refetch of the total. We
  // also pop a toast — unless the user is sitting on the messages page
  // already, or unless they were the sender. Effect runs ONCE on mount and
  // stays subscribed for the lifetime of the shell.
  useEffect(() => {
    const channel = supabase
      .channel("global-unread-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMessage = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string | null;
            content: string;
          };

          // Skip own outgoing messages so they don't pop a toast or
          // bump the badge for the sender. Two paths:
          //   - Auth users: messages they send carry sender_id ===
          //     their own userId.
          //   - Cookie clients (no auth user): their messages are
          //     inserted with sender_id = null + client_id set on the
          //     row. From the realtime payload, sender_id IS NULL is a
          //     reliable proxy for "from a cookie client", and since
          //     each project conversation has at most one cookie
          //     client (the project's client), that's effectively self.
          //     The /api/messages/unread-count cookie path already
          //     excludes these from the count; this just keeps the
          //     toast quiet too.
          if (
            currentUserIdRef.current &&
            newMessage.sender_id === currentUserIdRef.current
          ) {
            return;
          }
          if (
            !currentUserIdRef.current &&
            (newMessage.sender_id === null ||
              newMessage.sender_id === undefined)
          ) {
            return;
          }

          const prefix = messagesPathPrefixRef.current;
          const onMessagesPage = pathnameRef.current?.startsWith(prefix);

          // While the user is sitting on their role's messages page,
          // they're effectively "seeing" incoming activity in real time
          // — so the sidebar badge shouldn't tick up. For cookie
          // clients we also bump the localStorage anchor so a later
          // refetch (on path change, polling, etc.) starts from "now"
          // and doesn't surface this message as unread.
          if (onMessagesPage) {
            if (!currentUserIdRef.current) {
              try {
                window.localStorage.setItem(
                  "paintpro_messages_last_seen",
                  new Date().toISOString(),
                );
              } catch {}
            }
            return;
          }

          if (toastSuppressionCount === 0) {
            const preview =
              typeof newMessage.content === "string"
                ? newMessage.content.slice(0, 120)
                : "You have a new message.";
            toast("New message", {
              description: preview,
              action: {
                label: "Open",
                onClick: () => routerRef.current.push(prefix),
              },
            });
          }

          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Suppress the badge entirely whenever the user is on their role's
  // messages page — they're literally looking at the messages section,
  // so a count next to the sidebar item there is just noise. The
  // underlying `total` keeps tracking via realtime / polling so the
  // moment they navigate away the value is fresh again.
  const onMessagesPage = pathname?.startsWith(messagesPathPrefix) ?? false;
  return onMessagesPage ? 0 : total;
}
