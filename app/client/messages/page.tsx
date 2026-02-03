"use client";

import { useMemo, useState } from "react";
import styles from "./messages.module.css";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import {
  Search,
  MoreVertical,
  Paperclip,
  SendHorizonal,
} from "lucide-react";

type Role = "Client" | "Project Manager";

type Thread = {
  id: string;
  title: string; // display name
  subtitle: string; // role label
  preview: string;
  lastSeen: string; // e.g. "5min ago"
  unread: boolean;
  unreadCount?: number;
  avatarLetter: string;
  avatarColor?: "pink" | "green" | "gray";
};

type Message = {
  id: string;
  threadId: string;
  sender: "me" | "them";
  text: string;
  time: string; // e.g. "5min ago"
  dayLabel?: string; // e.g. "Today"
};

export default function MessagesPage() {
  // mock threads (replace with Firestore later)
  const threads: Thread[] = useMemo(
    () => [
      {
        id: "t1",
        title: "Client",
        subtitle: "Client",
        preview: "Client: The amount of paint needed did not ex...",
        lastSeen: "5min ago",
        unread: true,
        unreadCount: 1,
        avatarLetter: "C",
        avatarColor: "pink",
      },
      {
        id: "t2",
        title: "Marco Dela Cruz",
        subtitle: "Client",
        preview: "You: yes thats okay",
        lastSeen: "5min ago",
        unread: false,
        avatarLetter: "M",
        avatarColor: "gray",
      },
      {
        id: "t3",
        title: "Ramon Santos",
        subtitle: "Client",
        preview: "Ramon Santos: sir i have an urgency and i cur...",
        lastSeen: "5min ago",
        unread: false,
        avatarLetter: "R",
        avatarColor: "gray",
      },
    ],
    []
  );

  // mock messages (replace with Firestore later)
  const allMessages: Message[] = useMemo(
    () => [
      {
        id: "m1",
        threadId: "t1",
        sender: "them",
        text: "we changed the parts you mentioned",
        time: "5min ago",
        dayLabel: "Today",
      },
      { id: "m2", threadId: "t1", sender: "me", text: "thank you", time: "5min ago" },
      { id: "m3", threadId: "t1", sender: "them", text: "welcome", time: "5min ago" },
      {
        id: "m4",
        threadId: "t1",
        sender: "me",
        text: "is the amount of paint okay?",
        time: "5min ago",
      },
      {
        id: "m5",
        threadId: "t1",
        sender: "them",
        text: "The amount of paint needed did not exceed, so its okay",
        time: "5min ago",
      },
    ],
    []
  );

  const [query, setQuery] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string>(threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      return (
        t.title.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q)
      );
    });
  }, [threads, query]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? threads[0],
    [threads, activeThreadId]
  );

  const activeMessages = useMemo(
    () => allMessages.filter((m) => m.threadId === activeThreadId),
    [allMessages, activeThreadId]
  );

  const onSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
  };

  const onSendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    // frontend-only placeholder:
    // later: push to Firestore + optimistic UI
    console.log("send message", { threadId: activeThreadId, text });
    setDraft("");
  };

  const onKebabAction = (action: "archive" | "mute" | "delete", threadId: string) => {
    // placeholder only
    console.log("thread action", { action, threadId });
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Messages</h1>
      </div>

      <div className={styles.shell}>
        {/* LEFT: THREAD LIST */}
        <section className={styles.leftCard}>
          <div className={styles.leftTop}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className={styles.searchInput}
              />
            </div>
          </div>

          <div className={styles.threadList}>
            {filteredThreads.map((t) => {
              const isActive = t.id === activeThreadId;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectThread(t.id)}
                  className={cn(styles.threadItem, isActive && styles.threadItemActive)}
                >
                  <div className={styles.threadTopRow}>
                    <div className={styles.threadLeft}>
                      <span
                        className={cn(
                          styles.unreadDot,
                          t.unread ? styles.unreadDotOn : styles.unreadDotOff
                        )}
                        aria-label={t.unread ? "unread" : "read"}
                      />
                      <div className={styles.threadTitleWrap}>
                        <div className={styles.threadTitle}>{t.title}</div>
                        <div className={styles.threadPreview}>{t.preview}</div>
                      </div>
                    </div>

                    <div className={styles.threadRight}>
                      <button
                        type="button"
                        className={styles.kebab}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onKebabAction("archive", t.id);
                        }}
                        aria-label="Thread actions"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.threadMetaRow}>
                    <span className={styles.threadMetaText}>{t.lastSeen}</span>
                    {t.unreadCount ? (
                      <span className={styles.unreadPill}>{t.unreadCount}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* RIGHT: CHAT */}
        <section className={styles.rightCard}>
          {/* Chat header */}
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div
                className={cn(
                  styles.avatar,
                  activeThread?.avatarColor === "pink" && styles.avatarPink,
                  activeThread?.avatarColor === "green" && styles.avatarGreen,
                  activeThread?.avatarColor === "gray" && styles.avatarGray
                )}
              >
                <span className={styles.avatarLetter}>{activeThread?.avatarLetter ?? "?"}</span>
                <span className={styles.statusDot} />
              </div>

              <div className={styles.chatHeaderText}>
                <div className={styles.chatName}>{activeThread?.title ?? "Unknown"}</div>
                <div className={styles.chatRole}>{activeThread?.subtitle ?? "Client"}</div>
              </div>
            </div>

            <button type="button" className={styles.kebab} aria-label="Chat actions">
              <MoreVertical size={18} />
            </button>
          </div>

          {/* Chat body */}
          <div className={styles.chatBody}>
            {activeMessages.map((m, idx) => {
              const showDay =
                m.dayLabel &&
                (idx === 0 || activeMessages[idx - 1]?.dayLabel !== m.dayLabel);

              return (
                <div key={m.id} className={styles.msgGroup}>
                  {showDay ? (
                    <div className={styles.dayDivider}>
                      <div className={styles.dividerLine} />
                      <span className={styles.dayText}>{m.dayLabel}</span>
                      <div className={styles.dividerLine} />
                    </div>
                  ) : null}

                  <div className={cn(styles.msgRow, m.sender === "me" ? styles.msgRowMe : styles.msgRowThem)}>
                    <div className={cn(styles.bubble, m.sender === "me" ? styles.bubbleMe : styles.bubbleThem)}>
                      {m.text}
                    </div>
                  </div>
                  <div className={cn(styles.timeRow, m.sender === "me" ? styles.timeRowMe : styles.timeRowThem)}>
                    {m.time}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chat input */}
          <div className={styles.chatComposer}>
            <button type="button" className={styles.attachBtn} aria-label="Attach file">
              <Paperclip size={18} />
            </button>

            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Enter your message"
              className={styles.composerInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSendMessage();
              }}
            />

            <Button
              type="button"
              onClick={onSendMessage}
              className={styles.sendBtn}
              aria-label="Send message"
            >
              <SendHorizonal size={18} />
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
