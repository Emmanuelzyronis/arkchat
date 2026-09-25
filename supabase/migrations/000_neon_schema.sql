-- ============================================================
-- ArkChat Neon-Compatible Schema
-- All Supabase auth.users / RLS / auth.uid() removed.
-- Security is enforced at the API gateway (Fastify JWT).
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ─────────────────────────────────────────────────────
-- Replaces Supabase auth.users. Passwords hashed with bcrypt.
CREATE TABLE IF NOT EXISTS public.users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PROFILES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id                   UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    display_name         TEXT,
    avatar_url           TEXT,
    custom_instructions  TEXT,
    preferred_model      TEXT        NOT NULL DEFAULT 'claude-sonnet-5',
    theme                TEXT        NOT NULL DEFAULT 'system'
                             CHECK (theme IN ('light', 'dark', 'system')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CONVERSATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title           TEXT,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ
);

-- ── MESSAGES ─────────────────────────────────────────────────
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

-- ── ARTIFACTS ────────────────────────────────────────────────
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

-- ── MEMORIES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.memories (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content                TEXT        NOT NULL,
    category               TEXT        DEFAULT 'general',
    importance             FLOAT       NOT NULL DEFAULT 0.5
                               CHECK (importance >= 0.0 AND importance <= 1.0),
    embedding              vector(1536),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_conversation_id UUID        REFERENCES public.conversations(id) ON DELETE SET NULL
);

-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_memories_updated_at ON public.memories;
CREATE TRIGGER trg_memories_updated_at
    BEFORE UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile when user is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, split_part(NEW.email, '@', 1))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_users_create_profile ON public.users;
CREATE TRIGGER trg_users_create_profile
    AFTER INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── VECTOR SEARCH FUNCTION ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding   vector(1536),
    match_user_id     UUID,
    match_threshold   FLOAT DEFAULT 0.0,
    match_count       INT   DEFAULT 10
)
RETURNS TABLE (
    id                     UUID,
    user_id                UUID,
    content                TEXT,
    category               TEXT,
    importance             FLOAT,
    created_at             TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ,
    source_conversation_id UUID,
    similarity             FLOAT
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id, m.user_id, m.content, m.category, m.importance,
        m.created_at, m.updated_at, m.source_conversation_id,
        (1 - (m.embedding <=> query_embedding))::float AS similarity
    FROM public.memories m
    WHERE
        m.user_id    = match_user_id
        AND m.embedding IS NOT NULL
        AND (1 - (m.embedding <=> query_embedding)) >= match_threshold
    ORDER BY ((1 - (m.embedding <=> query_embedding)) * 0.7 + m.importance * 0.3) DESC
    LIMIT match_count;
END; $$;

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_user_last_msg
    ON public.conversations (user_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON public.conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_parent_id
    ON public.messages (parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_user_id
    ON public.memories (user_id);

CREATE INDEX IF NOT EXISTS idx_memories_user_importance
    ON public.memories (user_id, importance DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_message_id
    ON public.artifacts (message_id);

CREATE INDEX IF NOT EXISTS idx_memories_embedding_ivfflat
    ON public.memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
