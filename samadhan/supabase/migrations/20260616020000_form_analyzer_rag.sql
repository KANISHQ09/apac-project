-- Enable vector extension (skip if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- Table: form_knowledge_base
-- Stores metadata for each supported govt form
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_knowledge_base (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_code        TEXT UNIQUE NOT NULL,
  form_name        TEXT NOT NULL,
  description      TEXT,
  source_url       TEXT,
  version          TEXT DEFAULT 'v1.0',
  effective_date   DATE,
  last_verified_at TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Table: form_chunks
-- Granular RAG knowledge units per form
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_chunks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES public.form_knowledge_base(id) ON DELETE CASCADE,
  chunk_title    TEXT NOT NULL,
  chunk_content  TEXT NOT NULL,
  chunk_type     TEXT NOT NULL CHECK (chunk_type IN ('eligibility','documents','steps','submission','general')),
  embedding      vector(1024) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_form_chunks_embedding
  ON public.form_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for form_id lookups
CREATE INDEX IF NOT EXISTS idx_form_chunks_form_id
  ON public.form_chunks (form_id);

-- ─────────────────────────────────────────────
-- RPC: match_form_chunks
-- Filtered vector similarity search by form_id
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_form_chunks(
  query_embedding  vector(1024),
  target_form_id   uuid,
  match_threshold  float DEFAULT 0.65,
  match_count      int   DEFAULT 8
)
RETURNS TABLE (
  id            uuid,
  chunk_title   text,
  chunk_content text,
  chunk_type    text,
  similarity    float
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.chunk_title,
    c.chunk_content,
    c.chunk_type,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.form_chunks c
  WHERE c.form_id = target_form_id
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────
-- RLS Policies — public read, no auth required
-- (No citizen data here — just public govt form text)
-- ─────────────────────────────────────────────
ALTER TABLE public.form_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read form_knowledge_base"
  ON public.form_knowledge_base FOR SELECT USING (true);

CREATE POLICY "Anyone can read form_chunks"
  ON public.form_chunks FOR SELECT USING (true);
