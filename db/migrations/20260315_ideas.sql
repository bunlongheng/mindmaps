-- Ideas app — single canonical schema
-- One table: all diagram data including nodes as JSONB

DROP TABLE IF EXISTS public.mindmap_nodes CASCADE;
DROP TABLE IF EXISTS public.mindmap_diagrams CASCADE;
DROP TABLE IF EXISTS public.ideas CASCADE;

CREATE TABLE public.ideas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL DEFAULT 'Untitled',
  type            text        NOT NULL DEFAULT 'mindmap'
                              CHECK (type IN ('mindmap','fishbone','tree-vertical','tree-horizontal','timeline')),
  line_style      text        NOT NULL DEFAULT 'orthogonal'
                              CHECK (line_style IN ('straight','curved','orthogonal')),
  sharing_enabled boolean     NOT NULL DEFAULT false,
  nodes           jsonb       NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every save
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ideas_updated_at ON public.ideas;
CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Row Level Security (open anon access — app handles auth at the product level)
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON public.ideas;
CREATE POLICY "anon_all" ON public.ideas FOR ALL TO anon USING (true) WITH CHECK (true);
