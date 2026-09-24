-- RUN THIS READ-ONLY COUNT FIRST - it is exactly the set of rows the UPDATE below adopts:
--   SELECT count(*) FROM public.mindmaps WHERE user_id IS NULL AND 'API' = ANY(tags);
--
-- Issue 27: maps created through POST /api/ai/mindmaps were saved with user_id = NULL
-- whenever the caller omitted "userId" in the body. The library lists with
--   SELECT ... FROM mindmaps WHERE user_id = $1 ORDER BY updated_at DESC
-- so a NULL-owner row is invisible forever, and the endpoint still answered 201 - a
-- silent loss. api/ai/mindmaps.ts now always files a map under the configured owner
-- (MINDMAP_USER_ID) and rejects a mismatched userId with 403. This migration adopts
-- the rows that were orphaned before that fix.
--
-- The owner is resolved from the data rather than hardcoded: this is a single-owner
-- app, so the user_id that owns the most rows IS the MINDMAP_USER_ID owner. If you
-- would rather pin it, replace the sub-select with the literal uuid.
--
-- Safe to run more than once: after the first run there are no NULL-owner API rows
-- left, so a re-run updates 0 rows. If the table has no owned rows at all the guard
-- makes the whole statement a no-op instead of writing NULL back.

-- Adoption must not rewrite history: the mindmaps_updated_at trigger would stamp every
-- adopted row with now(), pushing months-old maps to the top of the library with today's
-- date on the card. Suspend it for this one UPDATE so created_at/updated_at survive.
ALTER TABLE public.mindmaps DISABLE TRIGGER mindmaps_updated_at;

UPDATE public.mindmaps m
   SET user_id = (
         SELECT user_id
           FROM public.mindmaps
          WHERE user_id IS NOT NULL
          GROUP BY user_id
          ORDER BY count(*) DESC
          LIMIT 1
       )
 WHERE m.user_id IS NULL
   AND 'API' = ANY(m.tags)
   AND EXISTS (SELECT 1 FROM public.mindmaps WHERE user_id IS NOT NULL);

ALTER TABLE public.mindmaps ENABLE TRIGGER mindmaps_updated_at;
