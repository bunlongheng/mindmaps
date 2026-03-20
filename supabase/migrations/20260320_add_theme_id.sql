-- Add per-diagram theme support
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS theme_id text NOT NULL DEFAULT 'default';
