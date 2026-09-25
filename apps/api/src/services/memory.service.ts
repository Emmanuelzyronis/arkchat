/**
 * Memory service — wraps Mem0 (cloud) with a direct pgvector fallback.
 *
 * Priority:
 *   1. Mem0 cloud client  (MEM0_API_KEY is set)
 *   2. Direct Supabase pgvector + OpenAI embeddings
 *
 * The Mem0 cloud client manages storage internally; the pgvector path
 * uses the `memories` table created by migration 001.
 */

import OpenAI from 'openai';
import type { Memory } from '@arkchat/types';
import {
  searchMemoriesDirect,
  insertMemoryDirect,
  listMemoriesDirect,
  deleteMemoryDirect,
} from './db.service.js';

// ── Lazy singletons ───────────────────────────────────────────────────────────

let _mem0Client: MemoryClient | null = null;
let _openaiClient: OpenAI | null = null;

type MemoryClient = {
  search: (query: string, opts: { user_id: string; limit?: number }) => Promise<Mem0SearchResult[]>;
  add: (messages: Mem0Message[], opts: { user_id: string }) => Promise<Mem0AddResult>;
  getAll: (opts: { user_id: string }) => Promise<Mem0Memory[]>;
  delete: (memoryId: string) => Promise<void>;
};

interface Mem0Message {
  role: string;
  content: string;
}

interface Mem0SearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface Mem0AddResult {
  results?: Array<{ id: string; memory: string; event: string }>;
}

interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

async function getMem0Client(): Promise<MemoryClient | null> {
  if (_mem0Client !== null) return _mem0Client;

  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) return null;

  try {
    const { MemoryClient: MC } = await import('mem0ai') as unknown as { MemoryClient: new (opts: { api_key: string }) => MemoryClient };
    _mem0Client = new MC({ api_key: apiKey });
    return _mem0Client;
  } catch (err) {
    console.warn('[memory] Failed to initialise Mem0 client:', err);
    return null;
  }
}

function getOpenAIClient(): OpenAI {
  if (_openaiClient) return _openaiClient;

  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (azureKey && azureEndpoint) {
    _openaiClient = new OpenAI({
      apiKey: azureKey,
      baseURL: `${azureEndpoint}/deployments/${process.env.EMBEDDING_DEPLOYMENT ?? 'text-embedding-3-large'}`,
      defaultQuery: { 'api-version': '2024-12-01-preview' },
      defaultHeaders: { 'api-key': azureKey },
    });
  } else if (openaiKey) {
    _openaiClient = new OpenAI({ apiKey: openaiKey });
  } else {
    throw new Error('Set AZURE_OPENAI_API_KEY+AZURE_OPENAI_ENDPOINT or OPENAI_API_KEY for embeddings');
  }

  return _openaiClient;
}

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

// ── Helpers: map external formats → our Memory type ──────────────────────────

function mem0ToMemory(m: Mem0Memory | Mem0SearchResult, userId: string): Memory {
  if ('memory' in m) {
    const mem = m as Mem0Memory;
    return {
      id: mem.id,
      user_id: userId,
      content: mem.memory,
      category: (mem.metadata?.category as string | undefined) ?? 'general',
      importance: (mem.metadata?.importance as number | undefined) ?? 0.5,
      created_at: mem.created_at ?? new Date().toISOString(),
      updated_at: mem.updated_at ?? new Date().toISOString(),
      source_conversation_id:
        (mem.metadata?.source_conversation_id as string | undefined) ?? null,
    };
  }
  const result = m as Mem0SearchResult;
  return {
    id: result.id,
    user_id: userId,
    content: result.memory,
    category: (result.metadata?.category as string | undefined) ?? 'general',
    importance: result.score ?? 0.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_conversation_id: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Semantic search for relevant memories — top N results.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 10,
): Promise<Memory[]> {
  try {
    const client = await getMem0Client();

    if (client) {
      const results = await client.search(query, { user_id: userId, limit });
      return results.map((r) => mem0ToMemory(r, userId));
    }

    // ── pgvector fallback ─────────────────────────────────────────────────
    const embedding = await embed(query);
    return searchMemoriesDirect(userId, embedding, limit);
  } catch (err) {
    console.error('[memory] searchMemories failed:', err);
    return [];
  }
}

/**
 * Extract facts from a conversation turn and persist them as memories.
 * Runs asynchronously — callers should not await if they want non-blocking.
 */
export async function addMemories(
  userId: string,
  messages: Array<{ role: string; content: string }>,
  conversationId: string,
): Promise<void> {
  try {
    const client = await getMem0Client();

    if (client) {
      await client.add(messages, { user_id: userId });
      return;
    }

    // pgvector fallback: use Claude via Foundry (no separate GPT deployment needed)
    const { completeOnce } = await import('./ai.service.js');
    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const raw = await completeOnce({
      model: 'claude-sonnet-4-6',
      system: 'Extract 1-5 concise, standalone facts or preferences the user revealed in this conversation. Output one fact per line. If there are no notable facts, output nothing.',
      userMessage: transcript.slice(0, 3000),
      maxTokens: 512,
    });

    if (!raw) return;

    const facts = raw
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);

    await Promise.all(
      facts.map(async (fact) => {
        const embedding = await embed(fact);
        return insertMemoryDirect({
          user_id: userId,
          content: fact,
          category: 'auto',
          importance: 0.5,
          embedding,
          source_conversation_id: conversationId,
        });
      }),
    );
  } catch (err) {
    console.error('[memory] addMemories failed:', err);
  }
}


/**
 * List all memories for a user.
 */
export async function getUserMemories(userId: string): Promise<Memory[]> {
  try {
    const client = await getMem0Client();

    if (client) {
      const results = await client.getAll({ user_id: userId });
      return results.map((m) => mem0ToMemory(m, userId));
    }

    return listMemoriesDirect(userId);
  } catch (err) {
    console.error('[memory] getUserMemories failed:', err);
    return [];
  }
}

/**
 * Delete a single memory by ID.
 */
export async function deleteMemory(memoryId: string, userId: string): Promise<void> {
  const client = await getMem0Client();

  if (client) {
    await client.delete(memoryId);
    return;
  }

  await deleteMemoryDirect(memoryId, userId);
}

/**
 * Manually add a single memory (user-initiated from the Memory UI).
 */
export async function addManualMemory(
  userId: string,
  content: string,
  category: string,
): Promise<Memory> {
  const client = await getMem0Client();

  if (client) {
    const result = await client.add(
      [{ role: 'user', content }],
      { user_id: userId },
    );
    const added = result.results?.[0];
    return {
      id: added?.id ?? crypto.randomUUID(),
      user_id: userId,
      content,
      category,
      importance: 0.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_conversation_id: null,
    };
  }

  const embedding = await embed(content);
  return insertMemoryDirect({
    user_id: userId,
    content,
    category,
    importance: 0.7, // manual memories are high-value
    embedding,
    source_conversation_id: null,
  });
}
