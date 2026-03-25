-- Split shared table into two dedicated tables:
--   diagrams  → this app (logic-chart, fishbone, timeline, tree-*)
--   mindmaps  → mindmaps app (mindmap type)

-- ── 1. Rename current mindmaps → diagrams ────────────────────────────────────

ALTER TABLE public.mindmaps RENAME TO diagrams;
ALTER TRIGGER mindmaps_updated_at ON public.diagrams RENAME TO diagrams_updated_at;
ALTER TABLE public.diagrams RENAME CONSTRAINT mindmaps_type_check TO diagrams_type_check;

-- Rename RLS policies
DROP POLICY IF EXISTS "users_own" ON public.diagrams;
DROP POLICY IF EXISTS "anon_read" ON public.diagrams;

CREATE POLICY "users_own" ON public.diagrams
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anon_read" ON public.diagrams
  FOR SELECT TO anon
  USING (true);

-- ── 2. Create dedicated mindmaps table ───────────────────────────────────────

CREATE TABLE public.mindmaps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  name            text        NOT NULL DEFAULT 'Untitled',
  type            text        NOT NULL DEFAULT 'mindmap'
                              CHECK (type IN ('mindmap')),
  line_style      text        NOT NULL DEFAULT 'orthogonal'
                              CHECK (line_style IN ('straight','curved','orthogonal')),
  sharing_enabled boolean     NOT NULL DEFAULT false,
  theme_id        text        NOT NULL DEFAULT 'default',
  nodes           jsonb       NOT NULL DEFAULT '[]',
  is_favorite     boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mindmaps_updated_at
  BEFORE UPDATE ON public.mindmaps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.mindmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own" ON public.mindmaps
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anon_read" ON public.mindmaps
  FOR SELECT TO anon
  USING (true);

-- ── 3. Migrate mindmap-type rows from diagrams → mindmaps ────────────────────

INSERT INTO public.mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, is_favorite, created_at, updated_at)
SELECT id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, is_favorite, created_at, updated_at
FROM public.diagrams
WHERE type = 'mindmap';

-- ── 4. Remove migrated rows + tighten diagrams type constraint ────────────────

DELETE FROM public.diagrams WHERE type = 'mindmap';

ALTER TABLE public.diagrams DROP CONSTRAINT IF EXISTS diagrams_type_check;
ALTER TABLE public.diagrams ADD CONSTRAINT diagrams_type_check
  CHECK (type IN ('logic-chart','fishbone','tree-vertical','tree-horizontal','timeline'));
