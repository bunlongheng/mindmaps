-- Consolidate mindmap_nodes into mindmap_diagrams as a JSONB column.
-- One table, one round-trip for load/save.

-- 1. Add sharing_enabled if missing (may already exist)
ALTER TABLE public.mindmap_diagrams
  ADD COLUMN IF NOT EXISTS sharing_enabled boolean NOT NULL DEFAULT false;

-- 2. Add nodes JSONB column
ALTER TABLE public.mindmap_diagrams
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]';

-- 3. Migrate existing node rows into JSON on their parent diagram
UPDATE public.mindmap_diagrams d
SET nodes = (
  SELECT COALESCE(json_agg(
    json_build_object(
      'id',                  n.id,
      'title',               n.title,
      'color',               n.color,
      'parentId',            n.parent_id,
      'depth',               n.depth,
      'x',                   n.x,
      'y',                   n.y,
      'width',               n.width,
      'height',              n.height,
      'sortOrder',           n.sort_order,
      'manuallyPositioned',  n.manually_positioned,
      'fontSize',            n.font_size,
      'bold',                n.bold,
      'italic',              n.italic,
      'textAlign',           n.text_align,
      'borderColor',         n.border_color,
      'borderWidth',         n.border_width,
      'icon',                n.icon
    ) ORDER BY n.sort_order
  ), '[]'::json)
  FROM public.mindmap_nodes n
  WHERE n.diagram_id = d.id
);

-- 4. Drop the now-redundant nodes table
DROP TABLE IF EXISTS public.mindmap_nodes;
