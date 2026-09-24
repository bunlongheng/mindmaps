-- Lock guard: a locked mind map cannot be edited or deleted by accident.
-- This is an accident guard, not a security boundary - the owner can always unlock it.
ALTER TABLE public.mindmaps
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
