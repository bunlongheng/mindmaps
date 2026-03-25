-- Recreate diagrams table with correct Mermaid schema (migrated from erhdiqjagmqbtmjblpbo)

DROP TABLE IF EXISTS public.diagrams;

CREATE TABLE public.diagrams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  title           text        NOT NULL DEFAULT 'Untitled',
  slug            text,
  code            text        NOT NULL DEFAULT '',
  diagram_type    text        NOT NULL DEFAULT 'sequence',
  is_favorite     boolean     NOT NULL DEFAULT false,
  settings        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER diagrams_updated_at
  BEFORE UPDATE ON public.diagrams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own" ON public.diagrams
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anon_read" ON public.diagrams
  FOR SELECT TO anon
  USING (true);
