-- Tighten the anon read policy: USING (true) let any anon-key holder enumerate and
-- read every row, not just fetch one by its unguessable UUID. Scope it to rows that
-- are explicitly shared so anon cannot list private diagrams.
--
-- Fixed 2026-07-22: this originally targeted public.ideas, but the table was renamed
-- to public.mindmaps in 20260323_rename_to_mindmaps.sql - CREATE POLICY on a
-- nonexistent table errors, so if this ran as-written against prod it never applied.
-- Verify the live anon_read policy on public.mindmaps against this file's intent.
DROP POLICY IF EXISTS "anon_read" ON public.mindmaps;

CREATE POLICY "anon_read" ON public.mindmaps
  FOR SELECT
  TO anon
  USING (sharing_enabled = true);
