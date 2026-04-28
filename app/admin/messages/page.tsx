"use client"

import React, { useMemo, useState, useEffect, useRef } from "react"
import {
  fetchConversations,
  fetchMessages,
  postMessage,
  fetchAvailableUsers,
  markConversationAsRead,
  updateMessage,
  deleteMessage,
  type Message
} from "@/lib/messages"
import { supabase } from '@/lib/supabaseClient'
import { Search, MessageSquare, Loader2, MoreHorizontal } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ACCENT = "#00c065"

export default function AdminMessages() {
  // UI State
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // Data State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<any[]>([]) 
  const [chatHistory, setChatHistory] = useState<Message[]>([])

  // New Chat Modal State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [isCreatingChat, setIsCreatingChat] = useState(false)

  // Message actions state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [visibleDotsId, setVisibleDotsId] = useState<string | null>(null)

  // Auto-Scroll Ref
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dotsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showDots = (msgId: string) => {
    if (dotsHideTimer.current) clearTimeout(dotsHideTimer.current)
    setVisibleDotsId(msgId)
  }
  const startHideDots = () => {
    dotsHideTimer.current = setTimeout(() => setVisibleDotsId(null), 1000)
  }

  // 1. Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)
    }
    getUser()
  }, [])

  // 2. Auto-Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

  // 3. Helper function to load/refresh conversations
  const loadConversations = async (userId: string, selectChatId?: string) => {
    const data = await fetchConversations(userId)
    const mappedConvos = data.map((cp: any) => {
      // Calculate unread status by comparing timestamps
      const lastMsg = cp.latest_message
      const lastReadAt = cp.last_read_at ? new Date(cp.last_read_at).getTime() : 0
      const lastMsgTime = lastMsg ? new Date(lastMsg.created_at).getTime() : 0
      const isUnread = lastMsgTime > lastReadAt

      return {
        id: cp.conversation_id,
        name: cp.users?.username || "Unknown User",
        role: cp.users?.role || "Client",
        profile_image_url: cp.users?.profile_image_url || null,
        lastMessage: lastMsg ? lastMsg.content : "Say hello!", 
        unread: isUnread,
        lastActivity: lastMsgTime // <-- NEW: Store time for sorting
      }
    })

    // <-- NEW: Sort initial load (highest timestamp first)
    mappedConvos.sort((a, b) => b.lastActivity - a.lastActivity)

    setConversations(mappedConvos)
    
    if (selectChatId) {
      setActiveChatId(selectChatId)
    } else if (mappedConvos.length > 0 && !activeChatId) {
      setActiveChatId(mappedConvos[0].id)
    }
    setIsLoading(false)
  }

  // 4. Initial Load — pick up pendingConvId from staff Message button if present
  useEffect(() => {
    if (!currentUserId) return
    const pendingConvId = localStorage.getItem("pendingConvId") ?? undefined
    if (pendingConvId) localStorage.removeItem("pendingConvId")
    loadConversations(currentUserId, pendingConvId)
  }, [currentUserId])

  // 5. When user CLICKS a chat, Mark as Read in DB
  useEffect(() => {
    if (activeChatId && currentUserId) {
      markConversationAsRead(activeChatId, currentUserId)
      setConversations(prev => prev.map(c =>
        c.id === activeChatId ? { ...c, unread: false } : c
      ))
    }
  }, [activeChatId, currentUserId])

  // 6. Fetch Chat History
  useEffect(() => {
    if (!activeChatId) return

    async function loadMessages() {
      const msgs = await fetchMessages(activeChatId!)
      setChatHistory(msgs)
    }
    loadMessages()
  }, [activeChatId])

  // Focus input whenever a conversation is opened
  useEffect(() => {
    if (activeChatId) setTimeout(() => inputRef.current?.focus(), 0)
  }, [activeChatId])

  // 7. Global Realtime Listener (Listens to ALL messages so sidebar updates)
  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`global-chat-listener`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' }, // No filter, listen to all
        (payload) => {
          const newMessage = payload.new as Message

          if (newMessage.conversation_id === activeChatId) {
            // It's the chat we are currently looking at
            if (newMessage.sender_id !== currentUserId) {
              setChatHistory((prev) => [...prev, newMessage])
              markConversationAsRead(activeChatId, currentUserId) // We read it instantly
            }
          }

          // <-- NEW: Update the sidebar for ALL incoming messages and bump to top
          setConversations(prev => {
            const updated = prev.map(c =>
              c.id === newMessage.conversation_id
                ? { 
                    ...c, 
                    unread: c.id !== activeChatId, // Red dot only if we aren't looking at it
                    lastMessage: newMessage.content,
                    lastActivity: new Date(newMessage.created_at).getTime() 
                  }
                : c
            )
            // Re-sort the array so this chat jumps to the top
            return updated.sort((a, b) => b.lastActivity - a.lastActivity)
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeChatId, currentUserId])

  // 8. Handle Sending a Message
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeChatId || !currentUserId) return
    setIsSending(true)
    try {
      const sentMsg = await postMessage(activeChatId, currentUserId, inputMessage)
      setChatHistory((prev) => [...prev, sentMsg])
      
      // <-- NEW: Update sidebar instantly for ourselves and bump to top
      setConversations(prev => {
        const updated = prev.map(c =>
          c.id === activeChatId 
            ? { ...c, lastMessage: inputMessage, unread: false, lastActivity: Date.now() } 
            : c
        )
        return updated.sort((a, b) => b.lastActivity - a.lastActivity)
      })

      setInputMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsSending(false)
      // Focus after isSending clears so the input is no longer disabled
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSendMessage()
  }

  const handleDelete = async (messageId: string) => {
    setOpenMenuId(null)
    startHideDots()
    try {
      const res = await fetch(`/api/messages/manage?messageId=${messageId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      setChatHistory((prev) => prev.filter((m) => m.id !== messageId))
    } catch (error) {
      console.error("Error deleting message:", error)
    }
  }

  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return
    try {
      const res = await fetch("/api/messages/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, content: editText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to update")
      setChatHistory((prev) => prev.map((m) => m.id === messageId ? { ...m, content: data.content } : m))
      setEditingId(null)
      startHideDots()
    } catch (error) {
      console.error("Error updating message:", error)
    }
  }

  // Modal Handlers
  const handleOpenNewChat = async () => {
    setIsNewChatOpen(true)
    if (currentUserId) {
      const users = await fetchAvailableUsers(currentUserId)
      setAvailableUsers(users)
    }
  }

  const handleStartConversation = async (targetUserId: string) => {
    if (!currentUserId) return
    setIsCreatingChat(true)
    try {
      const res = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to start conversation.")
      await loadConversations(currentUserId, data.conversationId)
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {chat.unread ? <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" /> : null}
                        <p className="text-sm font-semibold text-gray-900 truncate">{chat.name}</p>
                      </div>
                      <p className={`mt-1 text-xs line-clamp-1 ${chat.unread ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        {chat.lastMessage}
                      </p>
                    </div>
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

              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 flex flex-col custom-scrollbar">
                {chatHistory.length === 0 && (
                  <div className="m-auto text-gray-400 text-sm">Say hello to start the conversation!</div>
                )}
                {openMenuId && <div className="fixed inset-0 z-10" onClick={() => { setOpenMenuId(null); startHideDots() }} />}
                {chatHistory.map((msg) => {
                  const isMe = msg.sender_id === currentUserId
                  const timeString = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const isEditing = editingId === msg.id
                  const menuOpen = openMenuId === msg.id
                  const dotsVisible = visibleDotsId === msg.id || menuOpen

                  return (
                    <div
                      key={msg.id}
                      className={`flex w-full items-end gap-1 ${isMe ? "justify-end" : "justify-start"}`}
                      onMouseEnter={() => isMe && showDots(msg.id)}
                      onMouseLeave={() => isMe && startHideDots()}
                    >
                      {/* Dots button — left of bubble for sent messages */}
                      {isMe && (
                        <div className="relative shrink-0 mb-0.5">
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setOpenMenuId(menuOpen ? null : msg.id)}
                            className={`p-1 rounded-full hover:bg-gray-100 text-gray-400 transition-opacity duration-200 ${dotsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {menuOpen && (
                            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 min-w-[110px]">
                              <button
                                onClick={() => { setEditingId(msg.id); setEditText(msg.content); setOpenMenuId(null); startHideDots() }}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(msg.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bubble + timestamp */}
                      <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                        {isEditing ? (
                          <div className="w-full flex flex-col gap-1">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(msg.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="px-3 py-2 text-sm rounded-lg border-2 outline-none"
                              style={{ borderColor: ACCENT }}
                            />
                            <div className="flex gap-2 justify-end">
                              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                              <button onMouseDown={(e) => e.preventDefault()} onClick={() => handleSaveEdit(msg.id)} className="text-xs font-semibold" style={{ color: ACCENT }}>Save</button>
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
                            {msg.content}
                          </div>
                        )}
                        <span className="mt-1 text-[10px] text-gray-500">{timeString}</span>
                      </div>
                    </div>
                  )
                })}
                {/* Auto-scroll target */}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-gray-200 shrink-0">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter your message..."
                    className="flex-1 outline-none bg-white text-sm text-gray-700 placeholder:text-gray-400"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
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

      {/* --- NEW CHAT MODAL --- */}
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