-- Move all diagram records into mindmaps table (all types belong to the mindmaps app)
-- diagrams table stays empty for the separate diagrams app going forward

-- ── 1. Widen mindmaps type constraint to allow all diagram types ──────────────

ALTER TABLE public.mindmaps DROP CONSTRAINT IF EXISTS mindmaps_type_check;
ALTER TABLE public.mindmaps ADD CONSTRAINT mindmaps_type_check
  CHECK (type IN ('mindmap','logic-chart','fishbone','tree-vertical','tree-horizontal','timeline'));

-- ── 2. Move all records from diagrams → mindmaps (preserving is_favorite) ─────

INSERT INTO public.mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, is_favorite, created_at, updated_at)
SELECT id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, is_favorite, created_at, updated_at
FROM public.diagrams;

-- ── 3. Clear diagrams table ───────────────────────────────────────────────────

DELETE FROM public.diagrams;
