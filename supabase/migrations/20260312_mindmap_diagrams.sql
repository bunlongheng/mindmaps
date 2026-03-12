-- Mind Map Diagrams Schema

CREATE TABLE IF NOT EXISTS public.mindmap_diagrams (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL DEFAULT 'Untitled',
  type         text        NOT NULL DEFAULT 'mindmap'
                           CHECK (type IN ('mindmap','fishbone','tree-vertical','tree-horizontal')),
  line_style   text        NOT NULL DEFAULT 'curved'
                           CHECK (line_style IN ('straight','curved','orthogonal')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mindmap_nodes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id   uuid        NOT NULL REFERENCES public.mindmap_diagrams(id) ON DELETE CASCADE,
  parent_id    uuid        REFERENCES public.mindmap_nodes(id) ON DELETE CASCADE,
  title        text        NOT NULL DEFAULT '',
  color        text        NOT NULL DEFAULT '#6366f1',
  depth        integer     NOT NULL DEFAULT 0,
  x            real        NOT NULL DEFAULT 0,
  y            real        NOT NULL DEFAULT 0,
  width        real        NOT NULL DEFAULT 160,
  height       real        NOT NULL DEFAULT 40,
  sort_order           integer     NOT NULL DEFAULT 0,
  manually_positioned  boolean     NOT NULL DEFAULT false,
  font_size            integer     NOT NULL DEFAULT 13,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_diagram_id ON public.mindmap_nodes(diagram_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_parent_id  ON public.mindmap_nodes(parent_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER mindmap_diagrams_updated_at
  BEFORE UPDATE ON public.mindmap_diagrams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.mindmap_diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mindmap_nodes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select" ON public.mindmap_diagrams FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.mindmap_nodes    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_all" ON public.mindmap_diagrams FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.mindmap_nodes    FOR ALL TO anon USING (true) WITH CHECK (true);
