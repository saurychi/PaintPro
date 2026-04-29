"use client"

import Image from "next/image"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, MessageSquare, Loader2, MoreHorizontal, UserPlus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"

const ACCENT = "#00c065"

function roleKey(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase()
}

function roleLabel(role: string) {
  if (!role || role === "all") return "All"
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string | null
  client_id: string | null
  content: string
  created_at: string
}

type ConversationRow = {
  id: string
  name: string
  role: string
  profile_image_url: string | null
  lastMessage: string
  unread: boolean
  lastActivity: number
}

type AvailableUser = {
  id: string
  username: string
  role: string
  profile_image_url: string | null
  assignedTasks?: string
}

type ProjectChatResponse = {
  conversations?: Array<{
    id: string
    name: string
    role: string
    profile_image_url: string | null
    lastMessage: string
    lastActivity: number
  }>
  clientId?: string | null
  error?: string
  details?: string
}

type ConversationCreateResponse = {
  conversationId?: string
  error?: string
  details?: string
}

function readError(data: { error?: string; details?: string } | null, fallback: string) {
  return [data?.error, data?.details].filter(Boolean).join(": ") || fallback
}

export default function ClientMessages() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [currentClientId, setCurrentClientId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [chatHistory, setChatHistory] = useState<MessageRow[]>([])

  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all")
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false)
  const [hasLoadedRecipients, setHasLoadedRecipients] = useState(false)
  const [recipientLoadError, setRecipientLoadError] = useState<string | null>(null)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [visibleDotsId, setVisibleDotsId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dotsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showDots = (messageId: string) => {
    if (dotsHideTimer.current) clearTimeout(dotsHideTimer.current)
    setVisibleDotsId(messageId)
  }

  const startHideDots = () => {
    dotsHideTimer.current = setTimeout(() => setVisibleDotsId(null), 1000)
  }

  const isOwnMessage = useCallback((message: Pick<MessageRow, "client_id">) => {
    return Boolean(currentClientId && message.client_id === currentClientId)
  }, [currentClientId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

  const loadConversations = useCallback(async (selectChatId?: string, fallbackActiveChatId?: string | null) => {
    try {
      setLoadErr(null)

      const response = await fetch("/api/messages/project-chat", { cache: "no-store" })
      const data = (await response.json().catch(() => null)) as ProjectChatResponse | null

      if (!response.ok) {
        throw new Error(readError(data, "Failed to load conversations."))
      }

      setCurrentClientId(data?.clientId ?? null)

      const mappedConversations: ConversationRow[] = (data?.conversations ?? []).map((conversation) => ({
        ...conversation,
        unread: false,
      }))

      mappedConversations.sort((a, b) => b.lastActivity - a.lastActivity)
      setConversations(mappedConversations)

      if (selectChatId) {
        setActiveChatId(selectChatId)
      } else if (!mappedConversations.some((chat) => chat.id === fallbackActiveChatId)) {
        setActiveChatId(mappedConversations[0]?.id ?? null)
      }
    } catch (error: unknown) {
      console.error("Error loading conversations:", error)
      setLoadErr(error instanceof Error ? error.message : "Failed to load conversations.")
      setConversations([])
      setActiveChatId(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations(undefined, null)
    return () => {
      if (dotsHideTimer.current) clearTimeout(dotsHideTimer.current)
    }
  }, [loadConversations])

  useEffect(() => {
    if (!activeChatId) {
      setChatHistory([])
      return
    }

    const loadMessages = async () => {
      try {
        const response = await fetch(
          `/api/messages/project-chat/messages?conversationId=${encodeURIComponent(activeChatId)}`,
          { cache: "no-store" }
        )

        const data = (await response.json().catch(() => null)) as
          | MessageRow[]
          | { error?: string; details?: string }
          | null

        if (!response.ok) {
          throw new Error(
            readError(
              Array.isArray(data) ? null : data,
              "Failed to load messages."
            )
          )
        }

        setChatHistory(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error("Error loading messages:", error)
      }
    }

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeChatId ? { ...conversation, unread: false } : conversation
      )
    )

    void loadMessages()
  }, [activeChatId])

  useEffect(() => {
    if (activeChatId) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [activeChatId])

  useEffect(() => {
    const channel = supabase
      .channel("client-project-chat-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: { new: MessageRow }) => {
          const newMessage = payload.new
          const ownMessage = isOwnMessage(newMessage)

          if (newMessage.conversation_id === activeChatId) {
            if (!ownMessage) {
              setChatHistory((prev) => [...prev, newMessage])
            }
          }

          setConversations((prev) => {
            const updated = prev.map((conversation) =>
              conversation.id === newMessage.conversation_id
                ? {
                    ...conversation,
                    unread: !ownMessage && conversation.id !== activeChatId,
                    lastMessage: newMessage.content,
                    lastActivity: new Date(newMessage.created_at).getTime(),
                  }
                : conversation
            )

            return updated.sort((a, b) => b.lastActivity - a.lastActivity)
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChatId, isOwnMessage])

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeChatId) return

    setIsSending(true)
    try {
      const response = await fetch("/api/messages/project-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeChatId,
          content: inputMessage.trim(),
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | MessageRow
        | { error?: string; details?: string }
        | null

      if (!response.ok || !data || Array.isArray(data)) {
        throw new Error(readError(data as { error?: string; details?: string } | null, "Failed to send message."))
      }

      if ("client_id" in data && data.client_id) {
        setCurrentClientId(data.client_id)
      }

      setChatHistory((prev) => [...prev, data as MessageRow])
      setConversations((prev) => {
        const updated = prev.map((conversation) =>
          conversation.id === activeChatId
            ? {
                ...conversation,
                unread: false,
                lastMessage: inputMessage.trim(),
                lastActivity: Date.now(),
              }
            : conversation
        )

        return updated.sort((a, b) => b.lastActivity - a.lastActivity)
      })
      setInputMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsSending(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void handleSendMessage()
    }
  }

  const handleDelete = async (messageId: string) => {
    setOpenMenuId(null)
    startHideDots()
    try {
      const response = await fetch(
        `/api/messages/project-chat/messages?messageId=${encodeURIComponent(messageId)}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: string } | null
        throw new Error(readError(data, "Failed to delete message."))
      }

      setChatHistory((prev) => prev.filter((message) => message.id !== messageId))
    } catch (error) {
      console.error("Error deleting message:", error)
    }
  }

  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return

    try {
      const response = await fetch("/api/messages/project-chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, content: editText.trim() }),
      })

      const data = (await response.json().catch(() => null)) as
        | MessageRow
        | { error?: string; details?: string }
        | null

      if (!response.ok || !data || Array.isArray(data)) {
        throw new Error(readError(data as { error?: string; details?: string } | null, "Failed to update message."))
      }

      setChatHistory((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, content: (data as MessageRow).content } : message
        )
      )
      setEditingId(null)
      startHideDots()
    } catch (error) {
      console.error("Error updating message:", error)
    }
  }

  const loadAvailableRecipients = useCallback(async (force = false) => {
    if (hasLoadedRecipients && !force) return

    setIsLoadingRecipients(true)
    setRecipientLoadError(null)

    try {
      const response = await fetch("/api/messages/project-chat/users", { cache: "no-store" })
      const data = (await response.json().catch(() => null)) as
        | AvailableUser[]
        | { error?: string; details?: string }
        | null

      if (!response.ok) {
        throw new Error(readError(Array.isArray(data) ? null : data, "Failed to load users."))
      }

      setAvailableUsers(Array.isArray(data) ? data : [])
      setHasLoadedRecipients(true)
    } catch (error: unknown) {
      console.error("Error loading users:", error)
      setAvailableUsers([])
      setHasLoadedRecipients(false)
      setRecipientLoadError(
        error instanceof Error ? error.message : "Failed to load users."
      )
    } finally {
      setIsLoadingRecipients(false)
    }
  }, [hasLoadedRecipients])

  const handleOpenNewChat = () => {
    setIsNewChatOpen(true)
    setUserSearchQuery("")
    setSelectedRoleFilter("all")

    if (!isLoadingRecipients && (!hasLoadedRecipients || recipientLoadError)) {
      void loadAvailableRecipients(Boolean(recipientLoadError))
    }
  }

  const handleStartConversation = async (targetUserId: string) => {
    setIsCreatingChat(true)
    try {
      const response = await fetch("/api/messages/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      })

      const data = (await response.json().catch(() => null)) as ConversationCreateResponse | null

      if (!response.ok || !data?.conversationId) {
        throw new Error(readError(data, "Failed to start conversation."))
      }

      await loadConversations(data.conversationId, activeChatId)
      setIsNewChatOpen(false)
      setUserSearchQuery("")
      setSelectedRoleFilter("all")
    } catch (error) {
      console.error("Error starting conversation:", error)
    } finally {
      setIsCreatingChat(false)
    }
  }

  const availableRoleFilters = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          availableUsers
            .map((user) => roleKey(user.role))
            .filter(Boolean)
        )
      ).sort(),
    ],
    [availableUsers]
  )

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.toLowerCase()

    return availableUsers.filter((user) => {
      const normalizedRole = roleKey(user.role)
      const matchesRole = selectedRoleFilter === "all" || normalizedRole === selectedRoleFilter

      return (
        matchesRole &&
        (
          user.username.toLowerCase().includes(query) ||
          normalizedRole.includes(query) ||
          (user.assignedTasks ?? "").toLowerCase().includes(query)
        )
      )
    })
  }, [availableUsers, selectedRoleFilter, userSearchQuery])

  const activeChat = useMemo(
    () => conversations.find((conversation) => conversation.id === activeChatId) || null,
    [activeChatId, conversations]
  )

  if (isLoading) {
    return (
      <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>
        <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
          <div className="flex gap-6 h-full overflow-hidden">
            <aside className="w-full lg:w-1/4 xl:w-1/5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-hidden flex flex-col min-w-[260px]">
              <p className="text-sm font-semibold text-gray-900 mb-3 shrink-0">Conversations</p>
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
              </div>
            </aside>
            <div className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center min-w-0">
              <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
      <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>

      <div className="mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        <div className="flex gap-6 h-full overflow-hidden">
          <aside className="w-full lg:w-1/4 xl:w-1/5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-hidden flex flex-col min-w-[260px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="text-sm font-semibold text-gray-900">Conversations</p>
              <button
                onClick={handleOpenNewChat}
                aria-label="Start new message"
                title="Start new message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
              {loadErr ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {loadErr}
                </div>
              ) : null}

              {conversations.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={[
                    "w-full text-left rounded-lg border bg-white p-3 shadow-sm transition-colors hover:bg-gray-50",
                    activeChatId === chat.id ? "border-[#00c065]" : "border-gray-200",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {chat.unread ? <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" /> : null}
                        <p className="text-sm font-semibold text-gray-900 truncate">{chat.name}</p>
                      </div>
                      <p className={`mt-1 text-xs line-clamp-1 ${chat.unread ? "font-bold text-gray-900" : "text-gray-600"}`}>
                        {chat.lastMessage}
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {!loadErr && conversations.length === 0 ? (
                <div className="text-sm text-gray-400 mt-4 text-center">No active chats</div>
              ) : null}
            </div>
          </aside>

          {activeChat ? (
            <section className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-w-0">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
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
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 flex flex-col custom-scrollbar">
                {chatHistory.length === 0 ? (
                  <div className="m-auto text-gray-400 text-sm">Say hello to start the conversation!</div>
                ) : null}

                {openMenuId ? (
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => {
                      setOpenMenuId(null)
                      startHideDots()
                    }}
                  />
                ) : null}

                {chatHistory.map((message) => {
                  const isMe = isOwnMessage(message)
                  const timeString = new Date(message.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                  const isEditing = editingId === message.id
                  const menuOpen = openMenuId === message.id
                  const dotsVisible = visibleDotsId === message.id || menuOpen

                  return (
                    <div
                      key={message.id}
                      className={`flex w-full items-end gap-1 ${isMe ? "justify-end" : "justify-start"}`}
                      onMouseEnter={() => isMe && showDots(message.id)}
                      onMouseLeave={() => isMe && startHideDots()}
                    >
                      {isMe ? (
                        <div className="relative shrink-0 mb-0.5">
                          <button
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setOpenMenuId(menuOpen ? null : message.id)}
                            className={`p-1 rounded-full hover:bg-gray-100 text-gray-400 transition-opacity duration-200 ${dotsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {menuOpen ? (
                            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 min-w-[110px]">
                              <button
                                onClick={() => {
                                  setEditingId(message.id)
                                  setEditText(message.content)
                                  setOpenMenuId(null)
                                  startHideDots()
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void handleDelete(message.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                        {isEditing ? (
                          <div className="w-full flex flex-col gap-1">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(event) => setEditText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void handleSaveEdit(message.id)
                                }
                                if (event.key === "Escape") {
                                  setEditingId(null)
                                }
                              }}
                              className="px-3 py-2 text-sm rounded-lg border-2 outline-none"
                              style={{ borderColor: ACCENT }}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => setEditingId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                              <button
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => void handleSaveEdit(message.id)}
                                className="text-xs font-semibold"
                                style={{ color: ACCENT }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={[
                              "px-4 py-2.5 text-sm shadow-sm rounded-lg",
                              isMe ? "text-white" : "border border-gray-200 bg-white text-gray-900",
                            ].join(" ")}
                            style={isMe ? { backgroundColor: ACCENT } : undefined}
                          >
                            {message.content}
                          </div>
                        )}
                        <span className="mt-1 text-[10px] text-gray-500">{timeString}</span>
                      </div>
                    </div>
                  )
                })}

                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-gray-200 shrink-0">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter your message..."
                    className="flex-1 outline-none bg-white text-sm text-gray-700 placeholder:text-gray-400"
                    value={inputMessage}
                    onChange={(event) => setInputMessage(event.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handleSendMessage()}
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

      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="max-w-md bg-white border-0 shadow-xl overflow-hidden flex flex-col max-h-[80vh] p-0">
          <div className="h-1.5 w-full bg-[#00c065]" />
          <DialogHeader className="bg-emerald-50/70 p-6 pb-4 border-b border-emerald-100">
            <DialogTitle className="text-xl font-semibold">New Message</DialogTitle>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, role, or task..."
                value={userSearchQuery}
                onChange={(event) => setUserSearchQuery(event.target.value)}
                disabled={isLoadingRecipients}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00c065]/20"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {availableRoleFilters.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRoleFilter(role)}
                  disabled={isLoadingRecipients}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    selectedRoleFilter === role
                      ? "border-[#00c065]/40 bg-emerald-50 text-[#00c065]"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {roleLabel(role)}
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {isLoadingRecipients ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#00c065]" />
              </div>
            ) : recipientLoadError ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-red-600">{recipientLoadError}</p>
                <button
                  type="button"
                  onClick={() => void loadAvailableRecipients(true)}
                  className="rounded-lg border border-[#00c065]/30 bg-emerald-50 px-3 py-2 text-xs font-semibold text-[#00c065] transition-colors hover:bg-emerald-100"
                >
                  Try Again
                </button>
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No users found.</p>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => void handleStartConversation(user.id)}
                    disabled={isCreatingChat}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="relative h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200 overflow-hidden">
                      {user.profile_image_url ? (
                        <Image
                          src={user.profile_image_url}
                          alt={user.username}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-gray-600">
                          {user.username.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user.username}</p>
                      <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                      {user.assignedTasks ? (
                        <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-2">{user.assignedTasks}</p>
                      ) : null}
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
