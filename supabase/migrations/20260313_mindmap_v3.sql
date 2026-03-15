-- Migration v3: fix font_size default, add missing style columns, add sharing_enabled

-- Allow font_size to be NULL (no default — app applies depth-based defaults)
ALTER TABLE public.mindmap_nodes
  ALTER COLUMN font_size DROP NOT NULL,
  ALTER COLUMN font_size DROP DEFAULT;

-- Add missing node style columns
ALTER TABLE public.mindmap_nodes
  ADD COLUMN IF NOT EXISTS bold         boolean,
  ADD COLUMN IF NOT EXISTS italic       boolean,
  ADD COLUMN IF NOT EXISTS text_align   text CHECK (text_align IN ('left','center','right')),
  ADD COLUMN IF NOT EXISTS border_color text,
  ADD COLUMN IF NOT EXISTS border_width real;

-- Add sharing flag to diagrams
ALTER TABLE public.mindmap_diagrams
  ADD COLUMN IF NOT EXISTS sharing_enabled boolean NOT NULL DEFAULT false;
