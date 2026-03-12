-- Migration v2: add manually_positioned and font_size to nodes

ALTER TABLE public.mindmap_nodes
  ADD COLUMN IF NOT EXISTS manually_positioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS font_size           integer NOT NULL DEFAULT 13;
