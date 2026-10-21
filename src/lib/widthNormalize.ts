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

/** Make auto-mode nodes at the same depth (sibling group, below a mind map's level 1) share the widest label's width. */
export function normalizeWidthsPerDepth(nodes: MindmapNode[], type?: DiagramType): MindmapNode[] {
  // The mind map is a radial constellation: every circle's diameter IS its subtree's
  // weight, so sharing one width per depth would erase the thing it says.
  if (type === 'graph' || type === 'honeycomb') return nodes
  // In a mind map every box fits its own label: one long title never widens its neighbours.
  const key = (n: MindmapNode) => type === 'mindmap' ? `n:${n.id}` : `d:${n.depth}`
  const maxByKey = new Map<string, number>()
  for (const n of nodes) {
    if (n.depth > 0 && n.shape !== 'circle' && n.widthMode !== 'manual') {
      maxByKey.set(key(n), Math.max(maxByKey.get(key(n)) ?? 0, autoWidthFor(n)))
    }
  }
  return nodes.map(n => {
    if (n.depth <= 0) return n
    if (n.shape === 'circle') return n               // circles keep individual sizes
    if (n.widthMode === 'manual') return n            // manual keeps its own width
    return { ...n, width: maxByKey.get(key(n)) ?? n.width }
  })
}
