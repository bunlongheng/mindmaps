-- Restore user_id column that was dropped when the table was recreated
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Restore RLS policy for authenticated users
DROP POLICY IF EXISTS "anon_all" ON public.ideas;
DROP POLICY IF EXISTS "users_own" ON public.ideas;

CREATE POLICY "users_own" ON public.ideas
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Also allow anon reads for shared diagrams
CREATE POLICY "anon_read" ON public.ideas
  FOR SELECT
  TO anon
  USING (sharing_enabled = true);
