-- Tighten the anon read policy: USING (true) let any anon-key holder enumerate and
-- read every row, not just fetch one by its unguessable UUID. Scope it to rows that
-- are explicitly shared so anon cannot list private diagrams.
DROP POLICY IF EXISTS "anon_read" ON public.ideas;

CREATE POLICY "anon_read" ON public.ideas
  FOR SELECT
  TO anon
  USING (sharing_enabled = true);
