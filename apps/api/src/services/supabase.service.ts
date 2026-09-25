import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, Message, Memory } from '@arkchat/types';

// ── Admin client (service-role key — never expose to mobile) ──────────────────

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversation(
  id: string,
  userId: string,
): Promise<Conversation | null> {
  const { data, error } = await getClient()
    .from('conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data as Conversation;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await getClient()
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function createConversation(
  userId: string,
  model: string,
  title?: string,
): Promise<Conversation> {
  const { data, error } = await getClient()
    .from('conversations')
    .insert({ user_id: userId, model, title: title ?? null })
    .select()
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function updateConversationTitle(
  id: string,
  userId: string,
  title: string,
): Promise<void> {
  const { error } = await getClient()
    .from('conversations')
    .update({ title })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  const { error } = await getClient()
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  userId: string,
): Promise<Message[]> {
  // Verify ownership first
  const conv = await getConversation(conversationId, userId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });

  const { data, error } = await getClient()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function saveMessage(msg: {
  conversation_id: string;
  role: string;
  content: unknown;
  model?: string | null;
  parent_id?: string | null;
  branch_index?: number;
}): Promise<Message> {
  const { data, error } = await getClient()
    .from('messages')
    .insert({
      conversation_id: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      model: msg.model ?? null,
      parent_id: msg.parent_id ?? null,
      branch_index: msg.branch_index ?? 0,
    })
    .select()
    .single();

  if (error) throw error;

  // Update conversation last_message_at
  await getClient()
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', msg.conversation_id);

  return data as Message;
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  display_name: string | null;
  custom_instructions: string | null;
  preferred_model: string;
  theme: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await getClient()
    .from('profiles')
    .select('id, display_name, custom_instructions, preferred_model, theme')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as UserProfile;
}

// ── Memories (direct pgvector — used as fallback) ─────────────────────────────

export async function searchMemoriesDirect(
  userId: string,
  embedding: number[],
  limit = 10,
): Promise<Memory[]> {
  const { data, error } = await getClient().rpc('match_memories', {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: limit,
  });

  if (error) throw error;
  return (data ?? []) as Memory[];
}

export async function insertMemoryDirect(memory: {
  user_id: string;
  content: string;
  category: string;
  importance: number;
  embedding: number[];
  source_conversation_id?: string | null;
}): Promise<Memory> {
  const { data, error } = await getClient()
    .from('memories')
    .insert(memory)
    .select()
    .single();

  if (error) throw error;
  return data as Memory;
}

export async function listMemoriesDirect(userId: string): Promise<Memory[]> {
  const { data, error } = await getClient()
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Memory[];
}

export async function deleteMemoryDirect(id: string, userId: string): Promise<void> {
  const { error } = await getClient()
    .from('memories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}
