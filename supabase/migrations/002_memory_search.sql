-- ============================================================
-- ArkChat Migration 002: pgvector semantic search function
-- Used by the memory service pgvector fallback path.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding   vector(1536),
    match_user_id     UUID,
    match_count       INT DEFAULT 10
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
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.user_id,
        m.content,
        m.category,
        m.importance,
        m.created_at,
        m.updated_at,
        m.source_conversation_id,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM public.memories m
    WHERE
        m.user_id    = match_user_id
        AND m.embedding IS NOT NULL
    ORDER BY
        -- Blend cosine similarity with importance for ranking
        ((1 - (m.embedding <=> query_embedding)) * 0.7 + m.importance * 0.3) DESC
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_memories IS
    'Semantic memory search using pgvector cosine distance, blended with importance score.';

-- Index for faster ANN (approximate nearest-neighbour) lookups
CREATE INDEX IF NOT EXISTS idx_memories_embedding
    ON public.memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
