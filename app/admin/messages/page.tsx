"use client"

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react"
import {
  fetchConversations,
  fetchMessages,
  postMessage,
  fetchAvailableUsers,
  markConversationAsRead,
  markAllConversationsAsRead,
  type Message
} from "@/lib/messages"
import { supabase } from '@/lib/supabaseClient'
import { Search, MessageSquare, Loader2, MoreHorizontal, UserPlus, ArrowLeft } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ACCENT = "#00c065"

function roleKey(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase()
}

function roleLabel(role: string) {
  if (!role || role === "all") return "All"
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

type ConversationSummary = {
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
  kind?: "user" | "client"
  clientId?: string
  projectId?: string
  assignedTasks?: string
}

type ConversationPayload = {
  conversation_id: string
  users?: {
    username?: string | null
    role?: string | null
    profile_image_url?: string | null
  } | null
  latest_message?: {
    content?: string | null
    created_at: string
  } | null
  last_read_at?: string | null
}

export default function AdminMessages() {
  // UI State
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Data State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  // New Chat Modal State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all")
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false)
  const [hasLoadedRecipients, setHasLoadedRecipients] = useState(false)
  const [recipientLoadError, setRecipientLoadError] = useState<string | null>(null)

  // Mobile view toggle (list vs chat)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")

  // Message actions state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [visibleDotsId, setVisibleDotsId] = useState<string | null>(null)

  // Auto-Scroll Ref
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dotsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-conversation message cache so repeat visits don't refetch and the
  // sidebar prefetch-on-hover has somewhere to drop its results.
  const [messageCache, setMessageCache] = useState<Map<string, Message[]>>(new Map())
  // Per-conversation "has older messages still on the server" flag so the
  // scroll-to-top loader stops asking once we've reached the beginning.
  const [hasMoreMap, setHasMoreMap] = useState<Map<string, boolean>>(new Map())
  // Tracks an in-flight older-messages fetch to prevent duplicate requests
  // when the user keeps scrolling at the top.
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  // When prepending older messages we want to keep the visually-anchored
  // message in place. Capture the scroll height before the prepend so we can
  // restore the visible position after.
  const prependScrollAnchor = useRef<{ prevHeight: number; prevTop: number } | null>(null)
  // Tracks in-flight prefetches per conversation so hovering twice doesn't
  // fire two requests.
  const prefetchingRef = useRef<Set<string>>(new Set())

  const PAGE_SIZE = 7

  const showDots = (msgId: string) => {
    if (dotsHideTimer.current) clearTimeout(dotsHideTimer.current)
    setVisibleDotsId(msgId)
  }
  const startHideDots = () => {
    dotsHideTimer.current = setTimeout(() => setVisibleDotsId(null), 1000)
  }

  // Bulk-clear unread state across every one of the user's conversations
  // the moment the messages page mounts. This makes the sidebar badge drop
  // to zero on arrival rather than only after the user clicks each thread.
  // The per-conversation unread pills in the sidebar still work — they
  // track the same `last_read_at` field, so they reset together.
  useEffect(() => {
    if (!currentUserId) return
    void markAllConversationsAsRead(currentUserId)
  }, [currentUserId])

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
    // Don't auto-scroll to the bottom when the change came from prepending
    // older messages — the prepend handler restores scroll position itself.
    if (prependScrollAnchor.current) return
    scrollToBottom()
  }, [chatHistory])

  // 3. Helper function to load/refresh conversations
  const loadConversations = useCallback(async (userId: string, selectChatId?: string) => {
    const data = await fetchConversations(userId) as ConversationPayload[]
    const mappedConvos = data.map((cp) => {
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
        lastMessage: lastMsg?.content || "Say hello!",
        unread: isUnread,
        lastActivity: lastMsgTime // <-- NEW: Store time for sorting
      }
    })

    // <-- NEW: Sort initial load (highest timestamp first)
    mappedConvos.sort((a, b) => b.lastActivity - a.lastActivity)

    setConversations(mappedConvos)

    if (selectChatId) {
      setActiveChatId(selectChatId)
      setMobileView("chat")
    } else if (mappedConvos.length > 0) {
      setActiveChatId((currentChatId) => currentChatId || mappedConvos[0].id)
    }
    setIsLoading(false)
  }, [])

  // 4. Initial Load — pick up pendingConvId from staff Message button if present
  useEffect(() => {
    if (!currentUserId) return
    const pendingConvId = localStorage.getItem("pendingConvId") ?? undefined
    if (pendingConvId) localStorage.removeItem("pendingConvId")
    loadConversations(currentUserId, pendingConvId)
  }, [currentUserId, loadConversations])

  // 5. When user CLICKS a chat, Mark as Read in DB
  useEffect(() => {
    if (activeChatId && currentUserId) {
      markConversationAsRead(activeChatId, currentUserId)
      setConversations(prev => prev.map(c =>
        c.id === activeChatId ? { ...c, unread: false } : c
      ))
    }
  }, [activeChatId, currentUserId])

  // 6. Fetch Chat History (with in-memory cache + pagination)
  useEffect(() => {
    if (!activeChatId) return

    let cancelled = false

    // If we already have this conversation cached, render it instantly —
    // no spinner, no flicker. The realtime listener keeps the cache fresh
    // for any new messages that arrive while the conversation is open.
    const cached = messageCache.get(activeChatId)
    if (cached) {
      setChatHistory(cached)
      setIsLoadingMessages(false)
      return () => {
        cancelled = true
      }
    }

    // First time opening this conversation in this session — clear stale
    // messages from the previous one and show the loader.
    setChatHistory([])
    setIsLoadingMessages(true)

    ;(async () => {
      const result = await fetchMessages(activeChatId, { limit: PAGE_SIZE })
      if (cancelled) return
      setChatHistory(result.messages)
      setMessageCache((prev) => new Map(prev).set(activeChatId, result.messages))
      setHasMoreMap((prev) => new Map(prev).set(activeChatId, result.hasMore))
      setIsLoadingMessages(false)
    })()

    return () => {
      cancelled = true
    }
  }, [activeChatId, messageCache])

  // Prefetch the most recent page for a conversation in the background. Wired
  // to onMouseEnter on each sidebar row so by the time the user clicks, the
  // messages are already cached and the chat opens with no spinner.
  const prefetchConversation = useCallback((conversationId: string) => {
    if (messageCache.has(conversationId)) return
    if (prefetchingRef.current.has(conversationId)) return
    prefetchingRef.current.add(conversationId)
    void (async () => {
      try {
        const result = await fetchMessages(conversationId, { limit: PAGE_SIZE })
        // Skip overwriting if the user got there first and triggered the
        // primary fetch — its result is fresher.
        setMessageCache((prev) => {
          if (prev.has(conversationId)) return prev
          return new Map(prev).set(conversationId, result.messages)
        })
        setHasMoreMap((prev) => {
          if (prev.has(conversationId)) return prev
          return new Map(prev).set(conversationId, result.hasMore)
        })
      } finally {
        prefetchingRef.current.delete(conversationId)
      }
    })()
  }, [messageCache])

  // Load the next page of older messages, prepending them while preserving
  // the user's visible scroll position.
  const loadOlderMessages = useCallback(async () => {
    if (!activeChatId) return
    if (isLoadingOlder) return
    if (chatHistory.length === 0) return
    if (hasMoreMap.get(activeChatId) === false) return

    setIsLoadingOlder(true)

    // Capture scroll metrics so we can restore the user's position after
    // the new content is prepended.
    const scrollEl = messagesScrollRef.current
    if (scrollEl) {
      prependScrollAnchor.current = {
        prevHeight: scrollEl.scrollHeight,
        prevTop: scrollEl.scrollTop,
      }
    }

    const oldest = chatHistory[0]
    const result = await fetchMessages(activeChatId, {
      limit: PAGE_SIZE,
      before: oldest.created_at,
    })

    setChatHistory((prev) => {
      const merged = [...result.messages, ...prev]
      setMessageCache((cache) => new Map(cache).set(activeChatId, merged))
      return merged
    })
    setHasMoreMap((prev) => new Map(prev).set(activeChatId, result.hasMore))
    setIsLoadingOlder(false)
  }, [activeChatId, chatHistory, hasMoreMap, isLoadingOlder])

  // Trigger loading the next older page when the user scrolls near the top.
  useEffect(() => {
    const scrollEl = messagesScrollRef.current
    if (!scrollEl) return

    const onScroll = () => {
      if (scrollEl.scrollTop <= 40) {
        void loadOlderMessages()
      }
    }
    scrollEl.addEventListener("scroll", onScroll)
    return () => scrollEl.removeEventListener("scroll", onScroll)
  }, [loadOlderMessages])

  // Helper: apply a chatHistory update AND mirror it into the cache for the
  // active conversation so the cache doesn't go stale on send/edit/delete.
  // Always dedupes by id at the end — realtime + polling + send-handler can
  // each independently try to add the same message in tight races (worst
  // case StrictMode double-invokes everything in dev), and React errors
  // hard on duplicate keys.
  const applyChatUpdate = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setChatHistory((prev) => {
        const next = updater(prev)
        const seen = new Set<string>()
        const deduped = next.filter((msg) => {
          if (seen.has(msg.id)) return false
          seen.add(msg.id)
          return true
        })
        if (activeChatId) {
          setMessageCache((cache) => new Map(cache).set(activeChatId, deduped))
        }
        return deduped
      })
    },
    [activeChatId],
  )

  // After older messages are prepended, restore scroll so the message the
  // user was looking at stays put instead of jumping to the top.
  useEffect(() => {
    const anchor = prependScrollAnchor.current
    if (!anchor) return
    const scrollEl = messagesScrollRef.current
    if (!scrollEl) return
    const heightDelta = scrollEl.scrollHeight - anchor.prevHeight
    scrollEl.scrollTop = anchor.prevTop + heightDelta
    prependScrollAnchor.current = null
  }, [chatHistory])

  // Focus input whenever a conversation is opened
  useEffect(() => {
    if (activeChatId) setTimeout(() => inputRef.current?.focus(), 0)
  }, [activeChatId])

  // Tracks the newest message timestamp currently in chatHistory so the
  // polling fallback can request only what's strictly newer than that,
  // instead of re-downloading the whole conversation every tick. Lives in a
  // ref so the polling interval can read the latest value without restarting.
  const latestMessageAtRef = useRef<string | null>(null)
  useEffect(() => {
    if (chatHistory.length === 0) {
      latestMessageAtRef.current = null
      return
    }
    let max = chatHistory[0].created_at
    for (const m of chatHistory) {
      if (new Date(m.created_at).getTime() > new Date(max).getTime()) max = m.created_at
    }
    latestMessageAtRef.current = max
  }, [chatHistory])

  // Polling fallback for the chat panel: every 5s, ask for any messages
  // newer than the latest one we have and merge them in. Realtime alone
  // isn't reliable because the browser Supabase client is subject to RLS —
  // if the user can't SELECT a new message row directly the realtime push
  // is filtered out and the chat panel goes stale even though the sidebar
  // badge (which uses the server-side admin client) correctly shows the
  // new count. Pauses when the tab isn't visible.
  useEffect(() => {
    if (!activeChatId) return

    let cancelled = false

    async function pollActiveChat() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      const after = latestMessageAtRef.current
      // No baseline yet — the initial-load effect is still in flight or the
      // conversation is empty. Either way, nothing to incrementally fetch.
      if (!after) return
      const result = await fetchMessages(activeChatId!, { after })
      if (cancelled) return
      if (result.messages.length === 0) return
      setChatHistory((prev) => {
        // Build the dedup set incrementally so a fetch that itself contains
        // duplicate rows (rare API race) can't slip a second copy through.
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...prev]
        for (const msg of result.messages) {
          if (seen.has(msg.id)) continue
          seen.add(msg.id)
          merged.push(msg)
        }
        merged.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
        if (activeChatId) {
          setMessageCache((cache) => new Map(cache).set(activeChatId, merged))
        }
        return merged
      })
    }

    const interval = window.setInterval(() => {
      void pollActiveChat()
    }, 5_000)

    const onVisibility = () => {
      if (document.visibilityState === "visible") void pollActiveChat()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [activeChatId])

  // 7. Global Realtime Listener (Listens to ALL messages so sidebar updates)
  //
  // Subscription mounts ONCE per page life. Earlier we had `activeChatId`
  // in the deps array, which forced an unsubscribe + resubscribe every
  // time the user clicked a different conversation — and messages that
  // arrived during that window were dropped, which is why new messages
  // only appeared after navigating away and back. The handler now reads
  // `activeChatId` and `currentUserId` through refs so we can keep the
  // channel stable.
  const activeChatIdRef = useRef(activeChatId)
  const currentUserIdRef = useRef(currentUserId)
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])
  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => {
    const channel = supabase
      .channel(`global-chat-listener`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' }, // No filter, listen to all
        (payload) => {
          const newMessage = payload.new as Message
          const activeChat = activeChatIdRef.current
          const me = currentUserIdRef.current

          // Skip the realtime echo for our own outgoing messages —
          // handleSendMessage already updated chatHistory + the
          // sidebar optimistically, so processing it again would
          // re-mark the conversation as unread (line further down)
          // even though we're the one who just sent it.
          if (me && newMessage.sender_id === me) return

          if (newMessage.conversation_id === activeChat) {
            // It's the chat we are currently looking at
            if (newMessage.sender_id !== me) {
              setChatHistory((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) return prev
                return [...prev, newMessage]
              })
              if (me) markConversationAsRead(activeChat, me) // We read it instantly
            }
          }

          // Keep the cache in sync so a later switch back to this conversation
          // shows the freshly-arrived message instead of a stale snapshot.
          setMessageCache((prev) => {
            const cached = prev.get(newMessage.conversation_id)
            if (!cached) return prev
            if (cached.some((m) => m.id === newMessage.id)) return prev
            return new Map(prev).set(newMessage.conversation_id, [...cached, newMessage])
          })

          // Update the sidebar for ALL incoming messages and bump to top.
          // If the message is for a conversation NOT currently in the sidebar
          // (e.g., a brand-new project conversation just created by a server
          // route like /api/planning/notifyQuotationClient), refetch the
          // conversations list so it appears instead of being silently dropped.
          let conversationKnown = false
          setConversations(prev => {
            conversationKnown = prev.some(c => c.id === newMessage.conversation_id)
            if (!conversationKnown) return prev
            const updated = prev.map(c =>
              c.id === newMessage.conversation_id
                ? {
                    ...c,
                    unread: c.id !== activeChat, // Red dot only if we aren't looking at it
                    lastMessage: newMessage.content,
                    lastActivity: new Date(newMessage.created_at).getTime()
                  }
                : c
            )
            return updated.sort((a, b) => b.lastActivity - a.lastActivity)
          })

          if (!conversationKnown && me) {
            void loadConversations(me)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadConversations])

  // 8. Handle Sending a Message
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeChatId || !currentUserId) return
    setIsSending(true)
    try {
      const sentMsg = await postMessage(activeChatId, currentUserId, inputMessage)
      applyChatUpdate((prev) => [...prev, sentMsg])

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
      applyChatUpdate((prev) => prev.filter((m) => m.id !== messageId))
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
      applyChatUpdate((prev) => prev.map((m) => m.id === messageId ? { ...m, content: data.content } : m))
      setEditingId(null)
      startHideDots()
    } catch (error) {
      console.error("Error updating message:", error)
    }
  }

  // Modal Handlers
  const loadAvailableRecipients = useCallback(async (force = false) => {
    if (!currentUserId || (hasLoadedRecipients && !force)) return

    setIsLoadingRecipients(true)
    setRecipientLoadError(null)

    try {
      const users = await fetchAvailableUsers(currentUserId) as AvailableUser[]
      setAvailableUsers(users)
      setHasLoadedRecipients(true)
    } catch (error: unknown) {
      console.error("Error loading recipients:", error)
      setAvailableUsers([])
      setHasLoadedRecipients(false)
      setRecipientLoadError(
        error instanceof Error ? error.message : "Failed to load recipients."
      )
    } finally {
      setIsLoadingRecipients(false)
    }
  }, [currentUserId, hasLoadedRecipients])

  const handleOpenNewChat = () => {
    setIsNewChatOpen(true)
    setUserSearchQuery("")
    setSelectedRoleFilter("all")

    if (!isLoadingRecipients && (!hasLoadedRecipients || recipientLoadError)) {
      void loadAvailableRecipients(Boolean(recipientLoadError))
    }
  }

  const handleStartConversation = async (recipient: AvailableUser) => {
    if (!currentUserId) return
    setIsCreatingChat(true)
    try {
      const res = await fetch("/api/messages/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recipient.kind === "client"
            ? { targetClientId: recipient.clientId, projectId: recipient.projectId }
            : { targetUserId: recipient.id }
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to start conversation.")
      await loadConversations(currentUserId, data.conversationId)
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
            .map((u) => roleKey(u.role))
            .filter(Boolean)
        )
      ).sort(),
    ],
    [availableUsers]
  )

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.toLowerCase()

    return availableUsers.filter((u) => {
      const normalizedRole = roleKey(u.role)
      const matchesSearch =
        u.username.toLowerCase().includes(query) ||
        normalizedRole.includes(query) ||
        (u.assignedTasks ?? "").toLowerCase().includes(query)
      const matchesRole = selectedRoleFilter === "all" || normalizedRole === selectedRoleFilter

      return matchesSearch && matchesRole
    })
  }, [availableUsers, selectedRoleFilter, userSearchQuery])

  const activeChat = useMemo(
    () => conversations.find((c) => c.id === activeChatId) || null,
    [activeChatId, conversations]
  )

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>
        <div className="mt-4 sm:mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
          <div className="flex gap-4 sm:gap-6 h-full overflow-hidden">
            <aside className="w-full lg:w-72 xl:w-80 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Conversations</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-gray-300 animate-spin dark:text-slate-500" />
              </div>
            </aside>
            <div className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center min-w-0 hidden lg:flex">
              <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden">
      <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>

      <div className="mt-4 sm:mt-6 h-[calc(100%-3.25rem)] overflow-hidden">
        <div className="flex gap-4 sm:gap-6 h-full overflow-hidden">

          {/* Conversation Sidebar */}
          <aside className={[
            "rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col dark:border-slate-700 dark:bg-slate-900",
            "w-full lg:w-72 xl:w-80 lg:flex",
            mobileView === "list" ? "flex" : "hidden lg:flex",
          ].join(" ")}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 dark:border-slate-700">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Conversations</p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">Recent message threads</p>
              </div>
              <button
                onClick={handleOpenNewChat}
                aria-label="Start new message"
                title="Start new message"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-[#00c065]/40 hover:bg-emerald-50 hover:text-[#00c065] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-[#00c065]/50 dark:hover:bg-[#00c065]/10 dark:hover:text-[#00c065]"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {conversations.map((chat) => {
                const isActive = activeChatId === chat.id

                return (
                  <button
                    key={chat.id}
                    onClick={() => { setActiveChatId(chat.id); setMobileView("chat") }}
                    onMouseEnter={() => prefetchConversation(chat.id)}
                    onFocus={() => prefetchConversation(chat.id)}
                    className={[
                      "group relative w-full text-left border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 dark:border-slate-800",
                      isActive
                        ? "bg-emerald-50/70 dark:bg-[#00c065]/10"
                        : "bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800/70",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-opacity",
                        isActive ? "opacity-100 bg-[#00c065]" : "opacity-0 bg-transparent",
                      ].join(" ")}
                    />
                    <div className="flex items-start gap-3 pl-1">
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {chat.profile_image_url ? (
                          <img src={chat.profile_image_url} alt={chat.name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          <span>{chat.name.slice(0, 2).toUpperCase()}</span>
                        )}
                        {chat.unread ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 dark:border-slate-900" /> : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{chat.name}</p>
                        </div>
                        <p className={`mt-1 line-clamp-1 text-xs leading-5 ${chat.unread ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-500 dark:text-slate-400'}`}>
                          {chat.lastMessage}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
              {conversations.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-500">No active chats</div>
              )}
            </div>
          </aside>

          {/* Chat Area */}
          {activeChat ? (
            <section className={[
              "flex-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-w-0",
              mobileView === "chat" ? "flex" : "hidden lg:flex",
            ].join(" ")}>
              {/* Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setMobileView("list")}
                    className="lg:hidden mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
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
              <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 flex flex-col custom-scrollbar">
                {isLoadingMessages ? (
                  <div className="m-auto flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading messages...
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div className="m-auto text-gray-400 text-sm">Say hello to start the conversation!</div>
                ) : null}
                {isLoadingOlder ? (
                  <div className="flex justify-center py-2 text-xs text-gray-500">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Loading older messages...
                  </div>
                ) : null}
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
            <div className="hidden lg:flex flex-1 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm min-w-0">
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
          <div className="h-1.5 w-full bg-[#00c065]" />
          <DialogHeader className="bg-emerald-50/70 p-6 pb-4 border-b border-emerald-100">
            <DialogTitle className="text-xl font-semibold">New Message</DialogTitle>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, role, or task..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
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
                    onClick={() => handleStartConversation(user)}
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
