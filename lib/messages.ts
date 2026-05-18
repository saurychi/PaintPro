import { supabase } from '@/lib/supabaseClient'

export type Message = {
  id: string
  conversation_id: string
  sender_id: string | null
  client_id?: string | null
  content: string
  created_at: string
}

type ConversationPayload = {
  conversation_id: string
  users?: {
    id?: string | null
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

type RecipientPayload = {
  kind?: "user" | "client"
  id: string
  username: string
  role: string
  profile_image_url: string | null
  clientId?: string
  projectId?: string
  assignedTasks?: string
}

function readHttpError(
  data: { error?: string; details?: string } | null,
  fallback: string
) {
  return [data?.error, data?.details].filter(Boolean).join(": ") || fallback
}

export async function fetchConversations(userId: string): Promise<ConversationPayload[]> {
  void userId
  const response = await fetch('/api/messages/conversations', { cache: 'no-store' })
  if (!response.ok) {
    console.error('Error fetching conversations:', response.statusText)
    return []
  }

  const data = await response.json().catch(() => null)
  return Array.isArray(data) ? (data as ConversationPayload[]) : []
}

export type FetchMessagesResult = {
  messages: Message[]
  hasMore: boolean
}

export async function fetchMessages(
  conversationId: string,
  options: { limit?: number; before?: string | null; after?: string | null } = {},
): Promise<FetchMessagesResult> {
  // Goes through a server endpoint so RLS-blocked callers (project-cookie
  // clients without a Supabase auth user) can still read messages they're
  // entitled to. The endpoint authorizes via auth user OR project cookie.
  const params = new URLSearchParams({ conversationId })
  if (options.limit) params.set("limit", String(options.limit))
  if (options.before) params.set("before", options.before)
  if (options.after) params.set("after", options.after)

  const response = await fetch(`/api/messages/list?${params.toString()}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    console.error("Error fetching messages:", response.statusText)
    return { messages: [], hasMore: false }
  }

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== "object") return { messages: [], hasMore: false }

  // Tolerate the older array shape during rollout — pre-pagination responses
  // were a bare array. Drop this branch once everything's caught up.
  if (Array.isArray(data)) {
    return { messages: data as Message[], hasMore: false }
  }

  return {
    messages: Array.isArray(data.messages) ? (data.messages as Message[]) : [],
    hasMore: Boolean(data.hasMore),
  }
}

export async function postMessage(conversationId: string, _senderId: string, content: string) {
  // Routed through the server so guest clients (project-cookie mode, no
  // Supabase auth user) can send too — RLS would block their direct insert.
  // The server resolves sender_id (auth user) or client_id (cookie mode) from
  // the request itself, so the senderId argument is ignored but kept on the
  // signature so callers don't all need a refactor in one go.
  void _senderId
  const response = await fetch("/api/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, content }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(readHttpError(data, "Failed to send message."))
  }
  return data as Message
}

export async function fetchAvailableUsers(currentUserId: string): Promise<RecipientPayload[]> {
  void currentUserId
  const response = await fetch('/api/messages/recipients', { cache: 'no-store' })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(readHttpError(data, 'Failed to load recipients.'))
  }

  return Array.isArray(data) ? (data as RecipientPayload[]) : []
}

export async function createOrGetConversation(currentUserId: string, targetUserId: string) {
  const { data: myConvos } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', currentUserId)

  const myConvoIds = myConvos?.map(c => c.conversation_id) || []

  if (myConvoIds.length > 0) {
    const { data: sharedConvos } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', targetUserId)
      .in('conversation_id', myConvoIds)

    if (sharedConvos && sharedConvos.length > 0) return sharedConvos[0].conversation_id
  }

  const { data: convData, error: convError } = await supabase
    .from('conversations')
    .insert([{ updated_at: new Date().toISOString() }])
    .select()
    .single()

  if (convError) throw convError
  const newConvId = convData.id

  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: newConvId, user_id: currentUserId },
      { conversation_id: newConvId, user_id: targetUserId }
    ])

  if (partError) throw partError
  return newConvId
}

export async function updateMessage(messageId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', messageId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMessage(messageId: string) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
  if (error) throw error
}

// Custom DOM event the sidebar badge listens for so it can refetch the
// unread count the instant a conversation is marked read, instead of
// waiting up to ~15s for the next polling tick.
const MESSAGES_READ_EVENT = "paintpro:messages-read"

function dispatchMessagesReadEvent() {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new CustomEvent(MESSAGES_READ_EVENT))
  } catch {}
}

export async function markConversationAsRead(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)

  if (error) console.error("Error marking as read:", error)
  else dispatchMessagesReadEvent()
}

// Bulk-clears unread state across every conversation the user participates
// in. Called when the messages page mounts so the badge drops to zero on
// arrival, instead of only after the user clicks through each thread.
export async function markAllConversationsAsRead(userId: string) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) console.error("Error marking all as read:", error)
  else dispatchMessagesReadEvent()
}
