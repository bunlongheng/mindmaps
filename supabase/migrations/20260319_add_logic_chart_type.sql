-- Add logic-chart to allowed diagram types
ALTER TABLE public.ideas
  DROP CONSTRAINT IF EXISTS ideas_type_check;

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_type_check
  CHECK (type IN ('mindmap','logic-chart','fishbone','tree-vertical','tree-horizontal','timeline'));
