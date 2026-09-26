-- A mindmap can be embedded elsewhere (a README image, a Confluence page, the demo
-- wall). If it is edited or deleted, an image somebody else is looking at changes or
-- breaks - it already happened once (stickies-web/README.md linking a map that no
-- longer exists). `locked` blocks every write except the unlock toggle itself.
--
-- The API detects this column at runtime (information_schema, cached per process) and
-- treats every row as unlocked until this migration has been applied, so the app keeps
-- working whether or not this has run yet.
--
-- Idempotent, safe to re-run: IF NOT EXISTS makes a second run a no-op.

ALTER TABLE public.mindmaps ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
