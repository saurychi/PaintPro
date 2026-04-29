"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { fetchConversations } from "@/lib/messages";
import { supabase } from "@/lib/supabaseClient";

export type NotificationItem = {
  id: string;
  title: string;
  subtitle?: string;
  isUnread?: boolean;
  createdAt?: string | null;
};

type Props = {
  title?: string;
  notifications?: NotificationItem[];
  limit?: number;
  onOpenAll?: () => void;
};

type SizeMode = "mini" | "compact" | "normal";

function getSizeMode(width: number, height: number): SizeMode {
  if (width < 300 || height < 150) return "mini";
  if (width < 420 || height < 220) return "compact";
  return "normal";
}

function formatTime(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapConversationToNotification(cp: any): NotificationItem {
  const lastMessage = cp.latest_message;
  const lastReadAt = cp.last_read_at ? new Date(cp.last_read_at).getTime() : 0;
  const lastMessageTime = lastMessage?.created_at
    ? new Date(lastMessage.created_at).getTime()
    : 0;

  const isUnread = lastMessageTime > lastReadAt;

  return {
    id: cp.conversation_id,
    title: cp.users?.username || "Unknown User",
    subtitle: lastMessage?.content || "No recent message.",
    isUnread,
    createdAt: lastMessage?.created_at || null,
  };
}

function NotificationsCard({
  title = "Latest Messages",
  notifications,
  limit = 5,
  onOpenAll,
}: Props) {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement | null>(null);

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [latestMessages, setLatestMessages] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(!notifications);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;

      setSize({
        width: rect.width,
        height: rect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const mode = useMemo(
    () => getSizeMode(size.width, size.height),
    [size.width, size.height],
  );

  const isMini = mode === "mini";
  const isCompact = mode === "compact" || mode === "mini";

  useEffect(() => {
    if (notifications) return;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id || null);
    }

    loadCurrentUser();
  }, [notifications]);

  useEffect(() => {
    if (notifications || !currentUserId) return;

    const userId = currentUserId;
    let cancelled = false;

    async function loadLatestMessages() {
      setLoading(true);

      try {
        const data = await fetchConversations(userId);

        if (cancelled) return;

        const mapped = data
          .map(mapConversationToNotification)
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            return bTime - aTime;
          })
          .slice(0, limit);

        setLatestMessages(mapped);
      } catch (error) {
        console.error("Failed to load latest message notifications:", error);

        if (!cancelled) {
          setLatestMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLatestMessages();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, notifications, limit]);

  useEffect(() => {
    if (notifications || !currentUserId) return;

    const channel = supabase
      .channel("dashboard-latest-message-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async () => {
          try {
            const data = await fetchConversations(currentUserId);

            const mapped = data
              .map(mapConversationToNotification)
              .sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

                return bTime - aTime;
              })
              .slice(0, limit);

            setLatestMessages(mapped);
          } catch (error) {
            console.error("Failed to refresh latest messages:", error);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, notifications, limit]);

  const displayItems = notifications ?? latestMessages;

  function handleOpenAll() {
    if (onOpenAll) {
      onOpenAll();
      return;
    }

    router.push("/admin/messages");
  }

  function handleOpenConversation(id: string) {
    router.push(`/admin/messages?conversationId=${id}`);
  }

  return (
    <section
      ref={sectionRef}
      className="grid h-full min-h-0 grid-rows-[4px_auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-[#00c065]" />

      <div
        className={[
          "flex items-center justify-between gap-3 border-b border-gray-200",
          isMini ? "px-4 py-2" : "px-4 py-3",
        ].join(" ")}>
        <div className="min-w-0">
          <h3
            className={[
              "font-semibold leading-5 text-gray-900",
              isMini ? "text-[13px]" : "text-[14px]",
            ].join(" ")}>
            {title}
          </h3>

          {!isMini ? (
            <p className="mt-0.5 text-[10px] leading-4 text-gray-500">
              Recent conversations and unread messages.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleOpenAll}
          aria-label="Open messages"
          className="inline-flex shrink-0 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700 transition hover:bg-emerald-100">
          <MessageSquare className="h-4 w-4" />
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={isMini ? "min-h-0 p-2" : "min-h-0 p-3"}>
        <div
          className={[
            "h-full min-h-0 overflow-y-auto overflow-x-hidden pr-2",
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
          {loading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : displayItems.length > 0 ? (
            <div className={isCompact ? "space-y-2" : "space-y-2.5"}>
              {displayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenConversation(item.id)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-100 px-1 py-2.5 text-left last:border-b-0 hover:bg-emerald-50/40">
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      item.isUnread ? "bg-red-500" : "bg-emerald-500",
                    ].join(" ")}
                  />

                  <div className="min-w-0">
                    <div
                      className={[
                        "truncate font-semibold text-gray-900",
                        isCompact ? "text-[12px]" : "text-[13px]",
                      ].join(" ")}>
                      {item.title}
                    </div>

                    {item.subtitle ? (
                      <div className="mt-0.5 truncate text-[11px] leading-4 text-gray-500">
                        {item.subtitle}
                      </div>
                    ) : null}
                  </div>

                  {!isMini ? (
                    <div className="shrink-0 text-[10px] text-gray-400">
                      {formatTime(item.createdAt)}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-gray-500">
              No recent messages.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default memo(NotificationsCard);
