-- Rename table ideas → mindmaps
ALTER TABLE public.ideas RENAME TO mindmaps;

-- Rename trigger
ALTER TRIGGER ideas_updated_at ON public.mindmaps RENAME TO mindmaps_updated_at;

-- Rename constraints
ALTER TABLE public.mindmaps RENAME CONSTRAINT ideas_type_check TO mindmaps_type_check;
