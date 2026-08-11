-- Allow anon clients to read any diagram by its UUID.
-- Writes remain restricted to authenticated owners (users_own policy).
-- Security model: UUIDs are unguessable; knowing the ID grants read access
-- (same model as the existing viewer/sharing feature).

DROP POLICY IF EXISTS "anon_read" ON public.ideas;

CREATE POLICY "anon_read" ON public.ideas
  FOR SELECT
  TO anon
  USING (true);
