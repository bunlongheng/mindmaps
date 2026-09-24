// One source of truth for a node's box shape, shared by the canvas (Node.tsx), the
// server SVG renderer (render-svg.ts) and the layouts, so a home-grid card preview
// can never draw a different shape than the map it opens.
import type { MindmapNode } from '../types/index.js'
import { circleForText } from './layout/mindmap.js'

/** Per-node box shape. Absent keeps the diagram type's own default look. */
export type NodeShape = NonNullable<MindmapNode['shape']>

export const NODE_SHAPES: readonly NodeShape[] = ['rect', 'rounded', 'pill', 'circle']

/**
 * Corner radius for a non-root node's box:
 *   rect    -> square corners
 *   rounded -> the default radius (today's look, and what an unset shape keeps)
 *   pill    -> fully rounded ends
 *   circle  -> drawn as a real <circle>; the radius here only shapes the clip box
 */
export function shapeRx(shape: NodeShape | undefined, height: number, defaultRx: number): number {
  if (shape === 'rect') return 0
  if (shape === 'pill' || shape === 'circle') return height / 2
  return defaultRx
}

/**
 * Laid-out size for a node carrying an explicit shape. Only 'circle' changes the box:
 * it becomes a square whose diameter fits the wrapped label, reusing the very same
 * sizing the mindmap L2 circles already use. Every other shape keeps the box the
 * layout measured from the text, so the label still fits.
 */
export function shapedNodeSize(node: MindmapNode, fontSize: number, w: number, h: number): { w: number; h: number } {
  if (node.depth === 0 || node.shape !== 'circle') return { w, h }
  const d = circleForText(node.title, fontSize, Math.max(w, h))
  return { w: d, h: d }
}
