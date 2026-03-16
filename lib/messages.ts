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
    .select('conversation_id')
    .eq('user_id', userId)

  if (myError || !myConvos || myConvos.length === 0) {
    return []
  }

  const convoIds = myConvos.map(c => c.conversation_id)

  const { data: otherParticipants, error: otherError } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      users ( id, username, role, profile_image_url )
    `)
    .in('conversation_id', convoIds)
    .neq('user_id', userId)

  if (otherError) {
    console.error("Error fetching conversations:", otherError)
    return []
  }
  
  return otherParticipants
}

export async function fetchMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error("Error fetching messages:", error)
    return []
  }
  return data
}

export async function postMessage(conversationId: string, senderId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      { 
        conversation_id: conversationId, 
        sender_id: senderId, 
        content: content 
      }
    ])
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

  console.log("Supabase returned:", data)

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

    if (sharedConvos && sharedConvos.length > 0) {
      return sharedConvos[0].conversation_id
    }
  }

  const newConvId = crypto.randomUUID()

  const { error: convError } = await supabase
    .from('conversations')
    .insert([{ 
      id: newConvId, 
      updated_at: new Date().toISOString() 
    }]) 

  if (convError) {
    console.error("Error creating conversation row:", convError)
    throw convError
  }

  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: newConvId, user_id: currentUserId },
      { conversation_id: newConvId, user_id: targetUserId }
    ])

  if (partError) {
    console.error("Error adding participants:", partError)
    throw partError
  }

  return newConvId
}