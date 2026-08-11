-- Speed up the home-page list query (the hottest query in the app):
--   SELECT ... FROM mindmaps WHERE user_id=$1 ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS mindmaps_user_updated
  ON public.mindmaps (user_id, updated_at DESC);
