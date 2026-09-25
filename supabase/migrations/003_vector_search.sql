-- ============================================================
-- ArkChat Vector Search & Performance Indexes
-- Migration 003: match_memories RPC + all strategic indexes
-- ============================================================

-- ============================================================
-- VECTOR SEARCH FUNCTION
-- match_memories: semantic retrieval of a user's memory chunks.
--
-- Parameters:
--   query_embedding  — 1536-dim vector for the current query
--   match_threshold  — minimum cosine similarity (e.g. 0.75)
--   match_count      — max rows to return
--   user_id_filter   — restrict results to this user's memories
--
-- Returns rows ordered by similarity DESC, above the threshold.
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding  vector(1536),
    match_threshold  float,
    match_count      int,
    user_id_filter   uuid
)
RETURNS TABLE (
    id                     uuid,
    user_id                uuid,
    content                text,
    category               text,
    importance             float,
    source_conversation_id uuid,
    created_at             timestamptz,
    updated_at             timestamptz,
    similarity             float
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.user_id,
        m.content,
        m.category,
        m.importance,
        m.source_conversation_id,
        m.created_at,
        m.updated_at,
        -- cosine similarity = 1 - cosine distance
        (1 - (m.embedding <=> query_embedding))::float AS similarity
    FROM public.memories m
    WHERE
        m.user_id  = user_id_filter
        AND m.embedding IS NOT NULL
        -- cosine distance < 1 - threshold means similarity > threshold
        AND (1 - (m.embedding <=> query_embedding)) >= match_threshold
    ORDER BY m.embedding <=> query_embedding   -- ascending distance = descending similarity
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_memories IS
    'Semantic search over a single user''s memories using cosine similarity (pgvector).
     Call via Supabase RPC: supabase.rpc("match_memories", {...}).';

-- ============================================================
-- VECTOR INDEX
-- IVFFlat on memories.embedding for approximate nearest-neighbour
-- cosine search. lists = sqrt(estimated row count); tune as data grows.
-- The index is skipped if it already exists (idempotent).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_memories_embedding_ivfflat
    ON public.memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON INDEX idx_memories_embedding_ivfflat IS
    'IVFFlat ANN index for <=> cosine distance queries in match_memories().
     Re-tune `lists` when row count grows significantly (rule of thumb: sqrt(n)).';

-- ============================================================
-- CONVERSATIONS INDEXES
-- ============================================================

-- Fast sidebar listing per user, newest-active first
CREATE INDEX IF NOT EXISTS idx_conversations_user_last_msg
    ON public.conversations (user_id, last_message_at DESC NULLS LAST);

-- Supporting index for RLS policy existence checks on user_id alone
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON public.conversations (user_id);

-- ============================================================
-- MESSAGES INDEXES
-- ============================================================

-- Primary access pattern: fetch all messages in a conversation
-- in chronological order
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages (conversation_id, created_at ASC);

-- Branch traversal: find children of a parent message
CREATE INDEX IF NOT EXISTS idx_messages_parent_id
    ON public.messages (parent_id)
    WHERE parent_id IS NOT NULL;

-- ============================================================
-- MEMORIES INDEXES
-- ============================================================

-- RLS + non-vector queries filtered by user
CREATE INDEX IF NOT EXISTS idx_memories_user_id
    ON public.memories (user_id);

-- Optional: sort by importance for non-semantic retrieval
CREATE INDEX IF NOT EXISTS idx_memories_user_importance
    ON public.memories (user_id, importance DESC);

-- ============================================================
-- ARTIFACTS INDEXES
-- ============================================================

-- Fetch artifacts for a given message
CREATE INDEX IF NOT EXISTS idx_artifacts_message_id
    ON public.artifacts (message_id);
