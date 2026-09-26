// Shared by the store (canvas) and the server SVG renderer so both size a depth's
// column of boxes from the exact same rule: one auto node's width is its own
// longest label plus the depth's padding (src/lib/nodeMetrics); every auto node at
// that depth then shares the widest of those. A manual node (widthMode: 'manual')
// keeps the width the user dragged and never contributes to, or is touched by, the
// per-depth max.
import type { MindmapNode, DiagramType } from '../types/index.js'
import { nodeFontSize, nodeHeight, nodeWidth, estimateTextWidth } from './nodeMetrics.js'

/** A node's own auto width: its label, both paddings, and the icon zone when it carries a badge. */
function autoWidthFor(n: MindmapNode): number {
  const hasIcon = !!(n.icon || n.emoji)
  return nodeWidth(estimateTextWidth(n.title, nodeFontSize(n.depth)), n.depth, {
    hasIcon,
    height: n.height > 0 ? n.height : nodeHeight(n.depth),
  })
}

/** Make every auto-mode node at the same depth share the widest label's width at that depth. */
export function normalizeWidthsPerDepth(nodes: MindmapNode[], type?: DiagramType): MindmapNode[] {
  // The mind map is a radial constellation: every circle's diameter IS its subtree's
  // weight, so sharing one width per depth would erase the thing it says.
  if (type === 'mindmap' || type === 'honeycomb') return nodes
  const maxByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth > 0 && n.shape !== 'circle' && n.widthMode !== 'manual') {
      maxByDepth.set(n.depth, Math.max(maxByDepth.get(n.depth) ?? 0, autoWidthFor(n)))
    }
  }
  return nodes.map(n => {
    if (n.depth <= 0) return n
    if (n.shape === 'circle') return n               // circles keep individual sizes
    if (n.widthMode === 'manual') return n            // manual keeps its own width
    return { ...n, width: maxByDepth.get(n.depth) ?? n.width }
  })
}
