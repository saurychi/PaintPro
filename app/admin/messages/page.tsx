"use client"

import React, { useMemo, useState } from "react"

type Message = {
  id: string
  sender: "me" | "other"
  content: string
  timestamp: string
  date?: string
}

type Conversation = {
  id: string
  name: string
  role?: string
  lastMessage: string
  unread?: boolean
}

const conversations: Conversation[] = [
  { id: "1", name: "Client", lastMessage: "Client: The amount of paint needed did not ex...", unread: true },
  { id: "2", name: "Marco Dela Cruz", lastMessage: "You: yes thats okay" },
  { id: "3", name: "Ramon Santos", lastMessage: "Ramon Santos: sir i have an urgency and i cur..." },
]

const chatHistory: Message[] = [
  { id: "m1", sender: "other", content: "we changed the parts you mentioned", timestamp: "5min ago", date: "Today" },
  { id: "m2", sender: "me", content: "thank you", timestamp: "3min ago" },
  { id: "m3", sender: "other", content: "welcome", timestamp: "1min ago" },
  { id: "m4", sender: "me", content: "is the amount of paint okay?", timestamp: "1min ago" },
  { id: "m5", sender: "other", content: "The amount of paint needed did not exceed, so its okay", timestamp: "1min ago" },
]

const ACCENT = "#00c065"
const ACCENT_HOVER = "#00a054"

function AdminMessages() {
  const [activeChatId, setActiveChatId] = useState<string>("1")
  const [inputMessage, setInputMessage] = useState("")

  const activeChat = useMemo(
    () => conversations.find((c) => c.id === activeChatId) || conversations[0],
    [activeChatId]
  )

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
      <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>

      <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        {/* Full height without adding page scrollbar:
            - Outer container is capped to 100vh
            - Inner area uses remaining height after the H1 */}
        <div className="flex gap-6 h-full overflow-hidden">
          {/* Conversation List */}
          <aside className="w-full lg:w-1/4 xl:w-1/5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-hidden flex flex-col min-w-[260px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="text-sm font-semibold text-gray-900">Conversations</p>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-50"
              >
                New
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 min-h-0">
              {conversations.map((chat) => {
                const isActive = activeChatId === chat.id
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setActiveChatId(chat.id)}
                    className={[
                      "w-full text-left rounded-lg border bg-white p-3 shadow-sm transition-colors hover:bg-gray-50",
                      isActive ? "border-[#00c065]" : "border-gray-200",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {chat.unread ? <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> : null}
                          <p className="text-sm font-semibold text-gray-900 truncate">{chat.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-600 line-clamp-1">{chat.lastMessage}</p>
                      </div>

                      <span className="text-gray-400 hover:text-gray-600 shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Chat Area */}
          <section className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-w-0">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center relative shrink-0">
                  <span
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                    style={{ backgroundColor: ACCENT }}
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    {activeChat.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{activeChat.name}</p>
                  <p className="text-xs text-gray-600">{activeChat.role ?? "Project Manager"}</p>
                </div>
              </div>

              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
                aria-label="More"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
              {chatHistory.map((msg) => (
                <div key={msg.id}>
                  {msg.date ? (
                    <div className="flex items-center justify-center mb-4">
                      <div className="h-px bg-gray-200 w-1/4" />
                      <span className="px-3 text-xs font-semibold" style={{ color: ACCENT }}>
                        {msg.date}
                      </span>
                      <div className="h-px bg-gray-200 w-1/4" />
                    </div>
                  ) : null}

                  <div className={msg.sender === "me" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      className={[
                        "max-w-[72%] px-4 py-2.5 text-sm shadow-sm",
                        msg.sender === "me"
                          ? "rounded-lg text-white"
                          : "rounded-lg border border-gray-200 bg-white text-gray-900",
                      ].join(" ")}
                      style={msg.sender === "me" ? { backgroundColor: ACCENT } : undefined}
                    >
                      {msg.content}
                    </div>
                    <span className="mt-1 text-[10px] text-gray-500">{msg.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 shrink-0">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
                  aria-label="Attach"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <input
                  type="text"
                  placeholder="Enter your message"
                  className="flex-1 outline-none bg-white text-sm text-gray-700 placeholder:text-gray-400"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                />

                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                  aria-label="Send"
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default AdminMessages
