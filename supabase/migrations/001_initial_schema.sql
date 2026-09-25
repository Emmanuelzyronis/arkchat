-- ============================================================
-- ArkChat Initial Schema
-- Migration 001: Core tables and extensions
-- ============================================================

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- PROFILES
-- Extends auth.users; one row per authenticated user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name         TEXT,
    avatar_url           TEXT,
    custom_instructions  TEXT,
    preferred_model      TEXT        NOT NULL DEFAULT 'claude-sonnet-5',
    theme                TEXT        NOT NULL DEFAULT 'system'
                             CHECK (theme IN ('light', 'dark', 'system')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
    'Public profile data for each authenticated user, keyed to auth.users.';

-- ============================================================
-- CONVERSATIONS
-- Top-level chat sessions owned by a user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title           TEXT,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ
);

COMMENT ON TABLE public.conversations IS
    'Chat sessions, each belonging to a single user.';

-- ============================================================
-- MESSAGES
-- Individual messages within a conversation.
-- Supports branching via parent_id / branch_index.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         JSONB       NOT NULL,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    parent_id       UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
    branch_index    INT         NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.messages IS
    'Messages within a conversation. parent_id/branch_index enable branched editing.';
COMMENT ON COLUMN public.messages.content IS
    'JSONB to support multi-part content blocks (text, tool_use, tool_result, images, etc.).';

-- ============================================================
-- ARTIFACTS
-- Rendered code/HTML/markdown blocks produced by a message.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artifacts (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL CHECK (type IN ('code', 'html', 'markdown', 'text')),
    title      TEXT,
    language   TEXT,
    content    TEXT        NOT NULL,
    version    INT         NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.artifacts IS
    'Rendered output blocks (code, HTML, markdown) extracted from assistant messages.';

-- ============================================================
-- MEMORIES
-- Long-term memory chunks with vector embeddings per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.memories (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content                TEXT        NOT NULL,
    category               TEXT,
    importance             FLOAT       NOT NULL DEFAULT 0.5
                               CHECK (importance >= 0.0 AND importance <= 1.0),
    embedding              vector(1536),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_conversation_id UUID        REFERENCES public.conversations(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.memories IS
    'User-specific memory chunks with pgvector embeddings for semantic retrieval.';
COMMENT ON COLUMN public.memories.embedding IS
    'text-embedding-3-small / Ada-002 1536-dim vector for cosine similarity search.';
COMMENT ON COLUMN public.memories.importance IS
    'Salience score in [0,1]. Higher = more likely to be surfaced in context.';

-- ============================================================
-- UPDATED_AT triggers (keep updated_at in sync automatically)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- profiles
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- conversations
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- memories
DROP TRIGGER IF EXISTS trg_memories_updated_at ON public.memories;
CREATE TRIGGER trg_memories_updated_at
    BEFORE UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
