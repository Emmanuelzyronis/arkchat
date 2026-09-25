import { Pool, PoolClient } from 'pg';
import type { Conversation, Message, Memory } from '@arkchat/types';

// ── Connection pool ───────────────────────────────────────────────────────────

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  _pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false },
  });

  _pool.on('error', (err) => console.error('[db] pool error', err));
  return _pool;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const { rows } = await getPool().query<DbUser>(
    'SELECT * FROM users WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const { rows } = await getPool().query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(email: string, passwordHash: string): Promise<DbUser> {
  const { rows } = await getPool().query<DbUser>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, passwordHash],
  );
  return rows[0];
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
  const { rows } = await getPool().query<UserProfile>(
    'SELECT id, display_name, custom_instructions, preferred_model, theme FROM profiles WHERE id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<UserProfile, 'display_name' | 'custom_instructions' | 'preferred_model' | 'theme'>>,
): Promise<void> {
  const fields = Object.keys(patch) as (keyof typeof patch)[];
  if (!fields.length) return;
  const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = fields.map((k) => patch[k]);
  await getPool().query(`UPDATE profiles SET ${sets} WHERE id = $1`, [userId, ...values]);
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversation(
  id: string,
  userId: string,
): Promise<Conversation | null> {
  const { rows } = await getPool().query<Conversation>(
    'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const { rows } = await getPool().query<Conversation>(
    `SELECT * FROM conversations
     WHERE user_id = $1
     ORDER BY COALESCE(last_message_at, created_at) DESC`,
    [userId],
  );
  return rows;
}

export async function createConversation(
  userId: string,
  model: string,
  title?: string,
): Promise<Conversation> {
  const { rows } = await getPool().query<Conversation>(
    'INSERT INTO conversations (user_id, model, title) VALUES ($1, $2, $3) RETURNING *',
    [userId, model, title ?? null],
  );
  return rows[0];
}

export async function updateConversationTitle(
  id: string,
  userId: string,
  title: string,
): Promise<void> {
  await getPool().query(
    'UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3',
    [title, id, userId],
  );
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  await getPool().query(
    'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  userId: string,
): Promise<Message[]> {
  const conv = await getConversation(conversationId, userId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });

  const { rows } = await getPool().query<Message>(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
  return rows;
}

export async function saveMessage(msg: {
  conversation_id: string;
  role: string;
  content: unknown;
  model?: string | null;
  parent_id?: string | null;
  branch_index?: number;
}): Promise<Message> {
  const pool = getPool();
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages (conversation_id, role, content, model, parent_id, branch_index)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      msg.conversation_id,
      msg.role,
      JSON.stringify(msg.content),
      msg.model ?? null,
      msg.parent_id ?? null,
      msg.branch_index ?? 0,
    ],
  );

  await pool.query(
    'UPDATE conversations SET last_message_at = now() WHERE id = $1',
    [msg.conversation_id],
  );

  return rows[0];
}

// ── Memories (pgvector) ───────────────────────────────────────────────────────

export async function searchMemoriesDirect(
  userId: string,
  embedding: number[],
  limit = 10,
): Promise<Memory[]> {
  const { rows } = await getPool().query<Memory>(
    `SELECT * FROM match_memories($1::vector, $2::uuid, 0.0, $3)`,
    [`[${embedding.join(',')}]`, userId, limit],
  );
  return rows;
}

export async function insertMemoryDirect(memory: {
  user_id: string;
  content: string;
  category: string;
  importance: number;
  embedding: number[];
  source_conversation_id?: string | null;
}): Promise<Memory> {
  const { rows } = await getPool().query<Memory>(
    `INSERT INTO memories (user_id, content, category, importance, embedding, source_conversation_id)
     VALUES ($1, $2, $3, $4, $5::vector, $6) RETURNING *`,
    [
      memory.user_id,
      memory.content,
      memory.category,
      memory.importance,
      `[${memory.embedding.join(',')}]`,
      memory.source_conversation_id ?? null,
    ],
  );
  return rows[0];
}

export async function listMemoriesDirect(userId: string): Promise<Memory[]> {
  const { rows } = await getPool().query<Memory>(
    'SELECT * FROM memories WHERE user_id = $1 ORDER BY importance DESC, created_at DESC',
    [userId],
  );
  return rows;
}

export async function deleteMemoryDirect(id: string, userId: string): Promise<void> {
  await getPool().query(
    'DELETE FROM memories WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
}
