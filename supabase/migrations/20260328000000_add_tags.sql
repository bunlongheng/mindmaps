-- Add tags column to mindmaps table
ALTER TABLE public.mindmaps
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- GIN index for fast array containment queries (e.g. WHERE 'AI' = ANY(tags))
CREATE INDEX IF NOT EXISTS mindmaps_tags_gin
  ON public.mindmaps USING GIN(tags);
