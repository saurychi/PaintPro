"use client"

import React, { useMemo, useState, useEffect, useRef } from "react"
import { Search, MessageSquare } from "lucide-react"
import { useClientProject } from "../ClientShellClient"
import { supabase } from "@/lib/supabaseClient"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ACCENT = "#00c065"

type Message = {
  id: string
  conversation_id: string
  sender_id: string | null
  client_id: string | null
  content: string
  created_at: string
}

type Conversation = {
  id: string
  name: string
  role: string
  profile_image_url: string | null
  lastMessage: string
  lastActivity: number
}

type StaffUser = {
  id: string
  username: string
  role: string
  profile_image_url: string | null
}

export default function ClientMessages() {
  const { projectId } = useClientProject()

  // UI State
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Data State
  const [clientId, setClientId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [chatHistory, setChatHistory] = useState<Message[]>([])

  // New Chat Modal State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<StaffUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [isCreatingChat, setIsCreatingChat] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

  // Load conversations list — also retrieves clientId tied to this project
  const loadConversations = async (selectChatId?: string) => {
    const res = await fetch("/api/messages/project-chat")
    if (!res.ok) { setIsLoading(false); return }
    const data = await res.json()
    const convos: Conversation[] = data.conversations ?? []
    setConversations(convos)
    if (data.clientId) setClientId(data.clientId)
    if (selectChatId) {
      setActiveChatId(selectChatId)
    } else if (convos.length > 0 && !activeChatId) {
      setActiveChatId(convos[0].id)
    }
    setIsLoading(false)
  }

  // Initial load
  useEffect(() => {
    if (!projectId) { setIsLoading(false); return }
    loadConversations()
  }, [projectId])

  // Fetch messages when active chat changes
  useEffect(() => {
    if (!activeChatId) return
    async function loadMessages() {
      const res = await fetch(`/api/messages/project-chat/messages?conversationId=${activeChatId}`)
      if (res.ok) setChatHistory(await res.json())
    }
    loadMessages()
  }, [activeChatId])

  // Realtime listener for incoming staff replies
  useEffect(() => {
    if (!activeChatId) return

    const channel = supabase
      .channel(`project-chat-${activeChatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeChatId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          // Skip messages we sent ourselves (already added optimistically)
          if (newMessage.client_id === clientId) return
          setChatHistory((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === activeChatId
                ? { ...c, lastMessage: newMessage.content, lastActivity: new Date(newMessage.created_at).getTime() }
                : c
            )
            return updated.sort((a, b) => b.lastActivity - a.lastActivity)
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeChatId, clientId])

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeChatId) return
    setIsSending(true)
    try {
      const res = await fetch("/api/messages/project-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeChatId, content: inputMessage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(`${data?.error} — ${data?.details ?? ""}`)
      const msg: Message = data
      setChatHistory((prev) => [...prev, msg])
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === activeChatId
            ? { ...c, lastMessage: inputMessage, lastActivity: Date.now() }
            : c
        )
        return updated.sort((a, b) => b.lastActivity - a.lastActivity)
      })
      setInputMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSendMessage()
  }

  const handleOpenNewChat = async () => {
    setIsNewChatOpen(true)
    const res = await fetch("/api/messages/project-chat/users")
    if (res.ok) setAvailableUsers(await res.json())
  }

  const handleStartConversation = async (targetUserId: string) => {
    setIsCreatingChat(true)
    try {
      const res = await fetch("/api/messages/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(`${data?.error || "Failed to start conversation."} — ${data?.details ?? ""}`)
      await loadConversations(data.conversationId)
      setIsNewChatOpen(false)
      setUserSearchQuery("")
    } catch (error) {
      console.error("Error starting conversation:", error)
    } finally {
      setIsCreatingChat(false)
    }
  }

  const filteredUsers = availableUsers.filter((u) =>
    u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearchQuery.toLowerCase())
  )

  const activeChat = useMemo(
    () => conversations.find((c) => c.id === activeChatId) || null,
    [activeChatId, conversations]
  )

  if (isLoading) {
    return <div className="p-6 text-gray-500 font-medium">Loading messages...</div>
  }

  if (!projectId) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64">
        <MessageSquare className="h-12 w-12 text-gray-200 mb-3" />
        <p className="text-sm text-gray-500">No project session found.</p>
      </div>
    )
  }

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
      <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>

      <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        <div className="flex gap-6 h-full overflow-hidden">

          {/* Conversation Sidebar */}
          <aside className="w-full lg:w-1/4 xl:w-1/5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-hidden flex flex-col min-w-[260px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="text-sm font-semibold text-gray-900">Conversations</p>
              <button
                onClick={handleOpenNewChat}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-50 transition-colors"
              >
                New
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
              {conversations.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={[
                    "w-full text-left rounded-lg border bg-white p-3 shadow-sm transition-colors hover:bg-gray-50",
                    activeChatId === chat.id ? "border-[#00c065]" : "border-gray-200",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{chat.name}</p>
                    <p className="mt-1 text-xs line-clamp-1 text-gray-600">{chat.lastMessage}</p>
                  </div>
                </button>
              ))}
              {conversations.length === 0 && (
                <div className="text-sm text-gray-400 mt-4 text-center">No active chats</div>
              )}
            </div>
          </aside>

          {/* Chat Area */}
          {activeChat ? (
            <section className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-w-0">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
                <div className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center relative shrink-0">
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ backgroundColor: ACCENT }} />
                  <span className="text-xs font-semibold text-gray-700">
                    {activeChat.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{activeChat.name}</p>
                  <p className="text-xs text-gray-600 capitalize">{activeChat.role}</p>
                </div>
              </div>

              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 flex flex-col custom-scrollbar">
                {chatHistory.length === 0 && (
                  <div className="m-auto text-gray-400 text-sm">Say hello to start the conversation!</div>
                )}
                {chatHistory.map((msg) => {
                  const isMe = msg.client_id !== null && msg.client_id === clientId
                  const timeString = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={msg.id}>
                      <div className={isMe ? "flex flex-col items-end" : "flex flex-col items-start"}>
                        <div
                          className={[
                            "max-w-[72%] px-4 py-2.5 text-sm shadow-sm",
                            isMe ? "rounded-lg text-white" : "rounded-lg border border-gray-200 bg-white text-gray-900",
                          ].join(" ")}
                          style={isMe ? { backgroundColor: ACCENT } : undefined}
                        >
                          {msg.content}
                        </div>
                        <span className="mt-1 text-[10px] text-gray-500">{timeString}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-gray-200 shrink-0">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <input
                    type="text"
                    placeholder="Enter your message..."
                    className="flex-1 outline-none bg-white text-sm text-gray-700 placeholder:text-gray-400"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isSending || !inputMessage.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors hover:bg-green-600"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {isSending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm min-w-0">
              <MessageSquare className="h-12 w-12 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No conversation selected</p>
              <p className="mt-1 text-xs text-gray-400">Pick one from the list or start a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="max-w-md bg-white border-0 shadow-xl overflow-hidden flex flex-col max-h-[80vh] p-0">
          <DialogHeader className="p-6 pb-4 border-b border-gray-100">
            <DialogTitle className="text-xl font-semibold">New Message</DialogTitle>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or role..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00c065]/20"
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No users found.</p>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleStartConversation(user.id)}
                    disabled={isCreatingChat}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                      {user.profile_image_url ? (
                        <img src={user.profile_image_url} alt={user.username} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-gray-600">
                          {user.username.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user.username}</p>
                      <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
