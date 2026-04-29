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

export async function fetchMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }) // Oldest to newest

  if (error) {
    console.error("Error fetching messages:", error)
    return []
  }
  return data
}

export async function postMessage(conversationId: string, senderId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, sender_id: senderId, content: content }])
    .select()
    .single()

  if (error) throw error
  return data
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

export async function markConversationAsRead(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)

  if (error) console.error("Error marking as read:", error)
}
