-- ============================================================
-- ArkChat Row Level Security
-- Migration 002: RLS policies + auth trigger
-- ============================================================

-- ============================================================
-- Enable RLS on all application tables
-- ============================================================
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- SELECT / UPDATE own row only.
-- INSERT is handled exclusively by the auth trigger below.
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================
-- CONVERSATIONS
-- Full CRUD for rows the user owns.
-- ============================================================
DROP POLICY IF EXISTS "conversations_select_own" ON public.conversations;
CREATE POLICY "conversations_select_own"
    ON public.conversations
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conversations_insert_own" ON public.conversations;
CREATE POLICY "conversations_insert_own"
    ON public.conversations
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversations_update_own" ON public.conversations;
CREATE POLICY "conversations_update_own"
    ON public.conversations
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversations_delete_own" ON public.conversations;
CREATE POLICY "conversations_delete_own"
    ON public.conversations
    FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================
-- MESSAGES
-- Access is permitted when the parent conversation belongs to
-- the authenticated user (one join hop).
-- ============================================================
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own"
    ON public.messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own"
    ON public.messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own"
    ON public.messages
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own"
    ON public.messages
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- ============================================================
-- ARTIFACTS
-- SELECT / INSERT when the parent message is owned by the user.
-- (Artifacts are immutable once created; no UPDATE/DELETE.)
-- ============================================================
DROP POLICY IF EXISTS "artifacts_select_own" ON public.artifacts;
CREATE POLICY "artifacts_select_own"
    ON public.artifacts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.messages m
            JOIN public.conversations c ON c.id = m.conversation_id
            WHERE m.id = artifacts.message_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "artifacts_insert_own" ON public.artifacts;
CREATE POLICY "artifacts_insert_own"
    ON public.artifacts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.messages m
            JOIN public.conversations c ON c.id = m.conversation_id
            WHERE m.id = artifacts.message_id
              AND c.user_id = auth.uid()
        )
    );

-- ============================================================
-- MEMORIES
-- Full CRUD for rows the user owns.
-- ============================================================
DROP POLICY IF EXISTS "memories_select_own" ON public.memories;
CREATE POLICY "memories_select_own"
    ON public.memories
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "memories_insert_own" ON public.memories;
CREATE POLICY "memories_insert_own"
    ON public.memories
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "memories_update_own" ON public.memories;
CREATE POLICY "memories_update_own"
    ON public.memories
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "memories_delete_own" ON public.memories;
CREATE POLICY "memories_delete_own"
    ON public.memories
    FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================
-- AUTH TRIGGER
-- Automatically create a profile row when a new user signs up.
-- Runs as SECURITY DEFINER so it can bypass RLS to insert.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        -- Prefer full_name from OAuth metadata; fall back to email prefix
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'name',
            split_part(NEW.email, '@', 1)
        ),
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
    'Inserts a profile row for every new auth.users row. SECURITY DEFINER bypasses RLS.';

-- Attach the trigger to auth.users (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
