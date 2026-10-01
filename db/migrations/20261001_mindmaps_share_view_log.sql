-- Who opened a shared map. One row per real view of a public share link.
-- Prefixed because the Postgres is shared with the other apps and share_view_log
-- there belongs to one of them. Run as the schema owner: the app role (mindmaps_api)
-- cannot create tables, so it is granted the 3 rights it needs below.
-- (api/_lib/share-alert.ts also creates this table on first use).
CREATE TABLE IF NOT EXISTS mindmaps_share_view_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL,
  title TEXT,
  kind TEXT NOT NULL DEFAULT 'view',
  ip TEXT,
  city TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  emailed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mindmaps_share_view_log_file_id_idx ON mindmaps_share_view_log (file_id);
GRANT SELECT, INSERT, UPDATE ON mindmaps_share_view_log TO mindmaps_api;
