import { supabase } from '@/lib/supabaseClient'

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

export async function fetchConversations(userId: string) {
  const { data: myConvos, error: myError } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', userId)

  if (myError || !myConvos || myConvos.length === 0) return []

  const convoIds = myConvos.map(c => c.conversation_id)
  const myConvosMap = Object.fromEntries(myConvos.map(c => [c.conversation_id, c.last_read_at]))

  const { data: otherParticipants, error: otherError } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      users ( id, username, role, profile_image_url )
    `)
    .in('conversation_id', convoIds)
    .neq('user_id', userId)

  if (otherError) return []

  const { data: latestMessages } = await supabase
    .from('messages')
    .select('conversation_id, content, created_at')
    .in('conversation_id', convoIds)
    .order('created_at', { ascending: false })

  const latestMessageMap: Record<string, any> = {}
  if (latestMessages) {
    for (const msg of latestMessages) {
      if (!latestMessageMap[msg.conversation_id]) {
        latestMessageMap[msg.conversation_id] = msg
      }
    }
  }

  return otherParticipants.map(p => ({
    ...p,
    last_read_at: myConvosMap[p.conversation_id],
    latest_message: latestMessageMap[p.conversation_id] || null
  }))
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

export async function fetchAvailableUsers(currentUserId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, profile_image_url')
    .neq('id', currentUserId)
    .order('username', { ascending: true })

  if (error) {
    console.error("Error fetching available users:", error)
    return []
  }
  return data
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